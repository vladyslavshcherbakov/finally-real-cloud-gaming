export const TURNS_TO_START_A_VORTEX = 4;

const FULL_TURN_RADIANS = 2 * Math.PI;
const COUNTED_PATH_SECONDS = 6;
const LAST_TURN_SECONDS = 1;
const TURNS_IN_THE_LAST_SECOND_WHILE_CIRCLING = 0.5;
const SLOWEST_CIRCLING_UV_PER_SECOND = 0.25;
const SHORTEST_COUNTED_MOVE_UV = 0.002;
const SHORTEST_MOVE_SECONDS = 1 / 240;
const SHARPEST_TURN_PER_MOVE_RADIANS = Math.PI / 2;
const SMALLEST_CIRCLE_RADIUS = 0.03;
const LARGEST_CIRCLE_RADIUS = 0.3;
const RADIUS_PER_MEAN_VERTICAL_DISTANCE = Math.PI / 2;

export class DrawnCircle {
  constructor({ u, v, radius, spin, turns }) {
    this.u = u;
    this.v = v;
    this.radius = radius;
    this.spin = spin;
    this.turns = turns;
  }
}

export class CircleGesture {
  #path = [];
  #lastPoint = null;
  #lastHeading = null;

  pointerMoved({ u, v, timeSeconds }) {
    if (this.#lastPoint === null) {
      this.#lastPoint = { u, v, timeSeconds };
      return;
    }
    const moveU = u - this.#lastPoint.u;
    const moveV = v - this.#lastPoint.v;
    const moveLength = Math.hypot(moveU, moveV);
    if (moveLength < SHORTEST_COUNTED_MOVE_UV) return;
    const movedSeconds = Math.max(timeSeconds - this.#lastPoint.timeSeconds, SHORTEST_MOVE_SECONDS);
    const heading = Math.atan2(moveV, moveU);
    const turnRadians = this.#lastHeading === null ? 0 : wrappedAngle(heading - this.#lastHeading);
    const isCircling = moveLength / movedSeconds >= SLOWEST_CIRCLING_UV_PER_SECOND && Math.abs(turnRadians) <= SHARPEST_TURN_PER_MOVE_RADIANS;
    if (isCircling) {
      this.#path.push({ timeSeconds, u, v, turnRadians });
    } else {
      this.#path = [];
    }
    this.#lastHeading = heading;
    this.#lastPoint = { u, v, timeSeconds };
    this.#path = this.#path.filter((step) => timeSeconds - step.timeSeconds <= COUNTED_PATH_SECONDS);
  }

  circle(nowSeconds) {
    const lastTurnSteps = this.#path.filter((step) => nowSeconds - step.timeSeconds <= LAST_TURN_SECONDS);
    const turnsInTheLastSecond = turnsOf(lastTurnSteps);
    if (Math.abs(turnsInTheLastSecond) < TURNS_IN_THE_LAST_SECOND_WHILE_CIRCLING) return null;
    const turns = turnsOf(this.#path.filter((step) => nowSeconds - step.timeSeconds <= COUNTED_PATH_SECONDS));
    const centreU = mean(lastTurnSteps.map((step) => step.u));
    const centreV = mean(lastTurnSteps.map((step) => step.v));
    const meanVerticalDistance = mean(lastTurnSteps.map((step) => Math.abs(step.v - centreV)));
    return new DrawnCircle({
      u: centreU,
      v: centreV,
      radius: Math.min(LARGEST_CIRCLE_RADIUS, Math.max(SMALLEST_CIRCLE_RADIUS, meanVerticalDistance * RADIUS_PER_MEAN_VERTICAL_DISTANCE)),
      spin: Math.sign(turnsInTheLastSecond),
      turns: Math.abs(turns),
    });
  }
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
