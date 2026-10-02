const CLUMP_SCALE_PER_METRE = 0.02;
const CLUMP_RISE_PER_SECOND = 0.004;
const SWIRL_SCALE_PER_METRE = 0.05;
const SWIRL_OCTAVE_SCALE = 3.1;
const SWIRL_OCTAVE_WEIGHT = 0.45;
const SWIRL_SPEED_SCALE = 0.12;
const NEAREST_SWIRL_METRES = 15.0;

fn baseFogDensity(gridPoint: vec3f) -> f32 {
  let viewPoint = viewPosition(gridPoint);
  let elapsed = params.elapsedSeconds;
  let clumpPoint = (viewPoint - windDrift() * elapsed) * CLUMP_SCALE_PER_METRE + vec3f(0.0, elapsed * CLUMP_RISE_PER_SECOND, 0.0);
  let largeClumps = textureSampleLevel(flowNoise, repeatSampler, clumpPoint, 0.0).a;
  let smallClumps = textureSampleLevel(flowNoise, repeatSampler, clumpPoint * 2.9 + vec3f(0.37), 0.0).a;
  let clumpShape = smoothstep(0.3, 0.75, largeClumps * 0.7 + smallClumps * 0.3);
  let heightProfile = exp(-max(heightAboveGround(viewPoint), 0.0) / params.heightFalloffMetres);
  return (params.baseSmog + params.clumps * clumpShape) * heightProfile;
}

fn swirlingAirVelocity(gridPoint: vec3f) -> vec3f {
  let viewPoint = viewPosition(gridPoint);
  var curl = vec3f(0.0);
  var scale = SWIRL_SCALE_PER_METRE;
  var weight = 1.0;
  for (var octave = 0; octave < 2; octave++) {
    let noisePoint = (viewPoint - windDrift() * params.elapsedSeconds) * scale
      + vec3f(0.0, 0.0, params.elapsedSeconds * 0.02 * f32(octave + 1));
    curl += weight * textureSampleLevel(flowNoise, repeatSampler, noisePoint, 0.0).xyz;
    scale *= SWIRL_OCTAVE_SCALE;
    weight *= SWIRL_OCTAVE_WEIGHT;
  }
  let airMetresPerSecond = windDrift() + curl * params.turbulenceMetresPerSecond * SWIRL_SPEED_SCALE;
  return viewVelocityInCells(airMetresPerSecond, max(viewPoint.z, NEAREST_SWIRL_METRES));
}
