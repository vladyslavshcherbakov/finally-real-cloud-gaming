import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PointerWind, pointerKind, UnknownPointerKind, POINTER_KINDS } from '../../Domain/UseCases/PointerWind.js';
import { TURNS_TO_START_A_VORTEX } from '../../Domain/Entities/CircleGesture.js';

const CIRCLE = { centreU: 0.4, centreV: 0.6, radius: 0.1, secondsPerTurn: 0.8, movesPerTurn: 48 };

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

test('wind_whenAFingerStopsAfterADrag_doesNotBlowBackward', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerPressed({ id: 7, kind: POINTER_KINDS.touch, u: 0.2, v: 0.5, timeSeconds: 0 });
  for (let move = 1; move <= 10; move++) pointerWind.pointerMoved({ id: 7, kind: POINTER_KINDS.touch, u: 0.2 + move * 0.04, v: 0.5, timeSeconds: move * 0.02 });

  const [stoppedSource] = sourcesAt(pointerWind, 1);
  pointerWind.pointerReleased({ id: 7, timeSeconds: 1 });

  const [releasedSource] = sourcesAt(pointerWind, 1);
  assert.deepEqual([stoppedSource.outwardStrength, releasedSource.outwardStrength], [0, 0]);
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

test('vortex_whenAPointerCirclesQuicklyEnoughTimes_spinsAtTheCentreOfTheCircle', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerPressed({ id: 7, kind: POINTER_KINDS.touch, u: CIRCLE.centreU + CIRCLE.radius, v: CIRCLE.centreV, timeSeconds: 0 });

  const endSeconds = circle(pointerWind, { id: 7, kind: POINTER_KINDS.touch, turns: TURNS_TO_START_A_VORTEX + 0.5, direction: 1 });

  const vortices = pointerWind.vortices({ nowSeconds: endSeconds, strength: 1 });
  assert.equal(vortices.length, 1);
  assert.ok(Math.abs(vortices[0].u - CIRCLE.centreU) < 0.02 && Math.abs(vortices[0].v - CIRCLE.centreV) < 0.02,
    `vortex centre ${vortices[0].u}, ${vortices[0].v}`);
});

test('vortex_whenAPointerCirclesOneTurnTooFew_doesNotStart', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerPressed({ id: 7, kind: POINTER_KINDS.touch, u: CIRCLE.centreU + CIRCLE.radius, v: CIRCLE.centreV, timeSeconds: 0 });

  const endSeconds = circle(pointerWind, { id: 7, kind: POINTER_KINDS.touch, turns: TURNS_TO_START_A_VORTEX - 1, direction: 1 });

  assert.deepEqual(pointerWind.vortices({ nowSeconds: endSeconds, strength: 1 }), []);
});

test('vortex_whenAFingerSwipesBackAndForth_doesNotStart', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerPressed({ id: 7, kind: POINTER_KINDS.touch, u: 0.3, v: 0.5, timeSeconds: 0 });

  let timeSeconds = 0;
  for (let swipe = 0; swipe < 4 * TURNS_TO_START_A_VORTEX; swipe++) {
    for (let move = 1; move <= 10; move++) {
      timeSeconds += 0.02;
      const shareOfTheSwipe = swipe % 2 === 0 ? move / 10 : 1 - move / 10;
      pointerWind.pointerMoved({ id: 7, kind: POINTER_KINDS.touch, u: 0.3 + 0.4 * shareOfTheSwipe, v: 0.5, timeSeconds });
    }
  }

  assert.deepEqual(pointerWind.vortices({ nowSeconds: timeSeconds, strength: 1 }), []);
});

test('vortex_spin_followsTheDirectionOfTheCircle', () => {
  const spins = [1, -1].map((direction) => {
    const pointerWind = new PointerWind();
    pointerWind.pointerPressed({ id: 7, kind: POINTER_KINDS.touch, u: CIRCLE.centreU + CIRCLE.radius, v: CIRCLE.centreV, timeSeconds: 0 });
    const endSeconds = circle(pointerWind, { id: 7, kind: POINTER_KINDS.touch, turns: TURNS_TO_START_A_VORTEX + 0.5, direction });
    return pointerWind.vortices({ nowSeconds: endSeconds, strength: 1 })[0].spin;
  });

  assert.ok(spins[0] !== 0 && spins[0] === -spins[1], `spins ${spins}`);
});

