import { defaultSettings, validatedSetting, SettingRefused } from '../../Domain/Entities/Settings.js';

export class StoredSettingsCorrupt extends Error {
  constructor(key, detail) {
    super(`stored settings are corrupt at ${key}: ${detail}`);
    this.name = 'StoredSettingsCorrupt';
    this.key = key;
  }
}

export function settingsFromStoredText(storedText, solverIds) {
  let storedValues;
  try {
    storedValues = JSON.parse(storedText);
  } catch (parseError) {
    throw new StoredSettingsCorrupt('(whole value)', parseError.message);
  }
  const settings = defaultSettings(solverIds);
  for (const [key, value] of Object.entries(storedValues)) {
    try {
      settings[key] = validatedSetting(key, value, solverIds);
    } catch (refusal) {
      if (refusal instanceof SettingRefused) throw new StoredSettingsCorrupt(key, refusal.message);
      throw refusal;
    }
  }
  return settings;
}

export function storedTextFromSettings(settings, solverIds) {
  const defaults = defaultSettings(solverIds);
  return JSON.stringify(Object.fromEntries(Object.entries(settings).filter(([key, value]) => value !== defaults[key])));
}
