//#include base_fog

const LARGEST_STABLE_DIFFUSION_STEP = 0.16;
const MOVED_AIR_FADE_SECONDS = 2.0;

struct CellMotion {
  centre: vec3f,
  displacement: vec3f,
  departureUvw: vec3f,
}

struct DetailPhaseOffsets {
  first: vec3f,
  second: vec3f,
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  if (any(cellId >= vec3u(gridSize()))) { return; }
  let motion = cellMotion(cellId);
  let windReachHere = textureLoad(windReach, cellId, 0);
  let movedAir = movedAirShare(motion);
  let density = updatedDensity(vec3i(cellId), motion, movedAir, windReachHere);
  let phaseOffsets = updatedDetailPhaseOffsets(motion);
  textureStore(fogOut, cellId, vec4f(max(density, 0.0), phaseOffsets.first));
  textureStore(flowOut, cellId, vec4f(phaseOffsets.second, movedAir));
}

fn cellMotion(cellId: vec3u) -> CellMotion {
  let centre = cellCentre(cellId);
  let displacement = textureLoad(velocity, cellId, 0).xyz * stepSeconds();
  return CellMotion(centre, displacement, (centre - displacement) / gridSize());
}

fn movedAirShare(motion: CellMotion) -> f32 {
  let carriedMark = textureSampleLevel(flow, clampSampler, motion.departureUvw, 0.0).w * exp(-stepSeconds() / MOVED_AIR_FADE_SECONDS);
  return max(carriedMark, windEffect(motion.centre).movedAirShare);
}

fn updatedDensity(cell: vec3i, motion: CellMotion, movedAir: f32, windReachHere: vec4f) -> f32 {
  if (windReachHere.b < 0.5) { return fogJustInFront(cell); }
  var density = textureLoad(advected, cell, 0).r;
  density = densityStillInsideTheGrid(density, motion, movedAir);
  density = densityAfterCreep(density, cell);
  density = densityAfterReturning(density, motion.centre);
  return densityAfterWakeMixing(density, movedAir, windReachHere);
}

fn fogJustInFront(cell: vec3i) -> f32 {
  if (cell.z == 0) { return 0.0; }
  return textureLoad(fog, cell - vec3i(0, 0, 1), 0).r;
}

fn densityStillInsideTheGrid(density: f32, motion: CellMotion, movedAir: f32) -> f32 {
  return density * mix(1.0, shareOfPointInsideGrid(motion.centre - motion.displacement), movedAir);
}

fn shareOfPointInsideGrid(point: vec3f) -> f32 {
  let distanceBeyondGrid = max(max(-point, point - gridSize()), vec3f(0.0));
  return clamp(1.0 - max(distanceBeyondGrid.x, max(distanceBeyondGrid.y, distanceBeyondGrid.z)), 0.0, 1.0);
}

fn densityAfterCreep(density: f32, cell: vec3i) -> f32 {
  return density + min(params.diffusion * stepSeconds(), LARGEST_STABLE_DIFFUSION_STEP) * densityLaplacian(cell);
}

fn densityLaplacian(cell: vec3i) -> f32 {
  let ownDensity = textureLoad(fog, cell, 0).r;
  return neighbourDensity(cell + vec3i(1, 0, 0), ownDensity) + neighbourDensity(cell - vec3i(1, 0, 0), ownDensity)
    + neighbourDensity(cell + vec3i(0, 1, 0), ownDensity) + neighbourDensity(cell - vec3i(0, 1, 0), ownDensity)
    + neighbourDensity(cell + vec3i(0, 0, 1), ownDensity) + neighbourDensity(cell - vec3i(0, 0, 1), ownDensity) - 6.0 * ownDensity;
}

fn neighbourDensity(neighbour: vec3i, ownDensity: f32) -> f32 {
  let cell = clampedToGrid(neighbour);
  if (textureLoad(windReach, cell, 0).b < 0.5) { return ownDensity; }
  return textureLoad(fog, cell, 0).r;
}

fn densityAfterReturning(density: f32, centre: vec3f) -> f32 {
  return density + (baseFogDensity(centre) - density) * (1.0 - exp(-params.returnRate * stepSeconds()));
}

fn densityAfterWakeMixing(density: f32, movedAir: f32, windReachHere: vec4f) -> f32 {
  return density * exp(-params.wakeMixing * movedAir * windReachHere.r * windReachHere.g * stepSeconds());
}

fn updatedDetailPhaseOffsets(motion: CellMotion) -> DetailPhaseOffsets {
  var firstPhaseOffset = textureSampleLevel(fog, clampSampler, motion.departureUvw, 0.0).yzw + motion.displacement;
  var secondPhaseOffset = textureSampleLevel(flow, clampSampler, motion.departureUvw, 0.0).xyz + motion.displacement;
  if (phaseRestarted(0.0)) { firstPhaseOffset = vec3f(0.0); }
  if (phaseRestarted(0.5)) { secondPhaseOffset = vec3f(0.0); }
  return DetailPhaseOffsets(firstPhaseOffset, secondPhaseOffset);
}

fn phaseRestarted(phaseOffset: f32) -> bool {
  let period = params.detailFlowPeriodSeconds;
  return floor(params.elapsedSeconds / period + phaseOffset) != floor((params.elapsedSeconds - stepSeconds()) / period + phaseOffset);
}
