//#include particle_cell

var<workgroup> threadTotals: array<u32, WORKGROUP_SIZE_X>;

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(local_invocation_index) threadNumber: u32, @builtin(workgroup_id) block: vec3u) {
  let cellCount = u32(params.cellCount);
  let firstCell = block.x * CELLS_PER_SCAN_BLOCK + threadNumber * ENTRIES_PER_SCAN_THREAD;
  var startsInThread: array<u32, ENTRIES_PER_SCAN_THREAD>;
  var threadTotal = 0u;
  for (var i = 0u; i < ENTRIES_PER_SCAN_THREAD; i++) {
    startsInThread[i] = threadTotal;
    if (firstCell + i < cellCount) {
      threadTotal += cellParticleCounts[firstCell + i];
      cellParticleCounts[firstCell + i] = 0u;
    }
  }
  threadTotals[threadNumber] = threadTotal;
  workgroupBarrier();
  for (var distance = 1u; distance < WORKGROUP_SIZE_X; distance *= 2u) {
    var earlierTotal = 0u;
    if (threadNumber >= distance) { earlierTotal = threadTotals[threadNumber - distance]; }
    workgroupBarrier();
    threadTotals[threadNumber] += earlierTotal;
    workgroupBarrier();
  }
  let threadStart = threadTotals[threadNumber] - threadTotal;
  for (var i = 0u; i < ENTRIES_PER_SCAN_THREAD; i++) {
    if (firstCell + i < cellCount) { cellStarts[firstCell + i] = threadStart + startsInThread[i]; }
  }
  if (threadNumber == WORKGROUP_SIZE_X - 1u) { blockStarts[block.x] = threadTotals[threadNumber]; }
}
