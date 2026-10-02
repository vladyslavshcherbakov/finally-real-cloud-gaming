@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) slabTexel: vec3u) {
  let texel = slabTexel + vec3u(0u, 0u, u32(params.noiseSlabStart));
  let size = textureDimensions(detailNoiseOut);
  if (any(texel >= size)) { return; }
  let tilePoint = (vec3f(texel) + 0.5) / vec3f(size);
  let perlin = (gradientNoise(tilePoint * 4.0, 4) * 0.5 + gradientNoise(tilePoint * 8.0, 8) * 0.25
    + gradientNoise(tilePoint * 16.0, 16) * 0.125) / 0.875 * 0.5 + 0.5;
  let worley4 = invertedWorleyNoise(tilePoint * 4.0, 4);
  let worley8 = invertedWorleyNoise(tilePoint * 8.0, 8);
  let worley16 = invertedWorleyNoise(tilePoint * 16.0, 16);
  let worley32 = invertedWorleyNoise(tilePoint * 32.0, 32);
  let lowWorley = worley4 * 0.625 + worley8 * 0.25 + worley16 * 0.125;
  let perlinWorley = clamp(remap(clamp(perlin, 0.0, 1.0), lowWorley - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  let middleWorley = worley8 * 0.625 + worley16 * 0.25 + worley32 * 0.125;
  let highWorley = worley16 * 0.625 + worley32 * 0.375;
  textureStore(detailNoiseOut, texel, vec4f(perlinWorley, lowWorley, middleWorley, highWorley));
}
