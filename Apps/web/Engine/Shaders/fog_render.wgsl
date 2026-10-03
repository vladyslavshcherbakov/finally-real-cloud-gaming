//#include fullscreen_triangle

const BACK_SCATTERING = -0.25;
const BACK_SCATTERING_SHARE = 0.3;
const SCATTERING_OCTAVES = 3;
const OCTAVE_EXTINCTION_SCALE = 0.4;
const SKY_LIGHT_ABSORPTION = 0.05;
const AMBIENT_DESATURATION = 0.6;
const GLOW_DESATURATION = 0.4;
const FAINTEST_FOG = 0.002;
const OPAQUE_TRANSMITTANCE = 0.002;
const FINE_DETAIL_SCALE = 3.7;
const SECOND_PHASE_SHIFT = vec3f(0.31, 0.57, 0.11);
const LARGEST_PHASE = 2.0;
const WHOLE_PHOTO_MIP = 16.0;
const BRIGHTEST_FOG_OVER_SKY = 1.15;
const LUMINANCE_WEIGHTS = vec3f(0.2126, 0.7152, 0.0722);

struct ViewRay {
  canvasUv: vec2f,
  photoUv: vec2f,
  direction: vec3f,
  metresPerDepthMetre: f32,
  surfaceDepthMetres: f32,
  phase: f32,
  glow: vec3f,
}

struct FogLight {
  scattered: vec3f,
  transmittance: f32,
}

fn henyeyGreenstein(cosAngle: f32, asymmetry: f32) -> f32 {
  let asymmetrySquared = asymmetry * asymmetry;
  return (1.0 - asymmetrySquared) / pow(max(1.0 + asymmetrySquared - 2.0 * asymmetry * cosAngle, 1e-4), 1.5);
}

fn desaturated(colour: vec3f, amount: f32) -> vec3f {
  return mix(colour, vec3f(dot(colour, LUMINANCE_WEIGHTS)), amount);
}

fn viewRay(canvasUv: vec2f) -> ViewRay {
  let rayPhotoUv = photoUv(canvasUv);
  let surfaceDepthMetres = depthMetresFromCode(textureSampleLevel(sceneDepth, clampSampler, rayPhotoUv, 0.0).r);
  let unnormalised = vec3f((2.0 * canvasUv.x - 1.0) * params.tanHalfFovX, (1.0 - 2.0 * canvasUv.y) * params.tanHalfFovY, 1.0);
  let direction = normalize(unnormalised);
  let cosToSun = dot(direction, sunDirection());
  let phase = min(LARGEST_PHASE,
    mix(henyeyGreenstein(cosToSun, params.forwardScattering), henyeyGreenstein(cosToSun, BACK_SCATTERING), BACK_SCATTERING_SHARE));
  let glow = desaturated(textureSampleLevel(photo, clampSampler, rayPhotoUv, WHOLE_PHOTO_MIP).rgb, GLOW_DESATURATION) * params.sceneGlowIntensity;
  return ViewRay(canvasUv, rayPhotoUv, direction, length(unnormalised), surfaceDepthMetres, phase, glow);
}

fn detailNoiseAt(viewPoint: vec3f, depthMetres: f32, firstPhaseOffset: vec3f, secondPhaseOffset: vec3f) -> f32 {
  let scale = cellsPerMetre(depthMetres);
  let metresPerCell = vec3f(1.0 / scale.x, -1.0 / scale.y, 1.0 / scale.z);
  let phaseAge = fract(params.elapsedSeconds / params.detailFlowPeriodSeconds);
  let firstPhaseWeight = 1.0 - abs(2.0 * phaseAge - 1.0);
  let firstPoint = (viewPoint - firstPhaseOffset * metresPerCell) * params.detailScalePerMetre;
  let secondPoint = (viewPoint - secondPhaseOffset * metresPerCell) * params.detailScalePerMetre + SECOND_PHASE_SHIFT;
  let firstCoarse = textureSampleLevel(detailNoise, repeatSampler, firstPoint, 0.0).r;
  let secondCoarse = textureSampleLevel(detailNoise, repeatSampler, secondPoint, 0.0).r;
  let firstFine = textureSampleLevel(detailNoise, repeatSampler, firstPoint * FINE_DETAIL_SCALE, 0.0);
  let secondFine = textureSampleLevel(detailNoise, repeatSampler, secondPoint * FINE_DETAIL_SCALE, 0.0);
  let coarse = mix(secondCoarse, firstCoarse, firstPhaseWeight);
  let fine = mix(secondFine.g * 0.6 + secondFine.b * 0.4, firstFine.g * 0.6 + firstFine.b * 0.4, firstPhaseWeight);
  return coarse * 0.75 + fine * 0.25;
}

