//#include mpm_particle

const VELOCITY_KEPT_AFTER_HITTING_A_SOLID = 0.3;
const VELOCITY_KEPT_PER_SUBSTEP = 0.999;
const SMALLEST_VOLUME_RATIO = 0.6;
const LARGEST_VOLUME_RATIO = 1.6;

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) invocation: vec3u) {
  if (invocation.x >= arrayLength(&particles)) { return; }
  let particle = particles[invocation.x];
  let substep = params.mpmSubstepSeconds;
  let stencil = quadraticStencil(particle.positionAndVolumeRatio.xyz);
  var newVelocity = vec3f(0.0);
  var affine = mat3x3f(vec3f(0.0), vec3f(0.0), vec3f(0.0));
  for (var node = 0; node < 27; node++) {
    let nodeOffset = stencilNodeOffset(node);
    let weight = stencilWeight(stencil, nodeOffset);
    let nodeVelocity = textureLoad(velocity, clampedToGrid(stencil.lowerNode + nodeOffset), 0).xyz;
    let toNode = vec3f(nodeOffset) - stencil.offsetFromLowerNode;
    newVelocity += weight * nodeVelocity;
    affine += 4.0 * weight * mat3x3f(nodeVelocity * toNode.x, nodeVelocity * toNode.y, nodeVelocity * toNode.z);
  }
  var newPosition = clamp(particle.positionAndVolumeRatio.xyz + newVelocity * substep, vec3f(1.0), gridSize() - 1.0);
  if (textureLoad(solids, vec3i(newPosition), 0).r > 0.5) {
    newPosition = particle.positionAndVolumeRatio.xyz;
    newVelocity *= VELOCITY_KEPT_AFTER_HITTING_A_SOLID;
  }
  let affineTrace = affine[0].x + affine[1].y + affine[2].z;
  let newVolumeRatio = clamp(particle.positionAndVolumeRatio.w * (1.0 + substep * affineTrace), SMALLEST_VOLUME_RATIO, LARGEST_VOLUME_RATIO);
  particles[invocation.x] = movedParticle(vec4f(newPosition, newVolumeRatio), newVelocity * VELOCITY_KEPT_PER_SUBSTEP, affine);
}
