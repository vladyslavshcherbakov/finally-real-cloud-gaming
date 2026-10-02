import { PhotoFileReport, PhotoExif, AuxiliaryImage } from '../../Domain/Entities/PhotoFileReport.js';

const JPEG_START = [0xff, 0xd8, 0xff];
const PNG_START = [0x89, 0x50, 0x4e, 0x47];
const JPEG_START_OF_SCAN = 0xda;
const JPEG_EXIF_APP = 0xe1;
const JPEG_MULTI_PICTURE_APP = 0xe2;
const JPEG_EXIF_SIGNATURE = 'Exif\0\0';
const JPEG_XMP_SIGNATURE = 'http://ns.adobe.com/xap/1.0/\0';
const JPEG_MULTI_PICTURE_SIGNATURE = 'MPF\0';
const MULTI_PICTURE_IMAGE_COUNT_TAG = 0xb001;

const TIFF_MAKE_TAG = 0x010f;
const TIFF_MODEL_TAG = 0x0110;
const TIFF_ORIENTATION_TAG = 0x0112;
const TIFF_EXIF_POINTER_TAG = 0x8769;
const TIFF_GPS_POINTER_TAG = 0x8825;
const EXIF_FOCAL_LENGTH_TAG = 0x920a;
const EXIF_PIXEL_WIDTH_TAG = 0xa002;
const EXIF_PIXEL_HEIGHT_TAG = 0xa003;
const EXIF_FOCAL_LENGTH_35MM_TAG = 0xa405;
const EXIF_LENS_MODEL_TAG = 0xa434;
const TIFF_ASCII = 2;
const TIFF_SHORT = 3;
const TIFF_LONG = 4;
const TIFF_RATIONAL = 5;
const TIFF_ENTRY_BYTES = 12;

const BOX_HEADER_BYTES = 8;
const FULL_BOX_HEADER_BYTES = 4;
const AUXILIARY_REFERENCE = 'auxl';
const TEXT_CHUNK_BYTES = 8192;

export class PhotoFileUnreadable extends Error {
  constructor(reason, offset) {
    super(`photo file unreadable at byte ${offset}: ${reason}`);
    this.name = 'PhotoFileUnreadable';
    this.reason = reason;
    this.offset = offset;
  }
}

export function photoFileReport(bytes) {
  const reader = new ByteReader(bytes);
  if (startsWith(bytes, JPEG_START)) return jpegReport(reader);
  if (reader.text(4, 4) === 'ftyp') return heifReport(reader);
  const container = startsWith(bytes, PNG_START) ? 'png' : 'unknown';
  return new PhotoFileReport({ container, brand: null, exif: null, auxiliaryImages: [], multiPictureImageCount: null, doesXmpMentionDepth: false });
}

function jpegReport(reader) {
  let exif = null;
  let multiPictureImageCount = null;
  let doesXmpMentionDepth = false;
  let offset = 2;
  while (offset + 4 <= reader.length) {
    if (reader.u8(offset) !== 0xff) throw new PhotoFileUnreadable('a JPEG segment does not start with 0xFF', offset);
    const marker = reader.u8(offset + 1);
    if (marker === JPEG_START_OF_SCAN) break;
    const segmentLength = reader.u16(offset + 2, false);
    const payloadStart = offset + 4;
    const payloadEnd = offset + 2 + segmentLength;
    if (payloadEnd > reader.length) throw new PhotoFileUnreadable(`segment 0x${marker.toString(16)} runs past the end`, offset);
    if (marker === JPEG_EXIF_APP && reader.text(payloadStart, JPEG_EXIF_SIGNATURE.length) === JPEG_EXIF_SIGNATURE) {
      exif = tiffExif(reader, payloadStart + JPEG_EXIF_SIGNATURE.length);
    }
    if (marker === JPEG_EXIF_APP && reader.text(payloadStart, JPEG_XMP_SIGNATURE.length) === JPEG_XMP_SIGNATURE) {
      doesXmpMentionDepth = /depth|disparity/i.test(reader.text(payloadStart, payloadEnd - payloadStart));
    }
    if (marker === JPEG_MULTI_PICTURE_APP && reader.text(payloadStart, JPEG_MULTI_PICTURE_SIGNATURE.length) === JPEG_MULTI_PICTURE_SIGNATURE) {
      multiPictureImageCount = multiPictureCount(reader, payloadStart + JPEG_MULTI_PICTURE_SIGNATURE.length);
    }
    offset = payloadEnd;
  }
  return new PhotoFileReport({ container: 'jpeg', brand: null, exif, auxiliaryImages: [], multiPictureImageCount, doesXmpMentionDepth });
}

