//#include flip_particle

const SMALLEST_TRANSFER_WEIGHT = 0.05;
const EMPTY_CELL_VELOCITY_KEPT = 0.98;

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  if (any(cellId >= vec3u(gridSize()))) { return; }
  let firstSum = cellIndex(vec3i(cellId)) * 4u;
  let transferWeight = f32(gridSums[firstSum + 3u]) / FIXED_POINT_SCALE;
  var transferredVelocity = textureLoad(previousVelocity, cellId, 0).xyz * EMPTY_CELL_VELOCITY_KEPT;
  if (transferWeight > SMALLEST_TRANSFER_WEIGHT) {
    let weightedVelocity = vec3f(f32(gridSums[firstSum]), f32(gridSums[firstSum + 1u]), f32(gridSums[firstSum + 2u])) / FIXED_POINT_SCALE;
    transferredVelocity = weightedVelocity / transferWeight;
  }
  gridSums[firstSum] = 0; gridSums[firstSum + 1u] = 0; gridSums[firstSum + 2u] = 0; gridSums[firstSum + 3u] = 0;
  var acceleratedVelocity = transferredVelocity + textureLoad(acceleration, cellId, 0).xyz * stepSeconds();
  if (textureLoad(solids, cellId, 0).r > 0.5) { acceleratedVelocity = vec3f(0.0); }
  textureStore(transferredOut, cellId, vec4f(transferredVelocity, 0.0));
  textureStore(acceleratedOut, cellId, vec4f(acceleratedVelocity, 0.0));
}
