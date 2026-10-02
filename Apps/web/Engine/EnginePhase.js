export const ENGINE_PHASES = {
  starting: 'starting',
  compilingShaders: 'compilingShaders',
  generatingNoise: 'generatingNoise',
  loadingScene: 'loadingScene',
  running: 'running',
  sceneUnavailable: 'sceneUnavailable',
  deviceLost: 'deviceLost',
};

export function enginePhaseUpdate(name, noiseProgress = null) {
  return Object.freeze({ name, noiseProgress });
}
