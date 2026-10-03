import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoSceneFromPortrait, PortraitDepthUnusable } from '../../Domain/UseCases/PhotoSceneFromPortrait.js';
import { DepthEncoding, DEPTH_ENCODING_KINDS } from '../../Domain/Entities/DepthEncoding.js';
import { PhotoExif } from '../../Domain/Entities/PhotoFileReport.js';

const DISPARITY_FROM_ONE_TO_THREE = new DepthEncoding({ kind: DEPTH_ENCODING_KINDS.disparity, lowestCode: 0, highestCode: 255, lowestValue: 1, highestValue: 3 });
const IPHONE_28MM_EXIF = new PhotoExif({
  make: 'Apple', model: 'iPhone 16 Pro', lensModel: null, focalLengthMillimetres: 6.765, focalLength35mmMillimetres: 28,
  orientation: 1, pixelWidth: 5712, pixelHeight: 4284, hasGpsLocation: false,
});

test('photoScene_ofAPortraitShotAt28Millimetres_seesAbout63DegreesVertically', () => {
  const photoScene = sceneOf({ photoWidth: 3213, photoHeight: 5712, exif: IPHONE_28MM_EXIF, depthCodes: [0, 255] });

  assert.ok(Math.abs(photoScene.description.fovYDegrees - 63.4) < 0.2, `vertical field of view ${photoScene.description.fovYDegrees}`);
});

test('photoScene_fromDisparity_placesSurfacesInInverseProportionToIt', () => {
  const photoScene = sceneOf({ photoWidth: 90, photoHeight: 160, exif: null, depthCodes: [255, 0] });

  const [nearestMetres, farthestMetres] = photoScene.depthMetres;
  assert.ok(Math.abs(farthestMetres / nearestMetres - 3) < 1e-4, `nearest ${nearestMetres} m, farthest ${farthestMetres} m`);
});

test('photoScene_whenEveryDisparityIsZero_isRefusedAsUnusable', () => {
  const zeroDisparity = new DepthEncoding({ kind: DEPTH_ENCODING_KINDS.disparity, lowestCode: 0, highestCode: 255, lowestValue: 0, highestValue: 0 });

  assert.throws(() => sceneOf({ photoWidth: 90, photoHeight: 160, exif: null, depthCodes: [0, 0], encoding: zeroDisparity }), PortraitDepthUnusable);
});

function sceneOf({ photoWidth, photoHeight, exif, depthCodes, encoding = DISPARITY_FROM_ONE_TO_THREE }) {
  return photoSceneFromPortrait({
    photo: new Blob(['photo']), photoWidth, photoHeight, exif, depthCodes: Uint8Array.from(depthCodes), depthWidth: depthCodes.length, depthHeight: 1, encoding,
  });
}
