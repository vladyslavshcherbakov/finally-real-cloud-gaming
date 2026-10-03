const BYTES_PER_KILOBYTE = 1024;
const XMP_FIELD_PATTERN = /<([\w-]+:[\w-]+)>([^<]{1,60})<\/\1>|\s([\w-]+:[\w-]+)="([^"]{1,60})"/g;
const XMP_NAMESPACE_DECLARATION = /^xmlns:/;
const LARGEST_XMP_FIELD_COUNT = 20;

export function photoProbeLines(file, report) {
  return [
    `file: ${file.name}, type ${file.type || '(none)'}, ${Math.round(file.size / BYTES_PER_KILOBYTE)} KB`,
    `container: ${report.container}${report.brand === null ? '' : `, brand ${report.brand}`}`,
    ...depthLines(report),
    ...exifLines(report.exif),
  ];
}

export function unreadablePhotoLines(file, error) {
  return [
    `file: ${file.name}, type ${file.type || '(none)'}, ${Math.round(file.size / BYTES_PER_KILOBYTE)} KB`,
    `not read: ${error.message}`,
  ];
}

function depthLines(report) {
  const auxiliaryLines = report.auxiliaryImages.map((auxiliaryImage) => `auxiliary image ${auxiliaryImage.itemId}: ${auxiliaryImage.auxiliaryType}`
    + `, ${auxiliaryImage.width ?? '?'}×${auxiliaryImage.height ?? '?'}${auxiliaryImage.isDepthMap ? ' (depth map)' : ''}`);
  const multiPictureLines = report.multiPictureImageCount === null
    ? []
    : [`JPEG pictures in the file: ${report.multiPictureImageCount}, XMP mentions depth: ${report.doesXmpMentionDepth ? 'yes' : 'no'}`];
  return [`depth map: ${report.depthMaps.length > 0 ? 'yes' : 'no'}`, ...auxiliaryLines, ...multiPictureLines];
}

function exifLines(exif) {
  if (exif === null) return ['EXIF: none'];
  return [
    `camera: ${exif.make ?? '?'} ${exif.model ?? '?'}, lens ${exif.lensModel ?? '?'}`,
    `focal length: ${exif.focalLengthMillimetres?.toFixed(2) ?? '?'} mm, ${exif.focalLength35mmMillimetres ?? '?'} mm in 35 mm terms`,
    `image: ${exif.pixelWidth ?? '?'}×${exif.pixelHeight ?? '?'}, orientation ${exif.orientation ?? '?'}`,
    `location: ${exif.hasGpsLocation ? 'in the file, not shown' : 'none'}`,
  ];
}

export function decodedDepthLines(width, height, { lowest, highest, mean }) {
  return [`depth image decoded: ${width}×${height}, values ${lowest}–${highest} of 0–255, mean ${mean.toFixed(1)}`];
}

export function undecodedImageLines(imageName, error) {
  return [`${imageName} not decoded: ${error.name}: ${error.message}`];
}

export function depthXmpLines(xmp) {
  if (xmp === null) return ['depth XMP: none'];
  const fields = [...xmp.matchAll(XMP_FIELD_PATTERN)]
    .map(([, elementName, elementValue, attributeName, attributeValue]) => ({ name: elementName ?? attributeName, value: elementValue ?? attributeValue }))
    .filter((field) => !XMP_NAMESPACE_DECLARATION.test(field.name))
    .slice(0, LARGEST_XMP_FIELD_COUNT)
    .map((field) => `  ${field.name} = ${field.value}`);
  return ['depth XMP:', ...(fields.length > 0 ? fields : [`  ${xmp.slice(0, 300)}`])];
}
