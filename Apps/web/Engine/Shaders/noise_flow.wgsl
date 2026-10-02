const FLOW_NOISE_PERIOD = 4;
const POTENTIAL_STEP = 0.01;

fn twoOctaveNoise(position: vec3f, period: i32) -> f32 {
  return gradientNoise(position, period) * 0.7 + gradientNoise(position * 2.0, period * 2) * 0.3;
}

fn potential(tilePoint: vec3f) -> vec3f {
  return vec3f(
    twoOctaveNoise(tilePoint, FLOW_NOISE_PERIOD),
    twoOctaveNoise(tilePoint + vec3f(31.4, 7.1, 13.7), FLOW_NOISE_PERIOD),
    twoOctaveNoise(tilePoint + vec3f(3.3, 47.9, 23.1), FLOW_NOISE_PERIOD));
}

fn curlPerTextureUnit(tilePoint: vec3f) -> vec3f {
  let alongX = potential(tilePoint + vec3f(POTENTIAL_STEP, 0.0, 0.0)) - potential(tilePoint - vec3f(POTENTIAL_STEP, 0.0, 0.0));
  let alongY = potential(tilePoint + vec3f(0.0, POTENTIAL_STEP, 0.0)) - potential(tilePoint - vec3f(0.0, POTENTIAL_STEP, 0.0));
  let alongZ = potential(tilePoint + vec3f(0.0, 0.0, POTENTIAL_STEP)) - potential(tilePoint - vec3f(0.0, 0.0, POTENTIAL_STEP));
  let curlPerTileUnit = vec3f(alongY.z - alongZ.y, alongZ.x - alongX.z, alongX.y - alongY.x) / (2.0 * POTENTIAL_STEP);
  return curlPerTileUnit * f32(FLOW_NOISE_PERIOD);
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) slabTexel: vec3u) {
  let texel = slabTexel + vec3u(0u, 0u, u32(params.noiseSlabStart));
  let size = textureDimensions(flowNoiseOut);
  if (any(texel >= size)) { return; }
  let tilePoint = (vec3f(texel) + 0.5) / vec3f(size) * f32(FLOW_NOISE_PERIOD);
  let clumps = (gradientNoise(tilePoint, FLOW_NOISE_PERIOD) * 0.55 + gradientNoise(tilePoint * 2.0, FLOW_NOISE_PERIOD * 2) * 0.3
    + gradientNoise(tilePoint * 4.0, FLOW_NOISE_PERIOD * 4) * 0.15) * 0.5 + 0.5;
  textureStore(flowNoiseOut, texel, vec4f(curlPerTextureUnit(tilePoint), clamp(clumps, 0.0, 1.0)));
}