test('vortex_whenThePointerStopsCircling_fadesOutAndEnds', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerPressed({ id: 7, kind: POINTER_KINDS.touch, u: CIRCLE.centreU + CIRCLE.radius, v: CIRCLE.centreV, timeSeconds: 0 });
  const endSeconds = circle(pointerWind, { id: 7, kind: POINTER_KINDS.touch, turns: TURNS_TO_START_A_VORTEX + 0.5, direction: 1 });
  const [spinningVortex] = pointerWind.vortices({ nowSeconds: endSeconds, strength: 1 });

  pointerWind.pointerReleased({ id: 7, timeSeconds: endSeconds });

  const [fadingVortex] = vorticesAfterFrames(pointerWind, { fromSeconds: endSeconds, seconds: 1.5 });
  assert.ok(fadingVortex.strength < spinningVortex.strength, `strength while spinning ${spinningVortex.strength}, after it ${fadingVortex.strength}`);
  assert.deepEqual(pointerWind.vortices({ nowSeconds: endSeconds + 10, strength: 1 }), []);
});

test('vortex_whenAMouseCirclesWithoutAButton_spinsWeakerThanWithTheButtonPressed', () => {
  const strengths = [false, true].map((isPressed) => {
    const pointerWind = new PointerWind();
    if (isPressed) pointerWind.pointerPressed({ id: 1, kind: POINTER_KINDS.mouse, u: CIRCLE.centreU + CIRCLE.radius, v: CIRCLE.centreV, timeSeconds: 0 });
    const endSeconds = circle(pointerWind, { id: 1, kind: POINTER_KINDS.mouse, turns: TURNS_TO_START_A_VORTEX + 0.5, direction: 1 });
    return pointerWind.vortices({ nowSeconds: endSeconds, strength: 1 })[0].strength;
  });

  assert.ok(strengths[0] < strengths[1], `strength without a button ${strengths[0]}, with it ${strengths[1]}`);
});

test('vortex_whenTheCirclesDriftSideways_leansTheWayTheyDrift', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerPressed({ id: 7, kind: POINTER_KINDS.touch, u: CIRCLE.centreU + CIRCLE.radius, v: CIRCLE.centreV, timeSeconds: 0 });

  const endSeconds = circle(pointerWind, { id: 7, kind: POINTER_KINDS.touch, turns: TURNS_TO_START_A_VORTEX + 0.5, direction: 1, driftUPerSecond: 0.05 });

  const [vortex] = pointerWind.vortices({ nowSeconds: endSeconds, strength: 1 });
  assert.ok(vortex.leanU > Math.abs(vortex.leanV), `lean ${vortex.leanU}, ${vortex.leanV}`);
});

test('vortex_whenTheCirclesStayInPlace_standsStraightIntoTheScene', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerPressed({ id: 7, kind: POINTER_KINDS.touch, u: CIRCLE.centreU + CIRCLE.radius, v: CIRCLE.centreV, timeSeconds: 0 });

  const endSeconds = circle(pointerWind, { id: 7, kind: POINTER_KINDS.touch, turns: TURNS_TO_START_A_VORTEX + 0.5, direction: 1 });

  const [vortex] = pointerWind.vortices({ nowSeconds: endSeconds, strength: 1 });
  assert.ok(Math.hypot(vortex.leanU, vortex.leanV) < 0.1 * vortex.radius, `lean ${vortex.leanU}, ${vortex.leanV} for radius ${vortex.radius}`);
});

test('wind_whilePointerSpinsAVortex_blowsWeakerItselfThanBeforeTheVortex', () => {
  const pointerWind = new PointerWind();
  pointerWind.pointerPressed({ id: 7, kind: POINTER_KINDS.touch, u: CIRCLE.centreU + CIRCLE.radius, v: CIRCLE.centreV, timeSeconds: 0 });
  const [sourceBeforeTheVortex] = sourcesAt(pointerWind, 0);

  const endSeconds = circle(pointerWind, { id: 7, kind: POINTER_KINDS.touch, turns: TURNS_TO_START_A_VORTEX + 0.5, direction: 1 });
  pointerWind.vortices({ nowSeconds: endSeconds, strength: 1 });

  const [sourceWhileSpinning] = sourcesAt(pointerWind, endSeconds);
  assert.ok(sourceWhileSpinning.strength < sourceBeforeTheVortex.strength,
    `pointer wind before the vortex ${sourceBeforeTheVortex.strength}, while spinning it ${sourceWhileSpinning.strength}`);
});

