fn velocityAt(cell: vec3i) -> vec3f {
  return textureLoad(velocity, clampedToGrid(cell), 0).xyz;
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  if (any(cellId >= vec3u(gridSize()))) { return; }
  let cell = vec3i(cellId);
  let changeAlongX = (velocityAt(cell + vec3i(1, 0, 0)) - velocityAt(cell - vec3i(1, 0, 0))) * 0.5;
  let changeAlongY = (velocityAt(cell + vec3i(0, 1, 0)) - velocityAt(cell - vec3i(0, 1, 0))) * 0.5;
  let changeAlongZ = (velocityAt(cell + vec3i(0, 0, 1)) - velocityAt(cell - vec3i(0, 0, 1))) * 0.5;
  let curl = vec3f(changeAlongY.z - changeAlongZ.y, changeAlongZ.x - changeAlongX.z, changeAlongX.y - changeAlongY.x);
  textureStore(vorticityOut, cellId, vec4f(curl, length(curl)));
}
