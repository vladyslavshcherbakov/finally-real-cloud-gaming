const DEPTH_AUXILIARY_TYPE_WORDS = ['depth', 'disparity', 'urn:mpeg:hevc:2015:auxid:2'];

export class PhotoExif {
  constructor({ make, model, lensModel, focalLengthMillimetres, focalLength35mmMillimetres, orientation, pixelWidth, pixelHeight, hasGpsLocation }) {
    this.make = make;
    this.model = model;
    this.lensModel = lensModel;
    this.focalLengthMillimetres = focalLengthMillimetres;
    this.focalLength35mmMillimetres = focalLength35mmMillimetres;
    this.orientation = orientation;
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
    this.hasGpsLocation = hasGpsLocation;
  }
}

export class AuxiliaryImage {
  constructor({ itemId, auxiliaryType, width, height }) {
    this.itemId = itemId;
    this.auxiliaryType = auxiliaryType;
    this.width = width;
    this.height = height;
  }

  get isDepthMap() {
    const lowerCaseType = this.auxiliaryType.toLowerCase();
    return DEPTH_AUXILIARY_TYPE_WORDS.some((word) => lowerCaseType.includes(word));
  }
}

export class PhotoFileReport {
  constructor({ container, brand, exif, auxiliaryImages, multiPictureImageCount, doesXmpMentionDepth }) {
    this.container = container;
    this.brand = brand;
    this.exif = exif;
    this.auxiliaryImages = auxiliaryImages;
    this.multiPictureImageCount = multiPictureImageCount;
    this.doesXmpMentionDepth = doesXmpMentionDepth;
  }

  get depthMaps() {
    return this.auxiliaryImages.filter((auxiliaryImage) => auxiliaryImage.isDepthMap);
  }
}
