const STAT_COUNT = 11;
const STATS_BYTES = 64;
const FOG_SUM_UNITS_PER_BASE_FOG = 100;

export const FIELD_DIAGNOSTICS_KERNEL = {
  shader: 'field_diagnostics',
  bindings: {
    velocity: 'texture3d', fog: 'texture3d', acceleration: 'texture3d', vorticity: 'texture3d',
    pressure: 'read:array<f32>', divergence: 'read:array<f32>', stats: 'readWrite:array<atomic<u32>>',
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

  measure(pass, field) {
    this.#device.queue.writeBuffer(this.#stats, 0, new Uint32Array(STATS_BYTES / 4));
    this.#kernels.kernel(FIELD_DIAGNOSTICS_KERNEL).dispatch(pass, {
      velocity: field.velocity, fog: field.fog, acceleration: field.acceleration, vorticity: field.vorticity,
      pressure: field.pressure, divergence: field.divergence, stats: this.#stats,
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
  };
}
