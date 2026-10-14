// Canvas port of CleaningRobotEnv._render_frame (cleaning-robots-gym, pygame).
// Geometry is expressed in the gym's pixel units (76px cells) and scaled to fit,
// so the web board matches the pygame viewer tile for tile. Keep in sync with
// cleaning_robots_gym/envs/cleaning_robot_env.py when the gym renderer changes.

export const CELL_SIZE = 76;
// Cell contents are drawn inside the cell inset by 9px; icon geometry is defined
// at this size and scaled so legend markers reuse the same drawers.
const ICON_REF_SIZE = CELL_SIZE - 9;

const rgb = (r, g, b) => `rgb(${r}, ${g}, ${b})`;
const rgba = (r, g, b, a) => `rgba(${r}, ${g}, ${b}, ${a / 255})`;

export const COLORS = {
  bg: rgb(235, 239, 245),
  board: rgb(246, 248, 251),
  tile: rgb(255, 255, 255),
  tileAlt: rgb(249, 250, 252),
  tileSeen: rgb(225, 239, 255),
  tileShadow: rgb(214, 223, 235),
  grid: rgb(198, 208, 222),
  text: rgb(17, 24, 39),
  muted: rgb(96, 108, 128),
  dock: rgb(216, 248, 226),
  dockLine: rgb(48, 163, 93),
  robot: rgb(32, 102, 209),
  robotDark: rgb(20, 64, 145),
  robotHalo: rgb(219, 234, 254),
  robotShadow: rgb(145, 158, 178),
  dry: rgb(214, 121, 35),
  dryBg: rgb(255, 247, 237),
  wet: rgb(20, 143, 203),
  wetBg: rgb(240, 249, 255),
  sticky: rgb(209, 69, 76),
  stickyBg: rgb(255, 241, 242),
  obstacle: rgb(30, 41, 59),
  obstacleDot: rgb(71, 85, 105),
  panelLine: rgb(220, 227, 236),
  battery: rgb(30, 170, 91),
  danger: rgb(220, 38, 38),
  accent: rgb(67, 83, 255),
  accentSoft: rgb(232, 235, 255),
  white: rgb(255, 255, 255),
};

const MONO_FONT = 'bold 14px Consolas, "Cascadia Mono", Menlo, monospace';

// ---------------------------------------------------------------------------
// Primitive helpers mirroring pygame.draw semantics.

const rect = (x, y, w, h) => ({ x, y, w, h });
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const inflate = (r, dw, dh = dw) => rect(r.x - dw / 2, r.y - dh / 2, r.w + dw, r.h + dh);

function roundRectPath(ctx, r, radius) {
  const radii = Array.isArray(radius) ? radius : [radius];
  const max = Math.min(r.w, r.h) / 2;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radii.map((value) => Math.max(0, Math.min(value, max))));
}

function fillRect(ctx, r, color, radius = 0) {
  if (r.w <= 0 || r.h <= 0) return;
  ctx.fillStyle = color;
  roundRectPath(ctx, r, radius);
  ctx.fill();
}

// pygame draws rect borders inside the rect bounds.
function strokeRect(ctx, r, color, width, radius = 0) {
  const inset = inflate(r, -width);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  roundRectPath(ctx, inset, Math.max(0, radius - width / 2));
  ctx.stroke();
}

function circle(ctx, [cx, cy], radius, color) {
  if (radius <= 0) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

// pygame circle borders also sit inside the radius.
function ring(ctx, [cx, cy], radius, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0, radius - width / 2), 0, Math.PI * 2);
  ctx.stroke();
}

