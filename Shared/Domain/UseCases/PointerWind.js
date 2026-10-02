import { WindSource } from '../Entities/WindSource.js';
import { Vortex } from '../Entities/Vortex.js';
import { CircleGesture, TURNS_TO_START_A_VORTEX } from '../Entities/CircleGesture.js';

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
const DRAG_UV_THAT_ENDS_A_TAP = 0.05;
const HOVERING_SHARE_OF_STRENGTH = 1 / 3;
const VORTEX_FADE_SECONDS = 4;
const VORTEX_SECONDS_TO_FULL_GROWTH = 4;
const VORTEX_LEAN_SECONDS_OF_DRIFT = 1.5;
const LONGEST_VORTEX_LEAN_IN_RADII = 2;
const POINTER_WIND_SHARE_WHILE_SPINNING_A_VORTEX = 0.25;
const PRESSED_VORTEX_SHARE_OF_STRENGTH = 1.5;

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
const GONE = Object.freeze({ name: 'gone' });
const SPINNING = Object.freeze({ name: 'spinning' });

export function pointerKind(rawKind) {
  if (!(rawKind in POINTER_KINDS)) throw new UnknownPointerKind(rawKind);
  return POINTER_KINDS[rawKind];
}

export class PointerWind {
  #pointersById = new Map();
  #vortexStates = [];

  pointerPressed({ id, kind, u, v, timeSeconds }) {
    const pointer = this.#trackedPointer({ id, kind, u, v, timeSeconds });
    pointer.phase = nextPhase(pointer, { name: 'pressed' });
  }

  pointerMoved({ id, kind, u, v, timeSeconds }) {
    const pointer = this.#trackedPointer({ id, kind, u, v, timeSeconds });
    const movedSeconds = Math.max(timeSeconds - pointer.lastMoveSeconds, SHORTEST_MOVE_SECONDS);
    const smoothing = Math.min(1, movedSeconds * VELOCITY_SMOOTHING_PER_SECOND);
    pointer.phase = nextPhase(pointer, { name: 'moved', distanceUv: Math.hypot(u - pointer.u, v - pointer.v) });
    pointer.velocityU += ((u - pointer.u) / movedSeconds - pointer.velocityU) * smoothing;
    pointer.velocityV += ((v - pointer.v) / movedSeconds - pointer.velocityV) * smoothing;
    pointer.u = u;
    pointer.v = v;
    pointer.lastMoveSeconds = timeSeconds;
    pointer.circleGesture.pointerMoved({ u, v, timeSeconds });
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
    if (pointer && pointer.phase.name !== 'pressed') this.#pointersById.delete(id);
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
        strength: strength * strengthShareInPhase(pointer.phase) * this.#ownWindShare(id),
        outwardStrength: outwardStrengthInPhase(pointer.phase, nowSeconds),
      }));
    }
    return sources;
  }

  vortices({ nowSeconds, strength }) {
    this.#releaseVorticesNoLongerCircled(nowSeconds);
    this.#spinVorticesOfCirclingPointers(nowSeconds);
    this.#vortexStates = this.#vortexStates.filter((vortexState) => fadeShare(vortexState, nowSeconds) > 0);
    return this.#vortexStates.map((vortexState) => new Vortex({
      u: vortexState.u,
      v: vortexState.v,
      radius: vortexState.radius,
      spin: vortexState.spin,
      strength: strength * vortexState.strengthShare * fadeShare(vortexState, nowSeconds),
      leanU: vortexState.leanU,
      leanV: vortexState.leanV,
      growth: vortexState.growth,
    }));
  }

  #ownWindShare(pointerId) {
    const isSpinningAVortex = this.#vortexStates.some((state) => state.phase === SPINNING && state.pointerId === pointerId);
    return isSpinningAVortex ? POINTER_WIND_SHARE_WHILE_SPINNING_A_VORTEX : 1;
  }

  #releaseVorticesNoLongerCircled(nowSeconds) {
    for (const vortexState of this.#vortexStates.filter((state) => state.phase === SPINNING)) {
      const pointer = this.#pointersById.get(vortexState.pointerId);
      const isStillCircled = pointer !== undefined && blowsInPhase(pointer) && pointer.circleGesture.circle(nowSeconds) !== null;
      if (!isStillCircled) vortexState.phase = Object.freeze({ name: 'fading', releasedAtSeconds: nowSeconds });
    }
  }

  #spinVorticesOfCirclingPointers(nowSeconds) {
    for (const [id, pointer] of this.#pointersById) {
      if (!blowsInPhase(pointer)) continue;
      const drawnCircle = pointer.circleGesture.circle(nowSeconds);
      if (drawnCircle === null) continue;
      let vortexState = this.#vortexStates.find((state) => state.phase === SPINNING && state.pointerId === id);
      if (vortexState === undefined) {
        if (drawnCircle.turns < TURNS_TO_START_A_VORTEX) continue;
        vortexState = { pointerId: id, phase: SPINNING, startedAtSeconds: nowSeconds };
        this.#vortexStates.push(vortexState);
      }
      Object.assign(vortexState, {
        u: drawnCircle.u,
        v: drawnCircle.v,
        radius: drawnCircle.radius,
        spin: drawnCircle.spin,
        strengthShare: vortexStrengthShareInPhase(pointer.phase),
        growth: Math.min(1, (nowSeconds - vortexState.startedAtSeconds) / VORTEX_SECONDS_TO_FULL_GROWTH),
        ...vortexLean(drawnCircle),
      });
    }
  }

  #trackedPointer({ id, kind, u, v, timeSeconds }) {
    let pointer = this.#pointersById.get(id);
    if (!pointer) {
      pointer = {
        kind, u, v, velocityU: 0, velocityV: 0, phase: HOVERING, lastMoveSeconds: timeSeconds, circleGesture: new CircleGesture(),
      };
      this.#pointersById.set(id, pointer);
    }
    return pointer;
  }
}

