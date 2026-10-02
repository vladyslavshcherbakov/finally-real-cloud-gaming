import { FogField, FOG_FIELD_KERNELS } from './Field/FogField.js';
import { NoiseTextures, NOISE_KERNELS } from './Field/NoiseTextures.js';
import { ENGINE_PHASES } from './EnginePhase.js';
import { EngineStats } from './EngineStats.js';
import { SceneTextures } from './Scene/SceneTextures.js';
import { SOLVERS, solverClass } from './Solvers.js';
import { QUALITY_PRESETS, gridSize } from '../../../Shared/Domain/Entities/QualityPreset.js';
import { chooseNextScene } from '../../../Shared/Domain/UseCases/ChooseNextScene.js';
import { simulationParams } from './SimulationParams.js';

const MOST_FRAMES_IN_FLIGHT = 2;
const FRAME_TIME_SMOOTHING = 0.05;
const LIGHT_UPDATE_EVERY_FRAMES = 2;

export class FogEngine {
  #device;
  #frameTarget;
  #kernels;
  #params;
  #settings;
  #pointerWind;
  #scenes;
  #assetBaseUrl;
  #random;
  #logger;
  #renderer;
  #timer;
  #clock;
  #diagnosticsLog;
  #noise = null;
  #scene = null;
  #field = null;
  #solver = null;
  #phase = ENGINE_PHASES.starting;
  #elapsedSeconds = 0;
  #frameIndex = 0;
  #framesInFlight = 0;
  #averageFrameSeconds = null;
  #secondsSinceLight = Infinity;
  #windSourceCount = 0;
  #phaseListeners = new Set();

