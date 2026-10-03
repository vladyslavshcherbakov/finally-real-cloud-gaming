import { photoFileReport, auxiliaryImageFile, PhotoFileUnreadable } from '../../../../Shared/Storage/Mappers/PhotoFileMapper.js';
import { depthEncoding, DepthXmpInvalid } from '../../../../Shared/Storage/Mappers/DepthXmpMapper.js';
import { photoSceneFromPortrait, PortraitDepthUnusable } from '../../../../Shared/Domain/UseCases/PhotoSceneFromPortrait.js';

const ACCEPTED_FILE_TYPES = 'image/*,image/heic,image/heif';
const LONGEST_SHOWN_PHOTO_SIDE = 2700;
const SHOWN_PHOTO_TYPE = 'image/jpeg';
const SHOWN_PHOTO_QUALITY = 0.92;
const STATUS_SECONDS = 6;
const BITMAP_OPTIONS = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };

export class PhotoHasNoDepthMap extends Error {
  constructor(fileName) {
    super(`${fileName} has no depth map`);
    this.name = 'PhotoHasNoDepthMap';
    this.fileName = fileName;
  }
}

export class PhotoNotDecoded extends Error {
  constructor(imageName, cause) {
    super(`the browser could not decode the ${imageName}: ${cause.name}: ${cause.message}`);
    this.name = 'PhotoNotDecoded';
    this.imageName = imageName;
  }
}

export class PhotoSceneLoader {
  #engine;
  #logger;
  #fileInput;
  #status;
  #statusTimer = null;

  constructor({ engine, logger }) {
    this.#engine = engine;
    this.#logger = logger;
  }

  mount(parent) {
    const loadButton = document.createElement('button');
    loadButton.type = 'button';
    loadButton.className = 'photo-scene-button';
    loadButton.textContent = 'Load photo';
    this.#fileInput = document.createElement('input');
    this.#fileInput.type = 'file';
    this.#fileInput.accept = ACCEPTED_FILE_TYPES;
    this.#fileInput.hidden = true;
    this.#status = document.createElement('div');
    this.#status.className = 'photo-scene-status';
    this.#status.hidden = true;
    parent.append(loadButton, this.#fileInput, this.#status);
    loadButton.addEventListener('click', () => this.#fileInput.click());
    this.#fileInput.addEventListener('change', () => this.#fileChosen(this.#fileInput.files?.[0]));
  }

  async #fileChosen(file) {
    this.#fileInput.value = '';
    if (file === undefined) {
      this.#logger.info('photo not loaded: no file chosen');
      return;
    }
    this.#showStatus('Reading the depth of the photo…', { staysUntilReplaced: true });
    let photoScene;
    try {
      photoScene = await this.#photoScene(file);
    } catch (error) {
      if (!isExpectedRefusal(error)) throw error;
      this.#logger.info(`photo ${file.name} not loaded: ${error.message}`);
      this.#showStatus(refusalMessage(error));
      return;
    }
    const isShown = await this.#engine.photoSceneChosen(photoScene);
    this.#showStatus(isShown ? 'Photo loaded. It stays until the page reloads.' : 'The photo could not be shown. The scene stays.');
  }

  async #photoScene(file) {
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const report = photoFileReport(fileBytes);
    const depthMap = report.depthMaps[0];
    if (depthMap === undefined) throw new PhotoHasNoDepthMap(file.name);
    const encoding = depthEncoding(depthMap.describingXmp);
    const photoBitmap = await decodedBitmap(file, 'photo');
    const depthBitmap = await decodedBitmap(new Blob([auxiliaryImageFile(fileBytes, depthMap.itemId)], { type: 'image/heic' }), 'depth map');
    const photoScene = photoSceneFromPortrait({
      photo: await shownPhoto(photoBitmap),
      photoWidth: photoBitmap.width,
      photoHeight: photoBitmap.height,
      exif: report.exif,
      depthCodes: redChannel(depthBitmap),
      depthWidth: depthBitmap.width,
      depthHeight: depthBitmap.height,
      encoding,
    });
    this.#logger.info(`photo ${file.name}: ${photoBitmap.width}×${photoBitmap.height}, depth ${depthBitmap.width}×${depthBitmap.height} as ${encoding.kind}`
      + ` ${encoding.lowestValue}–${encoding.highestValue}, vertical field of view ${photoScene.description.fovYDegrees.toFixed(1)}°`);
    photoBitmap.close();
    depthBitmap.close();
    return photoScene;
  }

  #showStatus(text, { staysUntilReplaced = false } = {}) {
    clearTimeout(this.#statusTimer);
    this.#status.textContent = text;
    this.#status.hidden = false;
    if (!staysUntilReplaced) this.#statusTimer = setTimeout(() => { this.#status.hidden = true; }, STATUS_SECONDS * 1000);
  }
}

function isExpectedRefusal(error) {
  return [PhotoHasNoDepthMap, PhotoNotDecoded, PhotoFileUnreadable, DepthXmpInvalid, PortraitDepthUnusable].some((refusal) => error instanceof refusal);
}

function refusalMessage(error) {
  if (error instanceof PhotoHasNoDepthMap) return 'This photo has no depth map. The scene stays. Take it in Portrait mode on an iPhone.';
  if (error instanceof PhotoNotDecoded) return `This browser cannot open the ${error.imageName}. The scene stays. Try Safari.`;
  return `The depth of this photo cannot be read. The scene stays. (${error.message})`;
}

async function decodedBitmap(blob, imageName) {
  try {
    return await createImageBitmap(blob, BITMAP_OPTIONS);
  } catch (decodeError) {
    throw new PhotoNotDecoded(imageName, decodeError);
  }
}

async function shownPhoto(photoBitmap) {
  const scale = Math.min(1, LONGEST_SHOWN_PHOTO_SIDE / Math.max(photoBitmap.width, photoBitmap.height));
  const canvas = new OffscreenCanvas(Math.round(photoBitmap.width * scale), Math.round(photoBitmap.height * scale));
  canvas.getContext('2d').drawImage(photoBitmap, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: SHOWN_PHOTO_TYPE, quality: SHOWN_PHOTO_QUALITY });
}

function redChannel(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  return Uint8Array.from({ length: bitmap.width * bitmap.height }, (_, index) => pixels[index * 4]);
}
