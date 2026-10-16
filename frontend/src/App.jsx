import React, { useEffect, useRef, useState } from "react";
import SimBoard, { BoardLegend } from "./components/SimBoard.jsx";
import { ACTIONS, JOURNAL_CONFIG, createSimulation, normalizeConfig, validateLayout } from "./sim/localSimulation.js";
import { saveFrame } from "./sim/saveFrame.js";
import { ALGORITHMS, loadPolicy, policyAction } from "./sim/policies.js";
import BenchmarkView from "./components/BenchmarkView.jsx";
import "./viewer.css";

const MODES = ["Journal benchmark", "Random layout", "Custom layout"];
const copy = (value) => JSON.parse(JSON.stringify(value));

function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function LayoutEditor({ config, onApply, onClose }) {
  const dialog = useRef(null);
  const [dock, setDock] = useState(config.dock_position);
  const [obstacles, setObstacles] = useState(config.obstacle.positions.filter(([r, c]) => r <= config.grid_rows && c <= config.grid_cols && [r, c].join() !== config.dock_position.join()));
  const [tool, setTool] = useState("Obstacle");
  const [error, setError] = useState("");
  useEffect(() => { dialog.current.showModal(); }, []);
  const same = (a, b) => a.join() === b.join();
  function edit(cell) {
    setError("");
    if (tool === "Dock") { setDock(cell); setObstacles((prev) => prev.filter((p) => !same(p, cell))); }
    else if (!same(cell, dock)) setObstacles((prev) => tool === "Erase" || prev.some((p) => same(p, cell)) ? prev.filter((p) => !same(p, cell)) : [...prev, cell]);
  }
  function apply() {
    try { validateLayout(config.grid_rows, config.grid_cols, dock, obstacles); onApply(dock, obstacles); }
    catch (err) { setError(err.message); }
  }
  return <dialog ref={dialog} className="layout-dialog" aria-labelledby="editor-title" onCancel={onClose}>
    <h2 id="editor-title">Custom layout</h2>
    <div className="editor-tools" role="group" aria-label="Layout tools">
      {["Obstacle", "Dock", "Erase"].map((name) => <button key={name} aria-pressed={tool === name} onClick={() => setTool(name)}>{name}</button>)}
      <button className="push-right" onClick={() => setObstacles([])}>Clear</button>
    </div>
    <p className="editor-help">Click cells to place or remove obstacles. All free cells must connect to the dock.</p>
    <div className="editor-grid" style={{ gridTemplateColumns: `repeat(${config.grid_cols}, minmax(20px, 1fr))` }}>
      {Array.from({ length: config.grid_rows * config.grid_cols }, (_, i) => {
        const cell = [Math.floor(i / config.grid_cols) + 1, i % config.grid_cols + 1];
        const isDock = same(cell, dock), blocked = obstacles.some((p) => same(p, cell));
        return <button key={i} className={isDock ? "dock-cell" : blocked ? "obstacle-cell" : ""} aria-label={`Row ${cell[0]}, column ${cell[1]}${isDock ? ", dock" : blocked ? ", obstacle" : ", free"}`} onClick={() => edit(cell)}>{isDock ? "D" : blocked ? "×" : ""}</button>;
      })}
    </div>
    {error && <p className="viewer-error" role="alert">{error}</p>}
    <div className="editor-footer"><span>{config.grid_rows} × {config.grid_cols} · {obstacles.length} obstacles</span><button className="push-right" onClick={onClose}>Cancel</button><button onClick={apply}>Apply & reset</button></div>
  </dialog>;
}

