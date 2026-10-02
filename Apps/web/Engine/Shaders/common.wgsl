const PI = 3.14159265;

fn gridSize() -> vec3f { return vec3f(params.gridWidth, params.gridHeight, params.gridDepth); }
fn gridSizeInCells() -> vec3i { return vec3i(gridSize()); }
fn stepSeconds() -> f32 { return params.stepSeconds; }
fn groundNormal() -> vec3f { return normalize(vec3f(params.groundNormalX, params.groundNormalY, params.groundNormalZ)); }
fn sunDirection() -> vec3f { return normalize(vec3f(params.sunDirectionX, params.sunDirectionY, params.sunDirectionZ)); }
fn sunColor() -> vec3f { return vec3f(params.sunColorR, params.sunColorG, params.sunColorB); }
fn skyColor() -> vec3f { return vec3f(params.skyColorR, params.skyColorG, params.skyColorB); }
fn groundColor() -> vec3f { return vec3f(params.groundColorR, params.groundColorG, params.groundColorB); }
fn windDrift() -> vec3f { return vec3f(params.windDriftX, params.windDriftY, params.windDriftZ); }

fn isInsideGrid(cell: vec3i) -> bool {
  return all(cell >= vec3i(0)) && all(cell < gridSizeInCells());
}

fn clampedToGrid(cell: vec3i) -> vec3i {
  return clamp(cell, vec3i(0), gridSizeInCells() - 1);
}

fn cellIndex(cell: vec3i) -> u32 {
  let size = gridSizeInCells();
  return u32(cell.x + size.x * (cell.y + size.y * cell.z));
}

fn cellCentre(cell: vec3u) -> vec3f { return vec3f(cell) + 0.5; }

const NOT_FINITE_EXPONENT = 0x7f800000u;

fn isFiniteNumber(value: f32) -> bool {
  return (bitcast<u32>(value) & NOT_FINITE_EXPONENT) != NOT_FINITE_EXPONENT;
}

fn isFiniteVector(value: vec3f) -> bool {
  return isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.z);
}

fn finiteOrZero(value: vec3f) -> vec3f {
  return select(vec3f(0.0), value, isFiniteVector(value));
}

fn sliceDepthMetres(slice: f32) -> f32 {
  return params.nearSliceMetres * exp(params.sliceLogRange * slice / params.gridDepth);
}

fn sliceAtDepth(depthMetres: f32) -> f32 {
  return params.gridDepth * log(max(depthMetres, 1e-4) / params.nearSliceMetres) / params.sliceLogRange;
}

fn viewPosition(gridPosition: vec3f) -> vec3f {
  let depthMetres = sliceDepthMetres(gridPosition.z);
  let canvasUv = gridPosition.xy / gridSize().xy;
  return vec3f(
    (2.0 * canvasUv.x - 1.0) * params.tanHalfFovX * depthMetres,
    (1.0 - 2.0 * canvasUv.y) * params.tanHalfFovY * depthMetres,
    depthMetres);
}

fn gridPosition(viewPoint: vec3f) -> vec3f {
  let depthMetres = max(viewPoint.z, 1e-3);
  let canvasU = 0.5 + 0.5 * viewPoint.x / (params.tanHalfFovX * depthMetres);
  let canvasV = 0.5 - 0.5 * viewPoint.y / (params.tanHalfFovY * depthMetres);
  return vec3f(canvasU * params.gridWidth, canvasV * params.gridHeight, sliceAtDepth(depthMetres));
}

const NEAREST_FLOW_DEPTH_METRES = 15.0;

fn flowDepthMetres(depthMetres: f32) -> f32 {
  return max(depthMetres, NEAREST_FLOW_DEPTH_METRES);
}

fn flowDepthRelativeToFarSlice(gridZ: f32) -> f32 {
  return flowDepthMetres(sliceDepthMetres(gridZ)) / params.farSliceMetres;
}

fn pressureAxisWeights() -> vec3f {
  let cellSizePerDepthMetre = vec3f(
    2.0 * params.tanHalfFovX / params.gridWidth, 2.0 * params.tanHalfFovY / params.gridHeight, params.sliceLogRange / params.gridDepth);
  let sizeRelativeToWidth = cellSizePerDepthMetre.x / cellSizePerDepthMetre;
  return sizeRelativeToWidth * sizeRelativeToWidth;
}

fn cellsPerMetre(depthMetres: f32) -> vec3f {
  return vec3f(
    params.gridWidth / (2.0 * params.tanHalfFovX * depthMetres),
    params.gridHeight / (2.0 * params.tanHalfFovY * depthMetres),
    params.gridDepth / (depthMetres * params.sliceLogRange));
}

fn viewVelocityInCells(metresPerSecond: vec3f, depthMetres: f32) -> vec3f {
  let scale = cellsPerMetre(depthMetres);
  return vec3f(metresPerSecond.x * scale.x, -metresPerSecond.y * scale.y, metresPerSecond.z * scale.z);
}

fn heightAboveGround(viewPoint: vec3f) -> f32 { return dot(groundNormal(), viewPoint) + params.groundOffsetMetres; }

fn photoUv(canvasUv: vec2f) -> vec2f {
  return canvasUv * vec2f(params.photoScaleU, params.photoScaleV) + vec2f(params.photoOffsetU, params.photoOffsetV);
}

fn fogMetresInFrontOf(surfaceMetres: f32) -> f32 {
  return clamp(surfaceMetres, params.nearSliceMetres, params.farSliceMetres);
}

