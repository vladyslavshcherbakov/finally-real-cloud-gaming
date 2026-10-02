import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY_PRESETS, PRESETS_FROM_LOWEST, DEFAULT_PRESET, gridSize } from '../../Domain/Entities/QualityPreset.js';

test('qualityPresets_inTheOrderList_areEveryPresetOnce', () => {
  assert.deepEqual([...PRESETS_FROM_LOWEST].sort(), Object.keys(QUALITY_PRESETS).sort());
});

test('grid_onALandscapeCanvas_putsTheLongSideAlongX', () => {
  assert.deepEqual(gridSize('low', 2), [72, 36, 16]);
});

test('grid_onAPortraitCanvas_putsTheLongSideAlongY', () => {
  assert.deepEqual(gridSize('low', 0.5), [36, 72, 16]);
});

test('defaultQuality_isMedium', () => {
  assert.equal(DEFAULT_PRESET, 'medium');
});
