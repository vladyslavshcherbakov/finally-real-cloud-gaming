export const PARAM_FIELDS = [
  'gridWidth', 'gridHeight', 'gridDepth', 'cellCount',
  'elapsedSeconds', 'stepSeconds', 'frameIndex', 'canvasAspect',
  'nearSliceMetres', 'farSliceMetres', 'sliceLogRange', 'solidThicknessFactor',
  'tanHalfFovX', 'tanHalfFovY', 'depthCodecNearMetres', 'depthCodecLogRange',
  'photoScaleU', 'photoScaleV', 'photoOffsetU', 'photoOffsetV',
  'groundNormalX', 'groundNormalY', 'groundNormalZ', 'groundOffsetMetres',
  'sunDirectionX', 'sunDirectionY', 'sunDirectionZ', 'sunIntensity',
  'sunColorR', 'sunColorG', 'sunColorB', 'ambientIntensity',
  'skyColorR', 'skyColorG', 'skyColorB', 'sceneGlowIntensity',
  'groundColorR', 'groundColorG', 'groundColorB', 'exposure',
  'windDriftX', 'windDriftY', 'windDriftZ', 'turbulenceMetresPerSecond',
  'openingOpticalDepth', 'heightFalloffMetres', 'baseSmog', 'clumps',
  'returnRate', 'diffusion', 'vorticityConfinement', 'damping',
  'detailAmount', 'detailScalePerMetre', 'detailFlowPeriodSeconds', 'erosion',
  'windSourceCount', 'windStrength', 'windRadius', 'wakeMixing',
  'forwardScattering', 'multipleScattering', 'samplesPerSlice', 'debugView',
  'flipRatio',
  'respawnFractionPerStep', 'mpmSubstepSeconds', 'bulkStiffness', 'particlesPerCell',
  'noiseSlabStart', 'lightBlend',
];

const UNIFORM_ALIGNMENT_FLOATS = 4;

const WIND_SOURCES = {
  structName: 'WindSourceParams', arrayName: 'windSources', countParam: 'windSourceCount',
  fields: ['u', 'v', 'velocityU', 'velocityV', 'radius', 'strength', 'outwardStrength'], maxCount: 8,
};
const PARAM_ARRAYS = [WIND_SOURCES];

export class UnknownParam extends Error {
  constructor(name) {
    super(`params have no field ${name}`);
    this.name = 'UnknownParam';
  }
}

export class ParamsBuffer {
  #device;
  #floats;
  #offsetByName = new Map(PARAM_FIELDS.map((name, offset) => [name, offset]));

  constructor(device) {
    this.#device = device;
    this.#floats = new Float32Array(arrayOffset(PARAM_ARRAYS.length));
    this.buffer = device.createBuffer({
      label: 'params',
      size: this.#floats.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  static wgslDeclarations() {
    return [
      ...PARAM_ARRAYS.flatMap((paramArray) => [
        `struct ${paramArray.structName} {`,
        ...paramArray.fields.map((name) => `  ${name}: f32,`),
        ...paddingFields(strideFloats(paramArray) - paramArray.fields.length),
        '}',
      ]),
      'struct Params {',
      ...PARAM_FIELDS.map((name) => `  ${name}: f32,`),
      ...paddingFields(alignedFieldCount() - PARAM_FIELDS.length),
      ...PARAM_ARRAYS.map((paramArray) => `  ${paramArray.arrayName}: array<${paramArray.structName}, ${paramArray.maxCount}>,`),
      '}',
    ].join('\n');
  }

  set(valuesByName) {
    for (const [name, value] of Object.entries(valuesByName)) {
      const offset = this.#offsetByName.get(name);
      if (offset === undefined) throw new UnknownParam(name);
      this.#floats[offset] = value;
    }
  }

  setWindSources(windSources) {
    this.#setArray(WIND_SOURCES, windSources);
  }

  upload() {
    this.#device.queue.writeBuffer(this.buffer, 0, this.#floats);
  }

  #setArray(paramArray, items) {
    const itemCount = Math.min(items.length, paramArray.maxCount);
    const firstOffset = arrayOffset(PARAM_ARRAYS.indexOf(paramArray));
    for (let i = 0; i < itemCount; i++) {
      const values = paramArray.fields.map((name) => Number(items[i][name]));
      this.#floats.set(values, firstOffset + i * strideFloats(paramArray));
    }
    this.set({ [paramArray.countParam]: itemCount });
  }
}

function alignedFieldCount() {
  return alignedFloats(PARAM_FIELDS.length);
}

function strideFloats(paramArray) {
  return alignedFloats(paramArray.fields.length);
}

function arrayOffset(arrayIndex) {
  return PARAM_ARRAYS.slice(0, arrayIndex).reduce((offset, paramArray) => offset + paramArray.maxCount * strideFloats(paramArray), alignedFieldCount());
}

function alignedFloats(floatCount) {
  return Math.ceil(floatCount / UNIFORM_ALIGNMENT_FLOATS) * UNIFORM_ALIGNMENT_FLOATS;
}

function paddingFields(count) {
  return Array.from({ length: count }, (_, i) => `  padding${i}: f32,`);
}
