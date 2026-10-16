import { test } from "node:test";
import assert from "node:assert/strict";
import { JOURNAL_CONFIG, createSimulation, normalizeConfig, validateLayout } from "../src/sim/localSimulation.js";

const staticConfig = { ...JOURNAL_CONFIG, p_move: 1, dirt_dynamics: { rho0: 0, rho1: 0, rho2: 0, rho3: 0 }, initial_dirt_probs: { q0: 0, q1: 1, q2: 0, q3: 0 } };

test("reset and random policy reproduce the same browser run for a seed", () => {
  const a = createSimulation({}, 42), b = createSimulation({}, 42);
  assert.deepEqual(a.state, b.state);
  for (let i = 0; i < 100; i++) assert.deepEqual(a.step(), b.step());
});

test("manual movement, cleaning and dock charging follow the gym rules", () => {
  const sim = createSimulation(staticConfig);
  sim.step("Charge");
  const before = sim.state.battery;
  assert.equal(sim.step("E").battery, before - 1);
  assert.deepEqual(sim.state.robot_pos, [1, 2]);
  assert.equal(sim.state.grid[0][1], 1);
  assert.equal(sim.step("Clean").grid[0][1], 0);
  assert.equal(sim.state.reward, 27);
  assert.equal(sim.state.battery, before - 3);
  assert.equal(sim.step("Charge").reward, -12);
  assert.equal(sim.state.battery, before - 3);
  sim.step("W");
  const atDock = sim.state.battery;
  sim.step("Charge");
  assert.equal(sim.state.battery, Math.min(atDock + 5, 100));
});

test("bumping leaves position unchanged and returns the gym bump cost", () => {
  const sim = createSimulation(staticConfig);
  assert.deepEqual(sim.step("N").robot_pos, [1, 1]);
  assert.equal(sim.state.reward, -7);
  assert.equal(sim.state.render.move_case, "bump");
  assert.deepEqual(sim.state.render.collision_pos, [0, 1]);
});

test("depletion away from dock resets position and applies the penalty", () => {
  const sim = createSimulation({ ...staticConfig, battery_capacity: 2 });
  sim.step("Charge");
  sim.step("E");
  sim.step("E");
  assert.deepEqual(sim.state.robot_pos, sim.state.dock);
  assert.equal(sim.state.battery, 0);
  assert.equal(sim.state.render.manual_reset, true);
  assert.equal(sim.state.reward, -602);
  assert.deepEqual(sim.state.render.boom_pos, [1, 3]);
});

test("spontaneous dirt grows one level and never affects dock or obstacles", () => {
  const sim = createSimulation({ ...JOURNAL_CONFIG, initial_dirt_probs: { q0: 1, q1: 0, q2: 0, q3: 0 }, dirt_dynamics: { rho0: 1, rho1: 1, rho2: 1, rho3: 0 } });
  for (let i = 1; i <= 3; i++) {
    sim.step("Stay"); assert.equal(sim.state.grid[0][1], i); assert.equal(sim.state.grid[0][0], 0); assert.equal(sim.state.grid[1][3], 0);
  }
  sim.step("Stay"); assert.equal(sim.state.grid[0][1], 3);
});

test("horizon stops further steps", () => {
  const sim = createSimulation({ ...staticConfig, max_steps: 2 });
  sim.step("Stay"); const final = sim.step("Stay");
  assert.equal(final.truncated, true); assert.equal(sim.step(), final);
});

test("random layouts are repeatable, connected and preserve exact obstacle count", () => {
  for (const size of [2, 7, 20]) for (const count of [0, Math.floor(size * size / 2), size * size - 1]) {
    const config = { grid_rows: size, grid_cols: size, obstacle: { mode: "random", count } };
    const a = createSimulation(config, 42), b = createSimulation(config, 42);
    assert.equal(a.state.obstacles.length, count);
    assert.deepEqual(a.state, b.state);
    validateLayout(size, size, a.state.dock, a.state.obstacles);
  }
});

test("invalid custom maps and malformed imported configs are rejected", () => {
  assert.throws(() => validateLayout(3, 3, [1, 1], [[1, 2], [2, 1]]), /reachable/);
  assert.throws(() => validateLayout(3, 3, [1, 1], [[1, 1]]), /overlap/);
  assert.throws(() => validateLayout(3, 3, [1, 1], [[2, 2], [2, 2]]), /unique/);
  assert.throws(() => createSimulation({ grid_rows: 21 }), /Rows/);
  assert.throws(() => createSimulation({}, -1), /Seed/);
  assert.throws(() => normalizeConfig({ p_move: 1.1 }), /probabilities/);
  assert.throws(() => normalizeConfig({ initial_dirt_probs: { q0: .9 } }), /sum/);
  assert.throws(() => normalizeConfig({ obstacle: null }), /object/);
  assert.throws(() => createSimulation({ obstacle: { mode: "random", count: 49 } }), /Obstacles/);
});

test("Tkinter export config preserves parameters on import", () => {
  const input = { ...staticConfig, grid_rows: 4, grid_cols: 5, dock_position: [2, 2], obstacle: { mode: "fixed", count: 1, positions: [[4, 5]] }, rewards: { ...JOURNAL_CONFIG.rewards, alpha_1: 50 } };
  const sim = createSimulation(input, 123);
  const imported = JSON.parse(JSON.stringify({ environment: "CleaningRobots-v0", seed: 123, config: sim.config }));
  assert.deepEqual(createSimulation(imported.config, imported.seed).state, sim.state);
  assert.equal(sim.config.rewards.alpha_1, 50);
});
