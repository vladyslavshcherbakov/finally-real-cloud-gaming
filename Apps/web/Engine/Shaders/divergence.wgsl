fn volumeWeightedVelocity(cell: vec3i, ownVelocity: vec3f) -> vec3f {
  let depthCubed = pow(flowDepthRelativeToFarSlice(f32(cell.z) + 0.5), 3.0);
  if (!isInsideGrid(cell)) { return ownVelocity * depthCubed; }
  if (textureLoad(solids, cell, 0).r > 0.5) { return vec3f(0.0); }
  return finiteOrZero(textureLoad(velocity, cell, 0).xyz) * depthCubed;
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  if (any(cellId >= vec3u(gridSize()))) { return; }
  let cell = vec3i(cellId);
  let ownVelocity = finiteOrZero(textureLoad(velocity, cellId, 0).xyz);
  let outflow = (volumeWeightedVelocity(cell + vec3i(1, 0, 0), ownVelocity).x - volumeWeightedVelocity(cell - vec3i(1, 0, 0), ownVelocity).x)
    + (volumeWeightedVelocity(cell + vec3i(0, 1, 0), ownVelocity).y - volumeWeightedVelocity(cell - vec3i(0, 1, 0), ownVelocity).y)
    + (volumeWeightedVelocity(cell + vec3i(0, 0, 1), ownVelocity).z - volumeWeightedVelocity(cell - vec3i(0, 0, 1), ownVelocity).z);
  divergence[cellIndex(cell)] = 0.5 * outflow;
}
