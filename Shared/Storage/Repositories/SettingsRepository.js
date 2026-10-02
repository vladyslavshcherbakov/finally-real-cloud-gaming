import { defaultSettings } from '../../Domain/Entities/Settings.js';
import { settingsFromStoredText, storedTextFromSettings } from '../Mappers/SettingsMapper.js';

export class SettingsStorageUnavailable extends Error {
  constructor(operation, cause) {
    super(`settings storage unavailable for ${operation}: ${cause.message}`);
    this.name = 'SettingsStorageUnavailable';
  }
}

export const SETTINGS_STORAGE_KEY = 'fog-settings-v4';

export class SettingsRepository {
  #storage;
  #solverIds;

  constructor(storage, solverIds) {
    this.#storage = storage;
    this.#solverIds = solverIds;
  }

  load() {
    let storedText;
    try {
      storedText = this.#storage.getItem(SETTINGS_STORAGE_KEY);
    } catch (storageError) {
      throw new SettingsStorageUnavailable('load', storageError);
    }
    if (storedText === null) return defaultSettings(this.#solverIds);
    return settingsFromStoredText(storedText, this.#solverIds);
  }

  save(settings) {
    try {
      this.#storage.setItem(SETTINGS_STORAGE_KEY, storedTextFromSettings(settings, this.#solverIds));
    } catch (storageError) {
      throw new SettingsStorageUnavailable('save', storageError);
    }
  }
}
