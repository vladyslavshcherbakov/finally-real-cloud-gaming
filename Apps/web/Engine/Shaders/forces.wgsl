//#include base_fog

const PULL_TOWARD_SWIRLING_AIR_PER_SECOND = 3.0;

fn vorticityLengthAt(cell: vec3i) -> f32 {
  return textureLoad(vorticity, clampedToGrid(cell), 0).w;
}

fn vorticityConfinement(cell: vec3i, cellId: vec3u) -> vec3f {
  let towardStrongerSwirl = vec3f(
    vorticityLengthAt(cell + vec3i(1, 0, 0)) - vorticityLengthAt(cell - vec3i(1, 0, 0)),
    vorticityLengthAt(cell + vec3i(0, 1, 0)) - vorticityLengthAt(cell - vec3i(0, 1, 0)),
    vorticityLengthAt(cell + vec3i(0, 0, 1)) - vorticityLengthAt(cell - vec3i(0, 0, 1)));
  let gradientLength = length(towardStrongerSwirl);
  if (gradientLength < 1e-5) { return vec3f(0.0); }
  return params.vorticityConfinement * cross(towardStrongerSwirl / gradientLength, textureLoad(vorticity, cellId, 0).xyz);
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  if (any(cellId >= vec3u(gridSize()))) { return; }
  let centre = cellCentre(cellId);
  let cellVelocity = textureLoad(velocity, cellId, 0).xyz;
  let pullTowardSwirlingAir = (swirlingAirVelocity(centre) - cellVelocity) * PULL_TOWARD_SWIRLING_AIR_PER_SECOND;
  let acceleration = windEffect(centre).acceleration * textureLoad(windReach, cellId, 0).r + pullTowardSwirlingAir - cellVelocity * params.damping
    + vorticityConfinement(vec3i(cellId), cellId);
  textureStore(accelerationOut, cellId, vec4f(acceleration, 0.0));
}
