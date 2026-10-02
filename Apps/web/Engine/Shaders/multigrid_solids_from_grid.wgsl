//#include multigrid_level

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  let cell = vec3i(cellId);
  if (!isInsideLevel(cell)) { return; }
  levelSolidsOut[levelIndex(cell)] = select(0.0, 1.0, textureLoad(solids, cell, 0).r > 0.5);
}
