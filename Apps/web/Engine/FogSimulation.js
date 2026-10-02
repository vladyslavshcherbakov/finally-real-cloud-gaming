import { FogField } from './Field/FogField.js';

const LIGHT_UPDATE_EVERY_FRAMES = 2;

export class FogSimulation {
  #device;
  #kernels;
  #field;
  #solver;
  #secondsSinceLight = Infinity;

  constructor({ device, kernels, noise, gridSize, Solver, quality }) {
    this.#device = device;
    this.#kernels = kernels;
    this.#field = new FogField(device, kernels, noise, gridSize);
    this.#solver = this.#createdSolver(Solver, quality);
  }

  get field() {
    return this.#field;
  }

  get solver() {
    return this.#solver;
  }

  get secondsSinceLight() {
    return this.#secondsSinceLight;
  }

  prepare(sceneDepth) {
    this.#submitComputeWork('prepare grid', (pass) => {
      this.#field.buildSolids(pass, sceneDepth);
      this.#field.resetFog(pass, sceneDepth);
      this.#field.computeLight(pass);
    });
    this.#secondsSinceLight = 0;
  }

  replaceSolver(Solver, quality, sceneDepth) {
    this.#solver.destroy();
    this.#kernels.forgetBindGroups();
    this.#solver = this.#createdSolver(Solver, quality);
    this.resetFog(sceneDepth);
  }

  resetFog(sceneDepth) {
    this.#submitComputeWork('reset fog', (pass) => this.#field.resetFog(pass, sceneDepth));
    this.#solver.reset();
    this.#secondsSinceLight = Infinity;
  }

  advance(simulationSeconds) {
    this.#secondsSinceLight += simulationSeconds;
  }

  encodeStep(pass, sceneDepth, frameIndex) {
    this.#field.measureWindReach(pass, sceneDepth);
    this.#solver.step(pass);
    this.#field.transportFog(pass);
    if (frameIndex % LIGHT_UPDATE_EVERY_FRAMES === 0) {
      this.#field.computeLight(pass);
      this.#secondsSinceLight = 0;
    }
  }

  destroy() {
    this.#solver.destroy();
    this.#field.destroy();
    this.#kernels.forgetBindGroups();
  }

  #createdSolver(Solver, quality) {
    const solver = new Solver({ device: this.#device, kernels: this.#kernels, field: this.#field, quality });
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
}
