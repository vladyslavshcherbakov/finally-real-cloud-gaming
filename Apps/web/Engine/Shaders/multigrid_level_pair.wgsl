fn coarseSize() -> vec3i { return vec3i(i32(coarseDimensions[0]), i32(coarseDimensions[1]), i32(coarseDimensions[2])); }
fn fineSize() -> vec3i { return vec3i(i32(fineDimensions[0]), i32(fineDimensions[1]), i32(fineDimensions[2])); }

fn indexIn(cell: vec3i, size: vec3i) -> u32 {
  return u32(cell.x + size.x * (cell.y + size.y * cell.z));
}
