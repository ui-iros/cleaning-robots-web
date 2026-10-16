// Browser implementation of cleaning-robots-gym's CleaningRobots-v0 rules.
// Seeded runs are repeatable here; this PRNG is independent of NumPy's PRNG.
export const ACTIONS = { N: "North", S: "South", E: "East", W: "West", Stay: "Stay", Clean: "Clean", Charge: "Charge" };
export const JOURNAL_CONFIG = {
  grid_rows: 7, grid_cols: 7, battery_capacity: 100, charge_amount: 5, max_steps: 500,
  dock_position: [1, 1], obstacle: { mode: "fixed", count: 5, positions: [[2, 4], [3, 6], [4, 2], [5, 5], [6, 3]] },
  p_move: 0.9, dirt_dynamics: { rho0: 0.003, rho1: 0.002, rho2: 0.001, rho3: 0 }, random_seed: 12345,
  initial_dirt_probs: { q0: 0.7, q1: 0.2, q2: 0.08, q3: 0.02 },
  rewards: { step_cost: 1, move_cost: 1, slip_penalty: 2, bump_penalty: 5, idle_penalty: 2,
    clean_cost: 2, waste_penalty: 4, dock_clean_penalty: 8, charge_cost: 1, full_charge_penalty: 5,
    away_charge_penalty: 10, alpha_1: 30, alpha_2: 40, alpha_3: 50, alpha_charge: 0.8,
    lambda_return: 2, low_battery_threshold: 25, reset_penalty: 600 },
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const key = (cell) => cell.join(",");
const same = (a, b) => key(a) === key(b);
const inside = ([r, c], rows, cols) => r >= 1 && r <= rows && c >= 1 && c <= cols;
const neighbors = ([r, c], rows, cols) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter((p) => inside(p, rows, cols));

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer between ${min} and ${max}.`);
}

export function validateLayout(rows, cols, dock, obstacles) {
  integer(rows, 2, 20, "Rows");
  integer(cols, 2, 20, "Columns");
  const valid = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger) && inside(p, rows, cols);
  if (!valid(dock) || !Array.isArray(obstacles) || !obstacles.every(valid)) throw new Error("Dock and obstacle coordinates must be inside the grid.");
  const blocked = new Set(obstacles.map(key));
  if (blocked.size !== obstacles.length) throw new Error("Obstacle positions must be unique.");
  if (blocked.has(key(dock))) throw new Error("An obstacle cannot overlap the dock.");
  const reached = new Set([key(dock)]), pending = [dock];
  while (pending.length) {
    for (const p of neighbors(pending.pop(), rows, cols)) {
      if (!blocked.has(key(p)) && !reached.has(key(p))) { reached.add(key(p)); pending.push(p); }
    }
  }
  if (reached.size !== rows * cols - blocked.size) throw new Error("Every free cell must be reachable from the dock.");
}

function randomLayout(rows, cols, dock, count, random) {
  integer(count, 0, rows * cols - 1, "Obstacles");
  // Grow a connected free region, including for dense maps.
  const free = new Set([key(dock)]), frontier = new Map(neighbors(dock, rows, cols).map((p) => [key(p), p]));
  while (free.size < rows * cols - count) {
    const choices = [...frontier.values()];
    const p = choices[Math.floor(random() * choices.length)];
    frontier.delete(key(p)); free.add(key(p));
    for (const next of neighbors(p, rows, cols)) if (!free.has(key(next))) frontier.set(key(next), next);
  }
  const obstacles = [];
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) if (!free.has(`${r},${c}`)) obstacles.push([r, c]);
  return obstacles;
}

export function normalizeConfig(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Config must be a JSON object.");
  const config = { ...clone(JOURNAL_CONFIG), ...clone(input) };
  for (const name of ["obstacle", "dirt_dynamics", "initial_dirt_probs", "rewards"]) {
    if (input[name] !== undefined && (!input[name] || typeof input[name] !== "object" || Array.isArray(input[name]))) throw new Error(`${name} must be an object.`);
    config[name] = { ...JOURNAL_CONFIG[name], ...input[name] };
  }
  integer(config.grid_rows, 2, 20, "Rows"); integer(config.grid_cols, 2, 20, "Columns");
  integer(config.battery_capacity, 1, 100000, "Battery capacity"); integer(config.charge_amount, 1, 100000, "Charge amount");
  integer(config.max_steps, 1, 1000000, "Max steps");
  if (!["fixed", "random"].includes(config.obstacle.mode)) throw new Error("Obstacle mode must be fixed or random.");
  if (config.obstacle.mode === "fixed") validateLayout(config.grid_rows, config.grid_cols, config.dock_position, config.obstacle.positions);
  else {
    validateLayout(config.grid_rows, config.grid_cols, config.dock_position, []);
    integer(config.obstacle.count, 0, config.grid_rows * config.grid_cols - 1, "Obstacles");
  }
  const probability = (n) => Number.isFinite(n) && n >= 0 && n <= 1;
  if (!probability(config.p_move) || ![0, 1, 2, 3].every((i) => probability(config.dirt_dynamics[`rho${i}`]))) throw new Error("Move and dirt probabilities must be between 0 and 1.");
  if (config.dirt_dynamics.rho3 !== 0) throw new Error("rho3 must be zero (sticky dirt is the highest level).");
  const probs = [0, 1, 2, 3].map((i) => config.initial_dirt_probs[`q${i}`]);
  if (!probs.every(probability) || Math.abs(probs.reduce((a, b) => a + b, 0) - 1) > 1e-8) throw new Error("Initial dirt probabilities must sum to 1.");
  for (const [name, value] of Object.entries(config.rewards)) if (!Number.isFinite(value)) throw new Error(`Invalid reward: ${name}.`);
  return config;
}

export function createSimulation(input = {}, seed = 12345) {
  integer(seed, 0, 4294967295, "Seed");
  const config = normalizeConfig(input), random = seededRandom(seed), policyRandom = seededRandom(seed ^ 0x9E3779B9);
  const dirtRandom = seededRandom(seed ^ 0x85EBCA6B), moveRandom = seededRandom(seed ^ 0xC2B2AE35);
  const rows = config.grid_rows, cols = config.grid_cols, dock = [...config.dock_position];
  const obstacles = config.obstacle.mode === "random" ? randomLayout(rows, cols, dock, config.obstacle.count, random) : clone(config.obstacle.positions);
  const blocked = new Set(obstacles.map(key));
  const battery = Math.floor(random() * (config.battery_capacity + 1));
  const probs = [0, 1, 2, 3].map((i) => config.initial_dirt_probs[`q${i}`]);
  const grid = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    if (same([r + 1, c + 1], dock) || blocked.has(`${r + 1},${c + 1}`)) return 0;
    let p = random();
    for (let level = 0; level < 4; level++) { p -= probs[level]; if (p < 0) return level; }
    return 3;
  }));
  const dynamic = [0, 1, 2].some((i) => config.dirt_dynamics[`rho${i}`] > 0);
  let state = { grid, robot_pos: dock, dock, obstacles, battery, battery_capacity: config.battery_capacity,
    step_count: 0, reward: 0, episode_return: 0, action: null, terminated: false, truncated: false,
    render: { dynamic_dirt: dynamic, max_steps: config.max_steps } };

  return {
    config, seed,
    get state() { return state; },
    step(choice = "Policy") {
      if (state.truncated) return state;
      const action = choice === "Policy" ? Object.keys(ACTIONS)[Math.floor(policyRandom() * 7)] : choice;
      if (!(action in ACTIONS)) throw new Error("Unknown action.");
      const previous = state, r = config.rewards, pos = previous.robot_pos;
      let next = [...pos], reward = -r.step_cost, battery = previous.battery, moveCase = "none", collision = null;
      const grid = previous.grid.map((row) => [...row]);
      const atDock = same(pos, dock), level = grid[pos[0] - 1][pos[1] - 1];
      const deltas = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
      const moveRoll = moveRandom();
      if (action === "Charge") battery = atDock ? Math.min(battery + config.charge_amount, config.battery_capacity) : battery;
      else battery = Math.max(0, battery - (action === "Clean" ? 2 : 1));
      if (action === "Clean" && !atDock) grid[pos[0] - 1][pos[1] - 1] = Math.max(0, level - 1);
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const roll = dirtRandom();
        if (same([row + 1, col + 1], dock) || blocked.has(`${row + 1},${col + 1}`)) continue;
        const dirt = grid[row][col];
        if (dirt < 3 && roll < config.dirt_dynamics[`rho${dirt}`]) grid[row][col]++;
      }
      if (deltas[action]) {
        const [dr, dc] = deltas[action], target = [pos[0] + dr, pos[1] + dc];
        reward -= r.move_cost;
        if (!inside(target, rows, cols) || blocked.has(key(target))) { moveCase = "bump"; collision = target; reward -= r.bump_penalty; }
        else if (moveRoll < config.p_move) { next = target; moveCase = "success"; }
        else { moveCase = "slip"; reward -= r.slip_penalty; }
      } else if (action === "Stay") reward -= r.idle_penalty;
      else if (action === "Clean") reward += atDock ? -r.clean_cost - r.dock_clean_penalty : level > 0 ? r[`alpha_${level}`] - r.clean_cost : -r.clean_cost - r.waste_penalty;
      else if (action === "Charge") reward += !atDock ? -r.charge_cost - r.away_charge_penalty : previous.battery >= config.battery_capacity ? -r.charge_cost - r.full_charge_penalty : r.alpha_charge * (battery - previous.battery) - r.charge_cost;
      const manualReset = battery === 0 && !same(next, dock), boom = manualReset ? next : null;
      if (manualReset) { next = [...dock]; reward -= r.reset_penalty; }
      else if (previous.battery <= r.low_battery_threshold) {
        const distance = (p) => Math.ceil(3 * Math.abs(p[0] - dock[0]) / (rows - 1)) + Math.ceil(3 * Math.abs(p[1] - dock[1]) / (cols - 1));
        reward += r.lambda_return * (distance(pos) - distance(next));
      }
      state = { ...previous, grid, robot_pos: next, battery, reward, episode_return: previous.episode_return + reward,
        step_count: previous.step_count + 1, action, truncated: previous.step_count + 1 >= config.max_steps,
        render: { ...previous.render, previous_robot_pos: pos, move_case: moveCase, collision_pos: collision, boom_pos: boom, manual_reset: manualReset } };
      return state;
    },
  };
}
