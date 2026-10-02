const UNDERGROUND_METRES = -0.3;

fn surfaceBlocksCellAt(canvasUv: vec2f, nearMetres: f32, farMetres: f32) -> bool {
  let surfaceMetres = depthMetresFromCode(textureSampleLevel(sceneDepth, clampSampler, photoUv(canvasUv), 0.0).r);
  let isSky = surfaceMetres >= skyDepthMetres() * 0.99;
  return !isSky && farMetres > surfaceMetres && nearMetres < surfaceMetres * (1.0 + params.solidThicknessFactor);
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cell: vec3u) {
  if (any(cell >= vec3u(gridSize()))) { return; }
  let centre = cellCentre(cell);
  let nearMetres = sliceDepthMetres(f32(cell.z));
  let farMetres = sliceDepthMetres(f32(cell.z) + 1.0);
  var solidFraction = 0.0;
  for (var quarter = 0; quarter < 4; quarter++) {
    let quarterOffset = vec2f(f32(quarter & 1), f32(quarter >> 1)) * 0.5 - 0.25;
    if (surfaceBlocksCellAt((centre.xy + quarterOffset) / gridSize().xy, nearMetres, farMetres)) { solidFraction += 0.25; }
  }
  if (heightAboveGround(viewPosition(centre)) < UNDERGROUND_METRES) { solidFraction = 1.0; }
  textureStore(solidsOut, cell, vec4f(solidFraction, 0.0, 0.0, 1.0));
}
