fn velocityAt(cell: vec3i) -> vec3f {
  return finiteOrZero(textureLoad(velocity, clampedToGrid(cell), 0).xyz);
}

fn macCormackVelocity(centre: vec3f, ownVelocity: vec3f, semiLagrangianVelocity: vec3f) -> vec3f {
  let displacement = ownVelocity * stepSeconds();
  let returnTrip = textureSampleLevel(advected, clampSampler, (centre + displacement) / gridSize(), 0.0).xyz;
  let correctedVelocity = semiLagrangianVelocity + 0.5 * (ownVelocity - returnTrip);
  let departureCorner = vec3i(floor(centre - displacement - 0.5));
  var lowest = vec3f(1e9);
  var highest = vec3f(-1e9);
  for (var corner = 0; corner < 8; corner++) {
    let neighbourVelocity = velocityAt(departureCorner + vec3i(corner & 1, (corner >> 1) & 1, (corner >> 2) & 1));
    lowest = min(lowest, neighbourVelocity);
    highest = max(highest, neighbourVelocity);
  }
  return clamp(correctedVelocity, lowest, highest);
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  if (any(cellId >= vec3u(gridSize()))) { return; }
  if (textureLoad(solids, cellId, 0).r > 0.5) {
    textureStore(velocityOut, cellId, vec4f(0.0));
    return;
  }
  var newVelocity = textureLoad(advected, cellId, 0).xyz;
  if (USE_MACCORMACK) {
    newVelocity = macCormackVelocity(cellCentre(cellId), velocityAt(vec3i(cellId)), newVelocity);
  }
  newVelocity += textureLoad(acceleration, cellId, 0).xyz * stepSeconds();
  textureStore(velocityOut, cellId, vec4f(newVelocity, 0.0));
}
