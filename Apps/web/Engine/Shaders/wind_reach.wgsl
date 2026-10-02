//#include opening_fog

const FOG_LAYERS_AGAINST_WIND = 3.0;
const COLUMN_OPTICAL_DEPTH_THAT_SHIELDS_FULLY = 3.0;
const COLUMN_OPTICAL_DEPTH_CLEARED_AT_THE_PLAIN_RATE = 15.0;
const THICKEST_COLUMN_WITH_EVERY_LAYER = 15.0;
const WIND_REACH_BEYOND_THE_SURFACE = 1.15;

fn opticalDepthInSlice(column: vec2u, slice: u32, surfaceMetres: f32, extinctionPerBaseFog: f32) -> f32 {
  return textureLoad(fog, vec3u(column, slice), 0).r * extinctionPerBaseFog * sliceMetresInFrontOfSurface(slice, surfaceMetres);
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
  let shielding = FOG_LAYERS_AGAINST_WIND * min(1.0, columnOpticalDepth / COLUMN_OPTICAL_DEPTH_THAT_SHIELDS_FULLY)
    * min(1.0, THICKEST_COLUMN_WITH_EVERY_LAYER / max(columnOpticalDepth, 1e-4));
  let clearingSpeedUp = max(1.0, columnOpticalDepth / COLUMN_OPTICAL_DEPTH_CLEARED_AT_THE_PLAIN_RATE);
  var opticalDepthInFront = 0.0;
  for (var slice = 0u; slice < sliceCount; slice++) {
    let opticalDepthHere = opticalDepthInSlice(column.xy, slice, surfaceMetres, extinctionPerBaseFog);
    let shareInFront = select(0.0, (opticalDepthInFront + 0.5 * opticalDepthHere) / columnOpticalDepth, columnOpticalDepth > 0.0);
    let inFrontOfSurface = 1.0 - smoothstep(surfaceMetres * 0.9, surfaceMetres * WIND_REACH_BEYOND_THE_SURFACE, sliceDepthMetres(f32(slice) + 0.5));
    let fogCanLiveHere = select(0.0, 1.0, sliceDepthMetres(f32(slice)) < surfaceMetres);
    textureStore(windReachOut, vec3u(column.xy, slice), vec4f(exp(-shielding * shareInFront) * inFrontOfSurface, clearingSpeedUp, fogCanLiveHere, openingPerMeanBaseFog));
    opticalDepthInFront += opticalDepthHere;
  }
}
