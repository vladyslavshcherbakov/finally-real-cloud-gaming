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
const OUTWARD_BLOW_RAMP_SECONDS = 1;

export class UnknownPointerKind extends Error {
  constructor(rawKind) {
    super(`unknown pointer kind ${JSON.stringify(rawKind)}`);
    this.name = 'UnknownPointerKind';
    this.rawKind = rawKind;
  }
}

export function pointerKind(rawKind) {
  if (!(rawKind in POINTER_KINDS)) throw new UnknownPointerKind(rawKind);
  return POINTER_KINDS[rawKind];
}

export class PointerWind {
  #pointersById = new Map();

  pointerPressed({ id, kind, u, v, timeSeconds }) {
    const pointer = this.#trackedPointer({ id, kind, u, v, timeSeconds });
    pointer.isPressed = true;
    pointer.pressedAtSeconds = timeSeconds;
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

  pointerReleased({ id }) {
    const pointer = this.#pointersById.get(id);
    if (!pointer) return;
    if (pointer.kind.staysAfterRelease) pointer.isPressed = false;
    else this.#pointersById.delete(id);
  }

  pointerCancelled({ id }) {
    this.#pointersById.delete(id);
  }

  pointerLeft({ id }) {
    const pointer = this.#pointersById.get(id);
    if (pointer && !pointer.isPressed) this.#pointersById.delete(id);
  }

  windSources({ nowSeconds, realSeconds, strength, radius }) {
    const sources = [];
    for (const pointer of this.#pointersById.values()) {
      if (nowSeconds - pointer.lastMoveSeconds > STILL_AFTER_SECONDS) {
        const decay = Math.exp(-realSeconds * VELOCITY_DECAY_PER_SECOND);
        pointer.velocityU *= decay;
        pointer.velocityV *= decay;
      }
      if (!pointer.isPressed && !pointer.kind.blowsWhileHovering) continue;
      sources.push(new WindSource({
        u: pointer.u,
        v: pointer.v,
        velocityU: clampedPointerSpeed(pointer.velocityU),
        velocityV: clampedPointerSpeed(pointer.velocityV),
        radius,
        strength,
        outwardStrength: pointer.isPressed ? outwardStrengthAfterHolding(nowSeconds - pointer.pressedAtSeconds) : 0,
      }));
    }
    return sources;
  }

  #trackedPointer({ id, kind, u, v, timeSeconds }) {
    let pointer = this.#pointersById.get(id);
    if (!pointer) {
      pointer = { kind, u, v, velocityU: 0, velocityV: 0, isPressed: false, pressedAtSeconds: null, lastMoveSeconds: timeSeconds };
      this.#pointersById.set(id, pointer);
    }
    return pointer;
  }
}

function outwardStrengthAfterHolding(heldSeconds) {
  const shareOfRamp = Math.min(1, Math.max(0, heldSeconds / OUTWARD_BLOW_RAMP_SECONDS));
  return shareOfRamp * shareOfRamp;
}

function clampedPointerSpeed(uvPerSecond) {
  return Math.max(-FASTEST_POINTER_UV_PER_SECOND, Math.min(FASTEST_POINTER_UV_PER_SECOND, uvPerSecond));
}
