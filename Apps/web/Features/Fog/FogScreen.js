import { pointerKind, UnknownPointerKind } from '../../../../Shared/Domain/UseCases/PointerWind.js';
import { ENGINE_PHASES } from '../../Engine/EnginePhase.js';

const PHASE_MESSAGES = {
  [ENGINE_PHASES.starting]: 'Starting…',
  [ENGINE_PHASES.compilingShaders]: 'Preparing the shaders…',
  [ENGINE_PHASES.generatingNoise]: 'Growing the fog',
  [ENGINE_PHASES.loadingScene]: 'Loading the photo…',
  [ENGINE_PHASES.running]: '',
  [ENGINE_PHASES.sceneUnavailable]: 'The photo could not be loaded. Check the connection and reload the page.',
  [ENGINE_PHASES.deviceLost]: 'The graphics device stopped. Reload the page to continue.',
};

export class FogScreen {
  #canvas;
  #message;
  #engine;
  #pointerWind;
  #logger;
  #reportedUnknownKinds = new Set();

  constructor({ canvas, message, engine, pointerWind, logger }) {
    this.#canvas = canvas;
    this.#message = message;
    this.#engine = engine;
    this.#pointerWind = pointerWind;
    this.#logger = logger;
  }

  connect() {
    const listenerOptions = { passive: false };
    this.#canvas.style.touchAction = 'none';
    this.#canvas.addEventListener('pointerdown', (event) => this.#pointerEvent(event, 'pointerPressed'), listenerOptions);
    this.#canvas.addEventListener('pointermove', (event) => this.#pointerEvent(event, 'pointerMoved'), listenerOptions);
    this.#canvas.addEventListener('pointerup', (event) => this.#pointerEvent(event, 'pointerReleased'), listenerOptions);
    this.#canvas.addEventListener('pointercancel', (event) => this.#pointerEvent(event, 'pointerCancelled'), listenerOptions);
    this.#canvas.addEventListener('pointerleave', (event) => this.#pointerEvent(event, 'pointerLeft'), listenerOptions);
    this.#engine.subscribeToPhase((phase) => this.#phaseChanged(phase));
  }

  #pointerEvent(event, factName) {
    event.preventDefault();
    let kind;
    try {
      kind = pointerKind(event.pointerType);
    } catch (error) {
      if (!(error instanceof UnknownPointerKind)) throw error;
      if (this.#reportedUnknownKinds.has(error.rawKind)) return;
      this.#reportedUnknownKinds.add(error.rawKind);
      this.#logger.warn(`pointer ignored: ${error.message}`);
      return;
    }
    if (factName === 'pointerPressed') this.#canvas.setPointerCapture?.(event.pointerId);
    const bounds = this.#canvas.getBoundingClientRect();
    this.#pointerWind[factName]({
      id: event.pointerId,
      kind,
      u: (event.clientX - bounds.left) / bounds.width,
      v: (event.clientY - bounds.top) / bounds.height,
      timeSeconds: event.timeStamp / 1000,
    });
  }

  #phaseChanged(phase, progress) {
    const progressText = progress === null ? '' : ` ${Math.round(progress * 100)}%`;
    this.#message.textContent = PHASE_MESSAGES[phase] + progressText;
    this.#message.hidden = PHASE_MESSAGES[phase] === '';
  }
}