function multiPictureCount(reader, tiffStart) {
  const tiff = tiffHeader(reader, tiffStart);
  const countEntry = ifdEntries(reader, tiff, tiff.firstIfdOffset).find((entry) => entry.tag === MULTI_PICTURE_IMAGE_COUNT_TAG);
  return countEntry === undefined ? null : entryNumber(reader, tiff, countEntry);
}

function heifReport(reader) {
  const topBoxes = boxesIn(reader, 0, reader.length);
  const brand = reader.text(topBoxes[0].contentStart, 4);
  const metaBox = topBoxes.find((box) => box.type === 'meta');
  if (metaBox === undefined) throw new PhotoFileUnreadable('the HEIF file has no meta box', 0);
  const metaChildren = boxesIn(reader, metaBox.contentStart + FULL_BOX_HEADER_BYTES, metaBox.end);
  const itemTypesById = itemTypes(reader, metaChildren);
  const propertiesByItemId = itemProperties(reader, metaChildren);
  const auxiliaryItemIds = referencedFromItemIds(reader, metaChildren, AUXILIARY_REFERENCE);
  const auxiliaryImages = auxiliaryItemIds.map((itemId) => {
    const properties = propertiesByItemId.get(itemId) ?? [];
    const imageSize = properties.find((property) => property.type === 'ispe');
    const auxiliaryType = properties.find((property) => property.type === 'auxC');
    return new AuxiliaryImage({
      itemId,
      auxiliaryType: auxiliaryType === undefined ? '(no auxC)' : nullTerminatedText(reader, auxiliaryType.contentStart + FULL_BOX_HEADER_BYTES, auxiliaryType.end),
      width: imageSize === undefined ? null : reader.u32(imageSize.contentStart + FULL_BOX_HEADER_BYTES, false),
      height: imageSize === undefined ? null : reader.u32(imageSize.contentStart + FULL_BOX_HEADER_BYTES + 4, false),
    });
  });
  const exifItemId = [...itemTypesById].find(([, itemType]) => itemType === 'Exif')?.[0];
  const exif = exifItemId === undefined ? null : heifExif(reader, metaChildren, exifItemId);
  return new PhotoFileReport({ container: 'heif', brand, exif, auxiliaryImages, multiPictureImageCount: null, doesXmpMentionDepth: false });
}

function itemTypes(reader, metaChildren) {
  const itemInfoBox = metaChildren.find((box) => box.type === 'iinf');
  const itemTypesById = new Map();
  if (itemInfoBox === undefined) return itemTypesById;
  const version = reader.u8(itemInfoBox.contentStart);
  const entriesStart = itemInfoBox.contentStart + FULL_BOX_HEADER_BYTES + (version === 0 ? 2 : 4);
  for (const entryBox of boxesIn(reader, entriesStart, itemInfoBox.end).filter((box) => box.type === 'infe')) {
    const entryVersion = reader.u8(entryBox.contentStart);
    if (entryVersion < 2) continue;
    const idStart = entryBox.contentStart + FULL_BOX_HEADER_BYTES;
    const itemId = entryVersion === 2 ? reader.u16(idStart, false) : reader.u32(idStart, false);
    const typeStart = idStart + (entryVersion === 2 ? 2 : 4) + 2;
    itemTypesById.set(itemId, reader.text(typeStart, 4));
  }
  return itemTypesById;
}

function itemProperties(reader, metaChildren) {
  const propertiesByItemId = new Map();
  const propertiesBox = metaChildren.find((box) => box.type === 'iprp');
  if (propertiesBox === undefined) return propertiesByItemId;
  const propertyChildren = boxesIn(reader, propertiesBox.contentStart, propertiesBox.end);
  const containerBox = propertyChildren.find((box) => box.type === 'ipco');
  const associationBox = propertyChildren.find((box) => box.type === 'ipma');
  if (containerBox === undefined || associationBox === undefined) return propertiesByItemId;
  const properties = boxesIn(reader, containerBox.contentStart, containerBox.end);
  const version = reader.u8(associationBox.contentStart);
  const hasWideIndices = (reader.u8(associationBox.contentStart + 3) & 1) === 1;
  let offset = associationBox.contentStart + FULL_BOX_HEADER_BYTES;
  const entryCount = reader.u32(offset, false);
  offset += 4;
  for (let entry = 0; entry < entryCount; entry++) {
    const itemId = version < 1 ? reader.u16(offset, false) : reader.u32(offset, false);
    offset += version < 1 ? 2 : 4;
    const associationCount = reader.u8(offset);
    offset += 1;
    const itemPropertiesList = [];
    for (let association = 0; association < associationCount; association++) {
      const propertyIndex = hasWideIndices ? reader.u16(offset, false) & 0x7fff : reader.u8(offset) & 0x7f;
      offset += hasWideIndices ? 2 : 1;
      if (propertyIndex > 0 && propertyIndex <= properties.length) itemPropertiesList.push(properties[propertyIndex - 1]);
    }
    propertiesByItemId.set(itemId, itemPropertiesList);
  }
  return propertiesByItemId;
}