fn depthMetresFromCode(depthCode: f32) -> f32 {
  return params.depthCodecNearMetres * exp(depthCode * params.depthCodecLogRange);
}

fn skyDepthMetres() -> f32 { return params.depthCodecNearMetres * exp(params.depthCodecLogRange); }

fn pcg3d(seed: vec3u) -> vec3u {
  var state = seed * 1664525u + 1013904223u;
  state.x += state.y * state.z; state.y += state.z * state.x; state.z += state.x * state.y;
  state ^= state >> vec3u(16u);
  state.x += state.y * state.z; state.y += state.z * state.x; state.z += state.x * state.y;
  return state;
}

fn randomInCell(cell: vec3i) -> vec3f {
  return vec3f(pcg3d(bitcast<vec3u>(cell))) * (1.0 / 4294967295.0);
}

fn randomFraction(seed: u32) -> f32 {
  return f32(pcg3d(vec3u(seed, seed * 7919u, 104729u)).x) * (1.0 / 4294967295.0);
}

fn wrappedLatticePoint(point: vec3i, period: i32) -> vec3i {
  if (period <= 0) { return point; }
  return ((point % period) + period) % period;
}

fn gradientNoise(position: vec3f, period: i32) -> f32 {
  let lattice = vec3i(floor(position));
  let offsetInCell = fract(position);
  let fade = offsetInCell * offsetInCell * offsetInCell * (offsetInCell * (offsetInCell * 6.0 - 15.0) + 10.0);
  var cornerValues: array<f32, 8>;
  for (var corner = 0; corner < 8; corner++) {
    let cornerOffset = vec3i(corner & 1, (corner >> 1) & 1, (corner >> 2) & 1);
    let gradient = normalize(randomInCell(wrappedLatticePoint(lattice + cornerOffset, period)) * 2.0 - 1.0 + vec3f(1e-5));
    cornerValues[corner] = dot(gradient, offsetInCell - vec3f(cornerOffset));
  }
  let alongX = vec4f(
    mix(cornerValues[0], cornerValues[1], fade.x), mix(cornerValues[2], cornerValues[3], fade.x),
    mix(cornerValues[4], cornerValues[5], fade.x), mix(cornerValues[6], cornerValues[7], fade.x));
  let unitRangeScale = 1.6;
  return mix(mix(alongX.x, alongX.y, fade.y), mix(alongX.z, alongX.w, fade.y), fade.z) * unitRangeScale;
}

fn invertedWorleyNoise(position: vec3f, period: i32) -> f32 {
  let lattice = vec3i(floor(position));
  let offsetInCell = fract(position);
  var nearestSquared = 1.0;
  for (var neighbour = 0; neighbour < 27; neighbour++) {
    let neighbourOffset = vec3i(neighbour % 3, (neighbour / 3) % 3, neighbour / 9) - 1;
    let featurePoint = vec3f(neighbourOffset) + randomInCell(wrappedLatticePoint(lattice + neighbourOffset, period) + vec3i(17, 59, 113));
    let toFeature = featurePoint - offsetInCell;
    nearestSquared = min(nearestSquared, dot(toFeature, toFeature));
  }
  return 1.0 - sqrt(nearestSquared);
}

fn remap(value: f32, fromLow: f32, fromHigh: f32, toLow: f32, toHigh: f32) -> f32 {
  return toLow + (value - fromLow) / max(fromHigh - fromLow, 1e-5) * (toHigh - toLow);
}

struct WindEffect {
  acceleration: vec3f,
  movedAirShare: f32,
}

const SWEEP_PUSH = 8.0;
const INTO_SCENE_PUSH_WHILE_SWEEPING = 3.0;
const OUTWARD_PUSH = 15.0;
const INTO_SCENE_PUSH = 6.0;
const POINTER_SPEED_FOR_FULL_CLEANING = 0.4;
const WIND_REACH_IN_RADII_SQUARED = 9.0;

fn windEffect(gridPoint: vec3f) -> WindEffect {
  var effect = WindEffect(vec3f(0.0), 0.0);
  let canvasUv = gridPoint.xy / gridSize().xy;
  for (var i = 0; i < i32(params.windSourceCount); i++) {
    let source = params.windSources[i];
    let fromSource = (canvasUv - vec2f(source.u, source.v)) * vec2f(params.canvasAspect, 1.0);
    let radiiSquared = dot(fromSource, fromSource) / (source.radius * source.radius);
    if (radiiSquared > WIND_REACH_IN_RADII_SQUARED) { continue; }
    let weight = exp(-radiiSquared) * source.strength;
    let motion = clamp(length(vec2f(source.velocityU, source.velocityV)) / POINTER_SPEED_FOR_FULL_CLEANING, 0.0, 1.0);
    effect.acceleration += weight * sourcePush(source, fromSource, motion);
    let blowing = weight * max(motion, source.outwardStrength);
    effect.movedAirShare = min(1.0, effect.movedAirShare + blowing);
  }
  return effect;
}

fn sourcePush(source: WindSourceParams, fromSource: vec2f, motion: f32) -> vec3f {
  let sweepInCells = vec2f(source.velocityU, source.velocityV) * gridSize().xy;
  let outwardInCells = normalize(vec3f(fromSource / params.canvasAspect * gridSize().xy, 0.0) + vec3f(1e-5));
  let outwardPush = source.outwardStrength * (outwardInCells * OUTWARD_PUSH + vec3f(0.0, 0.0, INTO_SCENE_PUSH));
  return vec3f(sweepInCells * SWEEP_PUSH, motion * INTO_SCENE_PUSH_WHILE_SWEEPING) + outwardPush;
}
