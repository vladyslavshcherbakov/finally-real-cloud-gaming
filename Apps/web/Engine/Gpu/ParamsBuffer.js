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

export const WIND_SOURCE_FIELDS = ['u', 'v', 'velocityU', 'velocityV', 'radius', 'strength', 'outwardStrength'];
export const MAX_WIND_SOURCES = 8;

const UNIFORM_ALIGNMENT_FLOATS = 4;
const WIND_SOURCE_STRIDE_FLOATS = Math.ceil(WIND_SOURCE_FIELDS.length / UNIFORM_ALIGNMENT_FLOATS) * UNIFORM_ALIGNMENT_FLOATS;

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
  #windSourcesOffset = alignedFieldCount();

  constructor(device) {
    this.#device = device;
    this.#floats = new Float32Array(this.#windSourcesOffset + MAX_WIND_SOURCES * WIND_SOURCE_STRIDE_FLOATS);
    this.buffer = device.createBuffer({
      label: 'params',
      size: this.#floats.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  static wgslDeclarations() {
    const paddingCount = alignedFieldCount() - PARAM_FIELDS.length;
    const paddingFields = Array.from({ length: paddingCount }, (_, i) => `  padding${i}: f32,`);
    const windSourcePaddingFields = Array.from({ length: WIND_SOURCE_STRIDE_FLOATS - WIND_SOURCE_FIELDS.length }, (_, i) => `  padding${i}: f32,`);
    return [
      'struct WindSourceParams {',
      ...WIND_SOURCE_FIELDS.map((name) => `  ${name}: f32,`),
      ...windSourcePaddingFields,
      '}',
      'struct Params {',
      ...PARAM_FIELDS.map((name) => `  ${name}: f32,`),
      ...paddingFields,
      `  windSources: array<WindSourceParams, ${MAX_WIND_SOURCES}>,`,
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
    const sourceCount = Math.min(windSources.length, MAX_WIND_SOURCES);
    for (let i = 0; i < sourceCount; i++) {
      const source = windSources[i];
      const values = WIND_SOURCE_FIELDS.map((name) => Number(source[name]));
      this.#floats.set(values, this.#windSourcesOffset + i * WIND_SOURCE_STRIDE_FLOATS);
    }
    this.set({ windSourceCount: sourceCount });
  }

  upload() {
    this.#device.queue.writeBuffer(this.buffer, 0, this.#floats);
  }
}

function alignedFieldCount() {
  return Math.ceil(PARAM_FIELDS.length / UNIFORM_ALIGNMENT_FLOATS) * UNIFORM_ALIGNMENT_FLOATS;
}
