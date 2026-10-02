//#include multigrid_level

var<private> NEIGHBOUR_OFFSETS: array<vec3i, 6> = array<vec3i, 6>(
  vec3i(1, 0, 0), vec3i(-1, 0, 0), vec3i(0, 1, 0), vec3i(0, -1, 0), vec3i(0, 0, 1), vec3i(0, 0, -1));

const SIDE_FACES_MERGED_PER_LEVEL = 2.0;
const DEPTH_FACES_MERGED_PER_LEVEL = 4.0;

struct NeighbourPressure {
  weightedSum: f32,
  weightTotal: f32,
}

fn faceWeight(cell: vec3i, neighbourNumber: i32) -> f32 {
  let axisWeights = pressureAxisWeights();
  if (neighbourNumber < 4) {
    return axisWeights[neighbourNumber / 2] * flowDepthRelativeToFarSlice(f32(cell.z) + 0.5) * pow(SIDE_FACES_MERGED_PER_LEVEL, f32(levelNumber()));
  }
  let faceZ = f32(cell.z) + select(0.0, 1.0, neighbourNumber == 4);
  return axisWeights.z * flowDepthRelativeToFarSlice(faceZ) * pow(DEPTH_FACES_MERGED_PER_LEVEL, f32(levelNumber()));
}

fn neighbourPressure(cell: vec3i) -> NeighbourPressure {
  var neighbours = NeighbourPressure(0.0, 0.0);
  for (var i = 0; i < 6; i++) {
    let neighbour = cell + NEIGHBOUR_OFFSETS[i];
    let weight = faceWeight(cell, i);
    if (!isInsideLevel(neighbour)) { neighbours.weightTotal += weight; continue; }
    let neighbourIndex = levelIndex(neighbour);
    if (levelSolids[neighbourIndex] > 0.5) { continue; }
    neighbours.weightedSum += weight * pressure[neighbourIndex];
    neighbours.weightTotal += weight;
  }
  return neighbours;
}
