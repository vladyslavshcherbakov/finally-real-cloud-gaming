export class UnknownBindingKind extends Error {
  constructor(label, name, kind) {
    super(`${label}: binding ${name} has unknown kind ${kind}`);
    this.name = 'UnknownBindingKind';
  }
}

export class MissingBinding extends Error {
  constructor(label, name) {
    super(`${label}: no resource for binding ${name}`);
    this.name = 'MissingBinding';
  }
}

const PARAMS_BINDING = 0;
const LARGEST_BIND_GROUP_CACHE = 256;

const BINDING_KINDS = {
  texture3d: {
    layoutEntry: () => ({ texture: { sampleType: 'float', viewDimension: '3d' } }),
    declaration: (name) => `var ${name}: texture_3d<f32>;`,
  },
  texture2d: {
    layoutEntry: () => ({ texture: { sampleType: 'float', viewDimension: '2d' } }),
    declaration: (name) => `var ${name}: texture_2d<f32>;`,
  },
  sampler: {
    layoutEntry: () => ({ sampler: { type: 'filtering' } }),
    declaration: (name) => `var ${name}: sampler;`,
  },
  write3d: {
    layoutEntry: (format) => ({ storageTexture: { access: 'write-only', format, viewDimension: '3d' } }),
    declaration: (name, format) => `var ${name}: texture_storage_3d<${format}, write>;`,
  },
  read: {
    layoutEntry: () => ({ buffer: { type: 'read-only-storage' } }),
    declaration: (name, elementType) => `var<storage, read> ${name}: ${elementType};`,
  },
  readWrite: {
    layoutEntry: () => ({ buffer: { type: 'storage' } }),
    declaration: (name, elementType) => `var<storage, read_write> ${name}: ${elementType};`,
  },
};

let nextResourceId = 1;
const resourceIds = new WeakMap();

export class BindingLayout {
  #device;
  #label;
  #bindings;
  #bindGroupsByResources = new Map();
  #viewsByTexture = new WeakMap();

  constructor(device, label, bindingKindsByName, visibility) {
    this.#device = device;
    this.#label = label;
    this.#bindings = Object.entries(bindingKindsByName).map(([name, kindText], i) => {
      const [kindName, argument] = splitKind(kindText);
      const kind = BINDING_KINDS[kindName];
      if (!kind) throw new UnknownBindingKind(label, name, kindText);
      return { name, kind, argument, binding: PARAMS_BINDING + 1 + i };
    });
    this.layout = device.createBindGroupLayout({
      label,
      entries: [
        { binding: PARAMS_BINDING, visibility, buffer: { type: 'uniform' } },
        ...this.#bindings.map(({ kind, argument, binding }) => ({ binding, visibility, ...kind.layoutEntry(argument) })),
      ],
    });
  }

  wgslDeclarations() {
    return [
      `@group(0) @binding(${PARAMS_BINDING}) var<uniform> params: Params;`,
      ...this.#bindings.map(({ name, kind, argument, binding }) => `@group(0) @binding(${binding}) ${kind.declaration(name, argument)}`),
    ].join('\n');
  }

  bindGroup(paramsBuffer, resourcesByName) {
    const resources = this.#bindings.map(({ name }) => {
      if (!(name in resourcesByName)) throw new MissingBinding(this.#label, name);
      return resourcesByName[name];
    });
    const cacheKey = [paramsBuffer, ...resources].map(resourceId).join(',');
    let bindGroup = this.#bindGroupsByResources.get(cacheKey);
    if (!bindGroup) {
      if (this.#bindGroupsByResources.size > LARGEST_BIND_GROUP_CACHE) this.#bindGroupsByResources.clear();
      bindGroup = this.#device.createBindGroup({
        label: this.#label,
        layout: this.layout,
        entries: [
          { binding: PARAMS_BINDING, resource: { buffer: paramsBuffer } },
          ...this.#bindings.map(({ binding }, i) => ({ binding, resource: this.#bindingResource(resources[i]) })),
        ],
      });
      this.#bindGroupsByResources.set(cacheKey, bindGroup);
    }
    return bindGroup;
  }

  forgetBindGroups() {
    this.#bindGroupsByResources.clear();
  }

  #bindingResource(resource) {
    if (resource instanceof GPUBuffer) return { buffer: resource };
    if (!(resource instanceof GPUTexture)) return resource;
    if (!this.#viewsByTexture.has(resource)) this.#viewsByTexture.set(resource, resource.createView());
    return this.#viewsByTexture.get(resource);
  }
}

function splitKind(kindText) {
  const separator = kindText.indexOf(':');
  return separator < 0 ? [kindText, undefined] : [kindText.slice(0, separator), kindText.slice(separator + 1)];
}

function resourceId(resource) {
  if (!resourceIds.has(resource)) resourceIds.set(resource, nextResourceId++);
  return resourceIds.get(resource);
}
