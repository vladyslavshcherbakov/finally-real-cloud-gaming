import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserHarness } from '../BrowserHarness.mjs';
import { SOLVER_IDS } from '../../Engine/Solvers.js';

let harness;

before(async () => {
  harness = await BrowserHarness.start();
});

after(async () => {
  await harness.stop();
});

test('gpuMemory_afterSwitchingEverySolverTheQualityAndTheScene_returnsToWhereItStarted', async () => {
  const environment = await harness.openEnvironment({ solver: SOLVER_IDS[0], quality: 'low' });
  await environment.advance(2);
  const memoryAtStart = await environment.liveGpuMemory();

  for (const solverId of [...SOLVER_IDS, SOLVER_IDS[0]]) {
    await environment.changeSetting('solver', solverId);
    await environment.advance(1);
  }
  await environment.changeSetting('quality', 'medium');
  await environment.advance(1);
  await environment.changeSetting('quality', 'low');
  await environment.showNextScene();
  await environment.advance(2);

  assert.deepEqual(await environment.liveGpuMemory(), memoryAtStart);
  assert.deepEqual(await environment.problems(), []);
  await environment.close();
});

test('nextScene_whenRequestedTwiceAtOnce_loadsOneScene', async () => {
  const environment = await harness.openEnvironment();
  await environment.advance(1);
  const memoryAtStart = await environment.liveGpuMemory();

  await environment.page.evaluate(() => Promise.all([window.environment.showNextScene(), window.environment.showNextScene()]));
  await environment.advance(1);

  assert.deepEqual(await environment.liveGpuMemory(), memoryAtStart);
  await environment.close();
});
