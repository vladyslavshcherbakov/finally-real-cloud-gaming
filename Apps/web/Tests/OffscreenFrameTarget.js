const BYTES_PER_ROW_ALIGNMENT = 256;

export class CapturedFrame {
  constructor(width, height, rgba) {
    this.width = width;
    this.height = height;
    this.rgba = rgba;
  }

  meanDifference(otherFrame, region) {
    let differenceSum = 0;
    let channelCount = 0;
    for (let y = Math.floor(region.top * this.height); y < Math.floor(region.bottom * this.height); y++) {
      for (let x = Math.floor(region.left * this.width); x < Math.floor(region.right * this.width); x++) {
        for (let channel = 0; channel < 3; channel++) {
          const i = (y * this.width + x) * 4 + channel;
          differenceSum += Math.abs(this.rgba[i] - otherFrame.rgba[i]);
          channelCount++;
        }
      }
    }
    return differenceSum / channelCount / 255;
  }

  fingerprint() {
    let hash = 2166136261;
    for (let i = 0; i < this.rgba.length; i += 4) {
      hash ^= this.rgba[i] >> 3;
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash;
  }
}

export class OffscreenFrameTarget {
  #device;
  #texture;

  constructor(gpuDevice, width, height) {
    this.#device = gpuDevice.device;
    this.format = 'rgba8unorm';
    this.width = width;
    this.height = height;
    this.#texture = this.#device.createTexture({
      label: 'offscreen frame',
      size: [width, height],
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
  }

  resizeToDisplaySize() {
    return false;
  }

  currentView() {
    return this.#texture.createView();
  }

  async capture() {
    const bytesPerRow = Math.ceil((this.width * 4) / BYTES_PER_ROW_ALIGNMENT) * BYTES_PER_ROW_ALIGNMENT;
    const readBuffer = this.#device.createBuffer({ size: bytesPerRow * this.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = this.#device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: this.#texture }, { buffer: readBuffer, bytesPerRow }, [this.width, this.height]);
    this.#device.queue.submit([encoder.finish()]);
    await readBuffer.mapAsync(GPUMapMode.READ);
    const paddedRows = new Uint8Array(readBuffer.getMappedRange());
    const rgba = new Uint8ClampedArray(this.width * this.height * 4);
    for (let y = 0; y < this.height; y++) rgba.set(paddedRows.subarray(y * bytesPerRow, y * bytesPerRow + this.width * 4), y * this.width * 4);
    readBuffer.destroy();
    return new CapturedFrame(this.width, this.height, rgba);
  }
}
