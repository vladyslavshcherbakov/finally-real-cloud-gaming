import { createTexture3D } from '../Gpu/gpuResources.js';

const CURL_NOISE_FLOW_KERNEL = {
  shader: 'curl_noise_flow',
  bindings: {
    velocity: 'texture3d', impulse: 'texture3d', solids: 'texture3d', windReach: 'texture3d', flowNoise: 'texture3d',
    clampSampler: 'sampler', repeatSampler: 'sampler', impulseOut: 'write3d:rgba16float', velocityOut: 'write3d:rgba16float',
  },
};

export class CurlNoiseSolver {
  static id = 'curl';
  static label = 'Curl noise';
  static description = 'Kinematic, divergence-free procedural flow plus fading impulses. No pressure solve.';
  static kernels = [CURL_NOISE_FLOW_KERNEL];
  static advectsFogSharply = false;

  #kernels;
  #field;
  #impulses;
  #currentIndex = 0;

  constructor({ device, kernels, field }) {
    this.#kernels = kernels;
    this.#field = field;
    this.#impulses = [0, 1].map((i) => createTexture3D(device, `impulse ${i}`, field.size, 'rgba16float'));
  }

  get particleCount() {
    return 0;
  }

  solverParams() {
    return {};
  }

  reset() {
    this.#currentIndex = 0;
    this.#field.velocity = this.#field.velocities[0];
  }

  step(pass) {
    const field = this.#field;
    const nextIndex = 1 - this.#currentIndex;
    this.#kernels.kernel(CURL_NOISE_FLOW_KERNEL).dispatch(pass, {
      velocity: field.velocities[this.#currentIndex], impulse: this.#impulses[this.#currentIndex], solids: field.solids, windReach: field.windReach,
      flowNoise: field.noise.flow, clampSampler: field.clampSampler, repeatSampler: field.repeatSampler,
      impulseOut: this.#impulses[nextIndex], velocityOut: field.velocities[nextIndex],
    }, field.size);
    this.#currentIndex = nextIndex;
    field.velocity = field.velocities[nextIndex];
  }

  destroy() {
    for (const impulse of this.#impulses) impulse.destroy();
  }
}
