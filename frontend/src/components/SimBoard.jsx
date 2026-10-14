import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { BOARD_MARGIN, COLORS, LEGEND_ITEMS, boardSize, drawBoard, drawLegendMarker, rect } from "../sim/gymRenderer.js";

// Frame timings of the gym's human render mode: 5 frames at 24fps for a move,
// 14 frames at 30fps for a bump, 18 frames at 30fps for a battery reset.
const MOVE_MS = 210;
const BUMP_MS = 470;
const RESET_MS = 600;

function animationDuration(state, stepIntervalMs) {
  const meta = state?.render || {};
  let duration = 0;
  if (meta.manual_reset) duration = RESET_MS;
  else if (meta.move_case === "bump") duration = BUMP_MS;
  else if (meta.previous_robot_pos) duration = MOVE_MS;
  // Never lag behind autoplay: finish before the next step arrives.
  if (stepIntervalMs) duration = Math.min(duration, stepIntervalMs * 0.9);
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return reduceMotion ? 0 : duration;
}

function prepareCanvas(canvas) {
  const context = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const bounds = canvas.getBoundingClientRect();
  const width = Math.floor(bounds.width * dpr);
  const height = Math.floor(bounds.height * dpr);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width: bounds.width, height: bounds.height };
}

function paint(canvas, state, padding, progress, showEffects = true) {
  const { context, width, height } = prepareCanvas(canvas);
  context.fillStyle = COLORS.bg;
  context.fillRect(0, 0, width, height);
  if (!state?.grid || width <= 0 || height <= 0) return;

  const board = boardSize(state);
  const scale = Math.min((width - padding * 2) / board.width, (height - padding * 2) / board.height);
  if (scale <= 0) return;
  context.save();
  context.translate(
    (width - board.width * scale) / 2 + BOARD_MARGIN * scale,
    (height - board.height * scale) / 2 + BOARD_MARGIN * scale,
  );
  context.scale(scale, scale);
  drawBoard(context, state, { robotProgress: progress, effectPhase: progress, showEffects });
  context.restore();
}

export default function SimBoard({
  state,
  padding = 0,
  stepIntervalMs,
  className,
  canvasClassName,
  ariaLabel,
  animate = true,
  showEffects = true,
  showLegend = true,
}) {
  const canvasRef = useRef(null);
  const progressRef = useRef(1);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const duration = animate ? animationDuration(state, stepIntervalMs) : 0;
    if (duration <= 0) {
      progressRef.current = 1;
      paint(canvas, state, padding, 1, showEffects);
      return undefined;
    }

    let frameId;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      progressRef.current = progress;
      paint(canvas, state, padding, progress, showEffects);
      if (progress < 1) frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [state, padding, stepIntervalMs, animate, showEffects]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() =>
      paint(canvas, stateRef.current, padding, progressRef.current, showEffects),
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [padding, showEffects]);

  return (
    <div className={className}>
      <canvas ref={canvasRef} className={canvasClassName} aria-label={ariaLabel} />
      {showLegend ? <BoardLegend /> : null}
    </div>
  );
}

function LegendIcon({ kind, size }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size, size);
    drawLegendMarker(context, rect(0, 0, size, size), kind);
  }, [kind, size]);

  return <canvas ref={canvasRef} className="legend-icon" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function BoardLegend({ iconSize = 22 }) {
  const { t } = useTranslation();
  return (
    <div className="grid-legend">
      {LEGEND_ITEMS.map((kind) => (
        <span key={kind} className="legend-item">
          <LegendIcon kind={kind} size={iconSize} />
          {t(`legend.${kind}`)}
        </span>
      ))}
    </div>
  );
}
