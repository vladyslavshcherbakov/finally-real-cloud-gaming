//#include base_fog

const IMPULSE_FADE_PER_SECOND = vec3f(0.5, 0.5, 1.2);
const IMPULSE_SHARE_OF_WIND = 0.6;

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  if (any(cellId >= vec3u(gridSize()))) { return; }
  if (textureLoad(solids, cellId, 0).r > 0.5) {
    textureStore(impulseOut, cellId, vec4f(0.0));
    textureStore(velocityOut, cellId, vec4f(0.0));
    return;
  }
  let centre = cellCentre(cellId);
  let departurePoint = centre - textureLoad(velocity, cellId, 0).xyz * stepSeconds();
  let carriedImpulse = textureSampleLevel(impulse, clampSampler, departurePoint / gridSize(), 0.0).xyz;
  let fadedImpulse = carriedImpulse * exp(-(IMPULSE_FADE_PER_SECOND + vec3f(params.damping)) * stepSeconds());
  let wind = windEffect(centre);
  let windReachHere = textureLoad(windReach, cellId, 0);
  let windAcceleration = wind.acceleration * windReachHere.r + wind.vortexAcceleration * windReachHere.b;
  let newImpulse = fadedImpulse + windAcceleration * stepSeconds() * IMPULSE_SHARE_OF_WIND;
  textureStore(impulseOut, cellId, vec4f(newImpulse, 0.0));
  textureStore(velocityOut, cellId, vec4f(swirlingAirVelocity(centre) + newImpulse, 0.0));
}
