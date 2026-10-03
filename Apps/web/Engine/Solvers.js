import { FlipSolver } from './Solvers/FlipSolver.js';
import { MlsMpmSolver } from './Solvers/MlsMpmSolver.js';
import { CurlNoiseSolver } from './Solvers/CurlNoiseSolver.js';

export const SOLVERS = [FlipSolver, MlsMpmSolver, CurlNoiseSolver];

export const SOLVER_IDS = SOLVERS.map((solver) => solver.id);

export const SOLVER_SHADERS = [...new Set(SOLVERS.flatMap((solver) => solver.kernels.map((spec) => spec.shader)))];

export function solverClass(id) {
  return SOLVERS.find((solver) => solver.id === id);
}
