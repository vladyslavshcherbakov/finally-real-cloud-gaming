var<private> AXES: array<vec3i, 3> = array<vec3i, 3>(vec3i(1, 0, 0), vec3i(0, 1, 0), vec3i(0, 0, 1));

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  if (any(cellId >= vec3u(gridSize()))) { return; }
  let cell = vec3i(cellId);
  let ownVelocity = finiteOrZero(textureLoad(velocity, cellId, 0).xyz);
  var outflow = 0.0;
  for (var axis = 0; axis < 3; axis++) {
    outflow += faceFlux(cell, cell + AXES[axis], ownVelocity, axis) - faceFlux(cell, cell - AXES[axis], ownVelocity, axis);
  }
  divergence[cellIndex(cell)] = outflow;
}

fn faceFlux(cell: vec3i, neighbour: vec3i, ownVelocity: vec3f, axis: i32) -> f32 {
  let ownFlux = ownVelocity[axis] * depthCubed(cell);
  if (!isInsideGrid(neighbour)) { return 0.5 * ownFlux; }
  if (textureLoad(solids, neighbour, 0).r > 0.5) { return 0.0; }
  return 0.5 * (ownFlux + finiteOrZero(textureLoad(velocity, neighbour, 0).xyz)[axis] * depthCubed(neighbour));
}

fn depthCubed(cell: vec3i) -> f32 {
  return pow(flowDepthRelativeToFarSlice(f32(cell.z) + 0.5), 3.0);
}
