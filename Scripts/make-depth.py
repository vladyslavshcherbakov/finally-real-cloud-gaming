import argparse
import json
import math
import shutil
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageFilter
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

RELATIVE_DEPTH_MODEL = "depth-anything/Depth-Anything-V2-Large-hf"
METRIC_DEPTH_MODEL = "depth-anything/Depth-Anything-V2-Metric-Outdoor-Large-hf"
DEPTH_NEAR_METRES = 0.5
DEPTH_FAR_METRES = 4000.0
MODEL_INPUT_MULTIPLE = 14
METRIC_MODEL_LONG_SIDE = 74 * MODEL_INPUT_MULTIPLE
LONGEST_RELATIVE_MODEL_SIDE = 108 * MODEL_INPUT_MULTIPLE
SKY_DISPARITY = 0.004
TRUSTED_DISPARITY_PERCENTILES = (20, 80)
GROUND_ROWS_START = 0.6
GROUND_SEARCH_METRES = 80
GROUND_SAMPLE_LIMIT = 50000
GROUND_PLANE_TRIES = 600
GROUND_INLIER_METRES = 0.15
LEAST_UPWARD_NORMAL = 0.8
SUN_SEARCH_BLUR_PIXELS = 25
DEPTH_CODE_LEVELS = 65535

SCENES = Path(__file__).resolve().parents[1] / "Apps" / "web" / "Scenes"


def model_prediction(model_name, image, long_side):
    processor = AutoImageProcessor.from_pretrained(model_name)
    model = AutoModelForDepthEstimation.from_pretrained(model_name).eval()
    width, height = image.size
    scale = long_side / max(width, height)
    input_size = {
        "height": round(height * scale / MODEL_INPUT_MULTIPLE) * MODEL_INPUT_MULTIPLE,
        "width": round(width * scale / MODEL_INPUT_MULTIPLE) * MODEL_INPUT_MULTIPLE,
    }
    predictions = []
    for is_mirrored in (False, True):
        source = image.transpose(Image.FLIP_LEFT_RIGHT) if is_mirrored else image
        inputs = processor(images=source, return_tensors="pt", size=input_size, keep_aspect_ratio=False)
        with torch.no_grad():
            predicted = model(**inputs).predicted_depth
        full_size = torch.nn.functional.interpolate(predicted[:, None], size=(height, width), mode="bicubic", align_corners=False)[0, 0].numpy()
        predictions.append(full_size[:, ::-1] if is_mirrored else full_size)
    return (predictions[0] + predictions[1]) * 0.5


def disparity_scale(disparity, metric_depth, trusted):
    return float(np.median(1.0 / (metric_depth[trusted] * disparity[trusted])))


def depth_metres(image):
    relative_long_side = min(round(max(image.size) / MODEL_INPUT_MULTIPLE) * MODEL_INPUT_MULTIPLE, LONGEST_RELATIVE_MODEL_SIDE)
    disparity = np.clip(model_prediction(RELATIVE_DEPTH_MODEL, image, relative_long_side), 0, None)
    disparity /= disparity.max()
    metric_depth = model_prediction(METRIC_DEPTH_MODEL, image, METRIC_MODEL_LONG_SIDE)
    is_sky = disparity < SKY_DISPARITY
    low, high = np.percentile(disparity[~is_sky], TRUSTED_DISPARITY_PERCENTILES)
    trusted = (~is_sky) & (disparity > low) & (disparity < high)
    scale = disparity_scale(disparity, metric_depth, trusted)
    surface_metres = 1.0 / np.maximum(scale * disparity, 1.0 / DEPTH_FAR_METRES)
    return np.clip(np.where(is_sky, DEPTH_FAR_METRES, surface_metres), DEPTH_NEAR_METRES, DEPTH_FAR_METRES), is_sky


def rescaled_to_known_width(surface_metres, is_sky, rays_right, known_width):
    left_column, right_column, row, metres = known_width
    centre_metres = np.median(surface_metres[row, left_column:right_column + 1])
    measured_metres = (rays_right[row, right_column] - rays_right[row, left_column]) * centre_metres
    scale = metres / measured_metres
    print(f"depth scaled by {scale:.2f} so that columns {left_column}..{right_column} of row {row} are {metres} m wide")
    return np.where(is_sky, DEPTH_FAR_METRES, np.clip(surface_metres * scale, DEPTH_NEAR_METRES, DEPTH_FAR_METRES))


def view_rays(width, height, fov_y_degrees):
    focal_pixels = 0.5 * height / math.tan(math.radians(fov_y_degrees) * 0.5)
    right = (np.arange(width) + 0.5 - width * 0.5) / focal_pixels
    up = -(np.arange(height) + 0.5 - height * 0.5) / focal_pixels
    return np.meshgrid(right, up)


def ground_plane(points, random):
    best_plane, best_inliers = None, -1
    for _ in range(GROUND_PLANE_TRIES):
        triangle = points[random.choice(len(points), 3, replace=False)]
        normal = np.cross(triangle[1] - triangle[0], triangle[2] - triangle[0])
        normal_length = np.linalg.norm(normal)
        if normal_length < 1e-6:
            continue
        normal = normal / normal_length
        upward_normal = normal if normal[1] >= 0 else -normal
        if upward_normal[1] < LEAST_UPWARD_NORMAL:
            continue
        offset = -upward_normal.dot(triangle[0])
        inlier_count = np.count_nonzero(np.abs(points @ upward_normal + offset) < GROUND_INLIER_METRES)
        if inlier_count > best_inliers:
            best_plane, best_inliers = (upward_normal, offset), inlier_count
    normal, offset = best_plane
    inliers = points[np.abs(points @ normal + offset) < GROUND_INLIER_METRES]
    centroid = inliers.mean(axis=0)
    _, _, axes = np.linalg.svd(inliers - centroid, full_matrices=False)
    fitted_normal = axes[2] if axes[2][1] > 0 else -axes[2]
    return fitted_normal, -fitted_normal.dot(centroid)