fn densityWithDetail(gridDensity: f32, shareOfMeanBaseFog: f32, detail: f32) -> f32 {
  let eroded = clamp(remap(shareOfMeanBaseFog, (1.0 - detail) * params.erosion, 1.0, 0.0, 1.0), 0.0, 4.0);
  let varied = shareOfMeanBaseFog * (0.35 + 1.3 * smoothstep(0.2, 0.8, detail));
  let detailedShare = mix(shareOfMeanBaseFog, min(eroded, varied), params.detailAmount);
  return gridDensity * detailedShare / max(shareOfMeanBaseFog, 1e-4);
}

fn sunVisibility(opticalDepthToSun: f32) -> f32 {
  var visibility = 0.0;
  var extinctionScale = 1.0;
  var octaveWeight = 1.0;
  for (var octave = 0; octave < SCATTERING_OCTAVES; octave++) {
    visibility += octaveWeight * exp(-opticalDepthToSun * extinctionScale);
    extinctionScale *= OCTAVE_EXTINCTION_SCALE;
    octaveWeight *= params.multipleScattering;
  }
  return visibility;
}

fn lightReachingFog(ray: ViewRay, viewPoint: vec3f, sampleUvw: vec3f) -> vec3f {
  let opticalDepths = textureSampleLevel(light, clampSampler, sampleUvw, 0.0);
  let heightShare = clamp(heightAboveGround(viewPoint) / 40.0, 0.0, 1.0);
  let ambient = desaturated(mix(groundColor(), skyColor(), 0.55 + 0.45 * heightShare), AMBIENT_DESATURATION)
    / (1.0 + opticalDepths.g * SKY_LIGHT_ABSORPTION) * params.ambientIntensity;
  return boundedBySky(sunColor() * params.sunIntensity * ray.phase * sunVisibility(opticalDepths.r) + ambient + ray.glow);
}

fn boundedBySky(scatteredLight: vec3f) -> vec3f {
  let brightestFogLuminance = dot(skyColor(), LUMINANCE_WEIGHTS) * BRIGHTEST_FOG_OVER_SKY;
  let lightLuminance = dot(scatteredLight, LUMINANCE_WEIGHTS);
  if (lightLuminance <= brightestFogLuminance) { return scatteredLight; }
  return scatteredLight * (brightestFogLuminance / lightLuminance);
}

fn fogAlongRay(ray: ViewRay) -> FogLight {
  var fogLight = FogLight(vec3f(0.0), 1.0);
  let endMetres = min(ray.surfaceDepthMetres, params.farSliceMetres);
  let samplesPerSlice = max(i32(params.samplesPerSlice), 1);
  for (var sampleNumber = 0; sampleNumber < i32(params.gridDepth) * samplesPerSlice; sampleNumber++) {
    var nearMetres = sliceDepthMetres(f32(sampleNumber) / f32(samplesPerSlice));
    if (sampleNumber == 0) { nearMetres = 0.0; }
    if (nearMetres >= endMetres) { break; }
    let farMetres = min(sliceDepthMetres(f32(sampleNumber + 1) / f32(samplesPerSlice)), endMetres);
    let middleMetres = 0.5 * (nearMetres + farMetres);
    let sampleUvw = vec3f(ray.canvasUv, max(sliceAtDepth(middleMetres), 0.5) / params.gridDepth);
    let fogCell = textureSampleLevel(fog, clampSampler, sampleUvw, 0.0);
    if (fogCell.r < FAINTEST_FOG) { continue; }
    let viewPoint = ray.direction * middleMetres * ray.metresPerDepthMetre;
    let secondPhaseOffset = textureSampleLevel(flow, clampSampler, sampleUvw, 0.0).xyz;
    let openingPerMeanBaseFog = textureSampleLevel(windReach, clampSampler, sampleUvw, 0.0).a;
    let shareOfMeanBaseFog = fogCell.r * openingPerMeanBaseFog / max(params.openingOpticalDepth, 1e-4);
    let extinction = densityWithDetail(fogCell.r, shareOfMeanBaseFog, detailNoiseAt(viewPoint, middleMetres, fogCell.yzw, secondPhaseOffset))
      * openingPerMeanBaseFog / fogMetresInFrontOf(ray.surfaceDepthMetres);
    let segmentTransmittance = exp(-extinction * (farMetres - nearMetres) * ray.metresPerDepthMetre);
    fogLight.scattered += fogLight.transmittance * lightReachingFog(ray, viewPoint, sampleUvw) * (1.0 - segmentTransmittance);
    fogLight.transmittance *= segmentTransmittance;
    if (fogLight.transmittance < OPAQUE_TRANSMITTANCE) { break; }
  }
  return fogLight;
}

@fragment
fn main(vertex: FullscreenVertex) -> @location(0) vec4f {
  let ray = viewRay(vertex.canvasUv);
  let fogLight = fogAlongRay(ray);
  return vec4f(fogLight.scattered, fogLight.transmittance);
}
