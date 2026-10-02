import { requestGpuDevice } from '../../Engine/Gpu/GpuDevice.js';
import { ShaderLibrary } from '../../Engine/Gpu/ShaderLibrary.js';
import { KernelLibrary } from '../../Engine/Gpu/Kernel.js';
import { ParamsBuffer } from '../../Engine/Gpu/ParamsBuffer.js';
import { FogField, FOG_FIELD_KERNELS, FOG_FIELD_SHADERS } from '../../Engine/Field/FogField.js';
import { halfFloatBits } from '../../Engine/Gpu/gpuResources.js';
import { Logger } from '../../../../Shared/Logging/Logger.js';

const NEAR_SLICE_METRES = 1;
const FAR_SLICE_METRES = 350;
const TAN_HALF_FOV_X = 0.6;
const HALF_FLOAT_BYTES = 2;
const SOLID_BYTES = 4;
const NEAREST_FLOW_DEPTH_METRES = 15;
const COPY_ROW_ALIGNMENT = 256;

export async function projectedAir({ gridSize, solidShare, seed, projections, largestStartSpeed }) {
  const logger = new Logger('bench', { sink: console });
  const gpuDevice = await requestGpuDevice(logger);
  const device = gpuDevice.device;
  const params = new ParamsBuffer(device);
  const shaders = await ShaderLibrary.load(FOG_FIELD_SHADERS);
  const kernels = new KernelLibrary(device, shaders, params, logger);
  await kernels.prepare(FOG_FIELD_KERNELS);
  const field = new FogField(device, kernels, null, gridSize);
  params.set(gridParams(gridSize));
  params.upload();
  const random = seededRandom(seed);
  const solidMask = writeRandomSolids(device, field, gridSize, solidShare, random);
  writeRandomVelocities(device, field.velocities[0], gridSize, largestStartSpeed, random);
  const energyAtStart = airEnergy(await readVelocities(device, field.velocities[0], gridSize), solidMask, gridSize);
  submit(device, (pass) => field.pressureSolver.buildLevelSolids(pass, field.solids));
  let currentIndex = 0;
  for (let projection = 0; projection < projections; projection++) {
    submit(device, (pass) => field.makeDivergenceFree(pass, field.velocities[currentIndex], field.velocities[1 - currentIndex]));
    currentIndex = 1 - currentIndex;
  }
  field.velocity = field.velocities[currentIndex];
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  field.diagnostics.measure(pass, field, null);
  pass.end();
  field.diagnostics.copyForReading(encoder);
  device.queue.submit([encoder.finish()]);
  const reading = await field.diagnostics.read();
  const energyAfter = airEnergy(await readVelocities(device, field.velocity, gridSize), solidMask, gridSize);
  field.destroy();
  device.destroy();
  return {
    solidCells: solidMask.filter(Boolean).length,
    energyAtStart,
    energyAfter,
    nonFiniteCells: reading.brokenVelocityCells + reading.brokenPressureCells,
  };
}

function gridParams([gridWidth, gridHeight, gridDepth]) {
  return {
    gridWidth, gridHeight, gridDepth, cellCount: gridWidth * gridHeight * gridDepth,
    nearSliceMetres: NEAR_SLICE_METRES, farSliceMetres: FAR_SLICE_METRES, sliceLogRange: Math.log(FAR_SLICE_METRES / NEAR_SLICE_METRES),
    tanHalfFovX: TAN_HALF_FOV_X, tanHalfFovY: (TAN_HALF_FOV_X * gridHeight) / gridWidth,
  };
}

function writeRandomSolids(device, field, [width, height, depth], solidShare, random) {
  const texels = new Uint8Array(width * height * depth * SOLID_BYTES);
  const solidMask = [];
  for (let cell = 0; cell < width * height * depth; cell++) {
    const isSolid = random() < solidShare;
    solidMask.push(isSolid);
    if (!isSolid) continue;
    texels[cell * SOLID_BYTES] = 255;
    texels[cell * SOLID_BYTES + 3] = 255;
  }
  device.queue.writeTexture({ texture: field.solids }, texels, { bytesPerRow: width * SOLID_BYTES, rowsPerImage: height }, [width, height, depth]);
  return solidMask;
}

function writeRandomVelocities(device, texture, [width, height, depth], largestSpeed, random) {
  const halves = new Uint16Array(width * height * depth * 4);
  for (let cell = 0; cell < width * height * depth; cell++) {
    for (let axis = 0; axis < 3; axis++) halves[cell * 4 + axis] = halfFloatBits((random() * 2 - 1) * largestSpeed / Math.sqrt(3));
  }
  device.queue.writeTexture({ texture }, halves, { bytesPerRow: width * 4 * HALF_FLOAT_BYTES, rowsPerImage: height }, [width, height, depth]);
}

async function readVelocities(device, texture, [width, height, depth]) {
  const rowBytes = width * 4 * HALF_FLOAT_BYTES;
  const paddedRowBytes = Math.ceil(rowBytes / COPY_ROW_ALIGNMENT) * COPY_ROW_ALIGNMENT;
  const readback = device.createBuffer({ size: paddedRowBytes * height * depth, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow: paddedRowBytes, rowsPerImage: height }, [width, height, depth]);
  device.queue.submit([encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);
  const paddedHalves = new Uint16Array(readback.getMappedRange().slice(0));
  readback.destroy();
  const velocities = new Float32Array(width * height * depth * 3);
  for (let row = 0; row < height * depth; row++) {
    for (let x = 0; x < width; x++) {
      for (let axis = 0; axis < 3; axis++) {
        velocities[((row * width) + x) * 3 + axis] = floatFromHalfBits(paddedHalves[(row * paddedRowBytes) / HALF_FLOAT_BYTES + x * 4 + axis]);
      }
    }
  }
  return velocities;
}

function airEnergy(velocities, solidMask, [width, height, depth]) {
  const cellSizePerDepthMetre = [2 * TAN_HALF_FOV_X / width, 2 * ((TAN_HALF_FOV_X * height) / width) / height, Math.log(FAR_SLICE_METRES / NEAR_SLICE_METRES) / depth];
  const axisWeights = cellSizePerDepthMetre.map((size) => (size / cellSizePerDepthMetre[0]) ** 2);
  let energy = 0;
  for (let cell = 0; cell < width * height * depth; cell++) {
    if (solidMask[cell]) continue;
    const slice = Math.floor(cell / (width * height));
    const sliceMetres = NEAR_SLICE_METRES * Math.exp(Math.log(FAR_SLICE_METRES / NEAR_SLICE_METRES) * (slice + 0.5) / depth);
    const relativeFlowDepth = Math.max(sliceMetres, NEAREST_FLOW_DEPTH_METRES) / FAR_SLICE_METRES;
    for (let axis = 0; axis < 3; axis++) energy += relativeFlowDepth ** 5 * axisWeights[axis] * velocities[cell * 3 + axis] ** 2;
  }
  return energy;
}

function floatFromHalfBits(bits) {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function submit(device, encodePass) {
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  encodePass(pass);
  pass.end();
  device.queue.submit([encoder.finish()]);
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
