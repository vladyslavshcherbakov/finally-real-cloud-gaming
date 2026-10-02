import { createAppGraph } from './AppGraph.js';
import { CanvasFrameTarget } from '../Engine/Gpu/CanvasFrameTarget.js';
import { FogScreen } from '../Features/Fog/FogScreen.js';
import { AnimationFrameLoop } from '../Features/Fog/AnimationFrameLoop.js';
import { SettingsPanel } from '../Features/Settings/SettingsPanel.js';
import { Logger } from '../../../Shared/Logging/Logger.js';

const FRESH_FILES_WORKER_URL = new URL('../freshFilesWorker.js', import.meta.url);
const WEBGPU_HINT = 'This game needs a browser with WebGPU: Chrome or Edge 113+, Safari 26+, or Firefox 141+ on Windows.';

async function start() {
  const logger = new Logger('app');
  const canvas = document.querySelector('canvas');
  const message = document.querySelector('.message');
  registerFreshFilesWorker(logger.forArea('files'));
  try {
    const graph = await createAppGraph({
      createFrameTarget: (gpuDevice) => new CanvasFrameTarget(gpuDevice, canvas),
      storage: {
        getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
      },
      random: Math.random,
      logger,
    });
    new FogScreen({ canvas, message, engine: graph.engine, pointerWind: graph.pointerWind, logger: logger.forArea('screen') }).connect();
    new SettingsPanel({ settings: graph.settings, engine: graph.engine }).mount(document.body);
    await graph.engine.start();
    new AnimationFrameLoop((frameTime) => graph.engine.frameRequested(frameTime)).start();
  } catch (error) {
    logger.error(`start failed: ${error.name}: ${error.message}`);
    message.textContent = `${error.message}. ${WEBGPU_HINT}`;
    message.hidden = false;
  }
}

async function registerFreshFilesWorker(logger) {
  const workerScope = new URL('./', FRESH_FILES_WORKER_URL);
  if (!('serviceWorker' in navigator)) {
    logger.info('files may come from the browser cache: this browser has no service workers');
    return;
  }
  if (!window.location.href.startsWith(workerScope.href)) {
    logger.info(`files may come from the browser cache: the page is outside ${workerScope.pathname}`);
    return;
  }
  try {
    await navigator.serviceWorker.register(FRESH_FILES_WORKER_URL, { scope: workerScope.href, updateViaCache: 'none' });
    logger.info('fresh files worker registered: every file is checked with the server');
  } catch (registrationError) {
    logger.warn(`files may come from the browser cache: the worker was not registered: ${registrationError.message}`);
  }
}

start();
