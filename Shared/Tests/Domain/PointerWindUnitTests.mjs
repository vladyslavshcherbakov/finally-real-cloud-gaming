import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PointerWind, pointerKind, UnknownPointerKind, POINTER_KINDS } from '../../Domain/UseCases/PointerWind.js';

function sourcesAt(pointerWind, nowSeconds) {
  return pointerWind.windSources({ nowSeconds, realSeconds: 1 / 60, strength: 1, radius: 0.1 });
}

test('wind_whenAMouseMovesWithoutAButton_blowsAlongTheMove', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerMoved({ id: 1, kind: POINTER_KINDS.mouse, u: 0.5, v: 0.5, timeSeconds: 0 });

  pointerWind.pointerMoved({ id: 1, kind: POINTER_KINDS.mouse, u: 0.75, v: 0.5, timeSeconds: 0.25 });

  const [source] = sourcesAt(pointerWind, 0.25);
  assert.deepEqual([source.u, source.velocityU, source.velocityV, source.outwardStrength], [0.75, 1, 0, 0]);
});

test('wind_whenAMouseOnlyHovers_blowsWeakerThanWithTheButtonPressed', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerMoved({ id: 1, kind: POINTER_KINDS.mouse, u: 0.5, v: 0.5, timeSeconds: 0 });
  const [hoveringSource] = sourcesAt(pointerWind, 0);

  pointerWind.pointerPressed({ id: 1, kind: POINTER_KINDS.mouse, u: 0.5, v: 0.5, timeSeconds: 0 });

  const [pressedSource] = sourcesAt(pointerWind, 0);
  assert.ok(hoveringSource.strength < pressedSource.strength,
    `strength while hovering ${hoveringSource.strength}, with the button pressed ${pressedSource.strength}`);
});

test('wind_whenAFingerIsHeld_blowsOutwardAtFullStrengthAtOnce', () => {
  const pointerWind = new PointerWind();

  pointerWind.pointerPressed({ id: 7, kind: POINTER_KINDS.touch, u: 0.2, v: 0.3, timeSeconds: 10 });

  const strengths = [10, 10.5, 11, 12].map((nowSeconds) => sourcesAt(pointerWind, nowSeconds)[0].outwardStrength);
  assert.deepEqual(strengths, [1, 1, 1, 1]);
});

test('wind_whenTheFingerIsLifted_puffsOutForHalfASecondAndStops', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerPressed({ id: 7, kind: POINTER_KINDS.touch, u: 0.2, v: 0.3, timeSeconds: 0 });

  pointerWind.pointerReleased({ id: 7, timeSeconds: 0 });

  const strengths = [0, 0.25].map((nowSeconds) => sourcesAt(pointerWind, nowSeconds)[0].outwardStrength);
  assert.deepEqual([...strengths, sourcesAt(pointerWind, 1).length], [1, 0.5, 0]);
});

test('wind_whenTheSystemCancelsATouch_stops', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerPressed({ id: 7, kind: POINTER_KINDS.touch, u: 0.2, v: 0.3, timeSeconds: 0 });

  pointerWind.pointerCancelled({ id: 7 });

  assert.deepEqual(sourcesAt(pointerWind, 0), []);
});

test('wind_whenTheMouseButtonIsReleased_keepsBlowingOnlyAlongMoves', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerPressed({ id: 1, kind: POINTER_KINDS.mouse, u: 0.5, v: 0.5, timeSeconds: 0 });

  pointerWind.pointerReleased({ id: 1 });

  const [source] = sourcesAt(pointerWind, 1);
  assert.equal(source.outwardStrength, 0);
});

test('wind_whenTheMouseStopsForASecond_fadesOut', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerMoved({ id: 1, kind: POINTER_KINDS.mouse, u: 0.5, v: 0.5, timeSeconds: 0 });
  pointerWind.pointerMoved({ id: 1, kind: POINTER_KINDS.mouse, u: 0.6, v: 0.5, timeSeconds: 0.1 });

  for (let frame = 1; frame <= 60; frame++) sourcesAt(pointerWind, 0.1 + frame / 60);

  const [source] = sourcesAt(pointerWind, 1.2);
  assert.ok(Math.abs(source.velocityU) < 0.001, `velocity after a still second: ${source.velocityU}`);
});

test('pointerKind_whenTheBrowserReportsAnUnknownKind_failsNamingIt', () => {
  assert.throws(() => pointerKind('stylus'), (error) => error instanceof UnknownPointerKind && error.rawKind === 'stylus');
});
