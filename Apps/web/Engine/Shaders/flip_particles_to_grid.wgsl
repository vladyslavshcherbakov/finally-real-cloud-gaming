//#include flip_particle
//#include particle_tile

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) invocation: vec3u, @builtin(local_invocation_index) threadNumber: u32, @builtin(workgroup_id) workgroup: vec3u) {
  let particleCount = arrayLength(&particles);
  let tileOrigin = tileOriginForParticle(particles[min(workgroup.x * WORKGROUP_SIZE_X, particleCount - 1u)].position.xyz);
  clearTile(threadNumber);
  workgroupBarrier();
  if (invocation.x < particleCount) { addParticleToTile(particles[invocation.x], tileOrigin); }
  workgroupBarrier();
  addTileToGrid(tileOrigin, threadNumber);
}

fn addParticleToTile(particle: FlipParticle, tileOrigin: vec3i) {
  let fromFirstCentre = particle.position.xyz - 0.5;
  let lowerCell = vec3i(floor(fromFirstCentre));
  let offsetInCell = fromFirstCentre - vec3f(lowerCell);
  let particleVelocity = clamp(particle.velocity.xyz, vec3f(-FASTEST_PARTICLE_CELLS_PER_SECOND), vec3f(FASTEST_PARTICLE_CELLS_PER_SECOND));
  for (var corner = 0; corner < 8; corner++) {
    let cornerOffset = vec3i(corner & 1, (corner >> 1) & 1, (corner >> 2) & 1);
    let cell = lowerCell + cornerOffset;
    if (!isInsideGrid(cell)) { continue; }
    let axisWeights = mix(1.0 - offsetInCell, offsetInCell, vec3f(cornerOffset));
    let weight = axisWeights.x * axisWeights.y * axisWeights.z;
    addNodeSum(tileOrigin, cell, 0, i32(round(particleVelocity.x * weight * FIXED_POINT_SCALE)));
    addNodeSum(tileOrigin, cell, 1, i32(round(particleVelocity.y * weight * FIXED_POINT_SCALE)));
    addNodeSum(tileOrigin, cell, 2, i32(round(particleVelocity.z * weight * FIXED_POINT_SCALE)));
    addNodeSum(tileOrigin, cell, 3, i32(round(weight * FIXED_POINT_SCALE)));
  }
}
