import { createStorageBuffer, createStorageBufferHolding } from '../Gpu/gpuResources.js';

const LEVEL_COUNT = 4;
const PRE_SMOOTHING_SWEEPS = 3;
const POST_SMOOTHING_SWEEPS = 3;
const COARSEST_SMOOTHING_SWEEPS = 8;
const FLOAT_BYTES = 4;

const SMOOTH_BINDINGS = {
  levelDimensions: 'read:array<u32>', levelSolids: 'read:array<f32>', rightHandSide: 'read:array<f32>', pressure: 'readWrite:array<f32>',
};
const SMOOTH_KERNELS = [0, 1].map((colour) => ({
  shader: 'multigrid_smooth', bindings: SMOOTH_BINDINGS, constants: { CHECKERBOARD_COLOUR: `${colour}u` },
}));
const RESIDUAL_KERNEL = {
  shader: 'multigrid_residual',
  bindings: {
    levelDimensions: 'read:array<u32>', levelSolids: 'read:array<f32>', rightHandSide: 'read:array<f32>',
    pressure: 'read:array<f32>', residual: 'readWrite:array<f32>',
  },
};
const RESTRICT_KERNEL = {
  shader: 'multigrid_restrict',
  bindings: {
    coarseDimensions: 'read:array<u32>', fineDimensions: 'read:array<u32>', fineResidual: 'read:array<f32>',
    coarseRightHandSide: 'readWrite:array<f32>', coarsePressure: 'readWrite:array<f32>',
  },
};
const PROLONG_KERNEL = {
  shader: 'multigrid_prolong',
  bindings: {
    coarseDimensions: 'read:array<u32>', fineDimensions: 'read:array<u32>', fineSolids: 'read:array<f32>',
    coarsePressure: 'read:array<f32>', finePressure: 'readWrite:array<f32>',
  },
};
const SOLIDS_FROM_GRID_KERNEL = {
  shader: 'multigrid_solids_from_grid',
  bindings: { levelDimensions: 'read:array<u32>', solids: 'texture3d', levelSolidsOut: 'readWrite:array<f32>' },
};
const SOLIDS_RESTRICT_KERNEL = {
  shader: 'multigrid_solids_restrict',
  bindings: { coarseDimensions: 'read:array<u32>', fineDimensions: 'read:array<u32>', fineSolids: 'read:array<f32>', coarseSolids: 'readWrite:array<f32>' },
};

export const PRESSURE_MULTIGRID_KERNELS = [
  ...SMOOTH_KERNELS, RESIDUAL_KERNEL, RESTRICT_KERNEL, PROLONG_KERNEL, SOLIDS_FROM_GRID_KERNEL, SOLIDS_RESTRICT_KERNEL,
];

export class PressureMultigrid {
  #kernels;
  #levels;

  constructor(device, kernels, gridSize, finestRightHandSide, finestPressure) {
    this.#kernels = kernels;
    this.#levels = levelSizes(gridSize).map((size, levelNumber) => {
      const cellCount = size[0] * size[1] * size[2];
      const isFinest = levelNumber === 0;
      return {
        size,
        dimensions: createStorageBufferHolding(device, `pressure level ${levelNumber} size`, Uint32Array.from([...size, levelNumber])),
        solids: createStorageBuffer(device, `pressure level ${levelNumber} solids`, cellCount * FLOAT_BYTES),
        residual: createStorageBuffer(device, `pressure level ${levelNumber} residual`, cellCount * FLOAT_BYTES),
        rightHandSide: isFinest ? finestRightHandSide : createStorageBuffer(device, `pressure level ${levelNumber} divergence`, cellCount * FLOAT_BYTES),
        pressure: isFinest ? finestPressure : createStorageBuffer(device, `pressure level ${levelNumber} pressure`, cellCount * FLOAT_BYTES),
        ownsSolveBuffers: !isFinest,
      };
    });
  }

  buildLevelSolids(pass, solidsTexture) {
    const [finest] = this.#levels;
    this.#kernels.kernel(SOLIDS_FROM_GRID_KERNEL).dispatch(pass, {
      levelDimensions: finest.dimensions, solids: solidsTexture, levelSolidsOut: finest.solids,
    }, finest.size);
    for (let levelNumber = 1; levelNumber < this.#levels.length; levelNumber++) {
      const fine = this.#levels[levelNumber - 1];
      const coarse = this.#levels[levelNumber];
      this.#kernels.kernel(SOLIDS_RESTRICT_KERNEL).dispatch(pass, {
        coarseDimensions: coarse.dimensions, fineDimensions: fine.dimensions, fineSolids: fine.solids, coarseSolids: coarse.solids,
      }, coarse.size);
    }
  }

  solve(pass) {
    const coarsestNumber = this.#levels.length - 1;
    this.#smooth(pass, this.#levels[0], PRE_SMOOTHING_SWEEPS);
    for (let levelNumber = 0; levelNumber < coarsestNumber; levelNumber++) {
      this.#restrictResidual(pass, this.#levels[levelNumber], this.#levels[levelNumber + 1]);
      const isNextCoarsest = levelNumber + 1 === coarsestNumber;
      this.#smooth(pass, this.#levels[levelNumber + 1], isNextCoarsest ? COARSEST_SMOOTHING_SWEEPS : PRE_SMOOTHING_SWEEPS);
    }
    for (let levelNumber = coarsestNumber - 1; levelNumber >= 0; levelNumber--) {
      this.#prolongCorrection(pass, this.#levels[levelNumber + 1], this.#levels[levelNumber]);
      this.#smooth(pass, this.#levels[levelNumber], POST_SMOOTHING_SWEEPS);
    }
  }

  destroy() {
    for (const level of this.#levels) {
      level.dimensions.destroy();
      level.solids.destroy();
      level.residual.destroy();
      if (level.ownsSolveBuffers) {
        level.rightHandSide.destroy();
        level.pressure.destroy();
      }
    }
  }

  #smooth(pass, level, sweeps) {
    const resources = {
      levelDimensions: level.dimensions, levelSolids: level.solids, rightHandSide: level.rightHandSide, pressure: level.pressure,
    };
    for (let sweep = 0; sweep < sweeps; sweep++) {
      for (const smoothKernel of SMOOTH_KERNELS) this.#kernels.kernel(smoothKernel).dispatch(pass, resources, level.size);
    }
  }

  #restrictResidual(pass, fine, coarse) {
    this.#kernels.kernel(RESIDUAL_KERNEL).dispatch(pass, {
      levelDimensions: fine.dimensions, levelSolids: fine.solids, rightHandSide: fine.rightHandSide,
      pressure: fine.pressure, residual: fine.residual,
    }, fine.size);
    this.#kernels.kernel(RESTRICT_KERNEL).dispatch(pass, {
      coarseDimensions: coarse.dimensions, fineDimensions: fine.dimensions, fineResidual: fine.residual,
      coarseRightHandSide: coarse.rightHandSide, coarsePressure: coarse.pressure,
    }, coarse.size);
  }

  #prolongCorrection(pass, coarse, fine) {
    this.#kernels.kernel(PROLONG_KERNEL).dispatch(pass, {
      coarseDimensions: coarse.dimensions, fineDimensions: fine.dimensions, fineSolids: fine.solids,
      coarsePressure: coarse.pressure, finePressure: fine.pressure,
    }, fine.size);
  }
}

function levelSizes(gridSize) {
  const sizes = [gridSize];
  while (sizes.length < LEVEL_COUNT) {
    const [width, height, depth] = sizes.at(-1);
    sizes.push([Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)), depth]);
  }
  return sizes;
}
