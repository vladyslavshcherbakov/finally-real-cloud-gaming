//#include opening_fog

const DEPTH_LAYERS = 6.0;
const SHIELDING_PER_FOGGY_LAYER = 2.5;
const COLUMN_OPTICAL_DEPTH_CLEARED_AT_THE_PLAIN_RATE = 15.0;
const WIND_REACH_BEYOND_THE_SURFACE = 1.15;

fn opticalDepthInSlice(column: vec2u, slice: u32, surfaceMetres: f32, extinctionPerBaseFog: f32) -> f32 {
  return textureLoad(fog, vec3u(column, slice), 0).r * extinctionPerBaseFog * sliceMetresInFrontOfSurface(slice, surfaceMetres);
}

fn shareOfOpeningFogLeft(column: vec2u, slice: u32, surfaceMetres: f32) -> f32 {
  if (sliceMetresInFrontOfSurface(slice, surfaceMetres) <= 0.0) { return 0.0; }
  let openingFog = baseFogDensity(vec3f(vec2f(column) + 0.5, f32(slice) + 0.5));
  return clamp(textureLoad(fog, vec3u(column, slice), 0).r / max(openingFog, 1e-4), 0.0, 1.0);
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) column: vec3u) {
  if (any(column.xy >= vec2u(gridSize().xy))) { return; }
  let surfaceMetres = columnSurfaceMetres(column.xy);
  let sliceCount = u32(params.gridDepth);
  let openingPerMeanBaseFog = openingOpticalDepthPerMeanBaseFog(column.xy, surfaceMetres);
  let extinctionPerBaseFog = openingPerMeanBaseFog / fogMetresInFrontOf(surfaceMetres);
  var columnOpticalDepth = 0.0;
  for (var slice = 0u; slice < sliceCount; slice++) { columnOpticalDepth += opticalDepthInSlice(column.xy, slice, surfaceMetres, extinctionPerBaseFog); }
  let clearingSpeedUp = max(1.0, columnOpticalDepth / COLUMN_OPTICAL_DEPTH_CLEARED_AT_THE_PLAIN_RATE);
  let slicesPerLayer = params.gridDepth / DEPTH_LAYERS;
  var foggySlicesInFront = 0.0;
  for (var slice = 0u; slice < sliceCount; slice++) {
    let fogLeftHere = shareOfOpeningFogLeft(column.xy, slice, surfaceMetres);
    let foggyLayersInFront = (foggySlicesInFront + 0.5 * fogLeftHere) / slicesPerLayer;
    let inFrontOfSurface = 1.0 - smoothstep(surfaceMetres * 0.9, surfaceMetres * WIND_REACH_BEYOND_THE_SURFACE, sliceDepthMetres(f32(slice) + 0.5));
    let fogCanLiveHere = select(0.0, 1.0, sliceDepthMetres(f32(slice)) < surfaceMetres);
    let reach = exp(-SHIELDING_PER_FOGGY_LAYER * foggyLayersInFront) * inFrontOfSurface;
    textureStore(windReachOut, vec3u(column.xy, slice), vec4f(reach, clearingSpeedUp, fogCanLiveHere, openingPerMeanBaseFog));
    foggySlicesInFront += fogLeftHere;
  }
}
