//#include multigrid_level_pair

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) fineCellId: vec3u) {
  let fineCell = vec3i(fineCellId);
  if (any(fineCell >= fineSize())) { return; }
  let fineIndex = indexIn(fineCell, fineSize());
  if (fineSolids[fineIndex] > 0.5) { return; }
  finePressure[fineIndex] += coarsePressure[indexIn(vec3i(fineCell.xy / 2, fineCell.z), coarseSize())];
}
