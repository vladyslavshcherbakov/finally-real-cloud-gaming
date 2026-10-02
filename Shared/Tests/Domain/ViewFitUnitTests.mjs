import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverFit } from '../../Domain/Entities/ViewFit.js';

test('photo_onACanvasWiderThanThePhoto_isCroppedAtTopAndBottom', () => {
  const fit = coverFit({ canvasAspect: 2, photoAspect: 1, photoFovYDegrees: 90 });

  assert.deepEqual([fit.photoScaleU, fit.photoScaleV, fit.photoOffsetU, fit.photoOffsetV], [1, 0.5, 0, 0.25]);
});

test('photo_onACanvasTallerThanThePhoto_isCroppedAtTheSides', () => {
  const fit = coverFit({ canvasAspect: 0.5, photoAspect: 1, photoFovYDegrees: 90 });

  assert.deepEqual([fit.photoScaleU, fit.photoScaleV, fit.photoOffsetU, fit.photoOffsetV], [0.5, 1, 0.25, 0]);
});

test('viewAngle_whenThePhotoIsCroppedAtTopAndBottom_narrowsVerticallyByTheCrop', () => {
  const fit = coverFit({ canvasAspect: 2, photoAspect: 1, photoFovYDegrees: 90 });

  assert.equal(fit.tanHalfFovY.toFixed(6), '0.500000');
  assert.equal(fit.tanHalfFovX.toFixed(6), '1.000000');
});

test('canvasCentre_onAnyCrop_isThePhotoCentre', () => {
  const fit = coverFit({ canvasAspect: 0.6, photoAspect: 1.5, photoFovYDegrees: 50 });

  assert.deepEqual([fit.photoU(0.5), fit.photoV(0.5)], [0.5, 0.5]);
});
