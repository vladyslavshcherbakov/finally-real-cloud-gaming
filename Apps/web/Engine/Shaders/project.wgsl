fn pressureAt(cell: vec3i, ownPressure: f32) -> f32 {
  if (!isInsideGrid(cell)) { return 0.0; }
  if (textureLoad(solids, cell, 0).r > 0.5) { return ownPressure; }
  return pressure[cellIndex(cell)];
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  if (any(cellId >= vec3u(gridSize()))) { return; }
  let cell = vec3i(cellId);
  if (textureLoad(solids, cellId, 0).r > 0.5) {
    textureStore(velocityOut, cellId, vec4f(0.0));
    return;
  }
  let ownPressure = pressure[cellIndex(cell)];
  let pressureGradient = vec3f(
    pressureAt(cell + vec3i(1, 0, 0), ownPressure) - pressureAt(cell - vec3i(1, 0, 0), ownPressure),
    pressureAt(cell + vec3i(0, 1, 0), ownPressure) - pressureAt(cell - vec3i(0, 1, 0), ownPressure),
    pressureAt(cell + vec3i(0, 0, 1), ownPressure) - pressureAt(cell - vec3i(0, 0, 1), ownPressure)) * 0.5;
  let relativeDepth = flowDepthRelativeToFarSlice(f32(cell.z) + 0.5);
  let velocityCorrection = pressureGradient * pressureAxisWeights() / (relativeDepth * relativeDepth);
  textureStore(velocityOut, cellId, vec4f(finiteOrZero(textureLoad(velocity, cellId, 0).xyz - velocityCorrection), 0.0));
}