function polygon(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function line(ctx, [x1, y1], [x2, y2], color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function centeredText(ctx, text, r, color, font = MONO_FONT) {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const [cx, cy] = center(r);
  ctx.fillText(text, cx, cy + 1);
}

const offset = (value, r) => Math.round((value * r.w) / ICON_REF_SIZE);
const scaled = (value, r, minimum = 1) => Math.max(minimum, offset(value, r));

// ---------------------------------------------------------------------------
// Cell drawers (draw_battery, draw_dock, draw_obstacle, draw_robot, draw_dirt...).

function drawBattery(ctx, [cx, cy], bodyWidthRaw, outline = COLORS.dockLine, fill = COLORS.battery) {
  const bodyWidth = Math.max(10, Math.floor(bodyWidthRaw));
  const bodyHeight = Math.max(6, Math.floor(bodyWidth * 0.58));
  const nubWidth = Math.max(2, Math.floor(bodyWidth * 0.12));
  const nubHeight = Math.max(3, Math.floor(bodyHeight * 0.44));
  const lineWidth = Math.max(1, Math.round(bodyWidth / 16));
  const body = rect(cx - Math.floor(nubWidth / 2) - bodyWidth / 2, cy - bodyHeight / 2, bodyWidth, bodyHeight);
  const nub = rect(body.x + body.w - 1, cy - nubHeight / 2, nubWidth + 1, nubHeight);
  const corner = Math.max(2, Math.floor(bodyHeight / 5));
  const nubRadius = Math.max(1, Math.floor(nubWidth / 2));
  fillRect(ctx, nub, outline, [0, nubRadius, nubRadius, 0]);
  fillRect(ctx, body, COLORS.white, corner);
  strokeRect(ctx, body, outline, lineWidth, corner);
  const charge = inflate(body, -4 * lineWidth);
  fillRect(ctx, charge, fill, Math.max(1, corner - lineWidth));
  const boltW = Math.floor(charge.h * 0.72);
  const [chx, chy] = center(charge);
  const bolt = rect(chx - boltW / 2, chy - charge.h / 2, boltW, charge.h);
  const shape = [[0.62, 0], [0.12, 0.58], [0.46, 0.58], [0.36, 1], [0.88, 0.4], [0.54, 0.4]];
  polygon(ctx, shape.map(([fx, fy]) => [bolt.x + fx * bolt.w, bolt.y + fy * bolt.h]), COLORS.white);
}

function drawDock(ctx, r) {
  const radius = scaled(9, r, 3);
  fillRect(ctx, r, COLORS.dock, radius);
  strokeRect(ctx, r, COLORS.dockLine, scaled(2, r), radius);
  drawBattery(ctx, center(r), r.w * 0.58);
}

// Keeps the charging station recognisable while the robot covers it.
function drawDockBadge(ctx, r) {
  const w = Math.floor(r.w * 0.52);
  const h = Math.floor(r.h * 0.34);
  const badge = rect(r.x + r.w + 3 - w, r.y - 3, w, h);
  const radius = Math.floor(h / 2);
  fillRect(ctx, badge, COLORS.white, radius);
  strokeRect(ctx, badge, COLORS.dockLine, 1, radius);
  drawBattery(ctx, center(badge), badge.w * 0.64);
}

function drawObstacle(ctx, r) {
  fillRect(ctx, r, COLORS.obstacle, scaled(9, r, 3));
  const [cx, cy] = center(r);
  for (const [dx, dy, radius] of [[-14, -10, 5], [7, -12, 4], [12, 9, 7], [-6, 10, 4]]) {
    circle(ctx, [cx + offset(dx, r), cy + offset(dy, r)], scaled(radius, r), COLORS.obstacleDot);
  }
}

function drawRobot(ctx, r, { shadow = true, centerOverride = null, heading = null } = {}) {
  const [cx, cy] = centerOverride || center(r);
  const radius = scaled(16, r, 4);
  if (shadow) circle(ctx, [cx + 2, cy + 4], radius + 3, COLORS.robotShadow);
  circle(ctx, [cx, cy], radius + scaled(6, r), COLORS.robotHalo);
  circle(ctx, [cx, cy], radius, COLORS.robot);
  circle(ctx, [cx, cy], Math.max(2, Math.floor(radius / 3)), COLORS.white);
  ring(ctx, [cx, cy], radius, COLORS.robotDark, scaled(3, r));
  circle(ctx, [cx, cy - radius + scaled(5, r)], Math.max(1, Math.floor(radius / 7)), COLORS.white);
  if (heading) {
    const [dx, dy] = heading;
    circle(ctx, [cx + dx * scaled(9, r), cy + dy * scaled(9, r)], scaled(3, r), COLORS.white);
  }
}

function drawDirt(ctx, r, level) {
  const radius = scaled(10, r, 3);
  const [cx, cy] = center(r);
  if (level === 1) {
    fillRect(ctx, r, COLORS.dryBg, radius);
    for (const [px, py, dot] of [[0.3, 0.38, 6], [0.55, 0.3, 4], [0.67, 0.55, 5], [0.43, 0.66, 3]]) {
      circle(ctx, [r.x + Math.floor(r.w * px), r.y + Math.floor(r.h * py)], scaled(dot, r), COLORS.dry);
    }
  } else if (level === 2) {
    fillRect(ctx, r, COLORS.wetBg, radius);
    const drop = [[0, -15], [-12, 4], [0, 17], [12, 4]];
    polygon(ctx, drop.map(([dx, dy]) => [cx + offset(dx, r), cy + offset(dy, r)]), COLORS.wet);
    circle(ctx, [cx, cy + offset(5, r)], scaled(12, r), COLORS.wet);
    circle(ctx, [cx - offset(4, r), cy + offset(1, r)], scaled(3, r), COLORS.white);
  } else if (level >= 3) {
    fillRect(ctx, r, COLORS.stickyBg, radius);
    const blob = [[-15, -5], [-6, -17], [12, -12], [17, 4], [5, 16], [-14, 11]];
    polygon(ctx, blob.map(([dx, dy]) => [cx + offset(dx, r), cy + offset(dy, r)]), COLORS.sticky);
    circle(ctx, [cx + offset(4, r), cy - offset(4, r)], scaled(3, r), COLORS.white);
  } else {
    fillRect(ctx, r, COLORS.tile, radius);
  }
}

function drawBoom(ctx, baseRect, phase) {
  const c = center(baseRect);
  const [cx, cy] = c;
  const scale = 0.92 + 0.22 * Math.sin(Math.PI * phase);
  const r = inflate(baseRect, Math.trunc(baseRect.w * (scale - 1)), Math.trunc(baseRect.h * (scale - 1)));
  const left = r.x;
  const right = r.x + r.w;
  const top = r.y;
  const bottom = r.y + r.h;
  const burst = [
    [cx, top + 1], [cx + 9, cy - 15], [right - 3, cy - 12], [cx + 16, cy],
    [right - 1, cy + 13], [cx + 7, cy + 12], [cx, bottom - 1], [cx - 8, cy + 12],
    [left + 1, cy + 13], [cx - 16, cy], [left + 3, cy - 12], [cx - 9, cy - 15],
  ];
  const alphaRing = Math.max(30, Math.floor(150 * (1 - phase)));
  circle(ctx, c, Math.floor(r.w / 2) + Math.floor(16 * phase), rgba(239, 68, 68, alphaRing));
  circle(ctx, c, Math.floor(r.w / 2), rgb(248, 113, 113));
  polygon(ctx, burst, rgb(239, 68, 68));
  polygon(ctx, burst.filter((_, index) => index % 2 === 0), rgb(255, 214, 10));
  circle(ctx, c, Math.max(12, Math.floor(r.w / 5)), COLORS.white);
  centeredText(ctx, "BOOM", rect(r.x - 4, cy - 10, r.w + 8, 22), COLORS.danger);
}

function drawCollision(ctx, r, phase) {
  const c = center(r);
  const [cx, cy] = c;
  const ringRadius = 12 + Math.floor(18 * phase);
  const alpha = Math.max(35, Math.floor(190 * (1 - phase)));
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ring(ctx, c, ringRadius, rgba(220, 38, 38, alpha), 4);
  ctx.restore();
  const jitter = Math.trunc(4 * Math.sin(phase * Math.PI * 6));
  for (let angle = 0; angle < 360; angle += 45) {
    const rad = (angle * Math.PI) / 180;
    const inner = [cx + Math.trunc(Math.cos(rad) * (8 + jitter)), cy + Math.trunc(Math.sin(rad) * (8 + jitter))];
    const outer = [cx + Math.trunc(Math.cos(rad) * (18 + 10 * phase)), cy + Math.trunc(Math.sin(rad) * (18 + 10 * phase))];
    line(ctx, inner, outer, rgb(255, 214, 10), 3);
  }
  const badge = rect(cx - 24, cy - 24 - 10, 48, 20);
  fillRect(ctx, badge, rgb(254, 242, 242), 10);
  strokeRect(ctx, badge, COLORS.danger, 1, 10);
  centeredText(ctx, "BUMP", badge, COLORS.danger);
}

// ---------------------------------------------------------------------------
// Board.

const sameCell = (a, b) => Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];

// The gym's outer margin; also leaves room for BUMP badges drawn past the edge.
export const BOARD_MARGIN = 24;

export function boardSize(state) {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length || 1;
  return {
    rows,
    cols,
    width: cols * CELL_SIZE + BOARD_MARGIN * 2,
    height: rows * CELL_SIZE + BOARD_MARGIN * 2,
  };
}

function isInterpolating(state, progress) {
  const meta = state.render || {};
  return (
    Array.isArray(meta.previous_robot_pos) &&
    !sameCell(meta.previous_robot_pos, state.robot_pos) &&
    !meta.manual_reset &&
    progress < 0.999
  );
}

/**
 * Draws the board with its top-left grid cell at (0, 0) in gym pixel units.
 * `robotProgress` and `effectPhase` match the gym's robot_progress and
 * boom/collision phases (0..1). `showEffects: false` hides BUMP/BOOM markers,
 * which read as noise in still snapshots.
 */
export function drawBoard(ctx, state, { robotProgress = 1, effectPhase = 1, showEffects = true } = {}) {
  const { rows, cols } = boardSize(state);
  const meta = state.render || {};
  const robotPos = state.robot_pos;
  const previousPos = Array.isArray(meta.previous_robot_pos) ? meta.previous_robot_pos : null;
  const obstacles = new Set((state.obstacles || []).map(([row, col]) => `${row},${col}`));
  const cellRect = ([row, col]) => rect((col - 1) * CELL_SIZE, (row - 1) * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  const interpolating = isInterpolating(state, robotProgress);
  const heading =
    previousPos && robotPos ? [robotPos[1] - previousPos[1], robotPos[0] - previousPos[0]] : null;

  const gridW = cols * CELL_SIZE;
  const gridH = rows * CELL_SIZE;
  const boardBg = rect(-2, -2, gridW + 4, gridH + 4);
  fillRect(ctx, rect(boardBg.x, boardBg.y + 4, boardBg.w, boardBg.h), rgba(15, 23, 42, 24), 16);
  fillRect(ctx, boardBg, COLORS.board, 16);
  strokeRect(ctx, boardBg, COLORS.panelLine, 1, 16);

  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      const pos = [row, col];
      const r = cellRect(pos);
      fillRect(ctx, rect(r.x + 1, r.y + 2, r.w, r.h), COLORS.tileShadow, 11);
      fillRect(ctx, r, (row + col) % 2 === 0 ? COLORS.tileAlt : COLORS.tile, 11);
      const inner = inflate(r, -9);
      if (sameCell(pos, previousPos) && !sameCell(pos, robotPos)) fillRect(ctx, inner, COLORS.tileSeen, 10);
      if (sameCell(pos, state.dock)) drawDock(ctx, inner);
      else if (obstacles.has(`${row},${col}`)) drawObstacle(ctx, inner);
      else drawDirt(ctx, inner, state.grid[row - 1][col - 1]);
      strokeRect(ctx, r, COLORS.grid, 1, 11);
      if (sameCell(pos, robotPos)) {
        strokeRect(ctx, inflate(r, -4), COLORS.accent, 3, 12);
        if (!interpolating) {
          drawRobot(ctx, inner, { heading });
          if (sameCell(pos, state.dock)) drawDockBadge(ctx, inner);
        }
      }
      if (showEffects && sameCell(meta.boom_pos, pos)) drawBoom(ctx, inflate(r, -12), effectPhase);
    }
  }

  if (showEffects && meta.move_case === "bump" && Array.isArray(meta.collision_pos) && robotPos) {
    const [targetRow, targetCol] = meta.collision_pos;
    const inside = targetRow >= 1 && targetRow <= rows && targetCol >= 1 && targetCol <= cols;
    let collisionRect;
    if (inside) {
      collisionRect = inflate(cellRect(meta.collision_pos), -10);
    } else {
      const current = inflate(cellRect(robotPos), -10);
      collisionRect = { ...current };
      if (targetRow < 1) collisionRect.y = current.y + 4 - current.h / 2;
      else if (targetRow > rows) collisionRect.y = current.y + current.h - 4 - current.h / 2;
      else if (targetCol < 1) collisionRect.x = current.x + 4 - current.w / 2;
      else if (targetCol > cols) collisionRect.x = current.x + current.w - 4 - current.w / 2;
    }
    drawCollision(ctx, collisionRect, effectPhase);
  }

  if (interpolating) {
    const start = center(inflate(cellRect(previousPos), -9));
    const endRect = inflate(cellRect(robotPos), -9);
    const end = center(endRect);
    const moving = [
      Math.trunc(start[0] + (end[0] - start[0]) * robotProgress),
      Math.trunc(start[1] + (end[1] - start[1]) * robotProgress),
    ];
    line(ctx, start, end, COLORS.accentSoft, 8);
    line(ctx, start, moving, COLORS.accent, 3);
    drawRobot(ctx, endRect, { centerOverride: moving, heading });
  }
}

/** Same icons the gym draws in its side-panel legend. */
export const LEGEND_ITEMS = ["dock", "robot", "dry", "wet", "sticky", "obstacle", "clean"];

export function drawLegendMarker(ctx, r, kind) {
  if (kind === "dock") {
    drawDock(ctx, r);
    return;
  }
  if (kind === "robot") {
    drawDirt(ctx, r, 0);
    drawRobot(ctx, r, { shadow: false });
  } else if (kind === "obstacle") {
    drawObstacle(ctx, r);
  } else {
    drawDirt(ctx, r, { clean: 0, dry: 1, wet: 2, sticky: 3 }[kind]);
  }
  strokeRect(ctx, r, COLORS.grid, 1, scaled(10, r, 3));
}

export { rect };
