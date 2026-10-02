import { createStorageBuffer } from '../Gpu/gpuResources.js';
import { LINEAR_WORKGROUP } from '../Gpu/Kernel.js';

const VEC4_BYTES = 16;
const U32_BYTES = 4;
const SCAN_WORKGROUP = [256, 1, 1];
const ENTRIES_PER_SCAN_THREAD = 4;
const CELLS_PER_SCAN_BLOCK = SCAN_WORKGROUP[0] * ENTRIES_PER_SCAN_THREAD;
const MOST_SCAN_BLOCKS = SCAN_WORKGROUP[0] * ENTRIES_PER_SCAN_THREAD;
const SCAN_CONSTANTS = { ENTRIES_PER_SCAN_THREAD: `${ENTRIES_PER_SCAN_THREAD}u`, CELLS_PER_SCAN_BLOCK: `${CELLS_PER_SCAN_BLOCK}u` };

export class TooManyCellsToSort extends Error {
  constructor(cellCount) {
    super(`particles cannot be sorted over ${cellCount} cells: the scan holds ${CELLS_PER_SCAN_BLOCK * MOST_SCAN_BLOCKS}`);
    this.name = 'TooManyCellsToSort';
    this.cellCount = cellCount;
  }
}

export function particleKernels(vec4sPerParticle) {
  const particleLayout = { PARTICLE_VEC4_COUNT: `${vec4sPerParticle}u` };
  return {
    reset: { shader: 'particles_reset', bindings: { particleData: 'readWrite:array<vec4f>' }, workgroupSize: LINEAR_WORKGROUP, constants: particleLayout },
    countCells: {
      shader: 'particles_count_cells',
      bindings: { particleData: 'read:array<vec4f>', cellParticleCounts: 'readWrite:array<atomic<u32>>', particleRanks: 'readWrite:array<u32>' },
      workgroupSize: LINEAR_WORKGROUP,
      constants: particleLayout,
    },
    scanBlocks: {
      shader: 'cell_starts_block_scan',
      bindings: { cellParticleCounts: 'readWrite:array<u32>', cellStarts: 'readWrite:array<u32>', blockStarts: 'readWrite:array<u32>' },
      workgroupSize: SCAN_WORKGROUP,
      constants: SCAN_CONSTANTS,
    },
    scanBlockStarts: {
      shader: 'cell_starts_block_starts_scan',
      bindings: { blockStarts: 'readWrite:array<u32>' },
      workgroupSize: SCAN_WORKGROUP,
      constants: SCAN_CONSTANTS,
    },
    scatterByCell: {
      shader: 'particles_scatter_by_cell',
      bindings: {
        particleData: 'read:array<vec4f>', sortedParticleData: 'readWrite:array<vec4f>',
        cellStarts: 'read:array<u32>', blockStarts: 'read:array<u32>', particleRanks: 'read:array<u32>',
      },
      workgroupSize: LINEAR_WORKGROUP,
      constants: { ...particleLayout, ...SCAN_CONSTANTS },
    },
  };
}

export class ParticleBuffer {
  #kernels;
  #specs;
  #cellCount;
  #particleBuffers;
  #currentBuffer = 0;
  #cellParticleCounts;
  #cellStarts;
  #blockStarts;
  #particleRanks;

  constructor(device, kernels, { label, count, vec4sPerParticle, cellCount }) {
    if (cellCount > CELLS_PER_SCAN_BLOCK * MOST_SCAN_BLOCKS) throw new TooManyCellsToSort(cellCount);
    this.#kernels = kernels;
    this.#specs = particleKernels(vec4sPerParticle);
    this.#cellCount = cellCount;
    this.count = count;
    const particleBytes = count * vec4sPerParticle * VEC4_BYTES;
    this.#particleBuffers = [createStorageBuffer(device, `${label} A`, particleBytes), createStorageBuffer(device, `${label} B`, particleBytes)];
    this.#cellParticleCounts = createStorageBuffer(device, `${label} per cell`, cellCount * U32_BYTES);
    this.#cellStarts = createStorageBuffer(device, `${label} cell starts`, cellCount * U32_BYTES);
    this.#blockStarts = createStorageBuffer(device, `${label} block starts`, MOST_SCAN_BLOCKS * U32_BYTES);
    this.#particleRanks = createStorageBuffer(device, `${label} ranks in cell`, count * U32_BYTES);
  }

  get buffer() {
    return this.#particleBuffers[this.#currentBuffer];
  }

  scatterThroughGrid(pass) {
    this.#kernels.kernel(this.#specs.reset).dispatch(pass, { particleData: this.buffer }, [this.count]);
  }

  sortByCell(pass) {
    const sortedBuffer = this.#particleBuffers[1 - this.#currentBuffer];
    this.#kernels.kernel(this.#specs.countCells).dispatch(pass, {
      particleData: this.buffer, cellParticleCounts: this.#cellParticleCounts, particleRanks: this.#particleRanks,
    }, [this.count]);
    this.#kernels.kernel(this.#specs.scanBlocks).dispatch(pass, {
      cellParticleCounts: this.#cellParticleCounts, cellStarts: this.#cellStarts, blockStarts: this.#blockStarts,
    }, [Math.ceil(this.#cellCount / CELLS_PER_SCAN_BLOCK) * SCAN_WORKGROUP[0]]);
    this.#kernels.kernel(this.#specs.scanBlockStarts).dispatch(pass, { blockStarts: this.#blockStarts }, [SCAN_WORKGROUP[0]]);
    this.#kernels.kernel(this.#specs.scatterByCell).dispatch(pass, {
      particleData: this.buffer, sortedParticleData: sortedBuffer,
      cellStarts: this.#cellStarts, blockStarts: this.#blockStarts, particleRanks: this.#particleRanks,
    }, [this.count]);
    this.#currentBuffer = 1 - this.#currentBuffer;
  }

  destroy() {
    for (const particleBuffer of this.#particleBuffers) particleBuffer.destroy();
    this.#cellParticleCounts.destroy();
    this.#cellStarts.destroy();
    this.#blockStarts.destroy();
    this.#particleRanks.destroy();
  }
}
