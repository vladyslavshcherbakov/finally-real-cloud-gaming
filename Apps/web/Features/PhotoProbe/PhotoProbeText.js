const BYTES_PER_KILOBYTE = 1024;

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