function referencedFromItemIds(reader, metaChildren, referenceType) {
  const referenceBox = metaChildren.find((box) => box.type === 'iref');
  if (referenceBox === undefined) return [];
  const idBytes = reader.u8(referenceBox.contentStart) === 0 ? 2 : 4;
  return boxesIn(reader, referenceBox.contentStart + FULL_BOX_HEADER_BYTES, referenceBox.end)
    .filter((box) => box.type === referenceType)
    .map((box) => (idBytes === 2 ? reader.u16(box.contentStart, false) : reader.u32(box.contentStart, false)));
}

function heifExif(reader, metaChildren, exifItemId) {
  const location = itemLocation(reader, metaChildren, exifItemId);
  if (location === null) return null;
  const tiffOffset = reader.u32(location.start, false);
  return tiffExif(reader, location.start + 4 + tiffOffset);
}

function itemLocation(reader, metaChildren, wantedItemId) {
  const locationBox = metaChildren.find((box) => box.type === 'iloc');
  if (locationBox === undefined) return null;
  const version = reader.u8(locationBox.contentStart);
  let offset = locationBox.contentStart + FULL_BOX_HEADER_BYTES;
  const offsetSize = reader.u8(offset) >> 4;
  const lengthSize = reader.u8(offset) & 0xf;
  const baseOffsetSize = reader.u8(offset + 1) >> 4;
  const indexSize = version === 0 ? 0 : reader.u8(offset + 1) & 0xf;
  offset += 2;
  const itemCount = version < 2 ? reader.u16(offset, false) : reader.u32(offset, false);
  offset += version < 2 ? 2 : 4;
  for (let item = 0; item < itemCount; item++) {
    const itemId = version < 2 ? reader.u16(offset, false) : reader.u32(offset, false);
    offset += version < 2 ? 2 : 4;
    if (version > 0) offset += 2;
    offset += 2;
    const baseOffset = reader.sizedNumber(offset, baseOffsetSize);
    offset += baseOffsetSize;
    const extentCount = reader.u16(offset, false);
    offset += 2;
    let firstExtent = null;
    for (let extent = 0; extent < extentCount; extent++) {
      offset += indexSize;
      const extentOffset = reader.sizedNumber(offset, offsetSize);
      offset += offsetSize;
      offset += lengthSize;
      firstExtent ??= baseOffset + extentOffset;
    }
    if (itemId === wantedItemId && firstExtent !== null) return { start: firstExtent };
  }
  return null;
}

function tiffExif(reader, tiffStart) {
  const tiff = tiffHeader(reader, tiffStart);
  const firstEntries = ifdEntries(reader, tiff, tiff.firstIfdOffset);
  const exifPointer = firstEntries.find((entry) => entry.tag === TIFF_EXIF_POINTER_TAG);
  const exifEntries = exifPointer === undefined ? [] : ifdEntries(reader, tiff, entryNumber(reader, tiff, exifPointer));
  const textOf = (entries, tag) => entryText(reader, tiff, entries.find((entry) => entry.tag === tag));
  const numberOf = (entries, tag) => {
    const entry = entries.find((candidate) => candidate.tag === tag);
    return entry === undefined ? null : entryNumber(reader, tiff, entry);
  };
  return new PhotoExif({
    make: textOf(firstEntries, TIFF_MAKE_TAG),
    model: textOf(firstEntries, TIFF_MODEL_TAG),
    lensModel: textOf(exifEntries, EXIF_LENS_MODEL_TAG),
    focalLengthMillimetres: numberOf(exifEntries, EXIF_FOCAL_LENGTH_TAG),
    focalLength35mmMillimetres: numberOf(exifEntries, EXIF_FOCAL_LENGTH_35MM_TAG),
    orientation: numberOf(firstEntries, TIFF_ORIENTATION_TAG),
    pixelWidth: numberOf(exifEntries, EXIF_PIXEL_WIDTH_TAG),
    pixelHeight: numberOf(exifEntries, EXIF_PIXEL_HEIGHT_TAG),
    hasGpsLocation: firstEntries.some((entry) => entry.tag === TIFF_GPS_POINTER_TAG),
  });
}

