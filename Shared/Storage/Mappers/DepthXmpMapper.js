import { DepthEncoding, DEPTH_ENCODING_KINDS } from '../../Domain/Entities/DepthEncoding.js';

const APPLE_PIXEL_DATA_PREFIX = 'apdi';

export class DepthXmpInvalid extends Error {
  constructor(field, value) {
    super(`depth XMP field ${field} is invalid: ${JSON.stringify(value)}`);
    this.name = 'DepthXmpInvalid';
    this.field = field;
    this.value = value;
  }
}

export function depthEncoding(xmp) {
  if (typeof xmp !== 'string') throw new DepthXmpInvalid('(the whole XMP)', xmp);
  const kind = xmpField(xmp, 'AuxiliaryImageType');
  if (!Object.values(DEPTH_ENCODING_KINDS).includes(kind)) throw new DepthXmpInvalid('AuxiliaryImageType', kind);
  const lowestCode = finiteField(xmp, 'IntMinValue');
  const highestCode = finiteField(xmp, 'IntMaxValue');
  if (highestCode <= lowestCode) throw new DepthXmpInvalid('IntMaxValue', highestCode);
  return new DepthEncoding({
    kind,
    lowestCode,
    highestCode,
    lowestValue: finiteField(xmp, 'FloatMinValue'),
    highestValue: finiteField(xmp, 'FloatMaxValue'),
  });
}

function finiteField(xmp, name) {
  const text = xmpField(xmp, name);
  const value = Number(text);
  if (text === null || !Number.isFinite(value)) throw new DepthXmpInvalid(name, text);
  return value;
}

function xmpField(xmp, name) {
  const qualifiedName = `${APPLE_PIXEL_DATA_PREFIX}:${name}`;
  const asElement = xmp.match(new RegExp(`<${qualifiedName}>([^<]*)</${qualifiedName}>`));
  if (asElement) return asElement[1].trim();
  const asAttribute = xmp.match(new RegExp(`${qualifiedName}="([^"]*)"`));
  return asAttribute ? asAttribute[1].trim() : null;
}
