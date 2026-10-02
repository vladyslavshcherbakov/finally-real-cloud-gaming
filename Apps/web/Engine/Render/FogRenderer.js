import { FullscreenPass } from '../Gpu/FullscreenPass.js';

export const FOG_RENDERER_SHADERS = ['fog_render', 'composite'];

const FOG_LAYER_FORMAT = 'rgba16float';

export class FogRenderer {
  #device;
  #fogPass;
  #compositePass;
  #fogLayer = null;

  constructor(device, fogPass, compositePass) {
    this.#device = device;
    this.#fogPass = fogPass;
    this.#compositePass = compositePass;
  }

  static async create(device, shaders, params, targetFormat) {
    const [fogPass, compositePass] = await Promise.all([
      FullscreenPass.create(device, shaders, params, {
        shader: 'fog_render',
        bindings: {
          fog: 'texture3d', flow: 'texture3d', light: 'texture3d', detailNoise: 'texture3d', windReach: 'texture3d',
          sceneDepth: 'texture2d', photo: 'texture2d', clampSampler: 'sampler', repeatSampler: 'sampler',
        },
        targetFormat: FOG_LAYER_FORMAT,
      }),
      FullscreenPass.create(device, shaders, params, {
        shader: 'composite',
        bindings: {
          fogLayer: 'texture2d', photo: 'texture2d', sceneDepth: 'texture2d', fog: 'texture3d', velocity: 'texture3d',
          solids: 'texture3d', clampSampler: 'sampler',
        },
        targetFormat,
      }),
    ]);
    return new FogRenderer(device, fogPass, compositePass);
  }

  forgetBindGroups() {
    this.#fogPass.forgetBindGroups();
    this.#compositePass.forgetBindGroups();
  }

  resizeFogLayer(width, height) {
    if (this.#fogLayer && this.#fogLayer.width === width && this.#fogLayer.height === height) return;
    this.#fogLayer?.destroy();
    this.forgetBindGroups();
    this.#fogLayer = this.#device.createTexture({
      label: 'fog layer',
      size: [width, height],
      format: FOG_LAYER_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  render(encoder, targetView, field, scene, timestampWrites) {
    this.#fogPass.draw(encoder, this.#fogLayer.createView(), {
      fog: field.fog, flow: field.flow, light: field.light, detailNoise: field.noise.detail, windReach: field.windReach,
      sceneDepth: scene.depthCodes, photo: scene.photo, clampSampler: field.clampSampler, repeatSampler: field.repeatSampler,
    });
    this.#compositePass.draw(encoder, targetView, {
      fogLayer: this.#fogLayer, photo: scene.photo, sceneDepth: scene.depthCodes, fog: field.fog, velocity: field.velocity,
      solids: field.solids, clampSampler: field.clampSampler,
    }, timestampWrites);
  }
}
