import { ACTIONS } from "./localSimulation.js";
import { CELL_SIZE, COLORS, LEGEND_ITEMS, LEGEND_LABELS, drawBoard, drawLegendMarker, rect } from "./gymRenderer.js";

// Export the map and its status/key together, as in Tkinter's Save PNG.
export function saveFrame(state, mode, controller) {
  const canvas = document.createElement("canvas"); canvas.width = 980; canvas.height = 824;
  const ctx = canvas.getContext("2d");
  const text = (value, x, y, size = 14, color = COLORS.text) => {
    ctx.font = `600 ${size}px "Segoe UI", sans-serif`; ctx.fillStyle = color; ctx.fillText(String(value), x, y);
  };
  const box = (x, y, w, h, fill, border = "#d6deea") => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke();
  };
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, 980, 824);
  text("CleaningRobots-v0", 24, 36, 24); text("Full map", 24, 64, 14, COLORS.muted);
  text(state.render.dynamic_dirt ? "DYNAMIC DIRT" : "STATIC DIRT", 120, 64, 14, COLORS.accent);
  text(mode, 24, 94, 14, COLORS.muted);
  const scale = Math.min(532 / (state.grid[0].length * CELL_SIZE), 532 / (state.grid.length * CELL_SIZE));
  ctx.save(); ctx.translate(48, 120); ctx.scale(scale, scale); drawBoard(ctx, state, { showEffects: true }); ctx.restore();
  text("Local observation (3 × 3)", 90, 696, 18, COLORS.observation);
  ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = COLORS.observation; ctx.strokeRect(48, 676, 30, 20); ctx.restore();
  text("Robot cell + 8 neighbors", 90, 722, 14, COLORS.muted); text("Outside-grid neighbors: blocked", 90, 746, 14, COLORS.muted);
  box(604, 120, 352, 680, "white"); text("Run Status", 622, 158, 18);
  const status = state.render.manual_reset ? "RESET" : state.render.move_case === "bump" ? "BUMP" : state.truncated ? "HORIZON" : state.action ? "ACTIVE" : "READY";
  text(status, 862, 158, 14, ["RESET", "BUMP"].includes(status) ? COLORS.danger : COLORS.battery);
  text("Battery", 622, 200, 14, COLORS.muted); text(`${state.battery}/${state.battery_capacity}`, 870, 200, 14, COLORS.battery);
  box(622, 206, 316, 12, "#e2e8f0", "#e2e8f0");
  ctx.fillStyle = state.battery / state.battery_capacity > .25 ? COLORS.battery : COLORS.danger;
  ctx.fillRect(622, 206, 316 * state.battery / state.battery_capacity, 12);
  const cards = [["Last Action", ACTIONS[state.action] || "Reset"], ["Position (row, col)", state.robot_pos.join(", ")],
    ["Dirty cells", state.grid.flat().filter((n) => n > 0).length], ["Total dirt level", state.grid.flat().reduce((a, b) => a + b, 0)],
    ["Last Reward", state.reward.toFixed(1)], ["Step", `${state.step_count}/${state.render.max_steps}`], ["Episode Return", state.episode_return.toFixed(1)]];
  cards.forEach(([label, value], i) => {
    const x = 622 + i % 2 * 168, y = 232 + Math.floor(i / 2) * 66;
    box(x, y, i === 6 ? 316 : 148, 56, "#f8fafc"); text(label, x + 10, y + 20, 13, COLORS.muted);
    text(value, x + 10, y + 44, 18, i === 0 || i === 6 ? COLORS.accent : COLORS.text);
  });
  text("Map Key", 622, 516, 18);
  LEGEND_ITEMS.forEach((kind, i) => {
    const x = 622 + i % 2 * 150, y = 530 + Math.floor(i / 2) * 46;
    drawLegendMarker(ctx, rect(x, y, 38, 38), kind);
    LEGEND_LABELS[kind].split("\n").forEach((label, line) => text(label, x + 44, y + 17 + line * 18, 14, line ? COLORS.muted : COLORS.text));
  });
  text("Controller", 622, 742, 14, COLORS.muted); text(controller, 622, 768, 18);
  const link = document.createElement("a"); link.download = `cleaning-robots-step-${state.step_count}.png`; link.href = canvas.toDataURL("image/png"); link.click();
}
