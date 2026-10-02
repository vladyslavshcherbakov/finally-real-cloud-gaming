const VELOCITY_UPDATE_BINDINGS = {
  velocity: 'texture3d', advected: 'texture3d', acceleration: 'texture3d', solids: 'texture3d',
  clampSampler: 'sampler', velocityOut: 'write3d:rgba16float',
};
const VELOCITY_UPDATE_KERNELS = {
  semiLagrangian: { shader: 'velocity_update', bindings: VELOCITY_UPDATE_BINDINGS, constants: { USE_MACCORMACK: false } },
  macCormack: { shader: 'velocity_update', bindings: VELOCITY_UPDATE_BINDINGS, constants: { USE_MACCORMACK: true } },
};

class GridFluidSolver {
  #kernels;
  #field;
  #velocityUpdateKernel;

  constructor({ kernels, field }, velocityUpdateKernel) {
    this.#kernels = kernels;
    this.#field = field;
    this.#velocityUpdateKernel = velocityUpdateKernel;
  }

  get particleCount() {
    return 0;
  }

  solverParams() {
    return {};
  }

  reset() {
    this.#field.velocity = this.#field.velocities[0];
  }

  step(pass) {
    const field = this.#field;
    const [velocity, advectedVelocity, acceleratedVelocity] = field.velocities;
    field.computeAcceleration(pass, velocity);
    field.advect(pass, velocity, velocity, advectedVelocity);
    this.#kernels.kernel(this.#velocityUpdateKernel).dispatch(pass, {
      velocity, advected: advectedVelocity, acceleration: field.acceleration, solids: field.solids,
      clampSampler: field.clampSampler, velocityOut: acceleratedVelocity,
    }, field.size);
    field.makeDivergenceFree(pass, acceleratedVelocity, velocity);
    field.velocity = velocity;
  }

  destroy() {}
}

export class MacCormackSolver extends GridFluidSolver {
  static id = 'maccormack';
  static label = 'MacCormack';
  static description = 'Stable Fluids with second-order MacCormack advection of the air and the fog: less blur, longer-lived curls.';
  static kernels = [VELOCITY_UPDATE_KERNELS.macCormack];
  static advectsFogSharply = true;

  constructor(dependencies) {
    super(dependencies, VELOCITY_UPDATE_KERNELS.macCormack);
  }
}

export class StableFluidsSolver extends GridFluidSolver {
  static id = 'stable';
  static label = 'Stable Fluids';
  static description = 'Semi-Lagrangian advection, vorticity confinement, pressure projection.';
  static kernels = [VELOCITY_UPDATE_KERNELS.semiLagrangian];
  static advectsFogSharply = false;

  constructor(dependencies) {
    super(dependencies, VELOCITY_UPDATE_KERNELS.semiLagrangian);
  }
}
