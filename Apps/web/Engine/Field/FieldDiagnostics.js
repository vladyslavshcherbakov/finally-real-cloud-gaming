const STAT_COUNT = 41;
const STATS_BYTES = 256;
const FOG_SUM_UNITS_PER_BASE_FOG = 100;
const PROBE_COLUMN_X = 11;
const PROBE_COLUMN_Y = 12;
const HAS_PROBE = 13;
const PROBE_DEPTH_BINS = 8;

export const FIELD_DIAGNOSTICS_KERNEL = {
  shader: 'field_diagnostics',
  bindings: {
    velocity: 'texture3d', velocityA: 'texture3d', velocityB: 'texture3d', velocityC: 'texture3d',
    fog: 'texture3d', acceleration: 'texture3d', vorticity: 'texture3d',
    pressure: 'read:array<f32>', divergence: 'read:array<f32>', stats: 'readWrite:array<atomic<u32>>',
    windReach: 'texture3d', flow: 'texture3d', windBuildUp: 'read:array<f32>',
  },
};

export class FieldDiagnostics {
  #device;
  #kernels;
  #stats;
  #readback;
  #isReading = false;

  constructor(device, kernels) {
    this.#device = device;
    this.#kernels = kernels;
    this.#stats = device.createBuffer({
      label: 'field diagnostics', size: STATS_BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    this.#readback = device.createBuffer({ label: 'field diagnostics readback', size: STATS_BYTES, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  }

  get canMeasure() {
    return !this.#isReading;
  }

  measure(pass, field, probedUv) {
    const startingWords = new Uint32Array(STATS_BYTES / 4);
    if (probedUv !== null) {
      startingWords[PROBE_COLUMN_X] = Math.min(field.size[0] - 1, Math.max(0, Math.floor(probedUv.u * field.size[0])));
      startingWords[PROBE_COLUMN_Y] = Math.min(field.size[1] - 1, Math.max(0, Math.floor(probedUv.v * field.size[1])));
      startingWords[HAS_PROBE] = 1;
    }
    this.#device.queue.writeBuffer(this.#stats, 0, startingWords);
    this.#kernels.kernel(FIELD_DIAGNOSTICS_KERNEL).dispatch(pass, {
      velocity: field.velocity, velocityA: field.velocities[0], velocityB: field.velocities[1], velocityC: field.velocities[2], fog: field.fog, acceleration: field.acceleration, vorticity: field.vorticity,
      pressure: field.pressure, divergence: field.divergence, stats: this.#stats,
      windReach: field.windReach, flow: field.flow, windBuildUp: field.windBuildUp,
    }, field.size);
  }

  copyForReading(encoder) {
    this.#isReading = true;
    encoder.copyBufferToBuffer(this.#stats, 0, this.#readback, 0, STATS_BYTES);
  }

  async read() {
    try {
      await this.#readback.mapAsync(GPUMapMode.READ);
      const words = new Uint32Array(this.#readback.getMappedRange().slice(0, STAT_COUNT * 4));
      this.#readback.unmap();
      return fieldStats(words);
    } finally {
      this.#isReading = false;
    }
  }

  destroy() {
    this.#stats.destroy();
    this.#readback.destroy();
  }
}

function fieldStats(words) {
  const floats = new Float32Array(words.buffer);
  return {
    nearSpeedMax: floats[0],
    farSpeedMax: floats[1],
    brokenVelocityCells: words[2],
    nearFog: words[3] / FOG_SUM_UNITS_PER_BASE_FOG,
    farFog: words[4] / FOG_SUM_UNITS_PER_BASE_FOG,
    brokenFogCells: words[5],
    accelerationMax: floats[6],
    vorticityMax: floats[7],
    pressureMax: floats[8],
    divergenceMax: floats[9],
    brokenPressureCells: words[10],
    probe: words[HAS_PROBE] === 1 ? probeStats(words, floats) : null,
  };
}

function probeStats(words, floats) {
  const depthBins = Array.from({ length: PROBE_DEPTH_BINS }, (_, bin) => bin);
  return {
    column: [words[PROBE_COLUMN_X], words[PROBE_COLUMN_Y]],
    movedAirInFront: floats[14],
    clearingSpeedUp: floats[15],
    windBuildUp: floats[16],
    meanFogByDepthBin: depthBins.map((bin) => (words[25 + bin] > 0 ? words[17 + bin] / words[25 + bin] / FOG_SUM_UNITS_PER_BASE_FOG : null)),
    windReachByDepthBin: depthBins.map((bin) => floats[33 + bin]),
  };
}
