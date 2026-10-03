import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoFileReport, auxiliaryImageFile, PhotoFileUnreadable } from '../../Storage/Mappers/PhotoFileMapper.js';

const TIFF_ASCII = 2;
const TIFF_SHORT = 3;
const TIFF_LONG = 4;
const TIFF_RATIONAL = 5;
const PORTRAIT_DEPTH_TYPE = 'urn:com:apple:photo:2018:aux:portraitdepth';
const DEPTH_IMAGE_DATA = new Uint8Array([0x00, 0x00, 0x00, 0x05, 0x26, 0x01, 0xaf, 0x13, 0x80]);
const DEPTH_XMP = '<x:xmpmeta><rdf:Description depthData:Float="16"/></x:xmpmeta>';
const CAMERA_EXIF = [
  [
    { tag: 0x010f, type: TIFF_ASCII, value: 'Apple' },
    { tag: 0x0110, type: TIFF_ASCII, value: 'iPhone 15 Pro' },
    { tag: 0x8769, type: TIFF_LONG, value: { ifdIndex: 1 } },
    { tag: 0x8825, type: TIFF_LONG, value: { ifdIndex: 2 } },
  ],
  [
    { tag: 0x920a, type: TIFF_RATIONAL, value: { numerator: 686, denominator: 100 } },
    { tag: 0xa405, type: TIFF_SHORT, value: 24 },
  ],
  [],
];

test('photoFile_whenAPortraitHeicHoldsADepthImage_reportsTheDepthMapAndItsSize', () => {
  const report = photoFileReport(heicBytes({ auxiliaryType: PORTRAIT_DEPTH_TYPE }));

  assert.deepEqual(report.depthMaps.map((depthMap) => [depthMap.auxiliaryType, depthMap.width, depthMap.height]), [[PORTRAIT_DEPTH_TYPE, 768, 576]]);
});

test('photoFile_whenAHeicHasNoAuxiliaryImage_reportsNoDepthMap', () => {
  const report = photoFileReport(heicBytes({ auxiliaryType: null }));

  assert.deepEqual([report.container, report.depthMaps.length], ['heif', 0]);
});

test('photoFile_whenAHeicHoldsExif_reportsTheCamera', () => {
  const report = photoFileReport(heicBytes({ auxiliaryType: PORTRAIT_DEPTH_TYPE }));

  assert.deepEqual([report.exif.make, report.exif.model, report.exif.focalLength35mmMillimetres], ['Apple', 'iPhone 15 Pro', 24]);
});

test('photoFile_whenAJpegHoldsExif_reportsTheCameraAndTheFocalLength', () => {
  const report = photoFileReport(jpegBytes({ multiPictureCount: null, xmp: null }));

  assert.deepEqual([report.container, report.exif.model, report.exif.focalLengthMillimetres, report.exif.focalLength35mmMillimetres], ['jpeg', 'iPhone 15 Pro', 6.86, 24]);
});

test('photoFile_whenExifHoldsALocation_reportsOnlyThatItIsThere', () => {
  const report = photoFileReport(jpegBytes({ multiPictureCount: null, xmp: null }));

  assert.equal(report.exif.hasGpsLocation, true);
  assert.ok(!Object.keys(report.exif).some((field) => /latitude|longitude/i.test(field)));
});

test('photoFile_whenAJpegHoldsSeveralPicturesAndDepthXmp_reportsThem', () => {
  const report = photoFileReport(jpegBytes({ multiPictureCount: 2, xmp: '<x:xmpmeta><depthData/></x:xmpmeta>' }));

  assert.deepEqual([report.multiPictureImageCount, report.doesXmpMentionDepth], [2, true]);
});

test('photoFile_whenXmpDescribesTheDepthImage_reportsThatXmpWithIt', () => {
  const report = photoFileReport(heicBytes({ auxiliaryType: PORTRAIT_DEPTH_TYPE }));

  assert.equal(report.depthMaps[0].describingXmp, DEPTH_XMP);
});

test('depthImageFile_ofAPortraitHeic_holdsTheDepthImageAsItsOnlyItem', () => {
  const standaloneFile = auxiliaryImageFile(heicBytes({ auxiliaryType: PORTRAIT_DEPTH_TYPE }), 2);

  const metaBoxes = childBoxes(standaloneFile, topBox(standaloneFile, 'meta').contentStart + 4);
  const primaryItemId = (standaloneFile[metaBoxes.pitm.contentStart + 4] << 8) | standaloneFile[metaBoxes.pitm.contentStart + 5];
  const mediaData = topBox(standaloneFile, 'mdat');
  assert.deepEqual([primaryItemId, [...standaloneFile.subarray(mediaData.contentStart, mediaData.end)]], [2, [...DEPTH_IMAGE_DATA]]);
});

test('photoFile_whenABoxRunsPastTheEndOfTheFile_failsNamingWhere', () => {
  const wholeFile = heicBytes({ auxiliaryType: PORTRAIT_DEPTH_TYPE });

  assert.throws(() => photoFileReport(wholeFile.subarray(0, 60)), (error) => error instanceof PhotoFileUnreadable && Number.isInteger(error.offset));
});

