import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserHarness } from '../BrowserHarness.mjs';

const SWEEP_BAND = { left: 0.3, right: 0.7, top: 0.55, bottom: 0.65 };
const SWEEP = { fromX: 60, toX: 260, y: 120, moves: 20, framesPerMove: 1, passes: 3 };

let harness;

before(async () => {
  harness = await BrowserHarness.start();
});

after(async () => {
  await harness.stop();
});

test('fog_whenTheWindSweepsAcross_showsMoreOfThePhotoAlongThePath', async () => {
  const environment = await harness.openEnvironment({ returnRate: 0, fogThickness: 2 });
  await environment.advance(3);
  const differenceBeforeTheSweep = await environment.differenceFromPhoto(SWEEP_BAND);

  await environment.sweepMouse(SWEEP);

  const differenceAfterTheSweep = await environment.differenceFromPhoto(SWEEP_BAND);
  assert.ok(differenceAfterTheSweep < differenceBeforeTheSweep * 0.97,
    `difference along the path: before ${differenceBeforeTheSweep}, after ${differenceAfterTheSweep}`);
  await environment.close();
});

test('fog_afterTheWindStops_staysOffTheClearedPath', async () => {
  const environment = await harness.openEnvironment({ turbulence: 0, damping: 2, diffusion: 0, fogThickness: 2 });
  await environment.advance(3);
  await environment.sweepMouse(SWEEP);
  await environment.page.mouse.move(-1, -1);
  const differenceRightAfterTheSweep = await environment.differenceFromPhoto(SWEEP_BAND);

  await environment.advanceSeconds(2);

  const differenceAfterWaiting = await environment.differenceFromPhoto(SWEEP_BAND);
  assert.ok(differenceAfterWaiting < differenceRightAfterTheSweep * 1.03,
    `difference along the path: right after the sweep ${differenceRightAfterTheSweep}, two seconds later ${differenceAfterWaiting}`);
  await environment.close();
});

test('fog_withAReturnSpeed_closesTheClearedPathAfterTheWindStops', async () => {
  const environment = await harness.openEnvironment({ returnRate: 0.5, fogThickness: 2 });
  await environment.advance(3);
  await environment.sweepMouse(SWEEP);
  await environment.page.mouse.move(-1, -1);
  const differenceRightAfterTheSweep = await environment.differenceFromPhoto(SWEEP_BAND);

  await environment.advanceSeconds(2);

  const differenceAfterWaiting = await environment.differenceFromPhoto(SWEEP_BAND);
  assert.ok(differenceAfterWaiting > differenceRightAfterTheSweep * 1.03,
    `difference along the path: right after the sweep ${differenceRightAfterTheSweep}, two seconds later ${differenceAfterWaiting}`);
  await environment.close();
});

