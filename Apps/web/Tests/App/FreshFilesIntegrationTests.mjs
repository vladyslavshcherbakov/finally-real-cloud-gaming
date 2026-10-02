import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const GAME_PAGE = 'Apps/web/index.html';
const DEPLOYED_MODULE = 'Shared/Domain/Entities/QualityPreset.js';
const PAGES_CACHE_CONTROL = 'max-age=600';
const WORKER_START_TIMEOUT_MILLISECONDS = 10_000;
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let server;
let browser;
let deployedRevision = 1;

before(async () => {
  server = createServer(serveLikeGitHubPages);
  await new Promise((resolve) => server.listen(0, resolve));
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});

after(async () => {
  await browser.close();
  server.close();
});

test('game_whenOpenedAgainAfterADeploy_loadsTheNewFiles', async () => {
  const page = await browser.newPage();
  await page.goto(urlOf(GAME_PAGE));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: WORKER_START_TIMEOUT_MILLISECONDS });
  deployedRevision = 2;

  await page.goto(urlOf(GAME_PAGE));

  assert.equal(await page.evaluate(async (moduleUrl) => (await import(moduleUrl)).servedRevision, urlOf(DEPLOYED_MODULE)), 2);
  await page.close();
});

function urlOf(repositoryPath) {
  return `http://localhost:${server.address().port}/${repositoryPath}`;
}

async function serveLikeGitHubPages(request, response) {
  const requestedPath = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname)).replace(/^[/\\]+/, '').replace(/^(\.\.[/\\])+/, '');
  let body;
  try {
    body = await readFile(join(REPOSITORY_ROOT, requestedPath));
  } catch {
    response.writeHead(404);
    response.end();
    return;
  }
  if (requestedPath === DEPLOYED_MODULE) body = Buffer.concat([body, Buffer.from(`\nexport const servedRevision = ${deployedRevision};\n`)]);
  const entityTag = `"${createHash('sha1').update(body).digest('hex')}"`;
  const headers = { 'cache-control': PAGES_CACHE_CONTROL, etag: entityTag, 'content-type': CONTENT_TYPES[extname(requestedPath)] ?? 'application/octet-stream' };
  if (request.headers['if-none-match'] === entityTag) {
    response.writeHead(304, headers);
    response.end();
    return;
  }
  response.writeHead(200, headers);
  response.end(body);
}