def level_from_side_to_side(normal):
    pitch_only = np.array([0.0, normal[1], normal[2]])
    return pitch_only / np.linalg.norm(pitch_only)


def ground_of(surface_metres, rays_right, rays_up):
    height = surface_metres.shape[0]
    points = np.stack([rays_right * surface_metres, rays_up * surface_metres, surface_metres], axis=-1)
    lower_rows = slice(int(height * GROUND_ROWS_START), None)
    candidates = points[lower_rows][surface_metres[lower_rows] < GROUND_SEARCH_METRES].reshape(-1, 3)
    random = np.random.default_rng(1)
    if len(candidates) > GROUND_SAMPLE_LIMIT:
        candidates = candidates[random.choice(len(candidates), GROUND_SAMPLE_LIMIT, replace=False)]
    return ground_plane(candidates, random)


def sun_direction(image, is_sky, rays_right, rays_up):
    if not is_sky.any():
        raise SystemExit("the photo shows no sky, so the sun direction cannot be found; pass a photo with sky")
    blurred_luminance = np.asarray(image.convert("L").filter(ImageFilter.GaussianBlur(SUN_SEARCH_BLUR_PIXELS)), dtype=np.float32)
    row, column = np.unravel_index(np.argmax(np.where(is_sky, blurred_luminance, -1)), blurred_luminance.shape)
    direction = np.array([rays_right[row, column], rays_up[row, column], 1.0])
    return (direction / np.linalg.norm(direction)).round(4).tolist()


def depth_code_image(surface_metres):
    log_depth = np.log(surface_metres / DEPTH_NEAR_METRES) / math.log(DEPTH_FAR_METRES / DEPTH_NEAR_METRES)
    codes = np.round(log_depth * DEPTH_CODE_LEVELS).astype(np.uint32)
    channels = np.zeros(surface_metres.shape + (3,), dtype=np.uint8)
    channels[..., 0] = codes >> 8
    channels[..., 1] = codes & 255
    return Image.fromarray(channels)


def updated_manifest(scene):
    manifest_path = SCENES / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"scenes": []}
    manifest["scenes"] = [existing for existing in manifest["scenes"] if existing["id"] != scene["id"]] + [scene]
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


def main():
    arguments = argparse.ArgumentParser(description="Build the depth map and manifest entry of one scene.")
    arguments.add_argument("photo")
    arguments.add_argument("scene_id")
    arguments.add_argument("--fov", type=float, default=50.0, help="vertical field of view of the photo, in degrees")
    arguments.add_argument("--known-width", nargs=4, type=float, metavar=("LEFT_COLUMN", "RIGHT_COLUMN", "ROW", "METRES"),
                           help="scale the depth so that this span of one row is this wide, such as a window of a known size")
    ground_options = arguments.add_mutually_exclusive_group()
    ground_options.add_argument("--camera-height", type=float, metavar="METRES",
                                help="height of the camera above the street, for a photo whose ground is hidden by roofs")
    ground_options.add_argument("--eye-height", type=float, metavar="METRES",
                                help="height of the camera above the visible ground; the depth is scaled to put the ground there")
    options = arguments.parse_args()

    image = Image.open(options.photo).convert("RGB")
    width, height = image.size
    scene_folder = SCENES / options.scene_id
    scene_folder.mkdir(parents=True, exist_ok=True)

    surface_metres, is_sky = depth_metres(image)
    rays_right, rays_up = view_rays(width, height, options.fov)
    if options.known_width:
        left_column, right_column, row, metres = options.known_width
        surface_metres = rescaled_to_known_width(surface_metres, is_sky, rays_right, (int(left_column), int(right_column), int(row), metres))
    normal, offset = ground_of(surface_metres, rays_right, rays_up)
    if options.eye_height is not None:
        scale = options.eye_height / offset
        print(f"depth scaled by {scale:.2f} so that the ground lies {options.eye_height} m below the camera")
        surface_metres = np.where(is_sky, DEPTH_FAR_METRES, np.clip(surface_metres * scale, DEPTH_NEAR_METRES, DEPTH_FAR_METRES))
        offset = options.eye_height
    if options.camera_height is not None:
        print(f"ground moved from {offset:.2f} m to {options.camera_height} m below the camera, level from side to side")
        normal = level_from_side_to_side(normal)
        offset = options.camera_height

    photo_name = "photo" + Path(options.photo).suffix.lower()
    shutil.copyfile(options.photo, scene_folder / photo_name)
    depth_code_image(surface_metres).save(scene_folder / "depth.png", optimize=True)
    updated_manifest({
        "id": options.scene_id,
        "photo": f"{options.scene_id}/{photo_name}",
        "depth": f"{options.scene_id}/depth.png",
        "width": width,
        "height": height,
        "fovY": options.fov,
        "nearM": DEPTH_NEAR_METRES,
        "farM": DEPTH_FAR_METRES,
        "ground": {"normal": normal.round(5).tolist(), "offset": round(float(offset), 4)},
        "sunDir": sun_direction(image, is_sky, rays_right, rays_up),
    })
    surfaces = surface_metres[~is_sky]
    print(f"scene {options.scene_id}: {width}x{height}, sky {is_sky.mean():.0%}, "
          f"surfaces {surfaces.min():.1f}..{np.percentile(surfaces, 99):.0f} m, ground offset {offset:.2f} m")


if __name__ == "__main__":
    main()
