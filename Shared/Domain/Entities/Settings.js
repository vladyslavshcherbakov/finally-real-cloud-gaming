import { PRESETS_FROM_LOWEST, DEFAULT_PRESET } from './QualityPreset.js';

export const NUMERIC_SETTINGS = [
  { key: 'fogThickness', defaultValue: 20, min: 1, max: 30 },
  { key: 'baseSmog', defaultValue: 1.0, min: 0, max: 1.5 },
  { key: 'clumps', defaultValue: 0.9, min: 0, max: 1.5 },
  { key: 'heightFalloff', defaultValue: 90, min: 2, max: 120 },
  { key: 'returnRate', defaultValue: 0, min: 0, max: 0.5 },
  { key: 'diffusion', defaultValue: 0.08, min: 0, max: 2 },
  { key: 'windStrength', defaultValue: 1, min: 0, max: 4 },
  { key: 'windRadius', defaultValue: 0.15, min: 0.02, max: 0.3 },
  { key: 'wakeMixing', defaultValue: 0.8, min: 0, max: 10 },
  { key: 'turbulence', defaultValue: 0, min: 0, max: 3 },
  { key: 'drift', defaultValue: 0, min: -2, max: 2 },
  { key: 'vorticity', defaultValue: 1.2, min: 0, max: 6 },
  { key: 'damping', defaultValue: 0.25, min: 0, max: 2 },
  { key: 'detail', defaultValue: 0.85, min: 0, max: 1 },
  { key: 'detailScale', defaultValue: 0.15, min: 0.05, max: 1.5 },
  { key: 'erosion', defaultValue: 0.6, min: 0, max: 1 },
  { key: 'detailFlowPeriod', defaultValue: 6, min: 1, max: 20 },
  { key: 'sun', defaultValue: 0.8, min: 0, max: 8 },
  { key: 'ambient', defaultValue: 1.3, min: 0, max: 3 },
  { key: 'sceneGlow', defaultValue: 0.08, min: 0, max: 2 },
  { key: 'forwardScattering', defaultValue: 0.55, min: 0, max: 0.9 },
  { key: 'multipleScattering', defaultValue: 0.5, min: 0, max: 0.9 },
  { key: 'exposure', defaultValue: 1, min: 0.2, max: 3 },
];

export const DEBUG_VIEWS = ['final', 'photo', 'depth', 'fogDensity', 'velocity', 'solids'];

export const QUALITY_CHOICES = PRESETS_FROM_LOWEST;

export class SettingRefused extends Error {
  constructor(key, value, reason) {
    super(`setting ${key} refused value ${JSON.stringify(value)}: ${reason}`);
    this.name = 'SettingRefused';
    this.key = key;
    this.value = value;
  }
}

export function defaultSettings(solverIds) {
  const numericDefaults = Object.fromEntries(NUMERIC_SETTINGS.map((spec) => [spec.key, spec.defaultValue]));
  return { ...numericDefaults, solver: solverIds[0], quality: DEFAULT_PRESET, view: 'final' };
}

export function choicesFor(key, solverIds) {
  const choicesByKey = { solver: solverIds, quality: QUALITY_CHOICES, view: DEBUG_VIEWS };
  return choicesByKey[key];
}

export function validatedSetting(key, value, solverIds) {
  const numericSpec = NUMERIC_SETTINGS.find((spec) => spec.key === key);
  if (numericSpec) return validatedNumber(numericSpec, value);
  const choices = choicesFor(key, solverIds);
  if (!choices) throw new SettingRefused(key, value, 'unknown setting');
  if (!choices.includes(value)) throw new SettingRefused(key, value, `expected one of ${choices.join(', ')}`);
  return value;
}

function validatedNumber(spec, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new SettingRefused(spec.key, value, 'not a number');
  if (value < spec.min || value > spec.max) {
    throw new SettingRefused(spec.key, value, `outside ${spec.min}..${spec.max}`);
  }
  return value;
}
