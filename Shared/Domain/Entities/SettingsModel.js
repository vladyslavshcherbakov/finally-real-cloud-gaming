import { validatedSetting } from './Settings.js';

export class SettingsModel {
  #values;
  #solverIds;
  #listeners = new Set();

  constructor(initialValues, solverIds) {
    this.#values = { ...initialValues };
    this.#solverIds = solverIds;
  }

  get values() {
    return this.#values;
  }

  get solverIds() {
    return this.#solverIds;
  }

  change(key, value) {
    const acceptedValue = validatedSetting(key, value, this.#solverIds);
    if (this.#values[key] === acceptedValue) return;
    this.#values = { ...this.#values, [key]: acceptedValue };
    for (const listener of this.#listeners) listener(key, acceptedValue, this.#values);
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