function nextPhase(pointer, event) {
  switch (event.name) {
    case 'pressed':
      return Object.freeze({ name: 'pressed', travelledUv: 0 });
    case 'moved':
      if (pointer.phase.name !== 'pressed') return pointer.phase;
      return Object.freeze({ name: 'pressed', travelledUv: pointer.phase.travelledUv + event.distanceUv });
    case 'released':
      return Object.freeze({ name: 'puffing', releasedAtSeconds: event.timeSeconds, tapShare: tapShareOf(pointer.phase) });
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

function strengthShareInPhase(phase) {
  switch (phase.name) {
    case 'hovering':
      return HOVERING_SHARE_OF_STRENGTH;
    case 'pressed':
    case 'puffing':
      return 1;
    case 'gone':
      return 0;
  }
}

function vortexLean(drawnCircle) {
  const leanU = drawnCircle.driftU * VORTEX_LEAN_SECONDS_OF_DRIFT;
  const leanV = drawnCircle.driftV * VORTEX_LEAN_SECONDS_OF_DRIFT;
  const shortening = Math.min(1, (LONGEST_VORTEX_LEAN_IN_RADII * drawnCircle.radius) / Math.max(Math.hypot(leanU, leanV), 1e-9));
  return { leanU: leanU * shortening, leanV: leanV * shortening };
}

function vortexStrengthShareInPhase(phase) {
  switch (phase.name) {
    case 'hovering':
      return 1;
    case 'pressed':
    case 'puffing':
      return PRESSED_VORTEX_SHARE_OF_STRENGTH;
    case 'gone':
      return 0;
  }
}

function fadeShare(vortexState, nowSeconds) {
  switch (vortexState.phase.name) {
    case 'spinning':
      return 1;
    case 'fading':
      return Math.max(0, 1 - (nowSeconds - vortexState.phase.releasedAtSeconds) / VORTEX_FADE_SECONDS);
  }
}

function outwardStrengthInPhase(phase, nowSeconds) {
  switch (phase.name) {
    case 'pressed':
      return tapShareOf(phase);
    case 'puffing':
      return phase.tapShare * Math.min(1, Math.max(0, 1 - (nowSeconds - phase.releasedAtSeconds) / PUFF_AFTER_RELEASE_SECONDS));
    case 'hovering':
    case 'gone':
      return 0;
  }
}

function tapShareOf(phase) {
  switch (phase.name) {
    case 'pressed':
      return Math.max(0, 1 - phase.travelledUv / DRAG_UV_THAT_ENDS_A_TAP);
    case 'hovering':
    case 'puffing':
    case 'gone':
      return 0;
  }
}

function clampedPointerSpeed(uvPerSecond) {
  return Math.max(-FASTEST_POINTER_UV_PER_SECOND, Math.min(FASTEST_POINTER_UV_PER_SECOND, uvPerSecond));
}
