import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SettingsRepository, SettingsStorageUnavailable, SETTINGS_STORAGE_KEY } from '../../Storage/Repositories/SettingsRepository.js';
import { StoredSettingsCorrupt } from '../../Storage/Mappers/SettingsMapper.js';

const solverIds = ['stable', 'flip'];

class InMemoryStorage {
  #itemsByKey = new Map();

  getItem(key) {
    return this.#itemsByKey.has(key) ? this.#itemsByKey.get(key) : null;
  }

  setItem(key, value) {
    this.#itemsByKey.set(key, value);
  }
}

test('settings_whenNothingIsStored_areTheDefaults', () => {
  const settings = new SettingsRepository(new InMemoryStorage(), solverIds).load();

  assert.deepEqual([settings.fogThickness, settings.solver, settings.quality], [8, 'stable', 'medium']);
});

test('settings_whenSavedAndLoadedAgain_keepTheChangedValues', () => {
  const repository = new SettingsRepository(new InMemoryStorage(), solverIds);
  const changedSettings = { ...repository.load(), fogThickness: 12, solver: 'flip' };

  repository.save(changedSettings);

  assert.deepEqual([repository.load().fogThickness, repository.load().solver], [12, 'flip']);
});

test('storedSettings_whenAValueIsOutsideItsRange_failNamingTheSetting', () => {
  const storage = new InMemoryStorage();
  storage.setItem(SETTINGS_STORAGE_KEY, '{"fogThickness": 99}');

  assert.throws(() => new SettingsRepository(storage, solverIds).load(),
    (error) => error instanceof StoredSettingsCorrupt && error.key === 'fogThickness');
});

test('storedSettings_whenNotJson_failAsCorrupt', () => {
  const storage = new InMemoryStorage();
  storage.setItem(SETTINGS_STORAGE_KEY, '{fogThickness');

  assert.throws(() => new SettingsRepository(storage, solverIds).load(), StoredSettingsCorrupt);
});

test('settings_whenTheBrowserBlocksStorage_failAsUnavailable', () => {
  const blockedStorage = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };

  assert.throws(() => new SettingsRepository(blockedStorage, solverIds).load(), SettingsStorageUnavailable);
});
