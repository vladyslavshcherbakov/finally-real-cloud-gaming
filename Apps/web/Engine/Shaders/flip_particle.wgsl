struct FlipParticle {
  position: vec4f,
  velocity: vec4f,
}

const FIXED_POINT_SCALE = 4096.0;
const FASTEST_PARTICLE_CELLS_PER_SECOND = 400.0;
