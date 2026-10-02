import { BindingLayout } from './BindingLayout.js';

export class FullscreenPass {
  #bindingLayout;
  #params;
  #pipeline;

  constructor(params, bindingLayout, pipeline) {
    this.#params = params;
    this.#bindingLayout = bindingLayout;
    this.#pipeline = pipeline;
  }

  static async create(device, shaders, params, { shader, bindings, targetFormat }) {
    const bindingLayout = new BindingLayout(device, shader, bindings, GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX);
    const module = device.createShaderModule({ label: shader, code: shaders.moduleCode(shader, bindingLayout.wgslDeclarations()) });
    const pipeline = await device.createRenderPipelineAsync({
      label: shader,
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindingLayout.layout] }),
      vertex: { module, entryPoint: 'fullscreenVertex' },
      fragment: { module, entryPoint: 'main', targets: [{ format: targetFormat }] },
      primitive: { topology: 'triangle-list' },
    });
    return new FullscreenPass(params, bindingLayout, pipeline);
  }

  forgetBindGroups() {
    this.#bindingLayout.forgetBindGroups();
  }

  draw(encoder, targetView, resourcesByName, timestampWrites) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: targetView, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
      timestampWrites,
    });
    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, this.#bindingLayout.bindGroup(this.#params.buffer, resourcesByName));
    pass.draw(3);
    pass.end();
  }
}
