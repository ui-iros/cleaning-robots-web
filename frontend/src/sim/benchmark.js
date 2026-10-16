import { createSimulation } from "./localSimulation.js";
import { policyAction } from "./policies.js";

export function createBenchmark(config, seed, policies) {
  const runs = policies.map((policy) => ({ policy, simulation: createSimulation(config, seed), resets: 0 }));
  const initialDirt = runs[0]?.simulation.state.grid.flat().reduce((a, b) => a + b, 0) || 0;
  return {
    get finished() { return runs.every((run) => run.simulation.state.truncated); },
    snapshot() {
      return runs.map(({ policy, simulation, resets }) => ({ algorithm: policy.algorithm, state: simulation.state, resets,
        initialDirt, remainingDirt: simulation.state.grid.flat().reduce((a, b) => a + b, 0) }));
    },
    step() {
      for (const run of runs) {
        if (run.simulation.state.truncated) continue;
        run.simulation.step(policyAction(run.policy, run.simulation.state));
        if (run.simulation.state.render.manual_reset) run.resets++;
      }
      return this.snapshot();
    },
  };
}
