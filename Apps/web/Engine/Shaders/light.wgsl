const FIRST_LIGHT_STEP_METRES = 0.5;
const LIGHT_STEP_GROWTH = 1.8;
const SUN_LIGHT_STEPS = 9;
const SKY_LIGHT_STEPS = 6;
const SOLID_EXTINCTION_PER_METRE = 3.0;

fn opticalDepthToward(start: vec3f, direction: vec3f, steps: i32) -> f32 {
  var opticalDepth = 0.0;
  var travelledMetres = 0.0;
  var stepMetres = FIRST_LIGHT_STEP_METRES;
  for (var i = 0; i < steps; i++) {
    let samplePoint = start + direction * (travelledMetres + stepMetres * 0.5);
    let sampleUvw = gridPosition(samplePoint) / gridSize();
    if (sampleUvw.z > 1.0 || samplePoint.z < 0.05) { break; }
    let fogDensity = textureSampleLevel(fog, clampSampler, sampleUvw, 0.0).r;
    var solidFraction = 0.0;
    if (all(sampleUvw.xy > vec2f(0.0)) && all(sampleUvw.xy < vec2f(1.0))) {
      solidFraction = textureSampleLevel(solids, clampSampler, sampleUvw, 0.0).r;
    }
    opticalDepth += (fogDensity + solidFraction * SOLID_EXTINCTION_PER_METRE) * stepMetres;
    travelledMetres += stepMetres;
    stepMetres *= LIGHT_STEP_GROWTH;
  }
  return opticalDepth;
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cell: vec3u) {
  if (any(cell >= vec3u(gridSize()))) { return; }
  let cellViewPoint = viewPosition(cellCentre(cell));
  let opticalDepthToSun = opticalDepthToward(cellViewPoint, sunDirection(), SUN_LIGHT_STEPS);
  let opticalDepthToSky = opticalDepthToward(cellViewPoint, groundNormal(), SKY_LIGHT_STEPS);
  let previousOpticalDepths = textureLoad(previousLight, cell, 0).xy;
  let smoothedOpticalDepths = mix(previousOpticalDepths, vec2f(opticalDepthToSun, opticalDepthToSky), params.lightBlend);
  textureStore(lightOut, cell, vec4f(smoothedOpticalDepths, 0.0, 1.0));
}
