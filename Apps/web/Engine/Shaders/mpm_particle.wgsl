struct MpmParticle {
  positionAndVolumeRatio: vec4f,
  velocityAndAffineHalves: array<u32, 8>,
}

const FIXED_POINT_SCALE = 2048.0;
const FASTEST_PARTICLE_CELLS_PER_SECOND = 400.0;

fn particleVelocity(particle: MpmParticle) -> vec3f {
  return vec3f(unpack2x16float(particle.velocityAndAffineHalves[0]), unpack2x16float(particle.velocityAndAffineHalves[1]).x);
}

fn particleAffine(particle: MpmParticle) -> mat3x3f {
  let halves = particle.velocityAndAffineHalves;
  let first = unpack2x16float(halves[1]);
  let second = unpack2x16float(halves[2]);
  let third = unpack2x16float(halves[3]);
  let fourth = unpack2x16float(halves[4]);
  let fifth = unpack2x16float(halves[5]);
  return mat3x3f(vec3f(first.y, second), vec3f(third, fourth.x), vec3f(fourth.y, fifth));
}

fn movedParticle(positionAndVolumeRatio: vec4f, velocity: vec3f, affine: mat3x3f) -> MpmParticle {
  return MpmParticle(positionAndVolumeRatio, array<u32, 8>(
    pack2x16float(velocity.xy), pack2x16float(vec2f(velocity.z, affine[0].x)), pack2x16float(affine[0].yz),
    pack2x16float(affine[1].xy), pack2x16float(vec2f(affine[1].z, affine[2].x)), pack2x16float(affine[2].yz), 0u, 0u));
}

struct QuadraticStencil {
  lowerNode: vec3i,
  offsetFromLowerNode: vec3f,
  weights: array<vec3f, 3>,
}

fn quadraticStencil(particlePosition: vec3f) -> QuadraticStencil {
  let fromFirstNode = particlePosition - 0.5;
  let lowerNode = vec3i(floor(fromFirstNode - 0.5));
  let offset = fromFirstNode - vec3f(lowerNode);
  let weights = array<vec3f, 3>(
    0.5 * (1.5 - offset) * (1.5 - offset),
    0.75 - (offset - 1.0) * (offset - 1.0),
    0.5 * (offset - 0.5) * (offset - 0.5));
  return QuadraticStencil(lowerNode, offset, weights);
}

fn stencilNodeOffset(node: i32) -> vec3i { return vec3i(node % 3, (node / 3) % 3, node / 9); }

fn stencilWeight(stencil: QuadraticStencil, nodeOffset: vec3i) -> f32 {
  return stencil.weights[nodeOffset.x].x * stencil.weights[nodeOffset.y].y * stencil.weights[nodeOffset.z].z;
}
