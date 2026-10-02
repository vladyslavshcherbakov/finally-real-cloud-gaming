import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserHarness } from '../BrowserHarness.mjs';
import { SOLVER_IDS } from '../../Engine/Solvers.js';
import { DEBUG_VIEWS } from '../../../../Shared/Domain/Entities/Settings.js';

const WHOLE_FRAME = { left: 0, right: 1, top: 0, bottom: 1 };
const SWEEP_BAND = { left: 0.3, right: 0.7, top: 0.55, bottom: 0.65 };
const SWEEP = { fromX: 60, toX: 260, y: 120, moves: 20, framesPerMove: 2, passes: 3 };

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

test('fog_whenTheWindSweepsAcross_showsMoreOfThePhotoAlongThePath', async () => {
  const environment = await harness.openEnvironment({ returnRate: 0 });
  await environment.advance(3);
  const differenceBeforeTheSweep = await environment.differenceFromPhoto(SWEEP_BAND);

  await environment.sweepMouse(SWEEP);

  const differenceAfterTheSweep = await environment.differenceFromPhoto(SWEEP_BAND);
  assert.ok(differenceAfterTheSweep < differenceBeforeTheSweep * 0.85,
    `difference along the path: before ${differenceBeforeTheSweep}, after ${differenceAfterTheSweep}`);
  await environment.close();
});

test('fog_afterTheWindStops_staysOffTheClearedPath', async () => {
  const environment = await harness.openEnvironment({ turbulence: 0, damping: 2, diffusion: 0 });
  await environment.advance(3);
  await environment.sweepMouse(SWEEP);
  await environment.page.mouse.move(-1, -1);
  const differenceRightAfterTheSweep = await environment.differenceFromPhoto(SWEEP_BAND);

  await environment.advance(240);

  const differenceAfterWaiting = await environment.differenceFromPhoto(SWEEP_BAND);
  assert.ok(differenceAfterWaiting < differenceRightAfterTheSweep * 1.03,
    `difference along the path: right after the sweep ${differenceRightAfterTheSweep}, four seconds later ${differenceAfterWaiting}`);
  await environment.close();
});

test('fog_withAReturnSpeed_closesTheClearedPathAfterTheWindStops', async () => {
  const environment = await harness.openEnvironment({ returnRate: 0.5 });
  await environment.advance(3);
  const differenceBeforeTheSweep = await environment.differenceFromPhoto(SWEEP_BAND);
  await environment.sweepMouse(SWEEP);
  await environment.page.mouse.move(-1, -1);

  await environment.advance(240);

  const differenceAfterWaiting = await environment.differenceFromPhoto(SWEEP_BAND);
  assert.ok(differenceAfterWaiting > differenceBeforeTheSweep * 0.85,
    `difference along the path: before the sweep ${differenceBeforeTheSweep}, four seconds after it ${differenceAfterWaiting}`);
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
