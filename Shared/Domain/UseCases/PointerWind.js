import { WindSource } from '../Entities/WindSource.js';

export const POINTER_KINDS = {
  mouse: { blowsWhileHovering: true, staysAfterRelease: true },
  pen: { blowsWhileHovering: true, staysAfterRelease: true },
  touch: { blowsWhileHovering: false, staysAfterRelease: false },
};

export const FASTEST_POINTER_UV_PER_SECOND = 6;
const VELOCITY_SMOOTHING_PER_SECOND = 20;
const VELOCITY_DECAY_PER_SECOND = 12;
const STILL_AFTER_SECONDS = 0.04;
const SHORTEST_MOVE_SECONDS = 1 / 240;
const PUFF_AFTER_RELEASE_SECONDS = 0.5;

export class UnknownPointerKind extends Error {
  constructor(rawKind) {
    super(`unknown pointer kind ${JSON.stringify(rawKind)}`);
    this.name = 'UnknownPointerKind';
    this.rawKind = rawKind;
  }
}

export class UnknownPointerEvent extends Error {
  constructor(eventName) {
    super(`unknown pointer event ${JSON.stringify(eventName)}`);
    this.name = 'UnknownPointerEvent';
    this.eventName = eventName;
  }
}

const HOVERING = Object.freeze({ name: 'hovering' });
const PRESSED = Object.freeze({ name: 'pressed' });
const GONE = Object.freeze({ name: 'gone' });

export function pointerKind(rawKind) {
  if (!(rawKind in POINTER_KINDS)) throw new UnknownPointerKind(rawKind);
  return POINTER_KINDS[rawKind];
}

export class PointerWind {
  #pointersById = new Map();

  pointerPressed({ id, kind, u, v, timeSeconds }) {
    const pointer = this.#trackedPointer({ id, kind, u, v, timeSeconds });
    pointer.phase = nextPhase(pointer, { name: 'pressed' });
  }

  pointerMoved({ id, kind, u, v, timeSeconds }) {
    const pointer = this.#trackedPointer({ id, kind, u, v, timeSeconds });
    const movedSeconds = Math.max(timeSeconds - pointer.lastMoveSeconds, SHORTEST_MOVE_SECONDS);
    const smoothing = Math.min(1, movedSeconds * VELOCITY_SMOOTHING_PER_SECOND);
    pointer.velocityU += ((u - pointer.u) / movedSeconds - pointer.velocityU) * smoothing;
    pointer.velocityV += ((v - pointer.v) / movedSeconds - pointer.velocityV) * smoothing;
    pointer.u = u;
    pointer.v = v;
    pointer.lastMoveSeconds = timeSeconds;
  }

  pointerReleased({ id, timeSeconds }) {
    const pointer = this.#pointersById.get(id);
    if (!pointer) return;
    pointer.phase = nextPhase(pointer, { name: 'released', timeSeconds });
  }

  pointerCancelled({ id }) {
    this.#pointersById.delete(id);
  }

  pointerLeft({ id }) {
    const pointer = this.#pointersById.get(id);
    if (pointer && pointer.phase !== PRESSED) this.#pointersById.delete(id);
  }

  windSources({ nowSeconds, realSeconds, strength, radius }) {
    const sources = [];
    for (const [id, pointer] of this.#pointersById) {
      if (nowSeconds - pointer.lastMoveSeconds > STILL_AFTER_SECONDS) {
        const decay = Math.exp(-realSeconds * VELOCITY_DECAY_PER_SECOND);
        pointer.velocityU *= decay;
        pointer.velocityV *= decay;
      }
      pointer.phase = nextPhase(pointer, { name: 'clockTicked', nowSeconds });
      if (pointer.phase === GONE) {
        this.#pointersById.delete(id);
        continue;
      }
      if (!blowsInPhase(pointer)) continue;
      sources.push(new WindSource({
        u: pointer.u,
        v: pointer.v,
        velocityU: clampedPointerSpeed(pointer.velocityU),
        velocityV: clampedPointerSpeed(pointer.velocityV),
        radius,
        strength,
        outwardStrength: outwardStrengthInPhase(pointer.phase, nowSeconds),
      }));
    }
    return sources;
  }

  #trackedPointer({ id, kind, u, v, timeSeconds }) {
    let pointer = this.#pointersById.get(id);
    if (!pointer) {
      pointer = { kind, u, v, velocityU: 0, velocityV: 0, phase: HOVERING, lastMoveSeconds: timeSeconds };
      this.#pointersById.set(id, pointer);
    }
    return pointer;
  }
}

function nextPhase(pointer, event) {
  switch (event.name) {
    case 'pressed':
      return PRESSED;
    case 'released':
      return Object.freeze({ name: 'puffing', releasedAtSeconds: event.timeSeconds });
    case 'clockTicked':
      if (pointer.phase.name !== 'puffing' || event.nowSeconds - pointer.phase.releasedAtSeconds < PUFF_AFTER_RELEASE_SECONDS) return pointer.phase;
      return pointer.kind.staysAfterRelease ? HOVERING : GONE;
    default:
      throw new UnknownPointerEvent(event.name);
  }
}

function blowsInPhase(pointer) {
  return pointer.phase !== HOVERING || pointer.kind.blowsWhileHovering;
}

function outwardStrengthInPhase(phase, nowSeconds) {
  if (phase === PRESSED) return 1;
  if (phase.name !== 'puffing') return 0;
  return Math.min(1, Math.max(0, 1 - (nowSeconds - phase.releasedAtSeconds) / PUFF_AFTER_RELEASE_SECONDS));
}

function clampedPointerSpeed(uvPerSecond) {
  return Math.max(-FASTEST_POINTER_UV_PER_SECOND, Math.min(FASTEST_POINTER_UV_PER_SECOND, uvPerSecond));
}
