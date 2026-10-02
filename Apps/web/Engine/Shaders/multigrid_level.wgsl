fn levelSize() -> vec3i { return vec3i(i32(levelDimensions[0]), i32(levelDimensions[1]), i32(levelDimensions[2])); }

fn levelNumber() -> u32 { return levelDimensions[3]; }

fn isInsideLevel(cell: vec3i) -> bool {
  return all(cell >= vec3i(0)) && all(cell < levelSize());
}

fn levelIndex(cell: vec3i) -> u32 {
  let size = levelSize();
  return u32(cell.x + size.x * (cell.y + size.y * cell.z));
}
