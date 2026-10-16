import React, { useEffect, useRef, useState } from "react";
import SimBoard, { BoardLegend } from "./SimBoard.jsx";
import { ALGORITHMS, loadPolicy } from "../sim/policies.js";
import { createBenchmark } from "../sim/benchmark.js";
import { ACTIONS } from "../sim/localSimulation.js";

export default function BenchmarkView({ config, seed, speed, layout, paused }) {
  const [selected, setSelected] = useState(ALGORITHMS);
  const [benchmark, setBenchmark] = useState(null);
  const [runs, setRuns] = useState([]);
  const [running, setRunning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const policies = useRef([]);

  useEffect(() => { if (paused) setRunning(null); }, [paused]);

  useEffect(() => {
    let canceled = false;
    setRunning(null); setLoading(true); setError(""); setBenchmark(null); setRuns([]);
    Promise.all(selected.map(loadPolicy)).then((loaded) => {
      if (canceled) return;
      policies.current = loaded;
      const next = createBenchmark(config, seed, loaded);
      setBenchmark(next); setRuns(next.snapshot()); setLoading(false);
    }).catch((err) => { if (!canceled) { setError(err.message); setLoading(false); } });
    return () => { canceled = true; };
  }, [config, seed, selected, attempt]);

  useEffect(() => {
    if (!running || !benchmark || benchmark.finished) return undefined;
    let canceled = false, timer;
    function tick() {
      if (canceled) return;
      const count = running === "fast" ? 10 : 1;
      for (let i = 0; i < count && !benchmark.finished; i++) benchmark.step();
      setRuns(benchmark.snapshot());
      if (benchmark.finished) { setRunning(null); return; }
      timer = setTimeout(tick, running === "fast" ? 0 : 1000 / speed);
    }
    timer = setTimeout(tick, running === "fast" ? 0 : 1000 / speed);
    return () => { canceled = true; clearTimeout(timer); };
  }, [running, benchmark, speed]);

  function reset() {
    setRunning(null);
    const next = createBenchmark(config, seed, policies.current);
    setBenchmark(next); setRuns(next.snapshot());
  }
  function step() { setRunning(null); setRuns(benchmark.step()); }
  const disabled = loading || !!error || !runs.length || benchmark?.finished;
  const bestReturn = runs.length ? Math.max(...runs.map((run) => run.state.episode_return)) : 0;
  const stepCount = runs[0]?.state.step_count || 0;

  return <section className="benchmark-view" aria-label="Multi-grid benchmark">
    <div className="benchmark-heading"><h1>Multi-grid benchmark</h1><span className="dirt-pill">{benchmark?.finished && runs.length ? "COMPLETE" : running ? "RUNNING" : "READY"}</span></div>
    <p className="benchmark-description">{layout} · Environment seed {seed} · Same initial map, battery and environment noise for every policy. Checkpoint training seed: 12345.</p>
    <fieldset className="algorithm-checks"><legend>Algorithms</legend>{ALGORITHMS.map((name) => <label key={name}><input type="checkbox" checked={selected.includes(name)} onChange={() => { setRunning(null); setSelected((prev) => ALGORITHMS.filter((id) => id === name ? !prev.includes(id) : prev.includes(id))); }} />{name.toUpperCase()}</label>)}</fieldset>
    <div className="benchmark-controls">
      <button disabled={disabled} onClick={() => setRunning(running ? null : "play")}>{running ? "Pause benchmark" : "Play benchmark"}</button>
      <button disabled={disabled} onClick={step}>Step all</button>
      <button disabled={disabled} onClick={() => setRunning("fast")}>Run to horizon</button>
      <button disabled={loading || !!error || !runs.length} onClick={reset}>Reset benchmark</button>
      <span className="benchmark-progress" aria-live="polite">Step {stepCount}/{config.max_steps}</span>
    </div>
    {loading && <p role="status">Loading trained policies…</p>}
    {error && <p className="viewer-error" role="alert">{error} <button onClick={() => setAttempt((n) => n + 1)}>Retry policies</button></p>}
    {!selected.length && <p role="status">Select at least one algorithm.</p>}
    <div className="benchmark-grids">{runs.map(({ algorithm, state, resets, remainingDirt }) => <article className="benchmark-card" key={algorithm} aria-label={`${algorithm.toUpperCase()} benchmark grid`}>
      <header><h2>{algorithm.toUpperCase()}</h2><span className={`status-pill ${state.render.manual_reset ? "is-danger" : ""}`}>{state.truncated ? "HORIZON" : state.render.manual_reset ? "RESET" : state.action ? "ACTIVE" : "READY"}</span></header>
      <SimBoard state={state} showLegend={false} animate={running !== "fast"} showEffects={running !== "fast"} stepIntervalMs={1000 / speed} className="benchmark-board" canvasClassName="tk-canvas" ariaLabel={`${algorithm.toUpperCase()} map`} style={{ aspectRatio: `${state.grid[0].length * 76 + 48} / ${state.grid.length * 76 + 48}` }} />
      <dl className="benchmark-metrics"><div><dt>Return</dt><dd>{state.episode_return.toFixed(1)}</dd></div><div><dt>Dirt remaining</dt><dd>{remainingDirt}</dd></div><div><dt>Battery</dt><dd>{state.battery}/{state.battery_capacity}</dd></div></dl>
      <p className="benchmark-card-footer">{ACTIONS[state.action] || "Reset"} · Position {state.robot_pos.join(", ")} · Resets {resets}</p>
    </article>)}</div>
    {!!runs.length && <>
      <div className="benchmark-table-scroll"><table className="benchmark-table"><caption>Comparison for this seeded run</caption><thead><tr><th>Algorithm</th><th>Steps</th><th>Return</th><th>Dirt remaining</th><th>Dirty cells</th><th>Battery resets</th></tr></thead><tbody>{runs.map(({ algorithm, state, resets, remainingDirt }) => <tr key={algorithm}><th scope="row">{algorithm.toUpperCase()}{stepCount > 0 && state.episode_return === bestReturn && <span className="best-return"> Highest return</span>}</th><td>{state.step_count}</td><td>{state.episode_return.toFixed(1)}</td><td>{remainingDirt}</td><td>{state.grid.flat().filter((n) => n > 0).length}</td><td>{resets}</td></tr>)}</tbody></table></div>
      <p className="benchmark-note">This compares one episode per algorithm. Dynamic dirt can reappear; remaining dirt can exceed the starting amount.</p>
      <div className="benchmark-legend"><h2>Map Key</h2><BoardLegend iconSize={30} /></div>
    </>}
  </section>;
}
