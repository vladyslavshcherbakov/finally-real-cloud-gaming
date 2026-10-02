//#include base_fog

fn columnSurfaceMetres(column: vec2u) -> f32 {
  let canvasUv = (vec2f(column) + 0.5) / gridSize().xy;
  return depthMetresFromCode(textureSampleLevel(sceneDepth, clampSampler, photoUv(canvasUv), 0.0).r);
}

fn sliceMetresInFrontOfSurface(slice: u32, surfaceMetres: f32) -> f32 {
  let nearMetres = sliceDepthMetres(f32(slice));
  return max(min(sliceDepthMetres(f32(slice) + 1.0), surfaceMetres) - nearMetres, 0.0);
}

fn openingDensityScale(column: vec2u, surfaceMetres: f32) -> f32 {
  var baseOpticalDepth = 0.0;
  for (var slice = 0u; slice < u32(params.gridDepth); slice++) {
    let sliceCentre = vec3f(vec2f(column) + 0.5, f32(slice) + 0.5);
    baseOpticalDepth += baseFogDensity(sliceCentre) * sliceMetresInFrontOfSurface(slice, surfaceMetres);
  }
  return params.openingOpticalDepth / max(baseOpticalDepth, 1e-4);
}
