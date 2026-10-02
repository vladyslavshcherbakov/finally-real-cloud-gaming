import { createTexture3D, createStorageBuffer } from '../Gpu/gpuResources.js';
import { PressureMultigrid, PRESSURE_MULTIGRID_KERNELS } from './PressureMultigrid.js';

const VECTOR_FORMAT = 'rgba16float';
const VECTOR_OUT = `write3d:${VECTOR_FORMAT}`;
const SOLIDS_FORMAT = 'rgba8unorm';

const SOLIDS_KERNEL = {
  shader: 'solids',
  bindings: { sceneDepth: 'texture2d', clampSampler: 'sampler', solidsOut: `write3d:${SOLIDS_FORMAT}` },
};
const FOG_RESET_KERNEL = {
  shader: 'fog_reset',
  bindings: {
    sceneDepth: 'texture2d', flowNoise: 'texture3d', clampSampler: 'sampler', repeatSampler: 'sampler', fogOut: VECTOR_OUT, flowOut: VECTOR_OUT,
  },
};
const VORTICITY_KERNEL = {
  shader: 'vorticity',
  bindings: { velocity: 'texture3d', vorticityOut: VECTOR_OUT },
};
const WIND_REACH_KERNEL = {
  shader: 'wind_reach',
  workgroupSize: [8, 8, 1],
  bindings: {
    fog: 'texture3d', sceneDepth: 'texture2d', flowNoise: 'texture3d', clampSampler: 'sampler', repeatSampler: 'sampler', windReachOut: VECTOR_OUT,
  },
};
const FORCES_KERNEL = {
  shader: 'forces',
  bindings: {
    velocity: 'texture3d', vorticity: 'texture3d', windReach: 'texture3d', flowNoise: 'texture3d', repeatSampler: 'sampler', accelerationOut: VECTOR_OUT,
  },
};
const ADVECT_KERNEL = {
  shader: 'advect',
  bindings: { velocity: 'texture3d', carried: 'texture3d', clampSampler: 'sampler', advectedOut: VECTOR_OUT },
};
const DIVERGENCE_KERNEL = {
  shader: 'divergence',
  bindings: { velocity: 'texture3d', solids: 'texture3d', divergence: 'readWrite:array<f32>' },
};
const PROJECT_KERNEL = {
  shader: 'project',
  bindings: { velocity: 'texture3d', pressure: 'read:array<f32>', solids: 'texture3d', velocityOut: VECTOR_OUT },
};
const FOG_UPDATE_BINDINGS = {
  velocity: 'texture3d', fog: 'texture3d', flow: 'texture3d', advected: 'texture3d', windReach: 'texture3d',
  flowNoise: 'texture3d', clampSampler: 'sampler', repeatSampler: 'sampler', fogOut: VECTOR_OUT, flowOut: VECTOR_OUT,
};
const FOG_UPDATE_KERNEL = { shader: 'fog_update', bindings: FOG_UPDATE_BINDINGS };
const LIGHT_KERNEL = {
  shader: 'light',
  bindings: { fog: 'texture3d', solids: 'texture3d', previousLight: 'texture3d', clampSampler: 'sampler', lightOut: VECTOR_OUT },
};

export const FOG_FIELD_KERNELS = [
  SOLIDS_KERNEL, FOG_RESET_KERNEL, WIND_REACH_KERNEL, VORTICITY_KERNEL, FORCES_KERNEL, ADVECT_KERNEL, DIVERGENCE_KERNEL, ...PRESSURE_MULTIGRID_KERNELS,
  PROJECT_KERNEL, FOG_UPDATE_KERNEL, LIGHT_KERNEL,
];

export const FOG_FIELD_SHADERS = [...new Set(FOG_FIELD_KERNELS.map((spec) => spec.shader))];

export class FogField {
  #kernels;
  #noise;
  #fogIndex = 0;
  #lightIndex = 0;

  constructor(device, kernels, noise, size) {
    this.#kernels = kernels;
    this.#noise = noise;
    this.size = size;
    this.cellCount = size[0] * size[1] * size[2];
    const vectorTexture = (label) => createTexture3D(device, label, size, VECTOR_FORMAT);
    this.velocities = [vectorTexture('velocity A'), vectorTexture('velocity B'), vectorTexture('velocity C')];
    this.velocity = this.velocities[0];
    this.fogTextures = [vectorTexture('fog A'), vectorTexture('fog B')];
    this.flowTextures = [vectorTexture('flow A'), vectorTexture('flow B')];
    this.advected = vectorTexture('advected');
    this.solids = createTexture3D(device, 'solids', size, SOLIDS_FORMAT);
    this.lightTextures = [vectorTexture('light A'), vectorTexture('light B')];
    this.windReach = vectorTexture('wind reach');
    this.vorticity = vectorTexture('vorticity');
    this.acceleration = vectorTexture('acceleration');
    this.divergence = createStorageBuffer(device, 'divergence', this.cellCount * 4);
    this.pressure = createStorageBuffer(device, 'pressure', this.cellCount * 4);
    this.pressureSolver = new PressureMultigrid(device, kernels, size, this.divergence, this.pressure);
    this.clampSampler = device.createSampler({
      magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', addressModeW: 'clamp-to-edge',
    });
    this.repeatSampler = device.createSampler({
      magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat',
    });
  }

