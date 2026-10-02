const LARGEST_PIXEL_RATIO = 2;

export class CanvasFrameTarget {
  #canvas;
  #context;

  constructor(gpuDevice, canvas) {
    this.#canvas = canvas;
    this.#context = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.#context.configure({ device: gpuDevice.device, format: this.format, alphaMode: 'opaque' });
  }

  get width() {
    return this.#canvas.width;
  }

  get height() {
    return this.#canvas.height;
  }

  resizeToDisplaySize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, LARGEST_PIXEL_RATIO);
    const width = Math.max(1, Math.round(this.#canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.round(this.#canvas.clientHeight * pixelRatio));
    if (width === this.#canvas.width && height === this.#canvas.height) return false;
    this.#canvas.width = width;
    this.#canvas.height = height;
    return true;
  }

  currentView() {
    return this.#context.getCurrentTexture().createView();
  }
}
