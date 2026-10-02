//#include base_fog

const SURFACE_SAMPLES_PER_COLUMN_SIDE = 8;
const LARGEST_HALF_FLOAT = 65000.0;

fn columnSurfaceMetres(column: vec2u) -> f32 {
  var farthestDepthCode = 0.0;
  for (var i = 0; i < SURFACE_SAMPLES_PER_COLUMN_SIDE * SURFACE_SAMPLES_PER_COLUMN_SIDE; i++) {
    let offsetInColumn = (vec2f(f32(i % SURFACE_SAMPLES_PER_COLUMN_SIDE), f32(i / SURFACE_SAMPLES_PER_COLUMN_SIDE)) + 0.5)
      / f32(SURFACE_SAMPLES_PER_COLUMN_SIDE);
    let canvasUv = (vec2f(column) + offsetInColumn) / gridSize().xy;
    farthestDepthCode = max(farthestDepthCode, textureSampleLevel(sceneDepth, clampSampler, photoUv(canvasUv), 0.0).r);
  }
  return depthMetresFromCode(farthestDepthCode);
}

fn sliceMetresInFrontOfSurface(slice: u32, surfaceMetres: f32) -> f32 {
  let nearMetres = sliceDepthMetres(f32(slice));
  return max(min(sliceDepthMetres(f32(slice) + 1.0), surfaceMetres) - nearMetres, 0.0);
}

fn openingOpticalDepthPerMeanBaseFog(column: vec2u, surfaceMetres: f32) -> f32 {
  var baseFogMetres = 0.0;
  for (var slice = 0u; slice < u32(params.gridDepth); slice++) {
    let sliceCentre = vec3f(vec2f(column) + 0.5, f32(slice) + 0.5);
    baseFogMetres += baseFogDensity(sliceCentre) * sliceMetresInFrontOfSurface(slice, surfaceMetres);
  }
  return min(params.openingOpticalDepth * fogMetresInFrontOf(surfaceMetres) / max(baseFogMetres, 1e-4), LARGEST_HALF_FLOAT);
}
