//#include multigrid_level_pair

const SOLID_CHILDREN_FOR_A_SOLID_PARENT = 3.0;

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) coarseCellId: vec3u) {
  let coarseCell = vec3i(coarseCellId);
  if (any(coarseCell >= coarseSize())) { return; }
  var solidChildren = 0.0;
  for (var child = 0; child < 4; child++) {
    let fineCell = min(vec3i(coarseCell.xy * 2 + vec2i(child & 1, child >> 1), coarseCell.z), fineSize() - 1);
    if (fineSolids[indexIn(fineCell, fineSize())] > 0.5) { solidChildren += 1.0; }
  }
  coarseSolids[indexIn(coarseCell, coarseSize())] = select(0.0, 1.0, solidChildren >= SOLID_CHILDREN_FOR_A_SOLID_PARENT);
}
