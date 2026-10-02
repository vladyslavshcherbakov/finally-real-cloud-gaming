//#include particle_cell

var<workgroup> threadTotals: array<u32, WORKGROUP_SIZE_X>;

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(local_invocation_index) threadNumber: u32) {
  let firstBlock = threadNumber * ENTRIES_PER_SCAN_THREAD;
  var blockTotals: array<u32, ENTRIES_PER_SCAN_THREAD>;
  var threadTotal = 0u;
  for (var i = 0u; i < ENTRIES_PER_SCAN_THREAD; i++) {
    blockTotals[i] = blockStarts[firstBlock + i];
    threadTotal += blockTotals[i];
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
  var blockStart = threadTotals[threadNumber] - threadTotal;
  for (var i = 0u; i < ENTRIES_PER_SCAN_THREAD; i++) {
    blockStarts[firstBlock + i] = blockStart;
    blockStart += blockTotals[i];
  }
}
