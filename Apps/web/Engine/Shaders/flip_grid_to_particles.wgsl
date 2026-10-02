//#include flip_particle

const VELOCITY_KEPT_AFTER_HITTING_A_SOLID = 0.3;

fn velocityAt(field: texture_3d<f32>, gridPoint: vec3f) -> vec3f {
  return textureSampleLevel(field, clampSampler, gridPoint / gridSize(), 0.0).xyz;
}

fn respawnPoint(particleNumber: u32) -> vec3f {
  return randomInCell(vec3i(i32(particleNumber), i32(params.frameIndex), 3)) * gridSize();
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) invocation: vec3u) {
  if (invocation.x >= arrayLength(&particles)) { return; }
  let particle = particles[invocation.x];
  let projectedHere = velocityAt(projectedVelocity, particle.position.xyz);
  let transferredHere = velocityAt(transferredVelocity, particle.position.xyz);
  var newVelocity = mix(projectedHere, particle.velocity.xyz + (projectedHere - transferredHere), params.flipRatio);
  let midpoint = particle.position.xyz + projectedHere * stepSeconds() * 0.5;
  var newPosition = particle.position.xyz + velocityAt(projectedVelocity, midpoint) * stepSeconds();
  if (textureSampleLevel(solids, clampSampler, newPosition / gridSize(), 0.0).r > 0.5) {
    newPosition = particle.position.xyz;
    newVelocity *= VELOCITY_KEPT_AFTER_HITTING_A_SOLID;
  }
  let isRespawning = randomFraction(invocation.x * 9781u + u32(params.frameIndex) * 6271u) < params.respawnFractionPerStep;
  if (isRespawning || any(newPosition < vec3f(0.0)) || any(newPosition >= gridSize())) {
    newPosition = respawnPoint(invocation.x);
    newVelocity = velocityAt(projectedVelocity, newPosition);
  }
  particles[invocation.x] = FlipParticle(vec4f(newPosition, 1.0), vec4f(newVelocity, 0.0));
}
