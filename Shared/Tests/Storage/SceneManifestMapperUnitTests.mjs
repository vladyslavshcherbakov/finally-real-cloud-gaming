import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneDescriptions, SceneManifestInvalid } from '../../Storage/Mappers/SceneManifestMapper.js';

function manifestWith(changes) {
  return {
    scenes: [{
      id: 'harbour', photo: 'harbour/photo.webp', depth: 'harbour/depth.png', width: 1200, height: 800,
      fovY: 50, nearM: 0.5, farM: 4000, ground: { normal: [0, 1, 0], offset: 1.5 }, sunDir: [0, 0.5, 0.8], ...changes,
    }],
  };
}

test('sceneManifest_whenEveryFieldIsValid_describesTheScene', () => {
  const [scene] = sceneDescriptions(manifestWith({}));

  assert.deepEqual([scene.id, scene.aspect, scene.groundOffsetMetres], ['harbour', 1.5, 1.5]);
});

test('sceneManifest_whenTheDepthRangeIsInverted_failsNamingTheField', () => {
  assert.throws(() => sceneDescriptions(manifestWith({ farM: 0.1 })),
    (error) => error instanceof SceneManifestInvalid && error.field === 'farM' && error.sceneId === 'harbour');
});

test('sceneManifest_whenTheSunDirectionIsMissing_failsNamingTheField', () => {
  assert.throws(() => sceneDescriptions(manifestWith({ sunDir: undefined })),
    (error) => error instanceof SceneManifestInvalid && error.field === 'sunDir');
});

test('sceneManifest_withoutScenes_fails', () => {
  assert.throws(() => sceneDescriptions({ scenes: [] }), SceneManifestInvalid);
});
