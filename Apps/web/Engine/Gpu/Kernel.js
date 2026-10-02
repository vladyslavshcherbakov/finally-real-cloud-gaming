import { BindingLayout } from './BindingLayout.js';

export const GRID_WORKGROUP = [4, 4, 4];
export const LINEAR_WORKGROUP = [64, 1, 1];

export class Kernel {
  #bindingLayout;
  #workgroupSize;
  #params;
  #pipeline;

  constructor({ pipeline, bindingLayout, workgroupSize, params }) {
    this.#pipeline = pipeline;
    this.#bindingLayout = bindingLayout;
    this.#workgroupSize = workgroupSize;
    this.#params = params;
  }

  forgetBindGroups() {
    this.#bindingLayout.forgetBindGroups();
  }

  dispatch(pass, resourcesByName, invocationCounts) {
    const [countX, countY = 1, countZ = 1] = invocationCounts;
    const [sizeX, sizeY, sizeZ] = this.#workgroupSize;
    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, this.#bindingLayout.bindGroup(this.#params.buffer, resourcesByName));
    pass.dispatchWorkgroups(Math.ceil(countX / sizeX), Math.ceil(countY / sizeY), Math.ceil(countZ / sizeZ));
  }
}

export class KernelLibrary {
  #device;
  #shaders;
  #params;
  #logger;
  #kernelsByKey = new Map();
  #reportedUnpreparedKeys = new Set();

  constructor(device, shaders, params, logger) {
    this.#device = device;
    this.#shaders = shaders;
    this.#params = params;
    this.#logger = logger;
  }

  async prepare(kernelSpecs) {
    const missingSpecs = uniqueSpecs(kernelSpecs).filter((spec) => !this.#kernelsByKey.has(cacheKeyOf(spec)));
    const startMilliseconds = performance.now();
    const kernels = await Promise.all(missingSpecs.map((spec) => this.#compiledKernel(spec)));
    missingSpecs.forEach((spec, i) => this.#kernelsByKey.set(cacheKeyOf(spec), kernels[i]));
    if (missingSpecs.length > 0) {
      this.#logger.info(`${missingSpecs.length} kernels compiled in ${(performance.now() - startMilliseconds).toFixed(0)} ms`);
    }
  }

  kernel(spec) {
    const cacheKey = cacheKeyOf(spec);
    const preparedKernel = this.#kernelsByKey.get(cacheKey);
    if (preparedKernel) return preparedKernel;
    if (!this.#reportedUnpreparedKeys.has(cacheKey)) {
      this.#reportedUnpreparedKeys.add(cacheKey);
      this.#logger.warn(`kernel ${cacheKey} compiled during a frame: it is missing from a prepare list`);
    }
    const pipelineParts = this.#pipelineParts(spec);
    const kernel = this.#kernelFrom(pipelineParts, this.#device.createComputePipeline(pipelineParts.descriptor));
    this.#kernelsByKey.set(cacheKey, kernel);
    return kernel;
  }

  forgetBindGroups() {
    for (const kernel of this.#kernelsByKey.values()) kernel.forgetBindGroups();
  }

  async #compiledKernel(spec) {
    const pipelineParts = this.#pipelineParts(spec);
    const pipeline = await this.#device.createComputePipelineAsync(pipelineParts.descriptor);
    return this.#kernelFrom(pipelineParts, pipeline);
  }

  #pipelineParts({ shader, bindings, workgroupSize = GRID_WORKGROUP, constants = {} }) {
    const label = cacheKeyOf({ shader, constants });
    const bindingLayout = new BindingLayout(this.#device, label, bindings, GPUShaderStage.COMPUTE);
    const declarations = [
      bindingLayout.wgslDeclarations(),
      ...workgroupConstants(workgroupSize),
      ...Object.entries(constants).map(([name, value]) => `const ${name} = ${value};`),
    ].join('\n');
    const module = this.#device.createShaderModule({ label, code: this.#shaders.moduleCode(shader, declarations) });
    this.#reportCompilationErrors(label, module);
    return {
      bindingLayout,
      workgroupSize,
      descriptor: {
        label,
        layout: this.#device.createPipelineLayout({ bindGroupLayouts: [bindingLayout.layout] }),
        compute: { module, entryPoint: 'main' },
      },
    };
  }

  #kernelFrom({ bindingLayout, workgroupSize }, pipeline) {
    return new Kernel({ pipeline, bindingLayout, workgroupSize, params: this.#params });
  }

  async #reportCompilationErrors(label, module) {
    const info = await module.getCompilationInfo();
    for (const message of info.messages.filter((m) => m.type === 'error')) {
      this.#logger.error(`shader ${label} line ${message.lineNum}: ${message.message}`);
    }
  }
}

function cacheKeyOf({ shader, constants = {} }) {
  return `${shader}:${JSON.stringify(constants)}`;
}

function uniqueSpecs(kernelSpecs) {
  return [...new Map(kernelSpecs.map((spec) => [cacheKeyOf(spec), spec])).values()];
}

function workgroupConstants([sizeX, sizeY, sizeZ]) {
  return [`const WORKGROUP_SIZE_X = ${sizeX};`, `const WORKGROUP_SIZE_Y = ${sizeY};`, `const WORKGROUP_SIZE_Z = ${sizeZ};`];
}
