export class GpuAllocationTracker {
  #liveObjects = new Set();

  install() {
    const liveObjects = this.#liveObjects;
    const tracked = (create) => function trackedCreate(descriptor) {
      const created = create.call(this, descriptor);
      liveObjects.add(created);
      return created;
    };
    const untracked = (destroy) => function untrackedDestroy() {
      liveObjects.delete(this);
      return destroy.call(this);
    };
    GPUDevice.prototype.createBuffer = tracked(GPUDevice.prototype.createBuffer);
    GPUDevice.prototype.createTexture = tracked(GPUDevice.prototype.createTexture);
    GPUBuffer.prototype.destroy = untracked(GPUBuffer.prototype.destroy);
    GPUTexture.prototype.destroy = untracked(GPUTexture.prototype.destroy);
  }

  get liveBytes() {
    let bytes = 0;
    for (const object of this.#liveObjects) bytes += object instanceof GPUBuffer ? object.size : textureBytes(object);
    return bytes;
  }

  get liveObjectCount() {
    return this.#liveObjects.size;
  }
}

const BYTES_PER_TEXEL = { rgba16float: 8, rgba8unorm: 4, 'rgba8unorm-srgb': 4, r16float: 2 };

function textureBytes(texture) {
  const texels = texture.width * texture.height * texture.depthOrArrayLayers;
  return texels * (BYTES_PER_TEXEL[texture.format] ?? 4) * (texture.mipLevelCount > 1 ? 4 / 3 : 1);
}