function heicBytes({ auxiliaryType }) {
  const exifItem = concat(u32(6), ascii('Exif\0\0'), tiffBytes(CAMERA_EXIF));
  const xmpItem = ascii(DEPTH_XMP);
  const fileType = box('ftyp', ascii('heic'), u32(0), ascii('mif1'), ascii('heic'));
  const metaWithDataAt = (dataOffset) => fullBox('meta', 0, 0,
    fullBox('hdlr', 0, 0, u32(0), ascii('pict'), u32(0), u32(0), u32(0), ascii('\0')),
    fullBox('pitm', 0, 0, u16(1)),
    fullBox('iinf', 0, 0, u16(4), itemInfo(1, 'hvc1'), itemInfo(2, 'hvc1'), itemInfo(3, 'Exif'), itemInfo(4, 'mime')),
    fullBox('iref', 0, 0, ...(auxiliaryType === null ? [] : [box('auxl', u16(2), u16(1), u16(1)), box('cdsc', u16(4), u16(1), u16(2))])),
    box('iprp',
      box('ipco',
        fullBox('ispe', 0, 0, u32(4032), u32(3024)),
        fullBox('ispe', 0, 0, u32(768), u32(576)),
        fullBox('auxC', 0, 0, ascii(`${auxiliaryType ?? 'none'}\0`))),
      fullBox('ipma', 0, 0, u32(2), u16(1), u8(1), u8(1), u16(2), u8(2), u8(2), u8(3))),
    fullBox('iloc', 0, 0, u8(0x44), u8(0x00), u16(3),
      u16(3), u16(0), u16(1), u32(dataOffset), u32(exifItem.length),
      u16(2), u16(0), u16(1), u32(dataOffset + exifItem.length), u32(DEPTH_IMAGE_DATA.length),
      u16(4), u16(0), u16(1), u32(dataOffset + exifItem.length + DEPTH_IMAGE_DATA.length), u32(xmpItem.length)));
  const dataOffset = fileType.length + metaWithDataAt(0).length + 8;
  return concat(fileType, metaWithDataAt(dataOffset), box('mdat', exifItem, DEPTH_IMAGE_DATA, xmpItem));
}

function topBox(bytes, type) {
  return Object.values(childBoxesWithin(bytes, 0, bytes.length)).find((found) => found.type === type);
}

function childBoxes(bytes, start) {
  const parentEnd = topBox(bytes, 'meta').end;
  return childBoxesWithin(bytes, start, parentEnd);
}

function childBoxesWithin(bytes, start, end) {
  const boxesByType = {};
  for (let offset = start; offset + 8 <= end;) {
    const size = (bytes[offset] << 24 >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    boxesByType[type] = { type, contentStart: offset + 8, end: offset + size };
    offset += size;
  }
  return boxesByType;
}

function jpegBytes({ multiPictureCount, xmp }) {
  const segments = [segment(0xe1, ascii('Exif\0\0'), tiffBytes(CAMERA_EXIF))];
  if (multiPictureCount !== null) segments.push(segment(0xe2, ascii('MPF\0'), tiffBytes([[{ tag: 0xb001, type: TIFF_LONG, value: multiPictureCount }]])));
  if (xmp !== null) segments.push(segment(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0'), ascii(xmp)));
  return concat(new Uint8Array([0xff, 0xd8]), ...segments, new Uint8Array([0xff, 0xda, 0x00, 0x02]));
}

function segment(marker, ...payload) {
  const payloadBytes = concat(...payload);
  return concat(new Uint8Array([0xff, marker]), u16(payloadBytes.length + 2), payloadBytes);
}

function itemInfo(itemId, itemType) {
  return fullBox('infe', 2, 0, u16(itemId), u16(0), ascii(itemType), ascii('\0'));
}

function box(type, ...contents) {
  const content = concat(...contents);
  return concat(u32(content.length + 8), ascii(type), content);
}

function fullBox(type, version, flags, ...contents) {
  return box(type, u8(version), u8(flags >> 16), u16(flags & 0xffff), ...contents);
}

function tiffBytes(ifds) {
  const ifdOffsets = [];
  let offset = 8;
  for (const entries of ifds) {
    ifdOffsets.push(offset);
    offset += 2 + entries.length * 12 + 4;
  }
  const dataParts = [];
  let dataOffset = offset;
  const ifdParts = ifds.map((entries) => concat(u16(entries.length), ...entries.map((entry) => {
    const { count, inline, data } = entryValue(entry, ifdOffsets);
    if (data === null) return concat(u16(entry.tag), u16(entry.type), u32(count), inline);
    dataParts.push(data);
    const entryBytes = concat(u16(entry.tag), u16(entry.type), u32(count), u32(dataOffset));
    dataOffset += data.length;
    return entryBytes;
  }), u32(0)));
  return concat(ascii('MM'), u16(42), u32(8), ...ifdParts, ...dataParts);
}

function entryValue(entry, ifdOffsets) {
  switch (entry.type) {
    case TIFF_ASCII: {
      const text = ascii(`${entry.value}\0`);
      return text.length <= 4 ? { count: text.length, inline: concat(text, new Uint8Array(4 - text.length)), data: null } : { count: text.length, inline: null, data: text };
    }
    case TIFF_SHORT:
      return { count: 1, inline: concat(u16(entry.value), u16(0)), data: null };
    case TIFF_LONG:
      return { count: 1, inline: u32(typeof entry.value === 'number' ? entry.value : ifdOffsets[entry.value.ifdIndex]), data: null };
    case TIFF_RATIONAL:
      return { count: 1, inline: null, data: concat(u32(entry.value.numerator), u32(entry.value.denominator)) };
    default:
      throw new Error(`test TIFF builder has no type ${entry.type}`);
  }
}

function u8(value) {
  return new Uint8Array([value]);
}

function u16(value) {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function u32(value) {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function ascii(text) {
  return new Uint8Array([...text].map((character) => character.charCodeAt(0)));
}

function concat(...parts) {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
