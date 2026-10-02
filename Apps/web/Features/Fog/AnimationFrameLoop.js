import { FrameTime } from '../../../../Shared/Domain/Entities/FrameTime.js';

export class AnimationFrameLoop {
  #onFrame;

  constructor(onFrame) {
    this.#onFrame = onFrame;
  }

  start() {
    let previousMilliseconds = performance.now();
    const frame = (nowMilliseconds) => {
      this.#onFrame(new FrameTime((nowMilliseconds - previousMilliseconds) / 1000));
      previousMilliseconds = nowMilliseconds;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
