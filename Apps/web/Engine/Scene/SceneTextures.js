import { halfFloatBits } from '../Gpu/gpuResources.js';
import { measureScene } from '../../../../Shared/Domain/Entities/SceneMeasurements.js';

export class SceneAssetLoadFailed extends Error {
  constructor(path, status) {
    super(`scene asset ${path} could not be loaded: HTTP ${status}`);
    this.name = 'SceneAssetLoadFailed';
  }
}

const MEASUREMENT_WIDTH = 96;
const DEPTH_CODE_LEVELS = 65535;
const BITMAP_OPTIONS = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };

const MIPMAP_SHADER = `
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
struct MipVertex { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn fullscreenVertex(@builtin(vertex_index) vertexIndex: u32) -> MipVertex {
  let corner = vec2f(f32((vertexIndex << 1u) & 2u), f32(vertexIndex & 2u));
  return MipVertex(vec4f(corner * 2.0 - 1.0, 0.0, 1.0), vec2f(corner.x, 1.0 - corner.y));
}
@fragment fn main(vertex: MipVertex) -> @location(0) vec4f { return textureSample(source, linearSampler, vertex.uv); }
`;

export class SceneTextures {
  constructor({ description, photo, depthCodes, depthMetres, depthWidth, depthHeight, measurements }) {
    this.description = description;
    this.photo = photo;
    this.depthCodes = depthCodes;
    this.depthMetres = depthMetres;
    this.depthWidth = depthWidth;
    this.depthHeight = depthHeight;
    this.measurements = measurements;
  }

  static async load(device, description, assetBaseUrl) {
    const [photoBitmap, depthBitmap] = await Promise.all([
      loadBitmap(new URL(description.photoPath, assetBaseUrl), description.photoPath),
      loadBitmap(new URL(description.depthPath, assetBaseUrl), description.depthPath),
    ]);
    const depthMetres = decodedDepthMetres(description, depthBitmap);
    const scene = SceneTextures.#fromPhotoAndDepth(device, description, photoBitmap, depthMetres, depthBitmap.width, depthBitmap.height);
    photoBitmap.close();
    depthBitmap.close();
    return scene;
  }

  static async fromPhotoScene(device, photoScene) {
    const photoBitmap = await createImageBitmap(photoScene.photo, BITMAP_OPTIONS);
    const scene = SceneTextures.#fromPhotoAndDepth(device, photoScene.description, photoBitmap, photoScene.depthMetres, photoScene.depthWidth, photoScene.depthHeight);
    photoBitmap.close();
    return scene;
  }

  static #fromPhotoAndDepth(device, description, photoBitmap, depthMetres, depthWidth, depthHeight) {
    return new SceneTextures({
      description,
      photo: photoTexture(device, photoBitmap),
      depthCodes: depthCodeTexture(device, description, depthMetres, depthWidth, depthHeight),
      depthMetres,
      depthWidth,
      depthHeight,
      measurements: measureScene({
        ...linearPixelsForMeasurement(photoBitmap),
        depthMetresAt: depthLookup(depthMetres, depthWidth, depthHeight),
        skyDepthMetres: description.depthFarMetres,
      }),
    });
  }

  destroy() {
    this.photo.destroy();
    this.depthCodes.destroy();
  }
}

async function loadBitmap(url, path) {
  const response = await fetch(url);
  if (!response.ok) throw new SceneAssetLoadFailed(path, response.status);
  return createImageBitmap(await response.blob(), BITMAP_OPTIONS);
}

function pixelBytes(bitmap, width = bitmap.width, height = bitmap.height) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

function depthLookup(depthMetres, width, height) {
  return (photoU, photoV) => {
    const x = Math.min(width - 1, Math.max(0, Math.floor(photoU * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(photoV * height)));
    return depthMetres[y * width + x];
  };
}

function decodedDepthMetres(description, bitmap) {
  const bytes = pixelBytes(bitmap);
  const depthMetres = new Float32Array(bitmap.width * bitmap.height);
  const logRange = Math.log(description.depthFarMetres / description.depthNearMetres);
  for (let i = 0; i < depthMetres.length; i++) {
    const depthCode = (bytes[i * 4] * 256 + bytes[i * 4 + 1]) / DEPTH_CODE_LEVELS;
    depthMetres[i] = description.depthNearMetres * Math.exp(depthCode * logRange);
  }
  return depthMetres;
}

function depthCodeTexture(device, description, depthMetres, width, height) {
  const logRange = Math.log(description.depthFarMetres / description.depthNearMetres);
  const halfFloats = Uint16Array.from(depthMetres, (metres) => halfFloatBits(Math.log(metres / description.depthNearMetres) / logRange));
  const texture = device.createTexture({
    label: 'scene depth',
    size: [width, height],
    format: 'r16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture }, halfFloats, { bytesPerRow: width * 2 }, [width, height]);
  return texture;
}

function linearPixelsForMeasurement(bitmap) {
  const width = MEASUREMENT_WIDTH;
  const height = Math.round((bitmap.height / bitmap.width) * width);
  const bytes = pixelBytes(bitmap, width, height);
  const linearPixels = [];
  for (let i = 0; i < width * height; i++) {
    linearPixels.push([0, 1, 2].map((channel) => srgbToLinear(bytes[i * 4 + channel] / 255)));
  }
  return { linearPixels, width, height };
}

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function photoTexture(device, bitmap) {
  const mipLevelCount = Math.floor(Math.log2(Math.max(bitmap.width, bitmap.height))) + 1;
  const texture = device.createTexture({
    label: 'photo',
    size: [bitmap.width, bitmap.height],
    format: 'rgba8unorm-srgb',
    mipLevelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [bitmap.width, bitmap.height]);
  generateMipmaps(device, texture, mipLevelCount);
  return texture;
}

function generateMipmaps(device, texture, mipLevelCount) {
  const module = device.createShaderModule({ label: 'mipmaps', code: MIPMAP_SHADER });
  const pipeline = device.createRenderPipeline({
    label: 'mipmaps',
    layout: 'auto',
    vertex: { module, entryPoint: 'fullscreenVertex' },
    fragment: { module, entryPoint: 'main', targets: [{ format: texture.format }] },
  });
  const linearSampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const encoder = device.createCommandEncoder({ label: 'mipmaps' });
  for (let level = 1; level < mipLevelCount; level++) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: texture.createView({ baseMipLevel: level, mipLevelCount: 1 }), loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }) },
        { binding: 1, resource: linearSampler },
      ],
    }));
    pass.draw(3);
    pass.end();
  }
  device.queue.submit([encoder.finish()]);
}