function tiffHeader(reader, start) {
  const byteOrder = reader.text(start, 2);
  if (byteOrder !== 'II' && byteOrder !== 'MM') throw new PhotoFileUnreadable(`unknown TIFF byte order ${JSON.stringify(byteOrder)}`, start);
  const isLittleEndian = byteOrder === 'II';
  return { start, isLittleEndian, firstIfdOffset: reader.u32(start + 4, isLittleEndian) };
}

function ifdEntries(reader, tiff, ifdOffset) {
  const ifdStart = tiff.start + ifdOffset;
  const entryCount = reader.u16(ifdStart, tiff.isLittleEndian);
  return Array.from({ length: entryCount }, (_, index) => {
    const entryStart = ifdStart + 2 + index * TIFF_ENTRY_BYTES;
    return {
      tag: reader.u16(entryStart, tiff.isLittleEndian),
      type: reader.u16(entryStart + 2, tiff.isLittleEndian),
      count: reader.u32(entryStart + 4, tiff.isLittleEndian),
      valueStart: entryStart + 8,
    };
  });
}

function entryNumber(reader, tiff, entry) {
  switch (entry.type) {
    case TIFF_SHORT:
      return reader.u16(entry.valueStart, tiff.isLittleEndian);
    case TIFF_LONG:
      return reader.u32(entry.valueStart, tiff.isLittleEndian);
    case TIFF_RATIONAL: {
      const rationalStart = tiff.start + reader.u32(entry.valueStart, tiff.isLittleEndian);
      const denominator = reader.u32(rationalStart + 4, tiff.isLittleEndian);
      return denominator === 0 ? null : reader.u32(rationalStart, tiff.isLittleEndian) / denominator;
    }
    default:
      return null;
  }
}

function entryText(reader, tiff, entry) {
  if (entry === undefined || entry.type !== TIFF_ASCII) return null;
  const textStart = entry.count <= 4 ? entry.valueStart : tiff.start + reader.u32(entry.valueStart, tiff.isLittleEndian);
  return nullTerminatedText(reader, textStart, textStart + entry.count);
}

function boxesIn(reader, start, end) {
  const boxes = [];
  let offset = start;
  while (offset + BOX_HEADER_BYTES <= end) {
    let size = reader.u32(offset, false);
    const type = reader.text(offset + 4, 4);
    let headerBytes = BOX_HEADER_BYTES;
    if (size === 1) {
      size = reader.u64(offset + 8);
      headerBytes += 8;
    }
    if (size === 0) size = end - offset;
    if (size < headerBytes || offset + size > end) throw new PhotoFileUnreadable(`box ${JSON.stringify(type)} has a size of ${size}`, offset);
    boxes.push({ type, contentStart: offset + headerBytes, end: offset + size });
    offset += size;
  }
  return boxes;
}

function nullTerminatedText(reader, start, end) {
  const text = reader.text(start, end - start);
  const terminator = text.indexOf('\0');
  return terminator === -1 ? text : text.slice(0, terminator);
}

function startsWith(bytes, prefix) {
  return prefix.every((value, index) => bytes[index] === value);
}

class ByteReader {
  #bytes;
  #view;

  constructor(bytes) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length() {
    return this.#bytes.length;
  }

  u8(offset) {
    this.#requireBytes(offset, 1);
    return this.#view.getUint8(offset);
  }

  u16(offset, isLittleEndian) {
    this.#requireBytes(offset, 2);
    return this.#view.getUint16(offset, isLittleEndian);
  }

  u32(offset, isLittleEndian) {
    this.#requireBytes(offset, 4);
    return this.#view.getUint32(offset, isLittleEndian);
  }

  u64(offset) {
    this.#requireBytes(offset, 8);
    return Number(this.#view.getBigUint64(offset, false));
  }

  sizedNumber(offset, byteCount) {
    switch (byteCount) {
      case 0:
        return 0;
      case 4:
        return this.u32(offset, false);
      case 8:
        return this.u64(offset);
      default:
        throw new PhotoFileUnreadable(`an item location uses ${byteCount}-byte numbers`, offset);
    }
  }

  text(offset, byteCount) {
    this.#requireBytes(offset, byteCount);
    let text = '';
    for (let chunkStart = offset; chunkStart < offset + byteCount; chunkStart += TEXT_CHUNK_BYTES) {
      text += String.fromCharCode(...this.#bytes.subarray(chunkStart, Math.min(chunkStart + TEXT_CHUNK_BYTES, offset + byteCount)));
    }
    return text;
  }

  #requireBytes(offset, byteCount) {
    if (offset < 0 || offset + byteCount > this.#bytes.length) throw new PhotoFileUnreadable(`${byteCount} bytes needed past the end of the file`, offset);
  }
}
