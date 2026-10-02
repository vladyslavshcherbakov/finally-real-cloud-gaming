export class WebGpuUnavailable extends Error {
  constructor() {
    super('this browser has no WebGPU');
    this.name = 'WebGpuUnavailable';
  }
}

export class NoGpuAdapter extends Error {
  constructor() {
    super('the browser found no WebGPU adapter');
    this.name = 'NoGpuAdapter';
  }
}

const OPTIONAL_FEATURES = ['timestamp-query'];

export class GpuDevice {
  constructor(adapter, device, features) {
    this.adapter = adapter;
    this.device = device;
    this.features = features;
  }

  get hasTimestamps() {
    return this.features.has('timestamp-query');
  }
}

export async function requestGpuDevice(logger) {
  if (!navigator.gpu) throw new WebGpuUnavailable();
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new NoGpuAdapter();
  const features = new Set(OPTIONAL_FEATURES.filter((feature) => adapter.features.has(feature)));
  const adapterLimits = adapter.limits;
  const device = await adapter.requestDevice({
    requiredFeatures: [...features],
    requiredLimits: {
      maxStorageBufferBindingSize: adapterLimits.maxStorageBufferBindingSize,
      maxBufferSize: adapterLimits.maxBufferSize,
      maxStorageTexturesPerShaderStage: Math.min(adapterLimits.maxStorageTexturesPerShaderStage, 8),
    },
  });
  device.addEventListener('uncapturederror', (event) => logger.error(`uncaptured GPU error: ${event.error.message}`));
  logger.info(`GPU device ready: ${adapter.info?.vendor ?? 'unknown vendor'} ${adapter.info?.architecture ?? ''}, `
    + `features [${[...features].join(', ')}]`);
  return new GpuDevice(adapter, device, features);
}
