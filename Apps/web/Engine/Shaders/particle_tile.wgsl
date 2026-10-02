//#include particle_cell

const TILE_SIZE = vec3i(72, 3, 3);
const SUMS_PER_NODE = 4;
const TILE_SUM_COUNT = u32(TILE_SIZE.x * TILE_SIZE.y * TILE_SIZE.z * SUMS_PER_NODE);

var<workgroup> tileSums: array<atomic<i32>, TILE_SUM_COUNT>;

fn tileOriginForParticle(firstParticlePosition: vec3f) -> vec3i {
  return cellOfParticle(firstParticlePosition) - 1;
}

fn clearTile(threadNumber: u32) {
  for (var sum = threadNumber; sum < TILE_SUM_COUNT; sum += WORKGROUP_SIZE_X) { atomicStore(&tileSums[sum], 0); }
}

fn addNodeSum(tileOrigin: vec3i, node: vec3i, component: i32, value: i32) {
  let nodeInTile = node - tileOrigin;
  if (all(nodeInTile >= vec3i(0)) && all(nodeInTile < TILE_SIZE)) {
    let nodeNumber = nodeInTile.x + TILE_SIZE.x * (nodeInTile.y + TILE_SIZE.y * nodeInTile.z);
    atomicAdd(&tileSums[u32(nodeNumber * SUMS_PER_NODE + component)], value);
    return;
  }
  atomicAdd(&gridSums[cellIndex(node) * u32(SUMS_PER_NODE) + u32(component)], value);
}

fn addTileToGrid(tileOrigin: vec3i, threadNumber: u32) {
  for (var sum = threadNumber; sum < TILE_SUM_COUNT; sum += WORKGROUP_SIZE_X) {
    let value = atomicLoad(&tileSums[sum]);
    if (value == 0) { continue; }
    let nodeNumber = i32(sum) / SUMS_PER_NODE;
    let node = tileOrigin + vec3i(nodeNumber % TILE_SIZE.x, (nodeNumber / TILE_SIZE.x) % TILE_SIZE.y, nodeNumber / (TILE_SIZE.x * TILE_SIZE.y));
    if (isInsideGrid(node)) { atomicAdd(&gridSums[cellIndex(node) * u32(SUMS_PER_NODE) + sum % u32(SUMS_PER_NODE)], value); }
  }
}
