export class SceneDescription {
  constructor({ id, photoPath, depthPath, width, height, fovYDegrees, depthNearMetres, depthFarMetres, groundNormal, groundOffsetMetres, sunDirection }) {
    this.id = id;
    this.photoPath = photoPath;
    this.depthPath = depthPath;
    this.width = width;
    this.height = height;
    this.fovYDegrees = fovYDegrees;
    this.depthNearMetres = depthNearMetres;
    this.depthFarMetres = depthFarMetres;
    this.groundNormal = groundNormal;
    this.groundOffsetMetres = groundOffsetMetres;
    this.sunDirection = sunDirection;
  }

  get aspect() {
    return this.width / this.height;
  }
}
