import { test } from 'node:test';
import assert from 'node:assert/strict';
import { depthEncoding, DepthXmpInvalid } from '../../Storage/Mappers/DepthXmpMapper.js';

const APPLE_DISPARITY_XMP = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description xmlns:apdi="http://ns.apple.com/pixeldatainfo/1.0/">
<apdi:AuxiliaryImageType>disparity</apdi:AuxiliaryImageType><apdi:IntMinValue>0</apdi:IntMinValue><apdi:FloatMinValue>0.976562</apdi:FloatMinValue>
<apdi:FloatMaxValue>2.806641</apdi:FloatMaxValue><apdi:IntMaxValue>255</apdi:IntMaxValue></rdf:Description></rdf:RDF></x:xmpmeta>`;

test('depthXmp_ofAnIphonePortrait_readsDisparityAndItsRange', () => {
  const encoding = depthEncoding(APPLE_DISPARITY_XMP);

  assert.deepEqual([encoding.kind, encoding.valueOfCode(0), encoding.valueOfCode(255)], ['disparity', 0.976562, 2.806641]);
});

test('depthXmp_whenTheImageTypeIsMissing_failsNamingThatField', () => {
  const withoutType = APPLE_DISPARITY_XMP.replace(/<apdi:AuxiliaryImageType>.*<\/apdi:AuxiliaryImageType>/, '');

  assert.throws(() => depthEncoding(withoutType), (error) => error instanceof DepthXmpInvalid && error.field === 'AuxiliaryImageType');
});