  constructor({ gpuDevice, frameTarget, renderer, kernels, params, settings, pointerWind, scenes, gpuTimer, clock, diagnosticsLog, assetBaseUrl, random, logger }) {
    this.#device = gpuDevice.device;
    this.#frameTarget = frameTarget;
    this.#kernels = kernels;
    this.#params = params;
    this.#settings = settings;
    this.#pointerWind = pointerWind;
    this.#scenes = scenes;
    this.#assetBaseUrl = assetBaseUrl;
    this.#random = random;
    this.#logger = logger;
    this.#renderer = renderer;
    this.#timer = gpuTimer;
    this.#clock = clock;
    this.#diagnosticsLog = diagnosticsLog;
    settings.subscribe((key) => this.#settingChanged(key));
    this.#device.lost.then((info) => this.#deviceLost(info));
  }

  get phase() {
    return this.#phase;
  }

  get stats() {
    return new EngineStats({
      phase: this.#phase,
      framesPerSecond: this.#averageFrameSeconds ? 1 / this.#averageFrameSeconds : 0,
      preset: this.#settings.values.quality,
      gridSize: this.#field?.size ?? null,
      particleCount: this.#solver?.particleCount ?? 0,
      gpuMilliseconds: this.#timer?.milliseconds ?? null,
    });
  }

  subscribeToPhase(listener) {
    this.#phaseListeners.add(listener);
    return () => this.#phaseListeners.delete(listener);
  }

  async start() {
    this.#enterPhase(ENGINE_PHASES.compilingShaders);
    await this.#kernels.prepare([...NOISE_KERNELS, ...FOG_FIELD_KERNELS, ...solverClass(this.#settings.values.solver).kernels]);
    this.#enterPhase(ENGINE_PHASES.generatingNoise, 0);
    this.#noise = await NoiseTextures.generate(this.#device, this.#kernels, this.#params,
      (progress) => this.#enterPhase(ENGINE_PHASES.generatingNoise, progress));
    await this.nextSceneRequested();
    this.#kernels.prepare(SOLVERS.flatMap((solver) => solver.kernels));
  }

  async nextSceneRequested() {
    if (this.#phase === ENGINE_PHASES.loadingScene || this.#phase === ENGINE_PHASES.deviceLost) {
      this.#logger.info(`next scene not loaded: engine is ${this.#phase}`);
      return;
    }
    const description = chooseNextScene(this.#scenes, this.#scene?.description.id, this.#random);
    this.#enterPhase(ENGINE_PHASES.loadingScene);
    this.#logger.info(`loading scene ${description.id}`);
    let loadedScene;
    try {
      loadedScene = await SceneTextures.load(this.#device, description, this.#assetBaseUrl);
    } catch (loadError) {
      this.#logger.error(`scene ${description.id} not loaded: ${loadError.message}`);
      this.#enterPhase(this.#scene ? ENGINE_PHASES.running : ENGINE_PHASES.sceneUnavailable);
      return;
    }
    if (this.#phase === ENGINE_PHASES.deviceLost) {
      loadedScene.destroy();
      this.#logger.info(`scene ${description.id} dropped: the device was lost while it loaded`);
      return;
    }
    this.#scene?.destroy();
    this.#renderer.forgetBindGroups();
    this.#scene = loadedScene;
    this.#logger.info(`scene ${description.id} loaded: fog reaches ${loadedScene.measurements.fogReachMetres.toFixed(0)} m`);
    this.#rebuildGrid(`scene ${description.id} loaded`);
    this.#enterPhase(ENGINE_PHASES.running);
  }

  resetFogRequested() {
    if (this.#phase !== ENGINE_PHASES.running) {
      this.#logger.info(`fog not reset: engine is ${this.#phase}`);
      return;
    }
    this.#resetFog();
    this.#solver.reset();
    this.#logger.info('fog reset to its base state');
  }

  frameRequested(frameTime) {
    this.#averageFrameSeconds = this.#averageFrameSeconds === null
      ? frameTime.realSeconds
      : this.#averageFrameSeconds + (frameTime.realSeconds - this.#averageFrameSeconds) * FRAME_TIME_SMOOTHING;
    if (this.#phase !== ENGINE_PHASES.running) return;
    if (this.#framesInFlight >= MOST_FRAMES_IN_FLIGHT) return;
    if (this.#frameTarget.resizeToDisplaySize()) this.#rebuildGrid(`canvas resized to ${this.#frameTarget.width}×${this.#frameTarget.height}`);
    this.#elapsedSeconds += frameTime.simulationSeconds;
    this.#secondsSinceLight += frameTime.simulationSeconds;
    this.#diagnosticsLog.advance(frameTime.simulationSeconds);
    this.#frameIndex++;
    this.#writeParams(frameTime);
    this.#encodeFrame();
  }

  #enterPhase(phase, progress = null) {
    if (phase !== this.#phase) this.#logger.info(`engine phase: ${this.#phase} to ${phase}`);
    this.#phase = phase;
    for (const listener of this.#phaseListeners) listener(phase, progress);
  }

  #deviceLost(info) {
    this.#logger.error(`GPU device lost (${info.reason}): ${info.message}`);
    this.#enterPhase(ENGINE_PHASES.deviceLost);
  }

  #settingChanged(key) {
    if (this.#phase !== ENGINE_PHASES.running) return;
    const settingsThatRebuild = {
      quality: () => this.#rebuildGrid(`quality set to ${this.#settings.values.quality}`),
      solver: () => this.#replaceSolver(`solver set to ${this.#settings.values.solver}`),
    };
    settingsThatRebuild[key]?.();
  }

  #rebuildGrid(reason) {
    this.#frameTarget.resizeToDisplaySize();
    const preset = this.#settings.values.quality;
    const quality = QUALITY_PRESETS[preset];
    const size = gridSize(preset, this.#frameTarget.width / this.#frameTarget.height);
    this.#releaseGrid();
    this.#field = new FogField(this.#device, this.#kernels, this.#noise, size);
    this.#solver = this.#createSolver();
    this.#renderer.resizeFogLayer(...fogLayerSize(this.#frameTarget.width, this.#frameTarget.height, quality));
    this.#secondsSinceLight = Infinity;
    this.#fogWasReset();
    this.#writeParams({ realSeconds: 0, simulationSeconds: 0 });
    this.#secondsSinceLight = 0;
    this.#submitComputeWork('prepare grid', (pass) => {
      this.#field.buildSolids(pass, this.#scene.depthCodes);
      this.#field.resetFog(pass, this.#scene.depthCodes);
      this.#field.computeLight(pass);
    });
    this.#logger.info(`grid rebuilt at ${preset} ${size.join('×')}: ${reason}`);
  }

  #releaseGrid() {
    this.#solver?.destroy();
    this.#field?.destroy();
    this.#solver = null;
    this.#field = null;
    this.#kernels.forgetBindGroups();
    this.#renderer.forgetBindGroups();
  }

  async #replaceSolver(reason) {
    const requestedSolverId = this.#settings.values.solver;
    await this.#kernels.prepare(solverClass(requestedSolverId).kernels);
    if (requestedSolverId !== this.#settings.values.solver || this.#phase !== ENGINE_PHASES.running) {
      this.#logger.info(`solver ${requestedSolverId} not applied: the setting or the engine changed while it compiled`);
      return;
    }
    this.#solver.destroy();
    this.#kernels.forgetBindGroups();
    this.#solver = this.#createSolver();
    this.#resetFog();
    this.#logger.info(`solver replaced by ${requestedSolverId} and the fog reset to its base state: ${reason}`);
  }

  #resetFog() {
    this.#submitComputeWork('reset fog', (pass) => this.#field.resetFog(pass, this.#scene.depthCodes));
    this.#secondsSinceLight = Infinity;
    this.#fogWasReset();
  }

  #fogWasReset() {
    this.#diagnosticsLog.fogWasReset();
  }

