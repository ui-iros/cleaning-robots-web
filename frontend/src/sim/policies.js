import { ACTIONS } from "./localSimulation.js";

export const ALGORITHMS = ["dqn", "ppo", "trpo", "a2c", "sac"];
const loaded = new Map();

export function validatePolicy(policy, algorithm) {
  if (policy.format !== 1 || policy.algorithm !== algorithm || policy.observation_size !== 14 || policy.action_count !== 7 || !Array.isArray(policy.layers)) throw new Error(`Invalid ${algorithm.toUpperCase()} policy export.`);
  if (JSON.stringify(policy.actions) !== JSON.stringify(Object.keys(ACTIONS))) throw new Error("Policy action order does not match the environment.");
  let width = 14;
  for (const layer of policy.layers) {
    if (layer.type === "linear") {
      if (!Array.isArray(layer.weight) || !layer.weight.length || !Array.isArray(layer.bias) || layer.bias.length !== layer.weight.length || !layer.bias.every(Number.isFinite) || !layer.weight.every((row) => Array.isArray(row) && row.length === width && row.every(Number.isFinite))) throw new Error("Invalid policy layer dimensions.");
      width = layer.bias.length;
    } else if (!["relu", "tanh"].includes(layer.type)) throw new Error("Unsupported policy activation.");
  }
  if (width !== (algorithm === "sac" ? 1 : 7)) throw new Error("Invalid policy output size.");
  return policy;
}

export function loadPolicy(algorithm) {
  if (!ALGORITHMS.includes(algorithm)) return Promise.reject(new Error("Unknown algorithm."));
  if (!loaded.has(algorithm)) {
    const pending = fetch(`${import.meta.env.BASE_URL}policies/${algorithm}.json`).then(async (response) => {
      if (!response.ok) throw new Error(`Cannot load ${algorithm.toUpperCase()} policy (HTTP ${response.status}).`);
      return validatePolicy(await response.json(), algorithm);
    }).catch((error) => { loaded.delete(algorithm); throw error; });
    loaded.set(algorithm, pending);
  }
  return loaded.get(algorithm);
}

export function normalizedObservation(state) {
  const rows = state.grid.length, cols = state.grid[0].length, [row, col] = state.robot_pos;
  const blocked = new Set(state.obstacles.map((cell) => cell.join()));
  const offsets = [[0, 0], [-1, 0], [0, 1], [1, 0], [0, -1], [-1, -1], [-1, 1], [1, 1], [1, -1]];
  const local = offsets.map(([dr, dc]) => {
    const r = row + dr, c = col + dc;
    if (r < 1 || r > rows || c < 1 || c > cols || blocked.has([r, c].join())) return 0;
    if (r === state.dock[0] && c === state.dock[1]) return 1;
    return 2 + state.grid[r - 1][c - 1];
  });
  const distance = (delta, span) => Math.sign(delta) * Math.ceil(3 * Math.abs(delta) / span);
  const values = [row, col, state.battery, ...local, distance(state.dock[0] - row, rows - 1), distance(state.dock[1] - col, cols - 1)];
  const low = [...Array(12).fill(0), -3, -3], high = [rows, cols, state.battery_capacity, ...Array(9).fill(5), 3, 3];
  // Match the float32 observation wrapper used to train all five checkpoints.
  return values.map((v, i) => Math.fround(Math.max(-1, Math.min(1, Math.fround(2 * Math.fround(Math.fround(v - low[i]) / (high[i] - low[i]))) - 1))));
}

export function forward(policy, observation) {
  if (observation.length !== 14 || !observation.every(Number.isFinite)) throw new Error("Expected 14 finite observation features.");
  let values = observation;
  for (const layer of policy.layers) {
    if (layer.type === "linear") values = layer.weight.map((row, i) => {
      let value = layer.bias[i];
      for (let j = 0; j < row.length; j++) value += row[j] * values[j];
      return Math.fround(value);
    });
    else if (layer.type === "relu") values = values.map((n) => Math.max(0, n));
    else if (layer.type === "tanh") values = values.map((n) => Math.fround(Math.tanh(n)));
    else throw new Error("Unsupported policy activation.");
  }
  return values;
}

export function outputAction(algorithm, output) {
  if (algorithm === "sac") {
    const scaled = Math.fround(Math.fround(Math.max(-1, Math.min(1, output[0])) + 1) * 3);
    const lower = Math.floor(scaled), fraction = scaled - lower;
    // NumPy rint uses round-to-even, unlike JavaScript's Math.round.
    return fraction === 0.5 ? lower + lower % 2 : Math.round(scaled);
  }
  return output.reduce((best, value, i) => value > output[best] ? i : best, 0);
}

export function policyAction(policy, state) {
  return Object.keys(ACTIONS)[outputAction(policy.algorithm, forward(policy, normalizedObservation(state)))];
}
