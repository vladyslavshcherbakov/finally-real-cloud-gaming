import { SceneDescription } from '../../Domain/Entities/SceneDescription.js';

export class SceneManifestInvalid extends Error {
  constructor(sceneId, field, value) {
    super(`scene ${sceneId}: field ${field} is invalid: ${JSON.stringify(value)}`);
    this.name = 'SceneManifestInvalid';
    this.sceneId = sceneId;
    this.field = field;
  }
}

export function sceneDescriptions(manifestJson) {
  if (!Array.isArray(manifestJson?.scenes) || manifestJson.scenes.length === 0) {
    throw new SceneManifestInvalid('(manifest)', 'scenes', manifestJson?.scenes);
  }
  return manifestJson.scenes.map(sceneDescription);
}

function sceneDescription(entry) {
  const sceneId = typeof entry?.id === 'string' && entry.id ? entry.id : '(no id)';
  const requiredField = (field, isValid) => {
    if (!isValid(entry?.[field])) throw new SceneManifestInvalid(sceneId, field, entry?.[field]);
    return entry[field];
  };
  const isText = (value) => typeof value === 'string' && value.length > 0;
  const isPositive = (value) => Number.isFinite(value) && value > 0;
  const isVector = (value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  const ground = requiredField('ground', (value) => isVector(value?.normal) && Number.isFinite(value?.offset));
  const depthNearMetres = requiredField('nearM', isPositive);
  return new SceneDescription({
    id: requiredField('id', isText),
    photoPath: requiredField('photo', isText),
    depthPath: requiredField('depth', isText),
    width: requiredField('width', Number.isInteger),
    height: requiredField('height', Number.isInteger),
    fovYDegrees: requiredField('fovY', (value) => Number.isFinite(value) && value > 10 && value < 120),
    depthNearMetres,
    depthFarMetres: requiredField('farM', (value) => Number.isFinite(value) && value > depthNearMetres),
    groundNormal: ground.normal,
    groundOffsetMetres: ground.offset,
    sunDirection: requiredField('sunDir', isVector),
  });
}
