@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  if (any(cellId >= vec3u(gridSize()))) { return; }
  if (textureLoad(solids, cellId, 0).r > 0.5) {
    textureStore(velocityOut, cellId, vec4f(0.0));
    return;
  }
  let newVelocity = textureLoad(advected, cellId, 0).xyz + textureLoad(acceleration, cellId, 0).xyz * stepSeconds();
  textureStore(velocityOut, cellId, vec4f(newVelocity, 0.0));
}