  #createSolver() {
    const Solver = solverClass(this.#settings.values.solver);
    const solver = new Solver({ device: this.#device, kernels: this.#kernels, field: this.#field, quality: QUALITY_PRESETS[this.#settings.values.quality] });
    solver.reset();
    return solver;
  }

  #submitComputeWork(label, encodePasses) {
    const encoder = this.#device.createCommandEncoder({ label });
    const pass = encoder.beginComputePass({ label });
    encodePasses(pass);
    pass.end();
    this.#device.queue.submit([encoder.finish()]);
  }

  #writeParams(frameTime) {
    const settings = this.#settings.values;
    this.#params.set({
      ...simulationParams({
        settings, scene: this.#scene, gridSize: this.#field.size, cellCount: this.#field.cellCount,
        canvasAspect: this.#frameTarget.width / this.#frameTarget.height,
        elapsedSeconds: this.#elapsedSeconds, frameIndex: this.#frameIndex, stepSeconds: frameTime.simulationSeconds,
        secondsSinceLight: this.#secondsSinceLight,
      }),
      ...this.#solver.solverParams(frameTime),
    });
    const windSources = this.#pointerWind.windSources({
      nowSeconds: this.#clock.nowSeconds(),
      realSeconds: frameTime.realSeconds,
      strength: settings.windStrength,
      radius: settings.windRadius,
    });
    this.#windSourceCount = windSources.length;
    this.#params.setWindSources(windSources);
    this.#params.upload();
  }

  #encodeFrame() {
    const isTimed = this.#timer?.canMeasureThisFrame ?? false;
    const encoder = this.#device.createCommandEncoder({ label: 'frame' });
    const pass = encoder.beginComputePass({ label: 'simulation', timestampWrites: isTimed ? this.#timer.startWrites : undefined });
    this.#field.measureWindReach(pass, this.#scene.depthCodes);
    this.#solver.step(pass);
    this.#field.transportFog(pass);
    if (this.#frameIndex % LIGHT_UPDATE_EVERY_FRAMES === 0) {
      this.#field.computeLight(pass);
      this.#secondsSinceLight = 0;
    }
    const diagnostics = this.#field.diagnostics;
    const isDiagnosed = this.#diagnosticsLog.isReadingDue && diagnostics.canMeasure;
    if (isDiagnosed) diagnostics.measure(pass, this.#field);
    pass.end();
    this.#renderer.render(encoder, this.#frameTarget.currentView(), this.#field, this.#scene, isTimed ? this.#timer.endWrites : undefined);
    if (isTimed) this.#timer.copyResults(encoder);
    if (isDiagnosed) diagnostics.copyForReading(encoder);
    this.#device.queue.submit([encoder.finish()]);
    if (isDiagnosed) {
      this.#diagnosticsLog.report(diagnostics.read(), {
        solverId: this.#settings.values.solver, preset: this.#settings.values.quality, gridSize: this.#field.size,
        framesPerSecond: this.stats.framesPerSecond, windSourceCount: this.#windSourceCount,
      });
    }
    this.#framesInFlight++;
    this.#device.queue.onSubmittedWorkDone().then(() => { this.#framesInFlight--; });
    if (isTimed) this.#timer.readResultsIfStillAvailable();
  }
}

function fogLayerSize(canvasWidth, canvasHeight, quality) {
  const scaledPixels = canvasWidth * canvasHeight * quality.renderScale * quality.renderScale;
  const scale = quality.renderScale * Math.min(1, Math.sqrt(quality.mostFogLayerPixels / scaledPixels));
  return [Math.max(1, Math.round(canvasWidth * scale)), Math.max(1, Math.round(canvasHeight * scale))];
}
