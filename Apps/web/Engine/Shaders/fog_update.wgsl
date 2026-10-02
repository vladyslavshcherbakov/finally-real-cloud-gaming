//#include base_fog

const LARGEST_STABLE_DIFFUSION_STEP = 0.16;
const MOVED_AIR_FADE_SECONDS = 2.0;

fn neighbourDensity(neighbour: vec3i, ownDensity: f32) -> f32 {
  let cell = clampedToGrid(neighbour);
  if (textureLoad(windReach, cell, 0).b < 0.5) { return ownDensity; }
  return textureLoad(fog, cell, 0).r;
}

fn fogJustInFront(cell: vec3i) -> f32 {
  if (cell.z == 0) { return 0.0; }
  return textureLoad(fog, cell - vec3i(0, 0, 1), 0).r;
}

fn fogAt(cell: vec3i) -> f32 {
  return textureLoad(fog, clampedToGrid(cell), 0).r;
}

fn macCormackDensity(cell: vec3i, centre: vec3f, displacement: vec3f, semiLagrangianDensity: f32) -> f32 {
  let returnTrip = textureSampleLevel(advected, clampSampler, (centre + displacement) / gridSize(), 0.0).r;
  let correctedDensity = semiLagrangianDensity + 0.5 * (fogAt(cell) - returnTrip);
  let departureCorner = vec3i(floor(centre - displacement - 0.5));
  var lowest = 1e9;
  var highest = -1e9;
  for (var corner = 0; corner < 8; corner++) {
    let neighbourDensity = fogAt(departureCorner + vec3i(corner & 1, (corner >> 1) & 1, (corner >> 2) & 1));
    lowest = min(lowest, neighbourDensity);
    highest = max(highest, neighbourDensity);
  }
  return clamp(correctedDensity, lowest, highest);
}

fn shareOfPointInsideGrid(point: vec3f) -> f32 {
  let distanceBeyondGrid = max(max(-point, point - gridSize()), vec3f(0.0));
  return clamp(1.0 - max(distanceBeyondGrid.x, max(distanceBeyondGrid.y, distanceBeyondGrid.z)), 0.0, 1.0);
}

fn densityLaplacian(cell: vec3i) -> f32 {
  let ownDensity = textureLoad(fog, cell, 0).r;
  return neighbourDensity(cell + vec3i(1, 0, 0), ownDensity) + neighbourDensity(cell - vec3i(1, 0, 0), ownDensity)
    + neighbourDensity(cell + vec3i(0, 1, 0), ownDensity) + neighbourDensity(cell - vec3i(0, 1, 0), ownDensity)
    + neighbourDensity(cell + vec3i(0, 0, 1), ownDensity) + neighbourDensity(cell - vec3i(0, 0, 1), ownDensity) - 6.0 * ownDensity;
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
  if (USE_MACCORMACK) { density = macCormackDensity(cell, centre, displacement, density); }
  density *= mix(1.0, shareOfPointInsideGrid(centre - displacement), movedAir);
  density += min(params.diffusion * stepSeconds(), LARGEST_STABLE_DIFFUSION_STEP) * densityLaplacian(cell);
  let baseDensity = baseFogDensity(centre);
  density += (baseDensity - density) * (1.0 - exp(-params.returnRate * stepSeconds()));
  density *= exp(-params.wakeMixing * movedAir * windReachHere.g * stepSeconds());
  if (windReachHere.b < 0.5) { density = fogJustInFront(cell); }

  var firstPhaseOffset = textureSampleLevel(fog, clampSampler, departureUvw, 0.0).yzw + displacement;
  var secondPhaseOffset = textureSampleLevel(flow, clampSampler, departureUvw, 0.0).xyz + displacement;
  if (phaseRestarted(0.0)) { firstPhaseOffset = vec3f(0.0); }
  if (phaseRestarted(0.5)) { secondPhaseOffset = vec3f(0.0); }

  textureStore(fogOut, cellId, vec4f(max(density, 0.0), firstPhaseOffset));
  textureStore(flowOut, cellId, vec4f(secondPhaseOffset, movedAir));
}
