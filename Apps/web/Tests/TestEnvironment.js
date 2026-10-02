import { createAppGraph } from '../App/AppGraph.js';
import { FogScreen } from '../Features/Fog/FogScreen.js';
import { OffscreenFrameTarget } from './OffscreenFrameTarget.js';
import { FrameTime, LONGEST_SIMULATION_STEP_SECONDS } from '../../../Shared/Domain/Entities/FrameTime.js';
import { Logger } from '../../../Shared/Logging/Logger.js';
import { SETTINGS_STORAGE_KEY } from '../../../Shared/Storage/Repositories/SettingsRepository.js';

const FRAME_SECONDS = LONGEST_SIMULATION_STEP_SECONDS;

class SteppedClock {
  #seconds = 0;

  nowSeconds() {
    return this.#seconds;
  }

  advance(seconds) {
    this.#seconds += seconds;
  }
}

class InMemoryStorage {
  #itemsByKey = new Map();

  getItem(key) {
    return this.#itemsByKey.has(key) ? this.#itemsByKey.get(key) : null;
  }

  setItem(key, value) {
    this.#itemsByKey.set(key, value);
  }
}

class RecordingLogSink {
  problems = [];

  debug() {}

  info() {}

  warn(line) {
    this.problems.push(line);
  }

  error(line) {
    this.problems.push(line);
  }
}

export class TestEnvironment {
  #graph;
  #frameTarget;
  #device;
  #clock;

  constructor(graph, frameTarget, device, clock, logSink, messagesShown) {
    this.messagesShown = messagesShown;
    this.#graph = graph;
    this.#clock = clock;
    this.#frameTarget = frameTarget;
    this.#device = device;
    this.logSink = logSink;
  }

  static async create({ canvas, message, settings = {} }) {
    const storage = new InMemoryStorage();
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ quality: 'low', ...settings }));
    const logSink = new RecordingLogSink();
    const logger = new Logger('test', { sink: logSink });
    const clock = new SteppedClock();
    const messagesShown = [];
    new MutationObserver(() => messagesShown.push(message.textContent)).observe(message, { childList: true, characterData: true, subtree: true });
    let frameTarget = null;
    let device = null;
    const graph = await createAppGraph({
      createFrameTarget: (gpuDevice) => {
        device = gpuDevice.device;
        frameTarget = new OffscreenFrameTarget(gpuDevice, canvas.clientWidth, canvas.clientHeight);
        return frameTarget;
      },
      storage,
      random: () => 0,
      clock,
      logger,
    });
    new FogScreen({ canvas, message, engine: graph.engine, pointerWind: graph.pointerWind, clock, logger }).connect();
    await graph.engine.start();
    return new TestEnvironment(graph, frameTarget, device, clock, logSink, messagesShown);
  }

  get problems() {
    return this.logSink.problems;
  }

  async showNextScene() {
    await this.#graph.engine.nextSceneRequested();
  }

  changeSetting(key, value) {
    this.#graph.settings.change(key, value);
  }

  async advanceSeconds(seconds) {
    await this.advance(Math.round(seconds / FRAME_SECONDS));
  }

  async advance(frameCount) {
    for (let frame = 0; frame < frameCount; frame++) {
      this.#clock.advance(FRAME_SECONDS);
      this.#graph.engine.frameRequested(new FrameTime(FRAME_SECONDS));
      await this.#device.queue.onSubmittedWorkDone();
    }
  }

  async capture() {
    return this.#frameTarget.capture();
  }

  async captureView(view) {
    const previousView = this.#graph.settings.values.view;
    this.changeSetting('view', view);
    await this.advance(1);
    const frame = await this.capture();
    this.changeSetting('view', previousView);
    await this.advance(1);
    return frame;
  }
}
