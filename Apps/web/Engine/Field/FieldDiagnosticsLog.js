const READINGS_EVERY_SECOND_AFTER_A_FOG_RESET = 20;
const LATER_READINGS_EVERY_SECONDS = 10;

export class FieldDiagnosticsLog {
  #logger;
  #secondsSinceFogReset = 0;
  #isReadingDue = false;
  #fogAtFirstReading = null;

  constructor(logger) {
    this.#logger = logger;
  }

  get isReadingDue() {
    return this.#isReadingDue;
  }

  fogWasReset() {
    this.#secondsSinceFogReset = 0;
    this.#isReadingDue = false;
    this.#fogAtFirstReading = null;
  }

  advance(simulationSeconds) {
    const previousSeconds = this.#secondsSinceFogReset;
    this.#secondsSinceFogReset += simulationSeconds;
    this.#isReadingDue = isReadingSecond(previousSeconds, this.#secondsSinceFogReset);
  }

  async report(pendingReading, simulationContext) {
    const secondsSinceFogReset = Math.floor(this.#secondsSinceFogReset);
    let reading;
    try {
      reading = await pendingReading;
    } catch (readError) {
      this.#logger.info(`field reading at ${secondsSinceFogReset} s not read: ${readError.message}`);
      return;
    }
    this.#fogAtFirstReading ??= { near: reading.nearFog, far: reading.farFog };
    this.#logger.info(this.#readingLine(reading, secondsSinceFogReset, simulationContext));
    if (reading.probe !== null) this.#logger.info(clearingLine(reading.probe, secondsSinceFogReset, simulationContext.gridSize));
    const nonFiniteCells = reading.brokenVelocityCells + reading.brokenFogCells + reading.brokenPressureCells;
    if (nonFiniteCells > 0) {
      this.#logger.warn(`field at ${secondsSinceFogReset} s holds ${nonFiniteCells} values that are not finite; the projection treats them as still air`);
    }
  }

  #readingLine(reading, secondsSinceFogReset, { solverId, preset, gridSize, framesPerSecond, windSourceCount }) {
    return `field at ${secondsSinceFogReset} s after fog reset: ${solverId} ${preset} ${gridSize.join('×')},`
      + ` ${Math.round(framesPerSecond)} fps, ${windSourceCount} wind sources`
      + ` | fastest air near ${threeSignificantDigits(reading.nearSpeedMax)} far ${threeSignificantDigits(reading.farSpeedMax)} cells/s`
      + ` | fog near ${percentOfFirstReading(reading.nearFog, this.#fogAtFirstReading.near)}`
      + ` far ${percentOfFirstReading(reading.farFog, this.#fogAtFirstReading.far)} of the first reading`
      + ` | cells not finite: velocity at any step ${reading.brokenVelocityCells} fog ${reading.brokenFogCells} pressure ${reading.brokenPressureCells}`
      + ` | largest acceleration ${threeSignificantDigits(reading.accelerationMax)} vorticity ${threeSignificantDigits(reading.vorticityMax)}`
      + ` pressure ${threeSignificantDigits(reading.pressureMax)} divergence ${threeSignificantDigits(reading.divergenceMax)}`;
  }
}

function clearingLine(probe, secondsSinceFogReset, gridSize) {
  const slicesPerBin = gridSize[2] / probe.meanFogByDepthBin.length;
  const binNames = probe.meanFogByDepthBin.map((_, bin) => `slices ${bin * slicesPerBin}-${(bin + 1) * slicesPerBin - 1}`);
  const meanFog = probe.meanFogByDepthBin.map((fog, bin) => `${binNames[bin]} ${fog === null ? 'behind the surface' : fog.toFixed(3)}`);
  const windReach = probe.windReachByDepthBin.map((reach, bin) => `${binNames[bin]} ${reach.toFixed(2)}`);
  return `[CLEARING] at ${secondsSinceFogReset} s, column ${probe.column.join(',')}:`
    + ` wind build-up ${probe.windBuildUp.toFixed(2)}, moved air in front ${probe.movedAirInFront.toFixed(2)}, thick fog speed-up ${probe.clearingSpeedUp.toFixed(2)}`
    + ` | mean fog: ${meanFog.join(', ')}`
    + ` | wind reach: ${windReach.join(', ')}`;
}

function isReadingSecond(previousSeconds, seconds) {
  const second = Math.floor(seconds);
  if (second === Math.floor(previousSeconds)) return false;
  return second <= READINGS_EVERY_SECOND_AFTER_A_FOG_RESET || second % LATER_READINGS_EVERY_SECONDS === 0;
}

function threeSignificantDigits(value) {
  return Number(value.toPrecision(3));
}

function percentOfFirstReading(value, firstValue) {
  return firstValue > 0 ? `${Math.round((100 * value) / firstValue)}%` : `${threeSignificantDigits(value)} (none at first)`;
}
