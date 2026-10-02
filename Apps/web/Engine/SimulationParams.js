import { QUALITY_PRESETS } from '../../../Shared/Domain/Entities/QualityPreset.js';
import { coverFit } from '../../../Shared/Domain/Entities/ViewFit.js';
import { DEBUG_VIEWS } from '../../../Shared/Domain/Entities/Settings.js';

const NEAR_SLICE_METRES = 1;
const SOLID_THICKNESS_FACTOR = 0.5;
const LIGHT_SMOOTHING_SECONDS = 0.8;

export function simulationParams({ settings, scene, gridSize, cellCount, canvasAspect, elapsedSeconds, frameIndex, stepSeconds, secondsSinceLight }) {
  return {
    ...timeParams(elapsedSeconds, frameIndex, stepSeconds),
    ...gridParams(gridSize, cellCount, scene),
    ...viewParams(scene, canvasAspect),
    ...lightParams(settings, scene, secondsSinceLight),
    ...fogParams(settings),
    ...windParams(settings),
    ...lookParams(settings),
  };
}

function timeParams(elapsedSeconds, frameIndex, stepSeconds) {
  return { elapsedSeconds, frameIndex, stepSeconds };
}

function gridParams([gridWidth, gridHeight, gridDepth], cellCount, scene) {
  const farSliceMetres = scene.measurements.fogReachMetres;
  return {
    gridWidth, gridHeight, gridDepth, cellCount,
    nearSliceMetres: NEAR_SLICE_METRES, farSliceMetres, sliceLogRange: Math.log(farSliceMetres / NEAR_SLICE_METRES),
    solidThicknessFactor: SOLID_THICKNESS_FACTOR,
  };
}

function viewParams(scene, canvasAspect) {
  const description = scene.description;
  const fit = coverFit({ canvasAspect, photoAspect: description.aspect, photoFovYDegrees: description.fovYDegrees });
  const [groundNormalX, groundNormalY, groundNormalZ] = description.groundNormal;
  return {
    canvasAspect, tanHalfFovX: fit.tanHalfFovX, tanHalfFovY: fit.tanHalfFovY,
    photoScaleU: fit.photoScaleU, photoScaleV: fit.photoScaleV, photoOffsetU: fit.photoOffsetU, photoOffsetV: fit.photoOffsetV,
    depthCodecNearMetres: description.depthNearMetres, depthCodecLogRange: Math.log(description.depthFarMetres / description.depthNearMetres),
    groundNormalX, groundNormalY, groundNormalZ, groundOffsetMetres: description.groundOffsetMetres,
  };
}

function lightParams(settings, scene, secondsSinceLight) {
  const [sunDirectionX, sunDirectionY, sunDirectionZ] = scene.description.sunDirection;
  const [sunColorR, sunColorG, sunColorB] = scene.measurements.sunColor;
  const [skyColorR, skyColorG, skyColorB] = scene.measurements.skyColor;
  const [groundColorR, groundColorG, groundColorB] = scene.measurements.groundColor;
  return {
    sunDirectionX, sunDirectionY, sunDirectionZ, sunIntensity: settings.sun,
    sunColorR, sunColorG, sunColorB, ambientIntensity: settings.ambient,
    skyColorR, skyColorG, skyColorB, sceneGlowIntensity: settings.sceneGlow,
    groundColorR, groundColorG, groundColorB, exposure: settings.exposure,
    lightBlend: 1 - Math.exp(-secondsSinceLight / LIGHT_SMOOTHING_SECONDS),
    forwardScattering: settings.forwardScattering, multipleScattering: settings.multipleScattering,
  };
}

function fogParams(settings) {
  return {
    openingOpticalDepth: settings.fogThickness, heightFalloffMetres: settings.heightFalloff, baseSmog: settings.baseSmog, clumps: settings.clumps,
    returnRate: settings.returnRate, diffusion: settings.diffusion,
  };
}

function windParams(settings) {
  return {
    windDriftX: settings.drift, windDriftY: 0, windDriftZ: settings.drift * 0.3, turbulenceMetresPerSecond: settings.turbulence,
    vorticityConfinement: settings.vorticity, damping: settings.damping,
    windStrength: settings.windStrength, windRadius: settings.windRadius, wakeMixing: settings.wakeMixing,
  };
}

function lookParams(settings) {
  return {
    detailAmount: settings.detail, detailScalePerMetre: settings.detailScale, detailFlowPeriodSeconds: settings.detailFlowPeriod, erosion: settings.erosion,
    samplesPerSlice: QUALITY_PRESETS[settings.quality].samplesPerSlice, debugView: DEBUG_VIEWS.indexOf(settings.view),
  };
}
