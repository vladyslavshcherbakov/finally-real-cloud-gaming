import { createAppGraph } from '../App/AppGraph.js';
import { FogScreen } from '../Features/Fog/FogScreen.js';
import { OffscreenFrameTarget } from './OffscreenFrameTarget.js';
import { FrameTime } from '../../../Shared/Domain/Entities/FrameTime.js';
import { Logger } from '../../../Shared/Logging/Logger.js';
import { SETTINGS_STORAGE_KEY } from '../../../Shared/Storage/Repositories/SettingsRepository.js';

const FRAME_SECONDS = 1 / 60;

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

  constructor(graph, frameTarget, device, logSink) {
    this.#graph = graph;
    this.#frameTarget = frameTarget;
    this.#device = device;
    this.logSink = logSink;
  }

  static async create({ canvas, message, settings = {} }) {
    const storage = new InMemoryStorage();
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ quality: 'low', ...settings }));
    const logSink = new RecordingLogSink();
    const logger = new Logger('test', { sink: logSink });
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
      clock: { nowSeconds: () => performance.now() / 1000 },
      logger,
    });
    new FogScreen({ canvas, message, engine: graph.engine, pointerWind: graph.pointerWind, logger }).connect();
    await graph.engine.start();
    return new TestEnvironment(graph, frameTarget, device, logSink);
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

  async advance(frameCount) {
    for (let frame = 0; frame < frameCount; frame++) {
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
