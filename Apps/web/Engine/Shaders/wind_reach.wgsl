//#include opening_fog

const FARTHEST_WEAKENING_BEFORE_THE_WIND_BUILDS_UP = 0.0;
const SECONDS_OF_FULL_WIND_TO_BUILD_UP = 2.0;
const SECONDS_OF_STILL_AIR_TO_SETTLE = 4.0;
const MOVED_AIR_SHARE_OF_STILL_AIR = 0.02;
const NEAREST_SLICE = 0u;
const COLUMN_OPTICAL_DEPTH_CLEARED_AT_THE_PLAIN_RATE = 15.0;
const WIND_REACH_BEYOND_THE_SURFACE = 1.15;

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) column: vec3u) {
  if (any(column.xy >= vec2u(gridSize().xy))) { return; }
  let surfaceMetres = columnSurfaceMetres(column.xy);
  let openingPerMeanBaseFog = openingOpticalDepthPerMeanBaseFog(column.xy, surfaceMetres);
  let extinctionPerBaseFog = openingPerMeanBaseFog / fogMetresInFrontOf(surfaceMetres);
  let clearingSpeedUp = max(1.0, columnOpticalDepth(column.xy, surfaceMetres, extinctionPerBaseFog) / COLUMN_OPTICAL_DEPTH_CLEARED_AT_THE_PLAIN_RATE);
  let buildUp = updatedWindBuildUp(column.xy);
  storeWindReachOfEachSlice(column.xy, surfaceMetres, buildUp, clearingSpeedUp, openingPerMeanBaseFog);
}

fn columnOpticalDepth(column: vec2u, surfaceMetres: f32, extinctionPerBaseFog: f32) -> f32 {
  var opticalDepth = 0.0;
  for (var slice = 0u; slice < u32(params.gridDepth); slice++) {
    opticalDepth += textureLoad(fog, vec3u(column, slice), 0).r * extinctionPerBaseFog * sliceMetresInFrontOfSurface(slice, surfaceMetres);
  }
  return opticalDepth;
}

fn updatedWindBuildUp(column: vec2u) -> f32 {
  let columnIndex = column.y * u32(params.gridWidth) + column.x;
  let movedAirInFront = textureLoad(flow, vec3u(column, NEAREST_SLICE), 0).w;
  let buildUpPerSecond = select(
    movedAirInFront / SECONDS_OF_FULL_WIND_TO_BUILD_UP,
    -1.0 / SECONDS_OF_STILL_AIR_TO_SETTLE,
    movedAirInFront < MOVED_AIR_SHARE_OF_STILL_AIR);
  let storedBuildUp = windBuildUp[columnIndex];
  let buildUpBefore = select(0.0, storedBuildUp, isFiniteNumber(storedBuildUp));
  let buildUpNow = clamp(buildUpBefore + buildUpPerSecond * stepSeconds(), 0.0, 1.0);
  windBuildUp[columnIndex] = buildUpNow;
  return buildUpNow;
}

fn storeWindReachOfEachSlice(column: vec2u, surfaceMetres: f32, buildUp: f32, clearingSpeedUp: f32, openingPerMeanBaseFog: f32) {
  let farthestWeakening = FARTHEST_WEAKENING_BEFORE_THE_WIND_BUILDS_UP * (1.0 - buildUp);
  for (var slice = 0u; slice < u32(params.gridDepth); slice++) {
    let shareOfTheWayToTheSurface = clamp(sliceDepthMetres(f32(slice) + 0.5) / fogMetresInFrontOf(surfaceMetres), 0.0, 1.0);
    let reach = (1.0 - farthestWeakening * shareOfTheWayToTheSurface) * shareInFrontOfSurface(slice, surfaceMetres);
    textureStore(windReachOut, vec3u(column, slice), vec4f(reach, clearingSpeedUp, fogCanLiveIn(slice, surfaceMetres), openingPerMeanBaseFog));
  }
}

fn shareInFrontOfSurface(slice: u32, surfaceMetres: f32) -> f32 {
  return 1.0 - smoothstep(surfaceMetres * 0.9, surfaceMetres * WIND_REACH_BEYOND_THE_SURFACE, sliceDepthMetres(f32(slice) + 0.5));
}

fn fogCanLiveIn(slice: u32, surfaceMetres: f32) -> f32 {
  return select(0.0, 1.0, sliceDepthMetres(f32(slice)) < surfaceMetres);
}
