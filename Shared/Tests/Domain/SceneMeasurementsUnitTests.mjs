import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureScene } from '../../Domain/Entities/SceneMeasurements.js';

const SKY_METRES = 4000;

function sceneOfTwoRows({ topDepthMetres, bottomDepthMetres }) {
  const blue = [0.2, 0.4, 0.8];
  const brown = [0.3, 0.2, 0.1];
  return {
    linearPixels: [blue, blue, blue, blue, brown, brown, brown, brown],
    width: 4,
    height: 2,
    depthMetresAt: (u, v) => (v < 0.5 ? topDepthMetres : bottomDepthMetres),
    skyDepthMetres: SKY_METRES,
  };
}

test('skyColour_whenThePhotoShowsSky_isTheAverageOfTheSkyPixels', () => {
  const measurements = measureScene(sceneOfTwoRows({ topDepthMetres: SKY_METRES, bottomDepthMetres: 10 }));

  assert.deepEqual(measurements.skyColor, [0.2, 0.4, 0.8]);
});

test('skyColour_whenThePhotoShowsNoSky_isTheAverageOfTheTopRows', () => {
  const measurements = measureScene(sceneOfTwoRows({ topDepthMetres: 50, bottomDepthMetres: 10 }));

  assert.deepEqual(measurements.skyColor, [0.2, 0.4, 0.8]);
});

test('fogReach_whenTheFarthestSurfaceIsAt100Metres_is160Metres', () => {
  const measurements = measureScene(sceneOfTwoRows({ topDepthMetres: 100, bottomDepthMetres: 100 }));

  assert.equal(measurements.fogReachMetres, 160);
});

test('fogReach_whenThePhotoIsAllSky_isTheLongestReach', () => {
  const measurements = measureScene(sceneOfTwoRows({ topDepthMetres: SKY_METRES, bottomDepthMetres: SKY_METRES }));

  assert.equal(measurements.fogReachMetres, 800);
});
