@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) invocation: vec3u) {
  let particleCount = arrayLength(&particleData) / PARTICLE_VEC4_COUNT;
  if (invocation.x >= particleCount) { return; }
  let firstVec4 = invocation.x * PARTICLE_VEC4_COUNT;
  let volumeRatio = 1.0;
  particleData[firstVec4] = vec4f(randomInCell(vec3i(i32(invocation.x), 7, 11)) * gridSize(), volumeRatio);
  for (var i = 1u; i < PARTICLE_VEC4_COUNT; i++) { particleData[firstVec4 + i] = vec4f(0.0); }
}