  get fog() {
    return this.fogTextures[this.#fogIndex];
  }

  get light() {
    return this.lightTextures[this.#lightIndex];
  }

  get flow() {
    return this.flowTextures[this.#fogIndex];
  }

  get noise() {
    return this.#noise;
  }

  buildSolids(pass, sceneDepth) {
    this.#kernels.kernel(SOLIDS_KERNEL).dispatch(pass, { sceneDepth, clampSampler: this.clampSampler, solidsOut: this.solids }, this.size);
    this.pressureSolver.buildLevelSolids(pass, this.solids);
  }

  resetFog(pass, sceneDepth) {
    this.#fogIndex = 0;
    this.#kernels.kernel(FOG_RESET_KERNEL).dispatch(pass, {
      sceneDepth, flowNoise: this.#noise.flow, clampSampler: this.clampSampler, repeatSampler: this.repeatSampler, fogOut: this.fogTextures[0], flowOut: this.flowTextures[0],
    }, this.size);
  }

  measureWindReach(pass, sceneDepth) {
    this.#kernels.kernel(WIND_REACH_KERNEL).dispatch(pass, {
      fog: this.fog, sceneDepth, flowNoise: this.#noise.flow, clampSampler: this.clampSampler, repeatSampler: this.repeatSampler, windReachOut: this.windReach,
    }, [this.size[0], this.size[1], 1]);
  }

  computeAcceleration(pass, velocity) {
    this.#kernels.kernel(VORTICITY_KERNEL).dispatch(pass, { velocity, vorticityOut: this.vorticity }, this.size);
    this.#kernels.kernel(FORCES_KERNEL).dispatch(pass, {
      velocity, vorticity: this.vorticity, windReach: this.windReach, flowNoise: this.#noise.flow, repeatSampler: this.repeatSampler, accelerationOut: this.acceleration,
    }, this.size);
  }

  advect(pass, velocity, carried, advectedOut) {
    this.#kernels.kernel(ADVECT_KERNEL).dispatch(pass, { velocity, carried, clampSampler: this.clampSampler, advectedOut }, this.size);
  }

  makeDivergenceFree(pass, velocity, velocityOut) {
    this.#kernels.kernel(DIVERGENCE_KERNEL).dispatch(pass, { velocity, solids: this.solids, divergence: this.divergence }, this.size);
    this.pressureSolver.solve(pass);
    this.#kernels.kernel(PROJECT_KERNEL).dispatch(pass, { velocity, pressure: this.pressure, solids: this.solids, velocityOut }, this.size);
  }

  transportFog(pass) {
    const nextIndex = 1 - this.#fogIndex;
    this.advect(pass, this.velocity, this.fog, this.advected);
    this.#kernels.kernel(FOG_UPDATE_KERNEL).dispatch(pass, {
      velocity: this.velocity, fog: this.fog, flow: this.flow, advected: this.advected, windReach: this.windReach,
      flowNoise: this.#noise.flow,
      clampSampler: this.clampSampler, repeatSampler: this.repeatSampler, fogOut: this.fogTextures[nextIndex], flowOut: this.flowTextures[nextIndex],
    }, this.size);
    this.#fogIndex = nextIndex;
  }

  computeLight(pass) {
    this.#kernels.kernel(LIGHT_KERNEL).dispatch(pass, {
      fog: this.fog, solids: this.solids, previousLight: this.light, clampSampler: this.clampSampler, lightOut: this.lightTextures[1 - this.#lightIndex],
    }, this.size);
    this.#lightIndex = 1 - this.#lightIndex;
  }

  destroy() {
    const textures = [...this.velocities, ...this.fogTextures, ...this.flowTextures, this.advected, this.solids, ...this.lightTextures, this.windReach, this.vorticity, this.acceleration];
    for (const texture of textures) texture.destroy();
    this.pressureSolver.destroy();
    this.divergence.destroy();
    this.pressure.destroy();
  }
}
