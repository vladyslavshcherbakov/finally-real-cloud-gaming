//#include mpm_particle

const SMALLEST_NODE_MASS = 1e-4;
const WALL_CELLS = 2u;

fn withWallsHeld(nodeVelocity: vec3f, cellId: vec3u) -> vec3f {
  let size = vec3u(gridSize());
  var heldVelocity = nodeVelocity;
  if (cellId.x < WALL_CELLS) { heldVelocity.x = max(heldVelocity.x, 0.0); }
  if (cellId.x >= size.x - WALL_CELLS) { heldVelocity.x = min(heldVelocity.x, 0.0); }
  if (cellId.y < WALL_CELLS) { heldVelocity.y = max(heldVelocity.y, 0.0); }
  if (cellId.y >= size.y - WALL_CELLS) { heldVelocity.y = min(heldVelocity.y, 0.0); }
  if (cellId.z < WALL_CELLS) { heldVelocity.z = max(heldVelocity.z, 0.0); }
  if (cellId.z >= size.z - WALL_CELLS) { heldVelocity.z = min(heldVelocity.z, 0.0); }
  return heldVelocity;
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  if (any(cellId >= vec3u(gridSize()))) { return; }
  let firstSum = cellIndex(vec3i(cellId)) * 4u;
  let nodeMass = f32(gridSums[firstSum + 3u]) / FIXED_POINT_SCALE;
  var nodeVelocity = vec3f(0.0);
  if (nodeMass > SMALLEST_NODE_MASS) {
    let nodeMomentum = vec3f(f32(gridSums[firstSum]), f32(gridSums[firstSum + 1u]), f32(gridSums[firstSum + 2u])) / FIXED_POINT_SCALE;
    nodeVelocity = nodeMomentum / nodeMass + textureLoad(acceleration, cellId, 0).xyz * params.mpmSubstepSeconds;
  }
  gridSums[firstSum] = 0; gridSums[firstSum + 1u] = 0; gridSums[firstSum + 2u] = 0; gridSums[firstSum + 3u] = 0;
  if (textureLoad(solids, cellId, 0).r > 0.5) { nodeVelocity = vec3f(0.0); }
  textureStore(velocityOut, cellId, vec4f(withWallsHeld(nodeVelocity, cellId), 0.0));
}
