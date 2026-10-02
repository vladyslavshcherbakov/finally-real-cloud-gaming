//#include opening_fog

const FOG_LAYERS_AGAINST_WIND = 3.0;
const COLUMN_OPTICAL_DEPTH_THAT_SHIELDS_FULLY = 3.0;
const COLUMN_OPTICAL_DEPTH_CLEARED_AT_THE_PLAIN_RATE = 15.0;
const THICKEST_COLUMN_WITH_EVERY_LAYER = 15.0;
const WIND_REACH_BEYOND_THE_SURFACE = 1.15;

fn fogInSlice(column: vec2u, slice: u32, surfaceMetres: f32) -> f32 {
  return textureLoad(fog, vec3u(column, slice), 0).r * sliceMetresInFrontOfSurface(slice, surfaceMetres);
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) column: vec3u) {
  if (any(column.xy >= vec2u(gridSize().xy))) { return; }
  let surfaceMetres = columnSurfaceMetres(column.xy);
  let sliceCount = u32(params.gridDepth);
  var columnFog = 0.0;
  for (var slice = 0u; slice < sliceCount; slice++) { columnFog += fogInSlice(column.xy, slice, surfaceMetres); }
  let columnOpticalDepth = columnFog;
  let densityScale = openingDensityScale(column.xy, surfaceMetres);
  let shielding = FOG_LAYERS_AGAINST_WIND * min(1.0, columnOpticalDepth / COLUMN_OPTICAL_DEPTH_THAT_SHIELDS_FULLY)
    * min(1.0, THICKEST_COLUMN_WITH_EVERY_LAYER / max(columnOpticalDepth, 1e-4));
  let clearingSpeedUp = max(1.0, columnOpticalDepth / COLUMN_OPTICAL_DEPTH_CLEARED_AT_THE_PLAIN_RATE);
  var fogInFront = 0.0;
  for (var slice = 0u; slice < sliceCount; slice++) {
    let fogHere = fogInSlice(column.xy, slice, surfaceMetres);
    let shareInFront = select(0.0, (fogInFront + 0.5 * fogHere) / columnFog, columnFog > 0.0);
    let inFrontOfSurface = 1.0 - smoothstep(surfaceMetres * 0.9, surfaceMetres * WIND_REACH_BEYOND_THE_SURFACE, sliceDepthMetres(f32(slice) + 0.5));
    textureStore(windReachOut, vec3u(column.xy, slice), vec4f(exp(-shielding * shareInFront) * inFrontOfSurface, clearingSpeedUp, inFrontOfSurface, densityScale));
    fogInFront += fogHere;
  }
}
