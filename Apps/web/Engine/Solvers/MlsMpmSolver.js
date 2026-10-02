import { createStorageBuffer } from '../Gpu/gpuResources.js';
import { LINEAR_WORKGROUP } from '../Gpu/Kernel.js';
import { ParticleBuffer, particleKernels } from './ParticleBuffer.js';

const MOST_PARTICLES = 1_500_000;
const SUBSTEPS_PER_FRAME = 2;
const BULK_STIFFNESS = 60;
const SUMS_PER_CELL_BYTES = 16;

const VEC4S_PER_PARTICLE = 3;
const PARTICLES_TO_GRID_KERNEL = {
  shader: 'mpm_particles_to_grid',
  bindings: { particles: 'read:array<MpmParticle>', gridSums: 'readWrite:array<atomic<i32>>' },
  workgroupSize: LINEAR_WORKGROUP,
};
const GRID_UPDATE_KERNEL = {
  shader: 'mpm_grid_update',
  bindings: { gridSums: 'readWrite:array<i32>', acceleration: 'texture3d', solids: 'texture3d', velocityOut: 'write3d:rgba16float' },
};
const GRID_TO_PARTICLES_KERNEL = {
  shader: 'mpm_grid_to_particles',
  bindings: { particles: 'readWrite:array<MpmParticle>', velocity: 'texture3d', solids: 'texture3d' },
  workgroupSize: LINEAR_WORKGROUP,
};

export class MlsMpmSolver {
  static id = 'mpm';
  static label = 'MLS-MPM gas';
  static description = 'Material point method with APIC transfer and a weakly compressible gas.';
  static kernels = [...Object.values(particleKernels(VEC4S_PER_PARTICLE)), PARTICLES_TO_GRID_KERNEL, GRID_UPDATE_KERNEL, GRID_TO_PARTICLES_KERNEL];
  static advectsFogSharply = false;

  #kernels;
  #field;
  #particles;
  #gridSums;
  #currentVelocity = 0;
  #needsReset = true;

  constructor({ device, kernels, field, quality }) {
    this.#kernels = kernels;
    this.#field = field;
    const particlesPerCell = Math.max(1, quality.particlesPerCell - 1);
    this.#particles = new ParticleBuffer(device, kernels, {
      label: 'mpm particles',
      count: Math.min(field.cellCount * particlesPerCell, MOST_PARTICLES),
      vec4sPerParticle: VEC4S_PER_PARTICLE,
      cellCount: field.cellCount,
    });
    this.#gridSums = createStorageBuffer(device, 'mpm grid sums', field.cellCount * SUMS_PER_CELL_BYTES);
  }

  get particleCount() {
    return this.#particles.count;
  }

  solverParams(frameTime) {
    return {
      mpmSubstepSeconds: frameTime.simulationSeconds / SUBSTEPS_PER_FRAME,
      bulkStiffness: BULK_STIFFNESS,
      particlesPerCell: this.#particles.count / this.#field.cellCount,
    };
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
    field.computeAcceleration(pass, field.velocities[this.#currentVelocity]);
    for (let substep = 0; substep < SUBSTEPS_PER_FRAME; substep++) {
      const nodeVelocity = field.velocities[1 - this.#currentVelocity];
      this.#particlesToGrid(pass);
      this.#updateGrid(pass, nodeVelocity);
      this.#gridToParticles(pass, nodeVelocity);
      this.#currentVelocity = 1 - this.#currentVelocity;
    }
    field.velocity = field.velocities[this.#currentVelocity];
  }

  destroy() {
    this.#particles.destroy();
    this.#gridSums.destroy();
  }

  #particlesToGrid(pass) {
    this.#kernels.kernel(PARTICLES_TO_GRID_KERNEL).dispatch(pass, { particles: this.#particles.buffer, gridSums: this.#gridSums }, [this.#particles.count]);
  }

  #updateGrid(pass, nodeVelocity) {
    const field = this.#field;
    this.#kernels.kernel(GRID_UPDATE_KERNEL).dispatch(pass, { gridSums: this.#gridSums, acceleration: field.acceleration, solids: field.solids, velocityOut: nodeVelocity }, field.size);
  }

  #gridToParticles(pass, nodeVelocity) {
    this.#kernels.kernel(GRID_TO_PARTICLES_KERNEL).dispatch(pass, { particles: this.#particles.buffer, velocity: nodeVelocity, solids: this.#field.solids }, [this.#particles.count]);
  }
}
