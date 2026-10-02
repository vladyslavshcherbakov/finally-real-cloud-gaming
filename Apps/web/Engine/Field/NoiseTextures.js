import { createTexture3D } from '../Gpu/gpuResources.js';

const DETAIL_NOISE_SIZE = 96;
const FLOW_NOISE_SIZE = 64;
const SLAB_DEPTH = 16;

const DETAIL_NOISE_KERNEL = { shader: 'noise_detail', bindings: { detailNoiseOut: 'write3d:rgba8unorm' } };
const FLOW_NOISE_KERNEL = { shader: 'noise_flow', bindings: { flowNoiseOut: 'write3d:rgba16float' } };

export const NOISE_KERNELS = [DETAIL_NOISE_KERNEL, FLOW_NOISE_KERNEL];

export const NOISE_SHADERS = NOISE_KERNELS.map((spec) => spec.shader);

export class NoiseTextures {
  constructor(detail, flow) {
    this.detail = detail;
    this.flow = flow;
  }

  static async generate(device, kernels, params, reportProgress) {
    const detail = createTexture3D(device, 'detail noise', cube(DETAIL_NOISE_SIZE), 'rgba8unorm');
    const flow = createTexture3D(device, 'flow noise', cube(FLOW_NOISE_SIZE), 'rgba16float');
    const slabs = [
      ...slabStarts(FLOW_NOISE_SIZE).map((slabStart) => ({ kernel: FLOW_NOISE_KERNEL, resources: { flowNoiseOut: flow }, size: FLOW_NOISE_SIZE, slabStart })),
      ...slabStarts(DETAIL_NOISE_SIZE).map((slabStart) => ({ kernel: DETAIL_NOISE_KERNEL, resources: { detailNoiseOut: detail }, size: DETAIL_NOISE_SIZE, slabStart })),
    ];
    for (const [slabNumber, slab] of slabs.entries()) {
      params.set({ noiseSlabStart: slab.slabStart });
      params.upload();
      const encoder = device.createCommandEncoder({ label: 'noise slab' });
      const pass = encoder.beginComputePass({ label: 'noise slab' });
      kernels.kernel(slab.kernel).dispatch(pass, slab.resources, [slab.size, slab.size, Math.min(SLAB_DEPTH, slab.size - slab.slabStart)]);
      pass.end();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      reportProgress((slabNumber + 1) / slabs.length);
    }
    return new NoiseTextures(detail, flow);
  }

  destroy() {
    this.detail.destroy();
    this.flow.destroy();
  }
}

function cube(size) {
  return [size, size, size];
}

function slabStarts(size) {
  return Array.from({ length: Math.ceil(size / SLAB_DEPTH) }, (_, i) => i * SLAB_DEPTH);
}
