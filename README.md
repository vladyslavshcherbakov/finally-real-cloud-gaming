# Autumn Fog

Play: https://vladyslavshcherbakov.github.io/finally-real-cloud-gaming/

A browser game for desktop and phone. A photo of a place is covered by fog. The player blows the fog away with the mouse or a finger, layer by layer, until the photo is clear.

- The fog is simulated on the GPU with WebGPU compute shaders. No neural network runs in the game.
- A depth map of the photo makes the fog flow around buildings and hide behind them.
- The fluid solvers listed in `Apps/web/Engine/Solvers.js` can be switched while the game runs.
- A random scene from `Apps/web/Scenes/manifest.json` opens on each visit.

How the game behaves is described in `docs/fog.md`.

## Requirements

- A browser with WebGPU: Chrome or Edge 113+, Safari 26+, Firefox 141+ on Windows.
- Node.js 22 and Python 3 for the scripts.

## Run

```bash
Scripts/serve.sh
```

Then open `http://localhost:8080/Apps/web/`.

## Build and test

```bash
npm install
npx playwright install chromium
Scripts/build.sh
Scripts/test.sh
```

- `Scripts/build.sh` checks the syntax of every module and writes the deployable site to `build/site/`.
- `Scripts/test.sh` runs the unit tests and the integration tests. The integration tests run the game in headless Chromium with software WebGPU, so they need no GPU.
- Set `CHROMIUM_PATH` to use a Chromium other than the one Playwright installed.

## Deploy

- GitHub Pages publishes the repository root of the branch chosen in Settings → Pages: "Deploy from a branch", folder `/ (root)`. The root `index.html` forwards to `Apps/web/`, and `.nojekyll` makes Pages serve the files as they are.
- `build/site/` is the same site as a self-contained folder for any other static host.
- `build/site/artifact-page.html` is the page for a Claude artifact. Publish it with every file of `build/site/` at the same relative path.

## Add a scene

```bash
python3 -m venv .venv
.venv/bin/pip install -r Scripts/make-depth-requirements.txt
.venv/bin/python Scripts/make-depth.py path/to/photo.jpg scene-id --fov 50
```

The script writes the photo, its depth map and its manifest entry into `Apps/web/Scenes/`. It downloads Depth Anything V2 Large (CC BY-NC 4.0, non-commercial use only) and Depth Anything V2 Metric Outdoor Large on the first run.

- `--fov` is the vertical field of view of the photo in degrees. For a phone photo, take it from the 35 mm equivalent focal length in the EXIF data: a 28 mm lens in portrait gives 63.5°.
- The depth model can get the scale of a scene wrong. One of these options fixes it:
  - `--eye-height METRES` scales the depth so that the visible ground lies this far below the camera. Use 1.5 for a photo taken by hand.
  - `--known-width LEFT RIGHT ROW METRES` scales the depth so that the span between two pixel columns of one row is this wide, such as a window of a known size.
  - `--camera-height METRES` sets the height of the camera above the street for a photo whose ground is hidden by roofs.
- The relative depth model sees the photo at most 1512 pixels on its long side. The cap keeps the memory the script needs to a few gigabytes.
