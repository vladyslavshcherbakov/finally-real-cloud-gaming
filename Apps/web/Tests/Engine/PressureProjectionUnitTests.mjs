import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserHarness } from '../BrowserHarness.mjs';

const GRID_SIZES = [[72, 44, 16], [104, 28, 24], [104, 56, 24], [13, 7, 5]];
const PROJECTIONS = 60;
const LARGEST_START_SPEED = 20;
const SOLID_SHARE = 0.3;
const SEED = 7;

let harness;

before(async () => {
  harness = await BrowserHarness.start();
});

after(async () => {
  await harness.stop();
});

for (const gridSize of GRID_SIZES) {
  test(`pressureProjection_whenRepeatedOnRandomAirAmongSolidsOnA${gridSize.join('x')}Grid_neverAddsEnergyToTheAir`, async () => {
    const { page, pageErrors } = await harness.openModulePage();

    const air = await page.evaluate(async (benchArguments) => {
      const { projectedAir } = await import('/Apps/web/Tests/Engine/PressureProjectionBench.js');
      return projectedAir(benchArguments);
    }, { gridSize, solidShare: SOLID_SHARE, seed: SEED, projections: PROJECTIONS, largestStartSpeed: LARGEST_START_SPEED });

    assert.equal(air.nonFiniteCells, 0);
    assert.ok(air.energyAfter <= air.energyAtStart,
      `air energy: ${air.energyAtStart} at the start, ${air.energyAfter} after ${PROJECTIONS} projections, ${air.solidCells} solid cells`);
    assert.deepEqual(pageErrors, []);
    await page.close();
  });
}
