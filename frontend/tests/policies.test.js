import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ALGORITHMS, forward, outputAction, normalizedObservation, validatePolicy } from "../src/sim/policies.js";
import { createSimulation, JOURNAL_CONFIG } from "../src/sim/localSimulation.js";
import { createBenchmark } from "../src/sim/benchmark.js";

const fixtures = JSON.parse(await readFile(new URL("./fixtures/policyParity.json", import.meta.url)));
const policies = await Promise.all(ALGORITHMS.map(async (name) => validatePolicy(JSON.parse(await readFile(new URL(`../public/policies/${name}.json`, import.meta.url))), name)));

for (const policy of policies) test(`${policy.algorithm.toUpperCase()} matches Python SB3 outputs and actions on 128 observations`, () => {
  const reference = fixtures.algorithms[policy.algorithm];
  fixtures.observations.forEach((observation, i) => {
    const output = forward(policy, observation);
    output.forEach((value, j) => assert.ok(Math.abs(value - reference.outputs[i][j]) <= 0.0001 * Math.max(1, Math.abs(reference.outputs[i][j])), `output mismatch at ${i}, ${j}`));
    assert.equal(outputAction(policy.algorithm, output), reference.actions[i]);
  });
});

test("observation has training order, normalization, dock and blocked features", () => {
  const state = createSimulation().state;
  const observation = normalizedObservation({ ...state, battery: 100 });
  assert.equal(observation.length, 14);
  assert.equal(observation[0], Math.fround(2 * Math.fround(1 / 7) - 1));
  assert.equal(observation[2], 1);
  assert.equal(observation[3], Math.fround(2 * Math.fround(1 / 5) - 1));
  assert.equal(observation[4], -1); // north of top row is blocked
  assert.equal(observation[7], -1); // west of first column is blocked
  assert.deepEqual(observation.slice(-2), [0, 0]);
});

test("browser observation normalization matches Python on 32 gym states", () => {
  for (const sample of fixtures.raw_cases) assert.deepEqual(normalizedObservation(sample.state), sample.observation);
});

test("benchmark starts five independent grids from an identical map and advances in lockstep", () => {
  const benchmark = createBenchmark({ ...JOURNAL_CONFIG, max_steps: 3 }, 42, policies);
  const initial = benchmark.snapshot();
  assert.equal(initial.length, 5);
  initial.forEach((run) => assert.deepEqual(run.state, initial[0].state));
  assert.notEqual(initial[0].state.grid, initial[1].state.grid);
  for (let i = 1; i <= 3; i++) benchmark.step().forEach((run) => assert.equal(run.state.step_count, i));
  assert.equal(benchmark.finished, true);
  benchmark.step().forEach((run) => assert.equal(run.state.step_count, 3));
});

test("environment noise is independent of the selected action and movement outcomes", () => {
  const config = { ...JOURNAL_CONFIG, dirt_dynamics: { rho0: .5, rho1: .5, rho2: .5, rho3: 0 } };
  const a = createSimulation(config, 42), b = createSimulation(config, 42);
  for (let i = 0; i < 20; i++) assert.deepEqual(a.step("E").grid, b.step("Stay").grid);
});
