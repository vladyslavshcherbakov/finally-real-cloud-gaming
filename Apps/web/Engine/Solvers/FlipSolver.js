import { createStorageBuffer, createTexture3D } from '../Gpu/gpuResources.js';
import { LINEAR_WORKGROUP } from '../Gpu/Kernel.js';
import { ParticleBuffer, particleKernels } from './ParticleBuffer.js';

const MOST_PARTICLES = 3_000_000;
const FLIP_RATIO = 0.95;
const RESPAWN_FRACTION_PER_STEP = 0.004;
const SUMS_PER_CELL_BYTES = 16;

const VEC4S_PER_PARTICLE = 2;
const PARTICLES_TO_GRID_KERNEL = {
  shader: 'flip_particles_to_grid',
  bindings: { particles: 'read:array<FlipParticle>', gridSums: 'readWrite:array<atomic<i32>>' },
  workgroupSize: LINEAR_WORKGROUP,
};
const GRID_UPDATE_KERNEL = {
  shader: 'flip_grid_update',
  bindings: {
    gridSums: 'readWrite:array<i32>', previousVelocity: 'texture3d', acceleration: 'texture3d', solids: 'texture3d',
    transferredOut: 'write3d:rgba16float', acceleratedOut: 'write3d:rgba16float',
  },
};
const GRID_TO_PARTICLES_KERNEL = {
  shader: 'flip_grid_to_particles',
  bindings: {
    particles: 'readWrite:array<FlipParticle>', transferredVelocity: 'texture3d', projectedVelocity: 'texture3d',
    solids: 'texture3d', clampSampler: 'sampler',
  },
  workgroupSize: LINEAR_WORKGROUP,
};

export class FlipSolver {
  static id = 'flip';
  static label = 'FLIP particles';
  static description = 'Particles carry velocity between steps (95% FLIP, 5% PIC), the grid does the pressure.';
  static kernels = [...Object.values(particleKernels(VEC4S_PER_PARTICLE)), PARTICLES_TO_GRID_KERNEL, GRID_UPDATE_KERNEL, GRID_TO_PARTICLES_KERNEL];

  #kernels;
  #field;
  #particles;
  #gridSums;
  #transferredVelocity;
  #currentVelocity = 0;
  #needsReset = true;

  constructor({ device, kernels, field, quality }) {
    this.#kernels = kernels;
    this.#field = field;
    this.#particles = new ParticleBuffer(device, kernels, {
      label: 'flip particles',
      count: Math.min(field.cellCount * quality.particlesPerCell, MOST_PARTICLES),
      vec4sPerParticle: VEC4S_PER_PARTICLE,
      cellCount: field.cellCount,
    });
    this.#gridSums = createStorageBuffer(device, 'flip grid sums', field.cellCount * SUMS_PER_CELL_BYTES);
    this.#transferredVelocity = createTexture3D(device, 'flip transferred velocity', field.size, 'rgba16float');
  }

  get particleCount() {
    return this.#particles.count;
  }

  solverParams() {
    return { flipRatio: FLIP_RATIO, respawnFractionPerStep: RESPAWN_FRACTION_PER_STEP };
  }

  reset() {
    this.#needsReset = true;
    this.#currentVelocity = 0;
    this.#field.velocity = this.#field.velocities[0];
  }

  step(pass) {
    const field = this.#field;
    if (this.#needsReset) {
      this.#particles.scatterThroughGrid(pass);
      this.#needsReset = false;
    }
    this.#particles.sortByCell(pass);
    const previousVelocity = field.velocities[this.#currentVelocity];
    const acceleratedVelocity = field.velocities[(this.#currentVelocity + 1) % 3];
    const projectedVelocity = field.velocities[(this.#currentVelocity + 2) % 3];
    field.computeAcceleration(pass, previousVelocity);
    this.#particlesToGrid(pass);
    this.#updateGrid(pass, previousVelocity, acceleratedVelocity);
    field.makeDivergenceFree(pass, acceleratedVelocity, projectedVelocity);
    this.#gridToParticles(pass, projectedVelocity);
    this.#currentVelocity = (this.#currentVelocity + 2) % 3;
    field.velocity = projectedVelocity;
  }

  destroy() {
    this.#particles.destroy();
    this.#gridSums.destroy();
    this.#transferredVelocity.destroy();
  }

  #particlesToGrid(pass) {
    this.#kernels.kernel(PARTICLES_TO_GRID_KERNEL).dispatch(pass, { particles: this.#particles.buffer, gridSums: this.#gridSums }, [this.#particles.count]);
  }

  #updateGrid(pass, previousVelocity, acceleratedVelocity) {
    const field = this.#field;
    this.#kernels.kernel(GRID_UPDATE_KERNEL).dispatch(pass, {
      gridSums: this.#gridSums, previousVelocity, acceleration: field.acceleration, solids: field.solids,
      transferredOut: this.#transferredVelocity, acceleratedOut: acceleratedVelocity,
    }, field.size);
  }

  #gridToParticles(pass, projectedVelocity) {
    const field = this.#field;
    this.#kernels.kernel(GRID_TO_PARTICLES_KERNEL).dispatch(pass, {
      particles: this.#particles.buffer, transferredVelocity: this.#transferredVelocity, projectedVelocity,
      solids: field.solids, clampSampler: field.clampSampler,
    }, [this.#particles.count]);
  }
}
