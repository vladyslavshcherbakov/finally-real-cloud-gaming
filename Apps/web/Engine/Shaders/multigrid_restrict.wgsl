//#include multigrid_level_pair

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) coarseCellId: vec3u) {
  let coarseCell = vec3i(coarseCellId);
  if (any(coarseCell >= coarseSize())) { return; }
  var residualSum = 0.0;
  for (var child = 0; child < 4; child++) {
    let fineCell = vec3i(coarseCell.xy * 2 + vec2i(child & 1, child >> 1), coarseCell.z);
    if (any(fineCell >= fineSize())) { continue; }
    residualSum += fineResidual[indexIn(fineCell, fineSize())];
  }
  let coarseIndex = indexIn(coarseCell, coarseSize());
  coarseRightHandSide[coarseIndex] = residualSum;
  coarsePressure[coarseIndex] = 0.0;
}
