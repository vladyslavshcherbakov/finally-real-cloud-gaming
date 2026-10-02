//#include opening_fog

const DEPTH_LAYERS = 8.0;
const SHIELDING_PER_FOGGY_LAYER = 3.0;
const COLUMN_OPTICAL_DEPTH_CLEARED_AT_THE_PLAIN_RATE = 15.0;
const WIND_REACH_BEYOND_THE_SURFACE = 1.15;

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) column: vec3u) {
  if (any(column.xy >= vec2u(gridSize().xy))) { return; }
  let surfaceMetres = columnSurfaceMetres(column.xy);
  let openingPerMeanBaseFog = openingOpticalDepthPerMeanBaseFog(column.xy, surfaceMetres);
  let extinctionPerBaseFog = openingPerMeanBaseFog / fogMetresInFrontOf(surfaceMetres);
  let clearingSpeedUp = max(1.0, columnOpticalDepth(column.xy, surfaceMetres, extinctionPerBaseFog) / COLUMN_OPTICAL_DEPTH_CLEARED_AT_THE_PLAIN_RATE);
  storeWindReachOfEachSlice(column.xy, surfaceMetres, clearingSpeedUp, openingPerMeanBaseFog);
}

fn columnOpticalDepth(column: vec2u, surfaceMetres: f32, extinctionPerBaseFog: f32) -> f32 {
  var opticalDepth = 0.0;
  for (var slice = 0u; slice < u32(params.gridDepth); slice++) {
    opticalDepth += textureLoad(fog, vec3u(column, slice), 0).r * extinctionPerBaseFog * sliceMetresInFrontOfSurface(slice, surfaceMetres);
  }
  return opticalDepth;
}

fn storeWindReachOfEachSlice(column: vec2u, surfaceMetres: f32, clearingSpeedUp: f32, openingPerMeanBaseFog: f32) {
  let layerMetres = params.farSliceMetres / DEPTH_LAYERS;
  var foggyMetresInFront = 0.0;
  for (var slice = 0u; slice < u32(params.gridDepth); slice++) {
    let foggyMetresHere = shareOfOpeningFogLeft(column, slice, surfaceMetres) * sliceMetresInFrontOfSurface(slice, surfaceMetres);
    let foggyLayersInFront = (foggyMetresInFront + 0.5 * foggyMetresHere) / layerMetres;
    let reach = exp(-SHIELDING_PER_FOGGY_LAYER * foggyLayersInFront) * shareInFrontOfSurface(slice, surfaceMetres);
    textureStore(windReachOut, vec3u(column, slice), vec4f(reach, clearingSpeedUp, fogCanLiveIn(slice, surfaceMetres), openingPerMeanBaseFog));
    foggyMetresInFront += foggyMetresHere;
  }
}

fn shareOfOpeningFogLeft(column: vec2u, slice: u32, surfaceMetres: f32) -> f32 {
  if (sliceMetresInFrontOfSurface(slice, surfaceMetres) <= 0.0) { return 0.0; }
  let openingFog = baseFogDensity(vec3f(vec2f(column) + 0.5, f32(slice) + 0.5));
  return clamp(textureLoad(fog, vec3u(column, slice), 0).r / max(openingFog, 1e-4), 0.0, 1.0);
}

fn shareInFrontOfSurface(slice: u32, surfaceMetres: f32) -> f32 {
  return 1.0 - smoothstep(surfaceMetres * 0.9, surfaceMetres * WIND_REACH_BEYOND_THE_SURFACE, sliceDepthMetres(f32(slice) + 0.5));
}

fn fogCanLiveIn(slice: u32, surfaceMetres: f32) -> f32 {
  return select(0.0, 1.0, sliceDepthMetres(f32(slice)) < surfaceMetres);
}
