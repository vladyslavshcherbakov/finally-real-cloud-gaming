const VELOCITY_UPDATE_KERNEL = {
  shader: 'velocity_update',
  bindings: {
    advected: 'texture3d', acceleration: 'texture3d', solids: 'texture3d', velocityOut: 'write3d:rgba16float',
  },
};

export class StableFluidsSolver {
  static id = 'stable';
  static label = 'Stable Fluids';
  static description = 'Semi-Lagrangian advection, vorticity confinement, pressure projection.';
  static kernels = [VELOCITY_UPDATE_KERNEL];

  #kernels;
  #field;

  constructor({ kernels, field }) {
    this.#kernels = kernels;
    this.#field = field;
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
    this.#kernels.kernel(VELOCITY_UPDATE_KERNEL).dispatch(pass, {
      advected: advectedVelocity, acceleration: field.acceleration, solids: field.solids, velocityOut: acceleratedVelocity,
    }, field.size);
    field.makeDivergenceFree(pass, acceleratedVelocity, velocity);
    field.velocity = velocity;
  }

  destroy() {}
}
