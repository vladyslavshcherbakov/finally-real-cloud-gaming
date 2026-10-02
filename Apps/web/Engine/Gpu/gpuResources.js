export function createTexture3D(device, label, size, format) {
  return device.createTexture({
    label,
    size,
    dimension: '3d',
    format,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
  });
}

const STORAGE_BUFFER_ALIGNMENT = 16;

export function createStorageBuffer(device, label, byteCount) {
  return device.createBuffer({
    label,
    size: Math.max(STORAGE_BUFFER_ALIGNMENT, Math.ceil(byteCount / STORAGE_BUFFER_ALIGNMENT) * STORAGE_BUFFER_ALIGNMENT),
    usage: GPUBufferUsage.STORAGE,
  });
}

const scratchFloat = new Float32Array(1);
const scratchBits = new Uint32Array(scratchFloat.buffer);

export function halfFloatBits(value) {
  scratchFloat[0] = value;
  const floatBits = scratchBits[0];
  const sign = (floatBits >>> 16) & 0x8000;
  const halfExponent = ((floatBits >>> 23) & 0xff) - 127 + 15;
  if (halfExponent <= 0) return sign;
  if (halfExponent >= 31) return sign | 0x7c00;
  return sign | (halfExponent << 10) | ((floatBits & 0x7fffff) >>> 13);
}

export function createStorageBufferHolding(device, label, values) {
  const buffer = device.createBuffer({ label, size: Math.max(STORAGE_BUFFER_ALIGNMENT, values.byteLength), usage: GPUBufferUsage.STORAGE, mappedAtCreation: true });
  new values.constructor(buffer.getMappedRange()).set(values);
  buffer.unmap();
  return buffer;
}
