import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserHarness } from '../BrowserHarness.mjs';
import { SOLVER_IDS } from '../../Engine/Solvers.js';
import { DEBUG_VIEWS } from '../../../../Shared/Domain/Entities/Settings.js';

const WHOLE_FRAME = { left: 0, right: 1, top: 0, bottom: 1 };
const SWEEP = { fromX: 60, toX: 260, y: 120, moves: 20, framesPerMove: 1, passes: 3 };

let harness;

before(async () => {
  harness = await BrowserHarness.start();
});

after(async () => {
  await harness.stop();
});

test('fog_whenTheGameOpens_hidesMostOfThePhoto', async () => {
  const environment = await harness.openEnvironment();
  await environment.advance(3);

  const difference = await environment.differenceFromPhoto(WHOLE_FRAME);

  assert.ok(difference > 0.15, `mean difference from the photo: ${difference}`);
  assert.deepEqual(await environment.problems(), []);
  await environment.close();
});

test('fog_whenLeftAlone_doesNotThinByItself', async () => {
  const environment = await harness.openEnvironment({ fogThickness: 2 });
  await environment.advance(3);
  const differenceAtStart = await environment.differenceFromPhoto(WHOLE_FRAME);

  await environment.advanceSeconds(2);

  const differenceAfterWaiting = await environment.differenceFromPhoto(WHOLE_FRAME);
  assert.ok(differenceAfterWaiting > differenceAtStart * 0.97,
    `mean difference from the photo: ${differenceAtStart} at the start, ${differenceAfterWaiting} two seconds later`);
  assert.deepEqual(await environment.problems(), []);
  await environment.close();
});

test('loadingMessage_whileTheFogGrows_showsItsProgressAsAPercentage', async () => {
  const environment = await harness.openEnvironment();

  const messagesShown = await environment.messagesShown();

  assert.ok(messagesShown.some((text) => /^Growing the fog \d+%$/.test(text)), JSON.stringify(messagesShown));
  assert.ok(!messagesShown.some((text) => text.includes('NaN')), JSON.stringify(messagesShown));
  await environment.close();
});

test('everySolver_whenTheWindBlows_runsWithoutGpuErrors', async () => {
  const environment = await harness.openEnvironment();
  const problemsBySolver = {};

  for (const solverId of SOLVER_IDS) {
    await environment.changeSetting('solver', solverId);
    await environment.sweepMouse({ ...SWEEP, moves: 4, framesPerMove: 1, passes: 1 });
    problemsBySolver[solverId] = await environment.problems();
  }

  assert.deepEqual(problemsBySolver, Object.fromEntries(SOLVER_IDS.map((solverId) => [solverId, []])));
  await environment.close();
});

test('everyDebugView_showsAPictureOfItsOwn', async () => {
  const environment = await harness.openEnvironment();
  await environment.sweepMouse({ ...SWEEP, moves: 4, framesPerMove: 1, passes: 1 });

  const fingerprints = await environment.viewFingerprints(DEBUG_VIEWS);

  assert.equal(new Set(Object.values(fingerprints)).size, DEBUG_VIEWS.length, JSON.stringify(fingerprints));
  await environment.close();
});
