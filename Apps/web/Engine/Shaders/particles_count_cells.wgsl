//#include particle_cell

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) invocation: vec3u) {
  let particleCount = arrayLength(&particleData) / PARTICLE_VEC4_COUNT;
  if (invocation.x >= particleCount) { return; }
  let cell = cellIndex(cellOfParticle(particleData[invocation.x * PARTICLE_VEC4_COUNT].xyz));
  particleRanks[invocation.x] = atomicAdd(&cellParticleCounts[cell], 1u);
}
