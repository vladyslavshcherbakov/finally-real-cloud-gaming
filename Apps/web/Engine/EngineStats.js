export class EngineStats {
  constructor({ phase, framesPerSecond, preset, gridSize: size, particleCount, gpuMilliseconds }) {
    this.phase = phase;
    this.framesPerSecond = framesPerSecond;
    this.preset = preset;
    this.gridSize = size;
    this.particleCount = particleCount;
    this.gpuMilliseconds = gpuMilliseconds;
  }
}
