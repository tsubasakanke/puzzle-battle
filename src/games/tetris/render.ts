// テトリスの描画（渡された ctx と rect の中だけに描く）
import type { GameEngine, GameSnapshot, Rect } from '../../core/types';
import { TETRIS } from '../../core/balance';
import { TetrisEngine, cellsOf } from './rules';

export const COLORS: Record<string, string> = {
  I: '#35d0f0', O: '#f5d633', T: '#a855f7', S: '#4ade5a',
  Z: '#ef4444', J: '#3b6cf6', L: '#f59e0b', G: '#8b8f98',
};
const BG = '#0f1220';
const PANEL = '#181c2e';
const GRID = 'rgba(255,255,255,0.05)';
const TEXT = '#e6e8f0';
const SUB = '#8b93b0';

/** 横 16 マス × 縦 20 マス のレイアウト（aspect 16/20） */
const UNITS_W = 16;
const UNITS_H = 20;
const BOARD_X = 3.5; // ボード左端（マス単位）
const SIDE_W = 3;

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

function block(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, s, s);
  const b = Math.max(1, s * 0.14);
  // 上・左を明るく
  ctx.fillStyle = shade(color, 0.35);
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + s, y); ctx.lineTo(x + s - b, y + b); ctx.lineTo(x + b, y + b); ctx.lineTo(x + b, y + s - b); ctx.lineTo(x, y + s);
  ctx.closePath(); ctx.fill();
  // 下・右を暗く
  ctx.fillStyle = shade(color, -0.35);
  ctx.beginPath();
  ctx.moveTo(x + s, y + s); ctx.lineTo(x, y + s); ctx.lineTo(x + b, y + s - b); ctx.lineTo(x + s - b, y + s - b); ctx.lineTo(x + s - b, y + b); ctx.lineTo(x + s, y);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}

/** 小さなミノの見本（枠 w×h の中央に） */
function piecePreview(ctx: CanvasRenderingContext2D, type: string, cx: number, cy: number, s: number, alpha = 1) {
  const cells = cellsOf(type, 0);
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = (maxX - minX + 1) * s, h = (maxY - minY + 1) * s;
  for (const [x, y] of cells) block(ctx, cx - w / 2 + (x - minX) * s, cy - h / 2 + (y - minY) * s, s, COLORS[type] ?? COLORS.G, alpha);
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = SUB, align: CanvasTextAlign = 'center') {
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.max(8, size)}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
}

