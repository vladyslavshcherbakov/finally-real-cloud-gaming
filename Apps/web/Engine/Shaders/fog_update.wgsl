//#include base_fog

const LARGEST_STABLE_DIFFUSION_STEP = 0.16;
const MOVED_AIR_FADE_SECONDS = 2.0;

fn densityAt(cell: vec3i) -> f32 {
  return textureLoad(fog, clampedToGrid(cell), 0).r;
}

fn shareOfPointInsideGrid(point: vec3f) -> f32 {
  let distanceBeyondGrid = max(max(-point, point - gridSize()), vec3f(0.0));
  return clamp(1.0 - max(distanceBeyondGrid.x, max(distanceBeyondGrid.y, distanceBeyondGrid.z)), 0.0, 1.0);
}

fn densityLaplacian(cell: vec3i) -> f32 {
  return densityAt(cell + vec3i(1, 0, 0)) + densityAt(cell - vec3i(1, 0, 0))
    + densityAt(cell + vec3i(0, 1, 0)) + densityAt(cell - vec3i(0, 1, 0))
    + densityAt(cell + vec3i(0, 0, 1)) + densityAt(cell - vec3i(0, 0, 1)) - 6.0 * densityAt(cell);
}

fn phaseRestarted(phaseOffset: f32) -> bool {
  let period = params.detailFlowPeriodSeconds;
  return floor(params.elapsedSeconds / period + phaseOffset) != floor((params.elapsedSeconds - stepSeconds()) / period + phaseOffset);
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  if (any(cellId >= vec3u(gridSize()))) { return; }
  let cell = vec3i(cellId);
  let centre = cellCentre(cellId);
  let displacement = textureLoad(velocity, cellId, 0).xyz * stepSeconds();
  let departureUvw = (centre - displacement) / gridSize();
  let wind = windEffect(centre);
  let windReachHere = textureLoad(windReach, cellId, 0);
  let movedAir = max(textureSampleLevel(flow, clampSampler, departureUvw, 0.0).w * exp(-stepSeconds() / MOVED_AIR_FADE_SECONDS), wind.movedAirShare * windReachHere.r);

  var density = textureLoad(advected, cellId, 0).r;
  density *= mix(1.0, shareOfPointInsideGrid(centre - displacement), movedAir);
  density += min(params.diffusion * stepSeconds(), LARGEST_STABLE_DIFFUSION_STEP) * densityLaplacian(cell);
  let baseDensity = baseFogDensity(centre);
  density += (baseDensity - density) * (1.0 - exp(-params.returnRate * stepSeconds()));
  density *= exp(-wind.cleanAirRate * windReachHere.r * windReachHere.g * stepSeconds());
  density *= windReachHere.b;

  var firstPhaseOffset = textureSampleLevel(fog, clampSampler, departureUvw, 0.0).yzw + displacement;
  var secondPhaseOffset = textureSampleLevel(flow, clampSampler, departureUvw, 0.0).xyz + displacement;
  if (phaseRestarted(0.0)) { firstPhaseOffset = vec3f(0.0); }
  if (phaseRestarted(0.5)) { secondPhaseOffset = vec3f(0.0); }

  textureStore(fogOut, cellId, vec4f(max(density, 0.0), firstPhaseOffset));
  textureStore(flowOut, cellId, vec4f(secondPhaseOffset, movedAir));
}
