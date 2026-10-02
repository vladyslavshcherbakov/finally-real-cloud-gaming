const FOG_SUM_UNITS_PER_BASE_FOG = 100.0;
const LARGEST_COUNTED_FOG = 1000.0;

const NEAR_SPEED_MAX = 0u;
const FAR_SPEED_MAX = 1u;
const BROKEN_VELOCITY_CELLS = 2u;
const NEAR_FOG_SUM = 3u;
const FAR_FOG_SUM = 4u;
const BROKEN_FOG_CELLS = 5u;
const ACCELERATION_MAX = 6u;
const VORTICITY_MAX = 7u;
const PRESSURE_MAX = 8u;
const DIVERGENCE_MAX = 9u;
const BROKEN_PRESSURE_CELLS = 10u;

fn recordMax(slot: u32, value: f32) {
  atomicMax(&stats[slot], bitcast<u32>(abs(value)));
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, WORKGROUP_SIZE_Z)
fn main(@builtin(global_invocation_id) cellId: vec3u) {
  if (any(cellId >= vec3u(gridSize()))) { return; }
  let isNear = sliceDepthMetres(f32(cellId.z) + 0.5) < NEAREST_FLOW_DEPTH_METRES;

  let cellVelocity = textureLoad(velocity, cellId, 0).xyz;
  if (isFiniteVector(cellVelocity)) { recordMax(select(FAR_SPEED_MAX, NEAR_SPEED_MAX, isNear), length(cellVelocity)); }
  let everyStepVelocityIsFinite = isFiniteVector(textureLoad(velocityA, cellId, 0).xyz)
    && isFiniteVector(textureLoad(velocityB, cellId, 0).xyz) && isFiniteVector(textureLoad(velocityC, cellId, 0).xyz);
  if (!everyStepVelocityIsFinite) { atomicAdd(&stats[BROKEN_VELOCITY_CELLS], 1u); }

  let cellFog = textureLoad(fog, cellId, 0).r;
  if (isFiniteNumber(cellFog)) {
    let fogUnits = u32(clamp(cellFog, 0.0, LARGEST_COUNTED_FOG) * FOG_SUM_UNITS_PER_BASE_FOG);
    atomicAdd(&stats[select(FAR_FOG_SUM, NEAR_FOG_SUM, isNear)], fogUnits);
  } else {
    atomicAdd(&stats[BROKEN_FOG_CELLS], 1u);
  }

  let cellAcceleration = textureLoad(acceleration, cellId, 0).xyz;
  if (isFiniteVector(cellAcceleration)) { recordMax(ACCELERATION_MAX, length(cellAcceleration)); }
  let vorticityLength = textureLoad(vorticity, cellId, 0).w;
  if (isFiniteNumber(vorticityLength)) { recordMax(VORTICITY_MAX, vorticityLength); }

  let index = cellIndex(vec3i(cellId));
  let cellPressure = pressure[index];
  let cellDivergence = divergence[index];
  if (isFiniteNumber(cellPressure) && isFiniteNumber(cellDivergence)) {
    recordMax(PRESSURE_MAX, cellPressure);
    recordMax(DIVERGENCE_MAX, cellDivergence);
  } else {
    atomicAdd(&stats[BROKEN_PRESSURE_CELLS], 1u);
  }
}
