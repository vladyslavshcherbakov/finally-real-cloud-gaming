//#include multigrid_neighbours

const OVER_RELAXATION = 1.15;

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  let cell = vec3i(cellId);
  if (!isInsideLevel(cell)) { return; }
  if (((cellId.x + cellId.y + cellId.z) & 1u) != CHECKERBOARD_COLOUR) { return; }
  let index = levelIndex(cell);
  if (levelSolids[index] > 0.5) {
    pressure[index] = 0.0;
    return;
  }
  let neighbours = neighbourPressure(cell);
  if (neighbours.weightTotal <= 0.0) { return; }
  let solvedPressure = (neighbours.weightedSum - rightHandSide[index]) / neighbours.weightTotal;
  let relaxedPressure = mix(pressure[index], solvedPressure, OVER_RELAXATION);
  pressure[index] = select(0.0, relaxedPressure, isFiniteNumber(relaxedPressure));
}
