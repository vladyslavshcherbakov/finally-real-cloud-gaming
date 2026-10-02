export const TURNS_TO_START_A_VORTEX = 4;

const FULL_TURN_RADIANS = 2 * Math.PI;
const COUNTED_PATH_SECONDS = 6;
const LAST_TURN_SECONDS = 1;
const TURNS_IN_THE_LAST_SECOND_WHILE_CIRCLING = 0.5;
const SHORTEST_COUNTED_MOVE_UV = 0.008;
const SHORTEST_MOVE_SECONDS = 1 / 240;
const SHARPEST_TURN_PER_MOVE_RADIANS = Math.PI / 2;
const SMALLEST_CIRCLE_RADIUS = 0.03;
const LARGEST_CIRCLE_RADIUS = 0.3;
const RADIUS_PER_MEAN_VERTICAL_DISTANCE = Math.PI / 2;

export class DrawnCircle {
  constructor({ u, v, radius, spin, turns, driftU, driftV }) {
    this.u = u;
    this.v = v;
    this.radius = radius;
    this.spin = spin;
    this.turns = turns;
    this.driftU = driftU;
    this.driftV = driftV;
  }
}

export class CircleGesture {
  #path = [];
  #lastPoint = null;
  #lastHeading = null;

  pointerMoved({ u, v, timeSeconds }) {
    if (this.#lastPoint === null) {
      this.#lastPoint = { u, v };
      return;
    }
    const moveU = u - this.#lastPoint.u;
    const moveV = v - this.#lastPoint.v;
    const moveLength = Math.hypot(moveU, moveV);
    if (moveLength < SHORTEST_COUNTED_MOVE_UV) return;
    const heading = Math.atan2(moveV, moveU);
    const turnRadians = this.#lastHeading === null ? 0 : wrappedAngle(heading - this.#lastHeading);
    const isSharpTurn = Math.abs(turnRadians) > SHARPEST_TURN_PER_MOVE_RADIANS;
    this.#path.push({ timeSeconds, u, v, turnRadians: isSharpTurn ? 0 : turnRadians });
    this.#lastHeading = heading;
    this.#lastPoint = { u, v };
    this.#path = this.#path.filter((step) => timeSeconds - step.timeSeconds <= COUNTED_PATH_SECONDS);
  }

  circle(nowSeconds) {
    const turnsInTheLastSecond = turnsOf(this.#path.filter((step) => nowSeconds - step.timeSeconds <= LAST_TURN_SECONDS));
    if (Math.abs(turnsInTheLastSecond) < TURNS_IN_THE_LAST_SECOND_WHILE_CIRCLING) return null;
    const [lastTurnSteps, turnBeforeSteps] = lastTwoFullTurns(this.#path);
    const lastTurn = turnShape(lastTurnSteps.length > 0 ? lastTurnSteps : this.#path);
    const drift = turnBeforeSteps.length > 0 ? centreDrift(turnShape(turnBeforeSteps), lastTurn) : { u: 0, v: 0 };
    return new DrawnCircle({
      u: lastTurn.u,
      v: lastTurn.v,
      radius: Math.min(LARGEST_CIRCLE_RADIUS, Math.max(SMALLEST_CIRCLE_RADIUS, lastTurn.meanVerticalDistance * RADIUS_PER_MEAN_VERTICAL_DISTANCE)),
      spin: Math.sign(turnsInTheLastSecond),
      turns: Math.abs(turnsOf(this.#path.filter((step) => nowSeconds - step.timeSeconds <= COUNTED_PATH_SECONDS))),
      driftU: drift.u,
      driftV: drift.v,
    });
  }
}

function lastTwoFullTurns(path) {
  const turns = [[], []];
  let turnIndex = 0;
  let turnedRadians = 0;
  for (let i = path.length - 1; i >= 0 && turnIndex < turns.length; i--) {
    turns[turnIndex].push(path[i]);
    turnedRadians += path[i].turnRadians;
    if (Math.abs(turnedRadians) >= FULL_TURN_RADIANS) {
      turnIndex++;
      turnedRadians = 0;
    }
  }
  return turnIndex >= 2 ? turns : [turnIndex >= 1 ? turns[0] : [], []];
}

function turnShape(steps) {
  const u = mean(steps.map((step) => step.u));
  const v = mean(steps.map((step) => step.v));
  return {
    u,
    v,
    timeSeconds: mean(steps.map((step) => step.timeSeconds)),
    meanVerticalDistance: mean(steps.map((step) => Math.abs(step.v - v))),
  };
}

function centreDrift(turnBefore, lastTurn) {
  const secondsBetweenTurns = Math.max(lastTurn.timeSeconds - turnBefore.timeSeconds, SHORTEST_MOVE_SECONDS);
  return { u: (lastTurn.u - turnBefore.u) / secondsBetweenTurns, v: (lastTurn.v - turnBefore.v) / secondsBetweenTurns };
}

function turnsOf(steps) {
  return steps.reduce((radians, step) => radians + step.turnRadians, 0) / FULL_TURN_RADIANS;
}

function wrappedAngle(radians) {
  return Math.atan2(Math.sin(radians), Math.cos(radians));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
