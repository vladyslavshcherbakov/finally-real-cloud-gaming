import { photoFileReport, auxiliaryImageFile, PhotoFileUnreadable } from '../../../../Shared/Storage/Mappers/PhotoFileMapper.js';
import { photoProbeLines, unreadablePhotoLines, decodedDepthLines, undecodedImageLines, depthXmpLines } from './PhotoProbeText.js';

const ACCEPTED_FILE_TYPES = 'image/*,image/heic,image/heif';
const THUMBNAIL_WIDTH_PIXELS = 160;

export class PhotoProbePanel {
  #logger;
  #fileInput;
  #panel;
  #reportText;
  #thumbnails;

  constructor({ logger }) {
    this.#logger = logger;
  }

  mount(parent) {
    const openButton = buttonElement('Photo probe', 'photo-probe-button');
    this.#fileInput = document.createElement('input');
    this.#fileInput.type = 'file';
    this.#fileInput.accept = ACCEPTED_FILE_TYPES;
    this.#fileInput.hidden = true;
    this.#panel = document.createElement('div');
    this.#panel.className = 'photo-probe-panel';
    this.#panel.hidden = true;
    this.#reportText = document.createElement('pre');
    this.#thumbnails = document.createElement('div');
    this.#thumbnails.className = 'photo-probe-thumbnails';
    const closeButton = buttonElement('Close', 'photo-probe-action');
    this.#panel.append(this.#thumbnails, this.#reportText, closeButton);
    parent.append(openButton, this.#fileInput, this.#panel);
    openButton.addEventListener('click', () => this.#fileInput.click());
    this.#fileInput.addEventListener('change', () => this.#fileChosen(this.#fileInput.files?.[0]));
    closeButton.addEventListener('click', () => { this.#panel.hidden = true; });
  }

  async #fileChosen(file) {
    this.#fileInput.value = '';
    if (file === undefined) {
      this.#logger.info('[PHOTO-PROBE] no file chosen');
      return;
    }
    this.#thumbnails.replaceChildren();
    const lines = await this.#reportLines(file);
    for (const line of lines) this.#logger.info(`[PHOTO-PROBE] ${line}`);
    this.#reportText.textContent = lines.join('\n');
    this.#panel.hidden = false;
  }

  async #reportLines(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let report;
    try {
      report = photoFileReport(bytes);
    } catch (error) {
      if (!(error instanceof PhotoFileUnreadable)) throw error;
      return unreadablePhotoLines(file, error);
    }
    const photoLines = await this.#photoThumbnailLines(file);
    const depthLines = report.depthMaps.length === 0 ? [] : await this.#depthMapLines(bytes, report.depthMaps[0]);
    return [...photoProbeLines(file, report), ...photoLines, ...depthLines];
  }

  async #photoThumbnailLines(file) {
    try {
      this.#thumbnails.append(thumbnailCanvas(await createImageBitmap(file)));
      return [];
    } catch (decodeError) {
      return undecodedImageLines('photo', decodeError);
    }
  }

  async #depthMapLines(bytes, depthMap) {
    const xmpLines = depthXmpLines(depthMap.describingXmp);
    let depthBitmap;
    try {
      depthBitmap = await createImageBitmap(new Blob([auxiliaryImageFile(bytes, depthMap.itemId)], { type: 'image/heic' }));
    } catch (decodeError) {
      return [...undecodedImageLines('depth image', decodeError), ...xmpLines];
    }
    this.#thumbnails.append(thumbnailCanvas(depthBitmap));
    return [...decodedDepthLines(depthBitmap.width, depthBitmap.height, grayValueRange(depthBitmap)), ...xmpLines];
  }
}

function thumbnailCanvas(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = THUMBNAIL_WIDTH_PIXELS;
  canvas.height = Math.round((THUMBNAIL_WIDTH_PIXELS * bitmap.height) / bitmap.width);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function grayValueRange(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  let lowest = 255;
  let highest = 0;
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    lowest = Math.min(lowest, pixels[i]);
    highest = Math.max(highest, pixels[i]);
    sum += pixels[i];
  }
  return { lowest, highest, mean: sum / (pixels.length / 4) };
}

function buttonElement(label, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}
