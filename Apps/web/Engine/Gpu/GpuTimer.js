const TIMESTAMP_BYTES = 16;
const SMOOTHING = 0.1;
const LONGEST_PLAUSIBLE_MILLISECONDS = 1000;

export class GpuTimer {
  #querySet;
  #resolveBuffer;
  #readBuffer;
  #isReading = false;
  #logger;
  #hasReportedFailure = false;

  constructor(device, logger) {
    this.#logger = logger;
    this.#querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
    this.#resolveBuffer = device.createBuffer({ size: TIMESTAMP_BYTES, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    this.#readBuffer = device.createBuffer({ size: TIMESTAMP_BYTES, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    this.milliseconds = null;
  }

  get canMeasureThisFrame() {
    return !this.#isReading;
  }

  get startWrites() {
    return { querySet: this.#querySet, beginningOfPassWriteIndex: 0 };
  }

  get endWrites() {
    return { querySet: this.#querySet, endOfPassWriteIndex: 1 };
  }

  copyResults(encoder) {
    encoder.resolveQuerySet(this.#querySet, 0, 2, this.#resolveBuffer, 0);
    encoder.copyBufferToBuffer(this.#resolveBuffer, 0, this.#readBuffer, 0, TIMESTAMP_BYTES);
  }

  async readResultsIfStillAvailable() {
    this.#isReading = true;
    try {
      await this.#readBuffer.mapAsync(GPUMapMode.READ);
      const [start, end] = new BigInt64Array(this.#readBuffer.getMappedRange());
      const measuredMilliseconds = Number(end - start) / 1e6;
      this.#readBuffer.unmap();
      if (measuredMilliseconds > 0 && measuredMilliseconds < LONGEST_PLAUSIBLE_MILLISECONDS) {
        this.milliseconds = this.milliseconds === null ? measuredMilliseconds : this.milliseconds + (measuredMilliseconds - this.milliseconds) * SMOOTHING;
      }
    } catch (readError) {
      if (!this.#hasReportedFailure) this.#logger.warn(`GPU time not available: ${readError.message}`);
      this.#hasReportedFailure = true;
    }
    this.#isReading = false;
  }
}
