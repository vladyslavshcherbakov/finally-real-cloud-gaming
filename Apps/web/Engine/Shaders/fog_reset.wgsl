//#include base_fog

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cell: vec3u) {
  if (any(cell >= vec3u(gridSize()))) { return; }
  textureStore(fogOut, cell, vec4f(baseFogDensity(cellCentre(cell)), 0.0, 0.0, 0.0));
  textureStore(flowOut, cell, vec4f(0.0));
}
