# Contributing

## Done

A change is done when `Scripts/build.sh` and `Scripts/test.sh` from the README section "Build and test" pass.

## Architecture

The layers are Domain (`Shared/Domain`, imports nothing) ← Storage (`Shared/Storage`) ← the web app (`Apps/web`).
Dependencies point toward Domain. `Shared/Logging/Logger.js` is the one logger.

The only platform is the browser. `Apps/web` has one page, `index.html`.

- `Apps/web/App/AppGraph.js` is the composition root. Only it creates the engine, the settings and the storage.
- `Apps/web/App/main.js` starts the browser build: the canvas, `localStorage`, the frame loop.
- `Apps/web/freshFilesWorker.js` is a service worker. It makes the browser check every file with the server, so a visit after a deploy gets the new files.
- `Apps/web/Engine/` holds the GPU engine. `FogEngine` is its entry point, and `Solvers.js` lists the solvers.
- `Apps/web/Engine/Field/` holds the fog grid and its shared passes. `Render/` draws the fog over the photo. `Scene/` loads a scene's photo and depth.
- `Apps/web/Engine/Gpu/` holds the WebGPU layer: device, kernels, binding layouts, the params buffer, the GPU timer.
- `Apps/web/Engine/Solvers/` holds one class per fluid solver.
- `Apps/web/Engine/Shaders/` holds the WGSL code. `common.wgsl` is added to every shader.
- `Apps/web/Features/Fog/` is the game screen. `Apps/web/Features/Settings/` is the settings panel.
- `Apps/web/Scenes/` holds the photos, the depth maps and `manifest.json`.

Add a solver in these steps:
1. Add a class in `Apps/web/Engine/Solvers/` with `id`, `label`, `description`, `kernels`, `particleCount`, `solverParams`, `reset`, `step` and `destroy`. `kernels` lists every kernel spec the solver dispatches, so they compile before its first frame.
2. Add its shaders to `Apps/web/Engine/Shaders/`.
3. Add the class to `SOLVERS` in `Apps/web/Engine/Solvers.js`.
4. Add any new uniform values to `PARAM_FIELDS` in `Apps/web/Engine/Gpu/ParamsBuffer.js`.

Add a setting in these steps:
1. Add it to `NUMERIC_SETTINGS` in `Shared/Domain/Entities/Settings.js`.
2. Write it into the params in `FogEngine` and read it in the shader through `params`.

The reference solver is `Apps/web/Engine/Solvers/StableFluidsSolver.js`.

## Conventions

- Shaders declare no bindings and no `Params` struct. The kernel's binding list in JavaScript generates them, and each binding is passed by name.
- Shaders use `WORKGROUP_SIZE_X`, `WORKGROUP_SIZE_Y` and `WORKGROUP_SIZE_Z`, which the kernel generates from its workgroup size.
- A kernel spec is a module-level constant next to the code that dispatches it, and it is in a list that `KernelLibrary.prepare` compiles at start. A kernel compiled during a frame is logged as a warning.
- Velocities on the grid are in cells per second. Positions on the grid are in cells, with the centre of cell `i` at `i + 0.5`.
- View space is the photo's camera space in metres: x right, y up, z forward.
- The product words are "fog", "wind source", "base fog", "slice", "cell", "solid", "scene".

## Rules the code cannot show

- A GPU texture or buffer is destroyed by the object that created it. `FogEngine` destroys the solver, the field and the scene before it replaces them.

## Tests

- Unit tests for `Shared/` live in `Shared/Tests/<Layer>/` and use `node:test`.
- Integration tests live in `Apps/web/Tests/<Feature>/`. They build the app through `AppGraph` in headless Chromium with software WebGPU, and replace only the canvas, the storage, the clock and the random choice.
- The allowed tool beyond the scripts is Playwright, for the integration tests.
