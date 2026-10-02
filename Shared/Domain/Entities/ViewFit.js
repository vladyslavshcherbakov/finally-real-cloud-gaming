export class ViewFit {
  constructor({ photoScaleU, photoScaleV, photoOffsetU, photoOffsetV, tanHalfFovX, tanHalfFovY }) {
    this.photoScaleU = photoScaleU;
    this.photoScaleV = photoScaleV;
    this.photoOffsetU = photoOffsetU;
    this.photoOffsetV = photoOffsetV;
    this.tanHalfFovX = tanHalfFovX;
    this.tanHalfFovY = tanHalfFovY;
  }

  photoU(canvasU) {
    return canvasU * this.photoScaleU + this.photoOffsetU;
  }

  photoV(canvasV) {
    return canvasV * this.photoScaleV + this.photoOffsetV;
  }
}

export function coverFit({ canvasAspect, photoAspect, photoFovYDegrees }) {
  const isCanvasWider = canvasAspect > photoAspect;
  const photoScaleU = isCanvasWider ? 1 : canvasAspect / photoAspect;
  const photoScaleV = isCanvasWider ? photoAspect / canvasAspect : 1;
  const photoTanHalfFovY = Math.tan((photoFovYDegrees * Math.PI) / 360);
  return new ViewFit({
    photoScaleU,
    photoScaleV,
    photoOffsetU: (1 - photoScaleU) / 2,
    photoOffsetV: (1 - photoScaleV) / 2,
    tanHalfFovX: photoTanHalfFovY * photoAspect * photoScaleU,
    tanHalfFovY: photoTanHalfFovY * photoScaleV,
  });
}
