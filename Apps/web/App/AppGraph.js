import { requestGpuDevice } from '../Engine/Gpu/GpuDevice.js';
import { ShaderLibrary } from '../Engine/Gpu/ShaderLibrary.js';
import { KernelLibrary } from '../Engine/Gpu/Kernel.js';
import { ParamsBuffer } from '../Engine/Gpu/ParamsBuffer.js';
import { FogEngine } from '../Engine/FogEngine.js';
import { GpuTimer } from '../Engine/Gpu/GpuTimer.js';
import { FOG_FIELD_SHADERS } from '../Engine/Field/FogField.js';
import { FogRenderer, FOG_RENDERER_SHADERS } from '../Engine/Render/FogRenderer.js';
import { NOISE_SHADERS } from '../Engine/Field/NoiseTextures.js';
import { SOLVER_IDS, SOLVER_SHADERS } from '../Engine/Solvers.js';
import { SettingsModel } from '../../../Shared/Domain/Entities/SettingsModel.js';
import { defaultSettings } from '../../../Shared/Domain/Entities/Settings.js';
import { PointerWind } from '../../../Shared/Domain/UseCases/PointerWind.js';
import { SettingsRepository } from '../../../Shared/Storage/Repositories/SettingsRepository.js';
import { sceneDescriptions } from '../../../Shared/Storage/Mappers/SceneManifestMapper.js';
import { SceneAssetLoadFailed } from '../Engine/Scene/SceneTextures.js';

const SCENES_URL = new URL('../Scenes/', import.meta.url);

export class AppGraph {
  constructor({ engine, settings, pointerWind }) {
    this.engine = engine;
    this.settings = settings;
    this.pointerWind = pointerWind;
  }
}

export async function createAppGraph({ createFrameTarget, storage, random, clock, logger }) {
  const gpuDevice = await requestGpuDevice(logger.forArea('gpu'));
  const frameTarget = createFrameTarget(gpuDevice);
  const settings = new SettingsModel(loadedSettings(storage, logger.forArea('settings')), SOLVER_IDS);
  saveEachChange(settings, storage, logger.forArea('settings'));
  const [shaders, scenes] = await Promise.all([
    ShaderLibrary.load([...FOG_FIELD_SHADERS, ...NOISE_SHADERS, ...SOLVER_SHADERS, ...FOG_RENDERER_SHADERS]),
    loadSceneDescriptions(),
  ]);
  const params = new ParamsBuffer(gpuDevice.device);
  const kernels = new KernelLibrary(gpuDevice.device, shaders, params, logger.forArea('shaders'));
  const pointerWind = new PointerWind();
  const renderer = await FogRenderer.create(gpuDevice.device, shaders, params, frameTarget.format);
  const gpuTimer = gpuDevice.hasTimestamps ? new GpuTimer(gpuDevice.device, logger.forArea('gpu')) : null;
  const engine = new FogEngine({
    gpuDevice, frameTarget, renderer, kernels, params, settings, pointerWind, scenes, gpuTimer, clock,
    assetBaseUrl: SCENES_URL, random, logger: logger.forArea('engine'),
  });
  return new AppGraph({ engine, settings, pointerWind });
}

function loadedSettings(storage, logger) {
  const repository = new SettingsRepository(storage, SOLVER_IDS);
  try {
    return repository.load();
  } catch (error) {
    logger.warn(`defaults used: ${error.message}`);
    return defaultSettings(SOLVER_IDS);
  }
}

function saveEachChange(settings, storage, logger) {
  const repository = new SettingsRepository(storage, SOLVER_IDS);
  let hasReportedSaveFailure = false;
  settings.subscribe((key, value, allValues) => {
    try {
      repository.save(allValues);
    } catch (error) {
      if (!hasReportedSaveFailure) logger.warn(`settings not kept for the next visit: ${error.message}`);
      hasReportedSaveFailure = true;
    }
  });
}

async function loadSceneDescriptions() {
  const manifestUrl = new URL('manifest.json', SCENES_URL);
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new SceneAssetLoadFailed('Scenes/manifest.json', response.status);
  return sceneDescriptions(await response.json());
}
