fn cellOfParticle(position: vec3f) -> vec3i {
  return clampedToGrid(vec3i(floor(position)));
}
