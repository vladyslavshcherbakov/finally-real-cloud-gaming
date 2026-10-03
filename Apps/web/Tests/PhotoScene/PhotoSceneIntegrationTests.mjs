import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserHarness } from '../BrowserHarness.mjs';

let harness;

before(async () => {
  harness = await BrowserHarness.start();
});

after(async () => {
  await harness.stop();
});

test('photoScene_whenChosen_showsItsPhotoUnderTheFog', async () => {
  const environment = await harness.openEnvironment();
  await environment.advance(1);
  const defaultPhoto = (await environment.viewFingerprints(['photo'])).photo;

  const isShown = await environment.choosePhotoScene();

  await environment.advance(1);
  const shownPhoto = (await environment.viewFingerprints(['photo'])).photo;
  assert.deepEqual([isShown, shownPhoto !== defaultPhoto], [true, true]);
  assert.deepEqual(await environment.problems(), []);
  await environment.close();
});

test('nextScene_afterAPhotoSceneWasChosen_showsTheDefaultSceneAgain', async () => {
  const environment = await harness.openEnvironment();
  await environment.advance(1);
  const defaultPhoto = (await environment.viewFingerprints(['photo'])).photo;
  await environment.choosePhotoScene();
  await environment.advance(1);

  await environment.showNextScene();

  await environment.advance(1);
  assert.equal((await environment.viewFingerprints(['photo'])).photo, defaultPhoto);
  await environment.close();
});
