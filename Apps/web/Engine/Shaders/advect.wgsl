@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cell: vec3u) {
  if (any(cell >= vec3u(gridSize()))) { return; }
  let cellVelocity = textureLoad(velocity, cell, 0).xyz;
  let departurePoint = cellCentre(cell) - cellVelocity * stepSeconds();
  textureStore(advectedOut, cell, textureSampleLevel(carried, clampSampler, departurePoint / gridSize(), 0.0));
}
