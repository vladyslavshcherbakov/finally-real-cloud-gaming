//#include multigrid_neighbours

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  let cell = vec3i(cellId);
  if (!isInsideLevel(cell)) { return; }
  let index = levelIndex(cell);
  if (levelSolids[index] > 0.5) {
    residual[index] = 0.0;
    return;
  }
  let neighbours = neighbourPressure(cell);
  residual[index] = rightHandSide[index] - (neighbours.weightedSum - neighbours.weightTotal * pressure[index]);
}
