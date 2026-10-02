export const LONGEST_SIMULATION_STEP_SECONDS = 1 / 30;

export class FrameTime {
  constructor(realSeconds) {
    this.realSeconds = realSeconds;
    this.simulationSeconds = Math.min(realSeconds, LONGEST_SIMULATION_STEP_SECONDS);
  }
}