export function drawTetris(ctx: CanvasRenderingContext2D, engine: GameEngine, rect: Rect) {
  const e = engine as TetrisEngine;
  const u = Math.min(rect.w / UNITS_W, rect.h / UNITS_H);
  const ox = rect.x + (rect.w - u * UNITS_W) / 2;
  const oy = rect.y + (rect.h - u * UNITS_H) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.fillStyle = BG;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  // ボード
  const bx = ox + BOARD_X * u;
  const by = oy;
  const hidden = TETRIS.hiddenRows;
  ctx.fillStyle = PANEL;
  ctx.fillRect(bx, by, TETRIS.cols * u, TETRIS.rows * u);
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (let c = 1; c < TETRIS.cols; c++) { ctx.beginPath(); ctx.moveTo(bx + c * u, by); ctx.lineTo(bx + c * u, by + TETRIS.rows * u); ctx.stroke(); }
  for (let r = 1; r < TETRIS.rows; r++) { ctx.beginPath(); ctx.moveTo(bx, by + r * u); ctx.lineTo(bx + TETRIS.cols * u, by + r * u); ctx.stroke(); }

  for (let r = hidden; r < e.board.length; r++) {
    for (let c = 0; c < TETRIS.cols; c++) {
      const v = e.board[r][c];
      if (v !== '.') block(ctx, bx + c * u, by + (r - hidden) * u, u, COLORS[v] ?? COLORS.G);
    }
  }

  const a = e.active;
  if (a) {
    const gy = e.ghostY();
    for (const [cx, cy] of cellsOf(a.type, a.rot)) {
      const r = gy + cy - hidden;
      if (r >= 0) block(ctx, bx + (a.x + cx) * u, by + r * u, u, COLORS[a.type], 0.25);
    }
    for (const [cx, cy] of cellsOf(a.type, a.rot)) {
      const r = a.y + cy - hidden;
      if (r >= 0) block(ctx, bx + (a.x + cx) * u, by + r * u, u, COLORS[a.type]);
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, u * 0.08);
  ctx.strokeRect(bx, by, TETRIS.cols * u, TETRIS.rows * u);

  // おじゃまゲージ（ボードの左端、下から pendingAttack 行ぶん）
  const gw = u * 0.35;
  const gx = bx - gw - u * 0.1;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(gx, by, gw, TETRIS.rows * u);
  const p = Math.min(e.pendingAttack, TETRIS.rows);
  if (p > 0) {
    ctx.fillStyle = e.pendingAttack > TETRIS.maxGarbagePerTurn ? '#ff2d2d' : '#ef4444';
    ctx.fillRect(gx, by + (TETRIS.rows - p) * u, gw, p * u);
  }

  // HOLD（左）
  const ps = u * 0.7;
  const lx = ox + SIDE_W * u / 2 - u * 0.2;
  label(ctx, 'HOLD', lx, oy + u * 0.2, u * 0.7);
  ctx.fillStyle = PANEL;
  ctx.fillRect(ox + u * 0.1, oy + u, SIDE_W * u - u * 0.4, u * 2.6);
  if (e.hold) piecePreview(ctx, e.hold, lx, oy + u * 2.3, ps, e.holdUsed ? 0.35 : 1);

  // スコア類（左下）
  const ty = oy + u * 5;
  label(ctx, 'SCORE', lx, ty, u * 0.6);
  label(ctx, String(e.score), lx, ty + u * 0.8, u * 0.75, TEXT);
  label(ctx, 'LINES', lx, ty + u * 2, u * 0.6);
  label(ctx, String(e.stats.lines), lx, ty + u * 2.8, u * 0.75, TEXT);
  label(ctx, 'LEVEL', lx, ty + u * 4, u * 0.6);
  label(ctx, String(e.level + 1), lx, ty + u * 4.8, u * 0.75, TEXT);
  if (e.combo > 0) label(ctx, `${e.combo} REN`, lx, ty + u * 6.4, u * 0.65, '#fbbf24');
  if (e.b2b) label(ctx, 'B2B', lx, ty + u * 7.4, u * 0.65, '#60a5fa');

  // NEXT（右）
  const nx0 = bx + TETRIS.cols * u + u * 0.2;
  const nw = UNITS_W * u - (nx0 - ox);
  const ncx = nx0 + nw / 2;
  label(ctx, 'NEXT', ncx, oy + u * 0.2, u * 0.7);
  ctx.fillStyle = PANEL;
  ctx.fillRect(nx0, oy + u, nw - u * 0.1, u * 2.7 * TETRIS.nextCount * 0.9 + u * 0.4);
  for (let i = 0; i < TETRIS.nextCount && i < e.queue.length; i++) {
    const s = i === 0 ? ps : ps * 0.85;
    piecePreview(ctx, e.queue[i], ncx, oy + u * 2.2 + i * u * 2.43, s);
  }

  if (e.isOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx, by, TETRIS.cols * u, TETRIS.rows * u);
    label(ctx, 'GAME OVER', bx + TETRIS.cols * u / 2, by + TETRIS.rows * u / 2 - u * 0.5, u * 1.1, '#fff');
  }
  ctx.restore();
}

export function drawTetrisSnapshot(ctx: CanvasRenderingContext2D, snap: GameSnapshot, rect: Rect) {
  if (snap.kind !== 'tetris') return;
  const rows = snap.rows.length || TETRIS.rows;
  const cols = TETRIS.cols;
  const s = Math.min(rect.w / cols, rect.h / rows);
  const ox = rect.x + (rect.w - s * cols) / 2;
  const oy = rect.y + (rect.h - s * rows) / 2;
  ctx.save();
  ctx.fillStyle = BG;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = PANEL;
  ctx.fillRect(ox, oy, s * cols, s * rows);
  snap.rows.forEach((row, r) => {
    for (let c = 0; c < cols; c++) {
      const v = row[c];
      if (v && v !== '.') {
        ctx.fillStyle = COLORS[v] ?? COLORS.G;
        ctx.fillRect(ox + c * s + 0.5, oy + r * s + 0.5, Math.max(1, s - 1), Math.max(1, s - 1));
      }
    }
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox, oy, s * cols, s * rows);
  ctx.restore();
}
