import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SettingsModel } from '../../Domain/Entities/SettingsModel.js';
import { defaultSettings, SettingRefused } from '../../Domain/Entities/Settings.js';

const solverIds = ['curl', 'flip'];

test('setting_whenChangedInsideItsRange_reachesEverySubscriber', () => {
  const settings = new SettingsModel(defaultSettings(solverIds), solverIds);
  const changesSeen = [];
  settings.subscribe((key, value) => changesSeen.push([key, value]));
  settings.subscribe((key, value) => changesSeen.push([key, value]));

  settings.change('fogThickness', 12);

  assert.deepEqual(changesSeen, [['fogThickness', 12], ['fogThickness', 12]]);
});

test('setting_whenOutsideItsRange_isRefusedAndKeepsTheOldValue', () => {
  const settings = new SettingsModel(defaultSettings(solverIds), solverIds);
  const thicknessBeforeTheRefusal = settings.values.fogThickness;

  assert.throws(() => settings.change('fogThickness', 99), SettingRefused);
  assert.equal(settings.values.fogThickness, thicknessBeforeTheRefusal);
});

test('solverSetting_whenTheSolverDoesNotExist_isRefused', () => {
  const settings = new SettingsModel(defaultSettings(solverIds), solverIds);

  assert.throws(() => settings.change('solver', 'navier'), SettingRefused);
});
