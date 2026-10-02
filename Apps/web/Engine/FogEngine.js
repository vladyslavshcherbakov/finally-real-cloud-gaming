import { FOG_FIELD_KERNELS } from './Field/FogField.js';
import { FogSimulation } from './FogSimulation.js';
import { NoiseTextures, NOISE_KERNELS } from './Field/NoiseTextures.js';
import { ENGINE_PHASES, enginePhaseUpdate } from './EnginePhase.js';
import { EngineStats } from './EngineStats.js';
import { SceneTextures } from './Scene/SceneTextures.js';
import { SOLVERS, solverClass } from './Solvers.js';
import { QUALITY_PRESETS, gridSize } from '../../../Shared/Domain/Entities/QualityPreset.js';
import { chooseNextScene } from '../../../Shared/Domain/UseCases/ChooseNextScene.js';
import { simulationParams } from './SimulationParams.js';

const MOST_FRAMES_IN_FLIGHT = 2;
const FRAME_TIME_SMOOTHING = 0.05;

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
  #simulation = null;
  #phase = ENGINE_PHASES.starting;
  #elapsedSeconds = 0;
  #frameIndex = 0;
  #framesInFlight = 0;
  #averageFrameSeconds = null;
  #windSourceCount = 0;
  #vortexCount = 0;
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
      gridSize: this.#simulation?.field.size ?? null,
      particleCount: this.#simulation?.solver.particleCount ?? 0,
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
    this.#simulation.resetFog(this.#scene.depthCodes);
    this.#diagnosticsLog.fogWasReset();
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
    this.#simulation.advance(frameTime.simulationSeconds);
    this.#diagnosticsLog.advance(frameTime.simulationSeconds);
    this.#frameIndex++;
    this.#writeParams(frameTime);
    this.#encodeFrame();
  }

  #enterPhase(phase, noiseProgress = null) {
    if (phase !== this.#phase) this.#logger.info(`engine phase: ${this.#phase} to ${phase}`);
    this.#phase = phase;
    const phaseUpdate = enginePhaseUpdate(phase, noiseProgress);
    for (const listener of this.#phaseListeners) listener(phaseUpdate);
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
    this.#simulation?.destroy();
    this.#renderer.forgetBindGroups();
    this.#simulation = new FogSimulation({
      device: this.#device, kernels: this.#kernels, noise: this.#noise, gridSize: size,
      Solver: solverClass(this.#settings.values.solver), quality,
    });
    this.#renderer.resizeFogLayer(...fogLayerSize(this.#frameTarget.width, this.#frameTarget.height, quality));
    this.#diagnosticsLog.fogWasReset();
    this.#writeParams({ realSeconds: 0, simulationSeconds: 0 });
    this.#simulation.prepare(this.#scene.depthCodes);
    this.#logger.info(`grid rebuilt at ${preset} ${size.join('×')}: ${reason}`);
  }

  async #replaceSolver(reason) {
    const requestedSolverId = this.#settings.values.solver;
    await this.#kernels.prepare(solverClass(requestedSolverId).kernels);
    if (requestedSolverId !== this.#settings.values.solver || this.#phase !== ENGINE_PHASES.running) {
      this.#logger.info(`solver ${requestedSolverId} not applied: the setting or the engine changed while it compiled`);
      return;
    }
    this.#simulation.replaceSolver(solverClass(requestedSolverId), QUALITY_PRESETS[this.#settings.values.quality], this.#scene.depthCodes);
    this.#diagnosticsLog.fogWasReset();
    this.#logger.info(`solver replaced by ${requestedSolverId} and the fog reset to its base state: ${reason}`);
  }

  #writeParams(frameTime) {
    const settings = this.#settings.values;
    this.#params.set({
      ...simulationParams({
        settings, scene: this.#scene, gridSize: this.#simulation.field.size, cellCount: this.#simulation.field.cellCount,
        canvasAspect: this.#frameTarget.width / this.#frameTarget.height,
        elapsedSeconds: this.#elapsedSeconds, frameIndex: this.#frameIndex, stepSeconds: frameTime.simulationSeconds,
        secondsSinceLight: this.#simulation.secondsSinceLight,
      }),
      ...this.#simulation.solver.solverParams(frameTime),
    });
    const windSources = this.#pointerWind.windSources({
      nowSeconds: this.#clock.nowSeconds(),
      realSeconds: frameTime.realSeconds,
      strength: settings.windStrength,
      radius: settings.windRadius,
    });
    this.#windSourceCount = windSources.length;
    this.#params.setWindSources(windSources);
    const vortices = this.#pointerWind.vortices({ nowSeconds: this.#clock.nowSeconds(), strength: settings.windStrength });
    this.#reportVortexCountChange(vortices);
    this.#params.setVortices(vortices);
    this.#params.upload();
  }

  #reportVortexCountChange(vortices) {
    if (vortices.length === this.#vortexCount) return;
    const vortexDescriptions = vortices.map((vortex) => `at ${vortex.u.toFixed(2)},${vortex.v.toFixed(2)} radius ${vortex.radius.toFixed(2)} spin ${vortex.spin}`);
    this.#logger.info(`vortices ${this.#vortexCount} to ${vortices.length}${vortexDescriptions.length > 0 ? `: ${vortexDescriptions.join('; ')}` : ''}`);
    this.#vortexCount = vortices.length;
  }

  #encodeFrame() {
    const isTimed = this.#timer?.canMeasureThisFrame ?? false;
    const encoder = this.#device.createCommandEncoder({ label: 'frame' });
    const pass = encoder.beginComputePass({ label: 'simulation', timestampWrites: isTimed ? this.#timer.startWrites : undefined });
    this.#simulation.encodeStep(pass, this.#scene.depthCodes, this.#frameIndex);
    const field = this.#simulation.field;
    const diagnostics = field.diagnostics;
    const isDiagnosed = this.#diagnosticsLog.isReadingDue && diagnostics.canMeasure;
    if (isDiagnosed) diagnostics.measure(pass, field);
    pass.end();
    this.#renderer.render(encoder, this.#frameTarget.currentView(), field, this.#scene, isTimed ? this.#timer.endWrites : undefined);
    if (isTimed) this.#timer.copyResults(encoder);
    if (isDiagnosed) diagnostics.copyForReading(encoder);
    this.#device.queue.submit([encoder.finish()]);
    if (isDiagnosed) {
      this.#diagnosticsLog.report(diagnostics.read(), {
        solverId: this.#settings.values.solver, preset: this.#settings.values.quality, gridSize: field.size,
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
