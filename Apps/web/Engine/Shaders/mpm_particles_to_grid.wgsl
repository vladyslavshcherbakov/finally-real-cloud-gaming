//#include mpm_particle
//#include particle_tile

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) invocation: vec3u, @builtin(local_invocation_index) threadNumber: u32, @builtin(workgroup_id) workgroup: vec3u) {
  let particleCount = arrayLength(&particles);
  let tileOrigin = tileOriginForParticle(particles[min(workgroup.x * WORKGROUP_SIZE_X, particleCount - 1u)].positionAndVolumeRatio.xyz);
  clearTile(threadNumber);
  workgroupBarrier();
  if (invocation.x < particleCount) { addParticleToTile(particles[invocation.x], tileOrigin); }
  workgroupBarrier();
  addTileToGrid(tileOrigin, threadNumber);
}

fn addParticleToTile(particle: MpmParticle, tileOrigin: vec3i) {
  let substep = params.mpmSubstepSeconds;
  let particleVolume = 1.0 / params.particlesPerCell;
  let particleMass = particleVolume;
  let stencil = quadraticStencil(particle.positionAndVolumeRatio.xyz);
  let pressureTerm = -substep * 4.0 * params.bulkStiffness * particleVolume * (particle.positionAndVolumeRatio.w - 1.0);
  let affineMomentum = particleAffine(particle) * particleMass
    + mat3x3f(pressureTerm, 0.0, 0.0, 0.0, pressureTerm, 0.0, 0.0, 0.0, pressureTerm);
  let particleMomentum = particleMass * clamp(particleVelocity(particle), vec3f(-FASTEST_PARTICLE_CELLS_PER_SECOND), vec3f(FASTEST_PARTICLE_CELLS_PER_SECOND));
  for (var node = 0; node < 27; node++) {
    let nodeOffset = stencilNodeOffset(node);
    let gridNode = stencil.lowerNode + nodeOffset;
    if (!isInsideGrid(gridNode)) { continue; }
    let weight = stencilWeight(stencil, nodeOffset);
    let nodeMomentum = weight * (particleMomentum + affineMomentum * (vec3f(nodeOffset) - stencil.offsetFromLowerNode));
    addNodeSum(tileOrigin, gridNode, 0, i32(round(nodeMomentum.x * FIXED_POINT_SCALE)));
    addNodeSum(tileOrigin, gridNode, 1, i32(round(nodeMomentum.y * FIXED_POINT_SCALE)));
    addNodeSum(tileOrigin, gridNode, 2, i32(round(nodeMomentum.z * FIXED_POINT_SCALE)));
    addNodeSum(tileOrigin, gridNode, 3, i32(round(weight * particleMass * FIXED_POINT_SCALE)));
  }
}
