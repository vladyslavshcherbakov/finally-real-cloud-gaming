import { SceneDescription } from '../Entities/SceneDescription.js';
import { PhotoScene } from '../Entities/PhotoScene.js';

export const PHOTO_SCENE_ID = 'photo-from-phone';

const NEAREST_SURFACE_METRES = 5;
const NEAREST_SURFACE_PERCENTILE = 0.01;
const DEPTH_NEAR_METRES = 0.5;
const DEPTH_FAR_METRES = 4000;
const FARTHEST_SURFACE_SHARE_OF_DEPTH_FAR = 0.95;
const FILM_DIAGONAL_MILLIMETRES = Math.hypot(36, 24);
const PORTRAIT_FOV_Y_DEGREES_WITHOUT_EXIF = 63.5;
const LANDSCAPE_FOV_Y_DEGREES_WITHOUT_EXIF = 49.5;
const CAMERA_HEIGHT_METRES = 1.5;
const LEVEL_GROUND_NORMAL = [0, 1, 0];
const SUN_DIRECTION = [0, 0.2, 0.98];

export class PortraitDepthUnusable extends Error {
  constructor(reason) {
    super(`the depth map cannot make a scene: ${reason}`);
    this.name = 'PortraitDepthUnusable';
    this.reason = reason;
  }
}

export function photoSceneFromPortrait({ photo, photoWidth, photoHeight, exif, depthCodes, depthWidth, depthHeight, encoding }) {
  const relativeDepths = Float32Array.from(depthCodes, (code) => encoding.relativeDepthOfCode(code));
  const nearestRelativeDepth = percentile(relativeDepths, NEAREST_SURFACE_PERCENTILE);
  if (!(nearestRelativeDepth > 0) || !Number.isFinite(nearestRelativeDepth)) throw new PortraitDepthUnusable(`its nearest surface is at ${nearestRelativeDepth}`);
  const metresPerRelativeDepth = NEAREST_SURFACE_METRES / nearestRelativeDepth;
  const farthestSurfaceMetres = DEPTH_FAR_METRES * FARTHEST_SURFACE_SHARE_OF_DEPTH_FAR;
  const depthMetres = relativeDepths.map((relativeDepth) => Math.min(farthestSurfaceMetres, Math.max(DEPTH_NEAR_METRES, relativeDepth * metresPerRelativeDepth)));
  return new PhotoScene({
    description: new SceneDescription({
      id: PHOTO_SCENE_ID,
      photoPath: null,
      depthPath: null,
      width: photoWidth,
      height: photoHeight,
      fovYDegrees: verticalFieldOfViewDegrees(photoWidth, photoHeight, exif),
      depthNearMetres: DEPTH_NEAR_METRES,
      depthFarMetres: DEPTH_FAR_METRES,
      groundNormal: LEVEL_GROUND_NORMAL,
      groundOffsetMetres: CAMERA_HEIGHT_METRES,
      sunDirection: SUN_DIRECTION,
    }),
    photo,
    depthMetres,
    depthWidth,
    depthHeight,
  });
}

function verticalFieldOfViewDegrees(photoWidth, photoHeight, exif) {
  const hasLens = exif !== null && exif.focalLength35mmMillimetres > 0 && exif.pixelWidth > 0 && exif.pixelHeight > 0;
  if (!hasLens) return photoHeight >= photoWidth ? PORTRAIT_FOV_Y_DEGREES_WITHOUT_EXIF : LANDSCAPE_FOV_Y_DEGREES_WITHOUT_EXIF;
  const halfDiagonalTangent = FILM_DIAGONAL_MILLIMETRES / (2 * exif.focalLength35mmMillimetres);
  const heightShareOfDiagonal = photoHeight / Math.hypot(exif.pixelWidth, exif.pixelHeight);
  return (2 * Math.atan(heightShareOfDiagonal * halfDiagonalTangent) * 180) / Math.PI;
}

function percentile(values, share) {
  const ascending = Float32Array.from(values).sort();
  return ascending[Math.floor((ascending.length - 1) * share)];
}
