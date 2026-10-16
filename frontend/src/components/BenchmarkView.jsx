import React, { useEffect, useRef, useState } from "react";
import SimBoard, { BoardLegend } from "./SimBoard.jsx";
import { ALGORITHMS, loadPolicy } from "../sim/policies.js";
import { createBenchmark } from "../sim/benchmark.js";
import { ACTIONS } from "../sim/localSimulation.js";

const ORDER_KEY = "cleaning-robots-benchmark-order";
function savedOrder() {
  try {
    const order = JSON.parse(localStorage.getItem(ORDER_KEY));
    if (Array.isArray(order) && order.length === ALGORITHMS.length && new Set(order).size === ALGORITHMS.length && order.every((id) => ALGORITHMS.includes(id))) return order;
  } catch { /* Storage may be unavailable. */ }
  return [...ALGORITHMS];
}

export default function BenchmarkView({ config, seed, speed, layout, paused }) {
  const [selected, setSelected] = useState(ALGORITHMS);
  const [benchmark, setBenchmark] = useState(null);
  const [runs, setRuns] = useState([]);
  const [running, setRunning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const policies = useRef([]);
  const [order, setOrder] = useState(savedOrder);
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [dragPosition, setDragPosition] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const drag = useRef(null);

  useEffect(() => { try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* Keep in-memory ordering. */ } }, [order]);

  function moveCard(source, target) {
    if (source === target) return;
    setOrder((previous) => {
      const next = previous.filter((id) => id !== source);
      next.splice(previous.indexOf(target), 0, source);
      return next;
    });
    setAnnouncement(`${source.toUpperCase()} moved ${order.indexOf(source) < order.indexOf(target) ? "after" : "before"} ${target.toUpperCase()}.`);
  }
  function startDrag(event, algorithm) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { algorithm, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false, target: algorithm };
  }
  function trackDrag(event) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 5) return;
    active.moved = true;
    setDragging(active.algorithm); setDragPosition({ x: event.clientX, y: event.clientY });
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-algorithm]")?.dataset.algorithm;
    active.target = target || active.algorithm;
    setDropTarget(target && target !== active.algorithm ? target : null);
  }
  function endDrag(event, canceled = false) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (!canceled && active.moved && active.target !== active.algorithm) moveCard(active.algorithm, active.target);
    drag.current = null; setDragging(null); setDropTarget(null); setDragPosition(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboardMove(event, algorithm) {
    const direction = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    const visible = order.filter((id) => selected.includes(id));
    const target = visible[visible.indexOf(algorithm) + direction];
    if (target) moveCard(algorithm, target);
  }

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
  const orderedRuns = order.flatMap((id) => runs.filter((run) => run.algorithm === id));

  return <section className="benchmark-view" aria-label="Multi-grid benchmark">
    <div className="benchmark-heading"><h1>Multi-grid benchmark</h1><span className="dirt-pill">{benchmark?.finished && runs.length ? "COMPLETE" : running ? "RUNNING" : "READY"}</span></div>
    <p className="benchmark-description">{layout} · Environment seed {seed} · Same initial map, battery and environment noise for every policy. Checkpoint training seed: 12345.</p>
    <div className="benchmark-toolbar"><fieldset className="algorithm-checks"><legend>Algorithms</legend>{ALGORITHMS.map((name) => <label key={name}><input type="checkbox" checked={selected.includes(name)} onChange={() => { setRunning(null); setSelected((prev) => ALGORITHMS.filter((id) => id === name ? !prev.includes(id) : prev.includes(id))); }} />{name.toUpperCase()}</label>)}</fieldset>
    <div className="benchmark-controls">
      <button disabled={disabled} onClick={() => setRunning(running ? null : "play")}>{running ? "Pause benchmark" : "Play benchmark"}</button>
      <button disabled={disabled} onClick={step}>Step all</button>
      <button disabled={disabled} onClick={() => setRunning("fast")}>Run to horizon</button>
      <button disabled={loading || !!error || !runs.length} onClick={reset}>Reset benchmark</button>
      <span className="benchmark-progress" aria-live="polite">Step {stepCount}/{config.max_steps}</span>
    </div></div>
    {loading && <p role="status">Loading trained policies…</p>}
    {error && <p className="viewer-error" role="alert">{error} <button onClick={() => setAttempt((n) => n + 1)}>Retry policies</button></p>}
    {!selected.length && <p role="status">Select at least one algorithm.</p>}
    {!!runs.length && <p className="benchmark-reorder-help" id="reorder-help">Drag the grip beside an algorithm to rearrange grids. You can also focus it and use the arrow keys.</p>}
    <div className="benchmark-grids">{orderedRuns.map(({ algorithm, state, resets, remainingDirt }) => <article className={`benchmark-card ${dragging === algorithm ? "is-dragging" : ""} ${dropTarget === algorithm ? "is-drop-target" : ""}`} data-algorithm={algorithm} key={algorithm} aria-label={`${algorithm.toUpperCase()} benchmark grid`}>
      <header><div className="benchmark-card-title"><button className="card-drag-handle" aria-label={`Move ${algorithm.toUpperCase()} grid`} aria-describedby="reorder-help" title="Drag to reorder, or use arrow keys" onPointerDown={(event) => startDrag(event, algorithm)} onPointerMove={trackDrag} onPointerUp={endDrag} onPointerCancel={(event) => endDrag(event, true)} onKeyDown={(event) => keyboardMove(event, algorithm)}><span aria-hidden="true">⠿</span></button><h2>{algorithm.toUpperCase()}</h2></div><span className={`status-pill ${state.render.manual_reset ? "is-danger" : ""}`}>{state.truncated ? "HORIZON" : state.render.manual_reset ? "RESET" : state.action ? "ACTIVE" : "READY"}</span></header>
      <SimBoard state={state} showLegend={false} animate={running !== "fast"} showEffects={running !== "fast"} stepIntervalMs={1000 / speed} className="benchmark-board" canvasClassName="tk-canvas" ariaLabel={`${algorithm.toUpperCase()} map`} style={{ aspectRatio: `${state.grid[0].length * 76 + 48} / ${state.grid.length * 76 + 48}` }} />
      <dl className="benchmark-metrics"><div><dt>Return</dt><dd>{state.episode_return.toFixed(1)}</dd></div><div><dt>Dirt left</dt><dd>{remainingDirt}</dd></div><div><dt>Battery</dt><dd>{state.battery}/{state.battery_capacity}</dd></div></dl>
      <p className="benchmark-card-footer">{ACTIONS[state.action] || "Reset"} · Position {state.robot_pos.join(", ")} · Resets {resets}</p>
    </article>)}</div>
    <span className="reorder-announcement" role="status" aria-live="polite">{announcement}</span>
    {dragging && dragPosition && <div className="card-drag-preview" aria-hidden="true" style={{ left: Math.max(8, Math.min(dragPosition.x + 14, window.innerWidth - 100)), top: Math.max(8, Math.min(dragPosition.y + 14, window.innerHeight - 44)) }}>⠿ {dragging.toUpperCase()}</div>}
    {!!runs.length && <>
      <div className="benchmark-legend"><h2>Map Key</h2><div className="legend-groups"><BoardLegend iconSize={24} items={["dry", "wet", "sticky"]} /><BoardLegend iconSize={24} items={["dock", "robot", "obstacle", "clean"]} /></div></div>
      <details className="benchmark-results"><summary>Comparison table · {runs.length} algorithms · Step {stepCount}/{config.max_steps}</summary>
      <div className="benchmark-table-scroll"><table className="benchmark-table"><caption>Comparison for this seeded run</caption><thead><tr><th>Algorithm</th><th>Steps</th><th>Return</th><th>Dirt remaining</th><th>Dirty cells</th><th>Battery resets</th></tr></thead><tbody>{orderedRuns.map(({ algorithm, state, resets, remainingDirt }) => <tr key={algorithm}><th scope="row">{algorithm.toUpperCase()}{stepCount > 0 && state.episode_return === bestReturn && <span className="best-return"> Highest return</span>}</th><td>{state.step_count}</td><td>{state.episode_return.toFixed(1)}</td><td>{remainingDirt}</td><td>{state.grid.flat().filter((n) => n > 0).length}</td><td>{resets}</td></tr>)}</tbody></table></div>
      <p className="benchmark-note">This compares one episode per algorithm. Dynamic dirt can reappear; remaining dirt can exceed the starting amount.</p>
      </details>
    </>}
  </section>;
}
