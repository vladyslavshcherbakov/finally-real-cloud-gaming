import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONTENT_TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wgsl': 'text/plain',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
};
const SOFTWARE_WEBGPU_ARGUMENTS = ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan'];
const ENVIRONMENT_PAGE = 'Apps/web/Tests/environment.html';
const START_TIMEOUT_MILLISECONDS = 180_000;

export class BrowserHarness {
  #server;
  #browser;

  constructor(server, browser) {
    this.#server = server;
    this.#browser = browser;
  }

  static async start() {
    const server = createServer(serveRepositoryFile);
    await new Promise((resolve) => server.listen(0, resolve));
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: SOFTWARE_WEBGPU_ARGUMENTS });
    return new BrowserHarness(server, browser);
  }

  async openEnvironment(settings = {}) {
    const page = await this.#browser.newPage({ viewport: { width: 320, height: 200 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()); });
    await page.goto(`http://localhost:${this.#server.address().port}/${ENVIRONMENT_PAGE}`);
    await page.waitForFunction(() => window.environmentModuleLoaded, null, { timeout: START_TIMEOUT_MILLISECONDS });
    await page.evaluate(async (initialSettings) => {
      window.environment = await window.TestEnvironment.create({
        canvas: document.querySelector('canvas'),
        message: document.querySelector('.message'),
        settings: initialSettings,
      });
    }, settings);
    return new EnvironmentPage(page, pageErrors);
  }

  async openModulePage() {
    const page = await this.#browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()); });
    await page.goto(`http://localhost:${this.#server.address().port}/${ENVIRONMENT_PAGE}`);
    await page.waitForFunction(() => window.environmentModuleLoaded, null, { timeout: START_TIMEOUT_MILLISECONDS });
    return { page, pageErrors };
  }

  async stop() {
    await this.#browser.close();
    this.#server.close();
  }
}

export class EnvironmentPage {
  constructor(page, pageErrors) {
    this.page = page;
    this.pageErrors = pageErrors;
  }

  async problems() {
    return [...this.pageErrors, ...(await this.page.evaluate(() => window.environment.problems))];
  }

  async advance(frameCount) {
    await this.page.evaluate((count) => window.environment.advance(count), frameCount);
  }

  async messagesShown() {
    return this.page.evaluate(() => window.environment.messagesShown);
  }

  async advanceSeconds(seconds) {
    await this.page.evaluate((secondsToAdvance) => window.environment.advanceSeconds(secondsToAdvance), seconds);
  }

  async changeSetting(key, value) {
    await this.page.evaluate(([settingKey, settingValue]) => window.environment.changeSetting(settingKey, settingValue), [key, value]);
  }

  async liveGpuMemory() {
    return this.page.evaluate(() => ({ bytes: window.gpuAllocations.liveBytes, objects: window.gpuAllocations.liveObjectCount }));
  }

  async showNextScene() {
    await this.page.evaluate(() => window.environment.showNextScene());
  }

  async dragMouse({ fromX, toX, y, moves, framesPerMove, passes = 1 }) {
    await this.page.mouse.move(fromX, y);
    await this.page.mouse.down();
    for (let pass = 0; pass < passes; pass++) {
      const [startX, endX] = pass % 2 === 0 ? [fromX, toX] : [toX, fromX];
      for (let move = 1; move <= moves; move++) {
        await this.page.mouse.move(startX + ((endX - startX) * move) / moves, y);
        await this.advance(framesPerMove);
      }
    }
    await this.page.mouse.up();
  }

  async differenceFromPhoto(region) {
    return this.page.evaluate(async (canvasRegion) => {
      const photo = await window.environment.captureView('photo');
      const finalFrame = await window.environment.capture();
      return finalFrame.meanDifference(photo, canvasRegion);
    }, region);
  }

  async viewFingerprints(views) {
    return this.page.evaluate(async (viewNames) => {
      const fingerprints = {};
      for (const view of viewNames) fingerprints[view] = (await window.environment.captureView(view)).fingerprint();
      return fingerprints;
    }, views);
  }

  async close() {
    await this.page.close();
  }
}

async function serveRepositoryFile(request, response) {
  const requestedPath = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(REPOSITORY_ROOT, requestedPath));
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(requestedPath)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
}
