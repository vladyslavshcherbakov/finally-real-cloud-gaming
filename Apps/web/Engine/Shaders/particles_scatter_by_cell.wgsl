//#include particle_cell

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) invocation: vec3u) {
  let particleCount = arrayLength(&particleData) / PARTICLE_VEC4_COUNT;
  if (invocation.x >= particleCount) { return; }
  let firstVec4 = invocation.x * PARTICLE_VEC4_COUNT;
  let cell = cellIndex(cellOfParticle(particleData[firstVec4].xyz));
  let sortedNumber = blockStarts[cell / CELLS_PER_SCAN_BLOCK] + cellStarts[cell] + particleRanks[invocation.x];
  for (var i = 0u; i < PARTICLE_VEC4_COUNT; i++) {
    sortedParticleData[sortedNumber * PARTICLE_VEC4_COUNT + i] = particleData[firstVec4 + i];
  }
}