export default function App() {
  const [simulation, setSimulation] = useState(() => createSimulation());
  const [state, setState] = useState(simulation.state);
  const [config, setConfig] = useState(() => copy(JOURNAL_CONFIG));
  const [mode, setMode] = useState(MODES[0]);
  const [appliedMode, setAppliedMode] = useState(MODES[0]);
  const [seed, setSeed] = useState(12345);
  const [action, setAction] = useState("Policy");
  const [algorithm, setAlgorithm] = useState("ppo");
  const [policy, setPolicy] = useState(null);
  const [policyError, setPolicyError] = useState("");
  const [policyAttempt, setPolicyAttempt] = useState(0);
  const [view, setView] = useState("single");
  const [speed, setSpeed] = useState(2);
  const [playing, setPlaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const file = useRef(null);

  useEffect(() => {
    let canceled = false;
    setPlaying(false); setPolicy(null); setPolicyError("");
    if (algorithm !== "random") loadPolicy(algorithm).then((next) => { if (!canceled) setPolicy(next); }).catch((err) => { if (!canceled) setPolicyError(err.message); });
    return () => { canceled = true; };
  }, [algorithm, policyAttempt]);
  const policyReady = algorithm === "random" || policy?.algorithm === algorithm;
  const controller = action === "Policy" ? algorithm === "random" ? "Random policy" : `${algorithm.toUpperCase()} policy` : `Manual: ${ACTIONS[action]}`;

  useEffect(() => {
    if (!playing || state.truncated || view !== "single" || (action === "Policy" && !policyReady)) return undefined;
    const timer = setInterval(() => {
      const next = simulation.step(action === "Policy" && algorithm !== "random" ? policyAction(policy, simulation.state) : action); setState(next);
      if (next.truncated) setPlaying(false);
    }, 1000 / speed);
    return () => clearInterval(timer);
  }, [playing, speed, simulation, action, state.truncated, algorithm, policy, policyReady, view]);

  const update = (name, value) => setConfig((prev) => ({ ...prev, [name]: value }));
  function replace(nextConfig, nextMode, nextSeed = seed) {
    const next = createSimulation(nextConfig, nextSeed);
    setPlaying(false); setSimulation(next); setState(next.state); setAppliedMode(nextMode);
    setMode(nextMode); setConfig(copy(next.config)); setSeed(nextSeed); setError("");
  }
  function apply() {
    setPlaying(false);
    try {
      if (mode === MODES[0]) replace(JOURNAL_CONFIG, mode);
      else replace({ ...config, obstacle: { ...config.obstacle, mode: mode === MODES[1] ? "random" : "fixed", count: mode === MODES[2] ? config.obstacle.positions.length : config.obstacle.count } }, mode);
    } catch (err) { setError(err.message); }
  }
  function reset() { setPlaying(false); replace(simulation.config, appliedMode, simulation.seed); }
  function step() { setPlaying(false); setState(simulation.step(action === "Policy" && algorithm !== "random" ? policyAction(policy, simulation.state) : action)); }
  function selectAlgorithm(next) {
    setPlaying(false); setAlgorithm(next); setAction("Policy");
    replace(simulation.config, appliedMode, simulation.seed);
  }
  function openEditor() {
    setPlaying(false);
    try {
      const dock = config.dock_position;
      validateLayout(config.grid_rows, config.grid_cols, dock[0] <= config.grid_rows && dock[1] <= config.grid_cols ? dock : [1, 1], []);
      setEditing(true); setError("");
    } catch (err) { setError(err.message); }
  }
  function saveConfig() {
    download(JSON.stringify({ environment: "CleaningRobots-v0", mode: appliedMode, seed: simulation.seed, config: simulation.config }, null, 2) + "\n", "cleaning-robots-config.json", "application/json");
  }
  async function loadConfig(event) {
    setPlaying(false);
    const selected = event.target.files[0]; event.target.value = "";
    if (!selected) return;
    try {
      if (selected.size > 1000000) throw new Error("Configuration file is too large (maximum 1 MB).");
      const data = JSON.parse(await selected.text());
      if (data?.environment !== "CleaningRobots-v0" || !data.config) throw new Error("Expected a CleaningRobots-v0 configuration export.");
      if (!Number.isInteger(data.seed)) throw new Error("Configuration seed must be an integer.");
      const loaded = normalizeConfig(data.config);
      const loadedMode = loaded.obstacle.mode === "random" ? MODES[1] : JSON.stringify(loaded) === JSON.stringify(JOURNAL_CONFIG) ? MODES[0] : MODES[2];
      replace(loaded, loadedMode, data.seed);
    } catch (err) { setError(err.message); }
  }
  const dirtyCells = state.grid.flat().filter((n) => n > 0).length;
  const dirt = state.grid.flat().reduce((a, b) => a + b, 0);
  const batteryRatio = state.battery / state.battery_capacity;
  const atDock = state.robot_pos.join() === state.dock.join();
  const status = state.render.manual_reset ? "RESET" : state.render.move_case === "bump" ? "BUMP" : state.truncated ? "HORIZON" : state.action ? "ACTIVE" : "READY";
  const cards = [
    ["Last Action", ACTIONS[state.action] || "Reset", status === "BUMP" ? "red" : "blue"], ["Position (row, col)", state.robot_pos.join(", "), ""],
    ["Dirty cells", dirtyCells, "orange"], ["Total dirt level", dirt, "orange"],
    ["Last Reward", state.reward.toFixed(1), state.reward < 0 ? "red" : "green"], ["Step", `${state.step_count}/${state.render.max_steps}`, ""],
    ["Episode Return", state.episode_return.toFixed(1), "blue"],
  ];
  const numericInput = (label, value, change, min, max, disabled = false, step = 1) => <label className="viewer-field">{label}<input aria-label={label} type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(e) => change(e.target.value === "" ? "" : Number(e.target.value))} /></label>;

  return <main className={`tk-viewer ${view === "multi" ? "is-benchmark" : "is-single"}`}>
    <nav className="viewer-modes" aria-label="Viewer mode"><button aria-pressed={view === "single"} onClick={() => { setPlaying(false); setView("single"); }}>Single grid</button><button aria-pressed={view === "multi"} onClick={() => { setPlaying(false); setView("multi"); }}>Multi-grid benchmark</button></nav>
    <header className="viewer-toolbar">
      <div className="toolbar-row">
        <label className="layout-label">Layout <select aria-label="Layout" value={mode} onChange={(e) => { setMode(e.target.value); setPlaying(false); }}>{MODES.map((name) => <option key={name}>{name}</option>)}</select></label>
        <button disabled={mode !== MODES[2]} onClick={openEditor}>Edit layout</button><button onClick={apply}>Apply & reset</button>
        <div className="toolbar-spacer" /><button onClick={() => file.current.click()}>Load config</button><button onClick={saveConfig}>Save config</button>
        <input ref={file} type="file" accept=".json,application/json" aria-label="Load configuration file" hidden onChange={loadConfig} />
      </div>
      <div className="toolbar-row settings-row">
        {numericInput("Rows", config.grid_rows, (v) => update("grid_rows", v), 2, 20, mode === MODES[0])}
        {numericInput("Columns", config.grid_cols, (v) => update("grid_cols", v), 2, 20, mode === MODES[0])}
        {numericInput("Obstacles", mode === MODES[2] ? config.obstacle.positions.length : config.obstacle.count, (v) => update("obstacle", { ...config.obstacle, count: v }), 0, 399, mode !== MODES[1])}
        {numericInput("Seed", seed, setSeed, 0, 4294967295)}<span className="settings-hint">Changes take effect with Apply & reset.</span>
      </div>
      <details className="advanced-settings"><summary>Environment settings</summary><div className="toolbar-row">
        {numericInput("Battery capacity", config.battery_capacity, (v) => update("battery_capacity", v), 1, 100000, mode === MODES[0])}
        {numericInput("Charge amount", config.charge_amount, (v) => update("charge_amount", v), 1, 100000, mode === MODES[0])}
        {numericInput("Max steps", config.max_steps, (v) => update("max_steps", v), 1, 1000000, mode === MODES[0])}
        {numericInput("Move probability", config.p_move, (v) => update("p_move", v), 0, 1, mode === MODES[0], 0.01)}
        {[0, 1, 2].map((i) => <React.Fragment key={i}>{numericInput(`Dirt rate ρ${i}`, config.dirt_dynamics[`rho${i}`], (v) => update("dirt_dynamics", { ...config.dirt_dynamics, [`rho${i}`]: v }), 0, 1, mode === MODES[0], 0.001)}</React.Fragment>)}
      </div></details>
      {view === "single" && <div className="toolbar-row playback-row">
        <label className="algorithm-label">Algorithm<select aria-label="Algorithm" value={algorithm} onChange={(e) => selectAlgorithm(e.target.value)}>{ALGORITHMS.map((name) => <option key={name} value={name}>{name.toUpperCase()}</option>)}<option value="random">Random</option></select></label>
        <strong className="policy-source">{controller}</strong>
        <select aria-label="Action" value={action} onChange={(e) => { setAction(e.target.value); setPlaying(false); }}><option value="Policy">Policy</option>{Object.entries(ACTIONS).map(([name, label]) => <option key={name} value={name}>{label}</option>)}</select>
        <button onClick={reset}>Reset</button><button disabled={state.truncated || (action === "Policy" && !policyReady)} onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button><button disabled={state.truncated || (action === "Policy" && !policyReady)} onClick={step}>Step</button>
        <div className="toolbar-spacer" /><button onClick={() => saveFrame(state, appliedMode, controller)}>Save PNG</button>
      </div>}
      <label className="speed-row">Speed<input aria-label="Speed" type="range" min="0.5" max="8" step="0.5" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /><output>{speed.toFixed(1)} steps/s</output></label>
    </header>
    {error && <div className="viewer-error" role="alert">{error}</div>}
    {view === "single" && !policyReady && !policyError && <p className="policy-loading" role="status">Loading {algorithm.toUpperCase()} policy…</p>}
    {view === "single" && policyError && <p className="viewer-error" role="alert">{policyError} <button onClick={() => setPolicyAttempt((n) => n + 1)}>Retry policy</button></p>}
    {view === "multi" ? <BenchmarkView config={simulation.config} seed={simulation.seed} speed={speed} layout={appliedMode} paused={editing} /> : <section className="viewer-stage" aria-label="Cleaning robot simulator">
      <div className="map-heading"><h1>CleaningRobots-v0</h1><div><strong>Full map</strong><span className="dirt-pill">{state.render.dynamic_dirt ? "DYNAMIC DIRT" : "STATIC DIRT"}</span></div><p>{appliedMode}</p></div>
      <div className="viewer-map">
        <SimBoard state={state} style={{ aspectRatio: `${state.grid[0].length * 76 + 48} / ${state.grid.length * 76 + 48}` }} showLegend={false} stepIntervalMs={1000 / speed} className="tk-board" canvasClassName="tk-canvas" ariaLabel="Full map with robot, dock, dirt and obstacles" />
        <div className="observation-key"><span className="dashed-key" /><div><strong>Local observation (3 × 3)</strong><p>Robot cell + 8 neighbors</p><p>Outside-grid neighbors: blocked</p></div></div>
      </div>
      <aside className="run-panel" aria-label="Run status">
        <div className="panel-heading"><h2>Run Status</h2><span className={`status-pill ${["RESET", "BUMP"].includes(status) ? "is-danger" : ""}`}>{status}</span></div>
        <div className={`battery-panel ${batteryRatio <= 0.25 ? "is-low" : ""}`}><div><span>Battery</span><strong>{state.battery}/{state.battery_capacity}</strong></div><progress aria-label="Battery level" value={state.battery} max={state.battery_capacity} /></div>
        <dl className="status-cards">{cards.map(([label, value, color]) => <div className={`status-card ${label === "Episode Return" ? "wide-card" : ""}`} key={label}><dt>{label}</dt><dd className={color}>{value}</dd></div>)}</dl>
        <h2 className="map-key-heading">Map Key</h2><BoardLegend iconSize={38} />
        <div className="controller-status"><span>Controller</span><strong>{controller}</strong>{algorithm !== "random" && action === "Policy" && <small>Trained checkpoint · seed 12345</small>}<p className={batteryRatio <= 0.25 ? "red" : "green"}>{batteryRatio <= 0.25 ? "Low battery" : atDock ? "At charging dock" : "Away from dock"}</p></div>
      </aside>
    </section>}
    <footer className="viewer-footer">Runs in your browser · Trained policies & manual control · <a href="https://github.com/ui-iros/cleaning-robots-gym">cleaning-robots-gym</a></footer>
    {editing && <LayoutEditor config={{ ...config, dock_position: config.dock_position[0] <= config.grid_rows && config.dock_position[1] <= config.grid_cols ? config.dock_position : [1, 1] }} onClose={() => setEditing(false)} onApply={(dock, obstacles) => {
      try { replace({ ...config, dock_position: dock, obstacle: { mode: "fixed", count: obstacles.length, positions: obstacles } }, MODES[2]); setEditing(false); }
      catch (err) { setError(err.message); }
    }} />}
  </main>;
}