test('vortex_whenAMouseCirclesUnevenlyInTinySteps_stillStarts', () => {
  const pointerWind = new PointerWind();
  const movesPerTurn = 400;
  const turnCount = TURNS_TO_START_A_VORTEX + 0.5;
  let timeSeconds = 0;
  for (let move = 1; move <= turnCount * movesPerTurn; move++) {
    timeSeconds = (move / movesPerTurn) * CIRCLE.secondsPerTurn;
    const angle = (move / movesPerTurn) * 2 * Math.PI;
    const wobble = 1 + 0.15 * Math.sin(angle * 3) + 0.01 * Math.sin(move * 2.3);
    pointerWind.pointerMoved({
      id: 1, kind: POINTER_KINDS.mouse, u: CIRCLE.centreU + CIRCLE.radius * wobble * Math.cos(angle), v: CIRCLE.centreV + CIRCLE.radius * wobble * Math.sin(angle), timeSeconds,
    });
  }

  assert.equal(pointerWind.vortices({ nowSeconds: timeSeconds, strength: 1 }).length, 1);
});

test('vortex_whenSpunLonger_growsFurther', () => {
  const growths = [0.5, 3].map((extraTurns) => {
    const pointerWind = new PointerWind();
    pointerWind.pointerPressed({ id: 7, kind: POINTER_KINDS.touch, u: CIRCLE.centreU + CIRCLE.radius, v: CIRCLE.centreV, timeSeconds: 0 });
    let vortices = [];
    let timeSeconds = 0;
    const moveCount = Math.round((TURNS_TO_START_A_VORTEX + extraTurns) * CIRCLE.movesPerTurn);
    for (let move = 1; move <= moveCount; move++) {
      timeSeconds = (move / CIRCLE.movesPerTurn) * CIRCLE.secondsPerTurn;
      const angle = (move / CIRCLE.movesPerTurn) * 2 * Math.PI;
      pointerWind.pointerMoved({ id: 7, kind: POINTER_KINDS.touch, u: CIRCLE.centreU + CIRCLE.radius * Math.cos(angle), v: CIRCLE.centreV + CIRCLE.radius * Math.sin(angle), timeSeconds });
      vortices = pointerWind.vortices({ nowSeconds: timeSeconds, strength: 1 });
    }
    return vortices[0].growth;
  });

  assert.ok(growths[0] < growths[1], `growth after a short spin ${growths[0]}, after a long one ${growths[1]}`);
});

test('pointerKind_whenTheBrowserReportsAnUnknownKind_failsNamingIt', () => {
  assert.throws(() => pointerKind('stylus'), (error) => error instanceof UnknownPointerKind && error.rawKind === 'stylus');
});

function circle(pointerWind, { id, kind, turns, direction, driftUPerSecond = 0 }) {
  const moveCount = Math.round(turns * CIRCLE.movesPerTurn);
  let timeSeconds = 0;
  for (let move = 1; move <= moveCount; move++) {
    timeSeconds = (move / CIRCLE.movesPerTurn) * CIRCLE.secondsPerTurn;
    const angle = direction * (move / CIRCLE.movesPerTurn) * 2 * Math.PI;
    pointerWind.pointerMoved({
      id, kind, u: CIRCLE.centreU + driftUPerSecond * timeSeconds + CIRCLE.radius * Math.cos(angle), v: CIRCLE.centreV + CIRCLE.radius * Math.sin(angle), timeSeconds,
    });
  }
  return timeSeconds;
}

function vorticesAfterFrames(pointerWind, { fromSeconds, seconds }) {
  let vortices = [];
  for (let frame = 1; frame <= seconds * 60; frame++) vortices = pointerWind.vortices({ nowSeconds: fromSeconds + frame / 60, strength: 1 });
  return vortices;
}
