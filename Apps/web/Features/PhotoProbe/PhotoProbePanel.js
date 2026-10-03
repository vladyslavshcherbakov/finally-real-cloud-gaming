import { photoFileReport, PhotoFileUnreadable } from '../../../../Shared/Storage/Mappers/PhotoFileMapper.js';
import { photoProbeLines, unreadablePhotoLines } from './PhotoProbeText.js';

const ACCEPTED_FILE_TYPES = 'image/*,image/heic,image/heif';
const COPY_LABEL = 'Copy';
const COPY_RESULT_SECONDS = 2;

export class PhotoProbePanel {
  #logger;
  #fileInput;
  #panel;
  #reportText;
  #copyButton;

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
    this.#copyButton = buttonElement(COPY_LABEL, 'photo-probe-action');
    const closeButton = buttonElement('Close', 'photo-probe-action');
    this.#panel.append(this.#reportText, this.#copyButton, closeButton);
    parent.append(openButton, this.#fileInput, this.#panel);
    openButton.addEventListener('click', () => this.#fileInput.click());
    this.#fileInput.addEventListener('change', () => this.#fileChosen(this.#fileInput.files?.[0]));
    this.#copyButton.addEventListener('click', () => this.#copyButtonTapped());
    closeButton.addEventListener('click', () => { this.#panel.hidden = true; });
  }

  async #fileChosen(file) {
    this.#fileInput.value = '';
    if (file === undefined) {
      this.#logger.info('[PHOTO-PROBE] no file chosen');
      return;
    }
    const lines = await this.#reportLines(file);
    for (const line of lines) this.#logger.info(`[PHOTO-PROBE] ${line}`);
    this.#reportText.textContent = lines.join('\n');
    this.#panel.hidden = false;
  }

  async #reportLines(file) {
    try {
      return photoProbeLines(file, photoFileReport(new Uint8Array(await file.arrayBuffer())));
    } catch (error) {
      if (!(error instanceof PhotoFileUnreadable)) throw error;
      return unreadablePhotoLines(file, error);
    }
  }

  async #copyButtonTapped() {
    const reportText = this.#reportText.textContent;
    let copyResult;
    try {
      await navigator.clipboard.writeText(reportText);
      copyResult = 'Copied';
    } catch (clipboardError) {
      this.#logger.info(`[PHOTO-PROBE] clipboard refused (${clipboardError.message}), copying through a selection`);
      copyResult = copiedThroughSelection(reportText) ? 'Copied' : `Not copied: ${clipboardError.message}`;
    }
    this.#logger.info(`[PHOTO-PROBE] copy: ${copyResult}`);
    this.#copyButton.textContent = copyResult;
    setTimeout(() => { this.#copyButton.textContent = COPY_LABEL; }, COPY_RESULT_SECONDS * 1000);
  }
}

function copiedThroughSelection(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.readOnly = true;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.append(textArea);
  textArea.select();
  textArea.setSelectionRange(0, text.length);
  const isCopied = document.execCommand('copy');
  textArea.remove();
  return isCopied;
}

function buttonElement(label, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}
