import { PRESETS_FROM_LOWEST, DEFAULT_PRESET } from './QualityPreset.js';

export const NUMERIC_SETTINGS = [
  { key: 'fogThickness', group: 'Fog', label: 'Thickness', defaultValue: 8, min: 1, max: 30, step: 0.5 },
  { key: 'baseSmog', group: 'Fog', label: 'Base smog', defaultValue: 1.0, min: 0, max: 1.5, step: 0.01 },
  { key: 'clumps', group: 'Fog', label: 'Clumps', defaultValue: 0.9, min: 0, max: 1.5, step: 0.01 },
  { key: 'heightFalloff', group: 'Fog', label: 'Height falloff (m)', defaultValue: 90, min: 2, max: 120, step: 1 },
  { key: 'returnRate', group: 'Fog', label: 'Return speed', defaultValue: 0, min: 0, max: 0.5, step: 0.005 },
  { key: 'diffusion', group: 'Fog', label: 'Creep in', defaultValue: 0.08, min: 0, max: 2, step: 0.01 },
  { key: 'windStrength', group: 'Wind', label: 'Strength', defaultValue: 1, min: 0, max: 4, step: 0.05 },
  { key: 'windRadius', group: 'Wind', label: 'Radius', defaultValue: 0.15, min: 0.02, max: 0.3, step: 0.005 },
  { key: 'cleanAirRate', group: 'Wind', label: 'Clean air', defaultValue: 25, min: 0, max: 60, step: 0.1 },
  { key: 'turbulence', group: 'Wind', label: 'Turbulence (m/s)', defaultValue: 0.7, min: 0, max: 3, step: 0.05 },
  { key: 'drift', group: 'Wind', label: 'Drift (m/s)', defaultValue: 0, min: -2, max: 2, step: 0.05 },
  { key: 'vorticity', group: 'Wind', label: 'Vorticity', defaultValue: 1.2, min: 0, max: 6, step: 0.05 },
  { key: 'damping', group: 'Wind', label: 'Damping', defaultValue: 0.25, min: 0, max: 2, step: 0.01 },
  { key: 'detail', group: 'Look', label: 'Detail', defaultValue: 0.85, min: 0, max: 1, step: 0.01 },
  { key: 'detailScale', group: 'Look', label: 'Detail scale (1/m)', defaultValue: 0.15, min: 0.05, max: 1.5, step: 0.01 },
  { key: 'erosion', group: 'Look', label: 'Erosion', defaultValue: 0.6, min: 0, max: 1, step: 0.01 },
  { key: 'detailFlowPeriod', group: 'Look', label: 'Detail flow period (s)', defaultValue: 6, min: 1, max: 20, step: 0.5 },
  { key: 'sun', group: 'Look', label: 'Sun', defaultValue: 0.8, min: 0, max: 8, step: 0.05 },
  { key: 'ambient', group: 'Look', label: 'Ambient', defaultValue: 1.3, min: 0, max: 3, step: 0.05 },
  { key: 'sceneGlow', group: 'Look', label: 'Scene glow', defaultValue: 0.08, min: 0, max: 2, step: 0.01 },
  { key: 'forwardScattering', group: 'Look', label: 'Forward scattering', defaultValue: 0.55, min: 0, max: 0.9, step: 0.01 },
  { key: 'multipleScattering', group: 'Look', label: 'Multiple scattering', defaultValue: 0.5, min: 0, max: 0.9, step: 0.01 },
  { key: 'exposure', group: 'Look', label: 'Exposure', defaultValue: 1, min: 0.2, max: 3, step: 0.01 },
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
