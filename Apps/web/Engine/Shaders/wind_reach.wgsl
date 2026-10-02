//#include opening_fog

const DEPTH_LAYERS = 8.0;
const SECONDS_OF_FULL_WIND_TO_REACH_THE_SURFACE = 5.0;
const SECONDS_FOR_STILL_AIR_TO_WITHDRAW_FROM_THE_SURFACE = 6.0;
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
  let reachedLayers = updatedWindDepthInLayers(column.xy);
  storeWindReachOfEachSlice(column.xy, surfaceMetres, reachedLayers, clearingSpeedUp, openingPerMeanBaseFog);
}

fn columnOpticalDepth(column: vec2u, surfaceMetres: f32, extinctionPerBaseFog: f32) -> f32 {
  var opticalDepth = 0.0;
  for (var slice = 0u; slice < u32(params.gridDepth); slice++) {
    opticalDepth += textureLoad(fog, vec3u(column, slice), 0).r * extinctionPerBaseFog * sliceMetresInFrontOfSurface(slice, surfaceMetres);
  }
  return opticalDepth;
}

fn updatedWindDepthInLayers(column: vec2u) -> f32 {
  let columnIndex = column.y * u32(params.gridWidth) + column.x;
  let movedAirInFront = textureLoad(flow, vec3u(column, NEAREST_SLICE), 0).w;
  let layersPerSecond = select(
    DEPTH_LAYERS / SECONDS_OF_FULL_WIND_TO_REACH_THE_SURFACE * movedAirInFront,
    -DEPTH_LAYERS / SECONDS_FOR_STILL_AIR_TO_WITHDRAW_FROM_THE_SURFACE,
    movedAirInFront < MOVED_AIR_SHARE_OF_STILL_AIR);
  let storedLayers = windDepthInLayers[columnIndex];
  let layersBefore = select(0.0, storedLayers, isFiniteNumber(storedLayers));
  let layersNow = clamp(layersBefore + layersPerSecond * stepSeconds(), 0.0, DEPTH_LAYERS + 1.0);
  windDepthInLayers[columnIndex] = layersNow;
  return layersNow;
}

fn storeWindReachOfEachSlice(column: vec2u, surfaceMetres: f32, reachedLayers: f32, clearingSpeedUp: f32, openingPerMeanBaseFog: f32) {
  let layerMetres = fogMetresInFrontOf(surfaceMetres) / DEPTH_LAYERS;
  for (var slice = 0u; slice < u32(params.gridDepth); slice++) {
    let layersOfDepth = sliceDepthMetres(f32(slice) + 0.5) / layerMetres;
    let reach = (1.0 - smoothstep(reachedLayers, reachedLayers + 1.0, layersOfDepth)) * shareInFrontOfSurface(slice, surfaceMetres);
    textureStore(windReachOut, vec3u(column, slice), vec4f(reach, clearingSpeedUp, fogCanLiveIn(slice, surfaceMetres), openingPerMeanBaseFog));
  }
}

fn shareInFrontOfSurface(slice: u32, surfaceMetres: f32) -> f32 {
  return 1.0 - smoothstep(surfaceMetres * 0.9, surfaceMetres * WIND_REACH_BEYOND_THE_SURFACE, sliceDepthMetres(f32(slice) + 0.5));
}

fn fogCanLiveIn(slice: u32, surfaceMetres: f32) -> f32 {
  return select(0.0, 1.0, sliceDepthMetres(f32(slice)) < surfaceMetres);
}
