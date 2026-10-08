// ぷよぷよの描画（渡された ctx と rect の中だけに描く）
import type { GameEngine, GameSnapshot, Rect } from '../../core/types';
import { PUYO } from '../../core/balance';
import { COLS, SPAWN_ROW, type PuyoEngine } from './rules';

const VIS_ROWS = PUYO.rows;
/** レイアウトの単位（マス数）: 盤面6 + 右パネル3、上の予告0.8 + 盤面12 */
export const LAYOUT_W = 9;
export const LAYOUT_H = 12.8;
const TOP = 0.8;

const COLOR: Record<string, [string, string]> = {
  R: ['#ff6b7a', '#c81e3a'],
  G: ['#6ff09a', '#1f9d4f'],
  B: ['#6fa8ff', '#2453c9'],
  Y: ['#ffe680', '#d9a400'],
  N: ['#dfe2ea', '#8a8f9e'],
};

function drawPuyo(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, v: string, alpha = 1, eyes = true) {
  const col = COLOR[v];
  if (!col || r <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, col[0]);
  g.addColorStop(1, col[1]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // つや
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.35, cy - r * 0.45, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();
  if (eyes && v !== 'N' && r > 6) {
    ctx.fillStyle = '#fff';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * r * 0.3, cy + r * 0.05, r * 0.2, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1b1b2a';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + s * r * 0.26, cy + r * 0.1, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function fit(rect: Rect, w: number, h: number) {
  const cell = Math.min(rect.w / w, rect.h / h);
  return { cell, ox: rect.x + (rect.w - cell * w) / 2, oy: rect.y + (rect.h - cell * h) / 2 };
}

function drawBoardBg(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number) {
  ctx.fillStyle = '#141a2e';
  ctx.fillRect(x, y, cell * COLS, cell * VIS_ROWS);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath(); ctx.moveTo(x + c * cell, y); ctx.lineTo(x + c * cell, y + cell * VIS_ROWS); ctx.stroke();
  }
  // 出現位置の×印
  ctx.strokeStyle = 'rgba(255,90,90,0.35)';
  ctx.lineWidth = Math.max(1, cell * 0.06);
  const sx = x + 2 * cell + cell * 0.3, sy = y + cell * 0.3, s = cell * 0.4;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + s, sy + s); ctx.moveTo(sx + s, sy); ctx.lineTo(sx, sy + s); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, cell * COLS, cell * VIS_ROWS);
}

/** 受け取り予定の AP（1AP = おじゃま1段 = 6個）を盤面の上に並べて表示 */
function drawPending(ctx: CanvasRenderingContext2D, ap: number, x: number, y: number, cell: number) {
  if (ap <= 0) return;
  const big = Math.floor(ap / 5), small = ap % 5;
  const icons: number[] = [...Array(Math.min(big, 6)).fill(1), ...Array(Math.min(small, Math.max(0, 6 - big))).fill(0)];
  icons.forEach((isBig, i) => {
    const r = cell * (isBig ? 0.36 : 0.24);
    drawPuyo(ctx, x + cell * (0.5 + i), y + cell * TOP * 0.5, r, 'N', 1, false);
    if (isBig) {
      ctx.fillStyle = '#ff5050';
      ctx.beginPath(); ctx.arc(x + cell * (0.5 + i), y + cell * TOP * 0.5, r * 0.25, 0, Math.PI * 2); ctx.fill();
    }
  });
}

export function drawPuyoEngine(ctx: CanvasRenderingContext2D, engine: GameEngine, rect: Rect) {
  const e = engine as PuyoEngine;
  const { cell, ox, oy } = fit(rect, LAYOUT_W, LAYOUT_H);
  ctx.save();
  ctx.fillStyle = '#0b0e1a';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const bx = ox, by = oy + cell * TOP;
  drawPending(ctx, e.pendingAttack, bx, oy, cell);
  drawBoardBg(ctx, bx, by, cell);

  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by, cell * COLS, cell * VIS_ROWS);
  ctx.clip();
  const r = cell * 0.46;
  const progress = e.phaseDuration > 0 ? Math.min(1, e.phaseTimer / e.phaseDuration) : 1;
  for (let row = 0; row < e.board.length; row++) {
    for (let c = 0; c < COLS; c++) {
      const v = e.board[row][c];
      if (v === '.') continue;
      const k = row * COLS + c;
      let drawRow = row;
      if (e.phase === 'gravity' && e.fallFrom.has(k)) {
        const from = e.fallFrom.get(k)!;
        const t = progress * progress; // 加速っぽく
        drawRow = from + (row - from) * t;
      }
      const cx = bx + (c + 0.5) * cell;
      const cy = by + (drawRow - SPAWN_ROW + 0.5) * cell;
      if (e.phase === 'pop' && e.popping.has(k)) {
        const blink = Math.floor(e.phaseTimer / 60) % 2 === 0 ? 1 : 0.4;
        drawPuyo(ctx, cx, cy, r * (1 - progress * 0.7), v, blink * (1 - progress * 0.5));
      } else {
        drawPuyo(ctx, cx, cy, r, v);
      }
    }
  }
  if (e.pair) {
    for (const [x, y, v] of e.pairCells(e.pair)) {
      const yy = y + e.fallProgress;
      drawPuyo(ctx, bx + (x + 0.5) * cell, by + (yy - SPAWN_ROW + 0.5) * cell, r, v);
    }
    // 軸ぷよの目印
    const p = e.pair;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = Math.max(1, cell * 0.05);
    ctx.beginPath();
    ctx.arc(bx + (p.x + 0.5) * cell, by + (p.y + e.fallProgress - SPAWN_ROW + 0.5) * cell, r * 1.02, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // 右パネル: NEXT 2組・得点・連鎖
  const px = bx + cell * (COLS + 0.4);
  ctx.fillStyle = '#e8ecff';
  ctx.font = `bold ${Math.round(cell * 0.45)}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('NEXT', px, by);
  e.nextPairs.slice(0, 2).forEach(([axis, child], i) => {
    const s = i === 0 ? 1 : 0.75;
    const cx = px + cell * (0.8 + i * 0.6);
    const top = by + cell * (0.8 + i * 2.4);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(cx - cell * 0.6 * s, top, cell * 1.2 * s, cell * 2.1 * s);
    drawPuyo(ctx, cx, top + cell * 0.55 * s, r * s, child);
    drawPuyo(ctx, cx, top + cell * 1.55 * s, r * s, axis);
  });

  ctx.fillStyle = '#9aa3c7';
  ctx.font = `${Math.round(cell * 0.38)}px sans-serif`;
  ctx.fillText('SCORE', px, by + cell * 6);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(cell * 0.42)}px sans-serif`;
  ctx.fillText(String(e.score), px, by + cell * 6.5);

  const shownChain = e.chain > 0 ? e.chain : 0;
  if (shownChain > 0) {
    ctx.fillStyle = '#ffd23f';
    ctx.font = `bold ${Math.round(cell * 0.6)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${shownChain}れんさ!`, bx + cell * COLS / 2, by + cell * 4.5);
  }

  if (e.isOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx, by, cell * COLS, cell * VIS_ROWS);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(cell * 0.7)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ばたんきゅ〜', bx + cell * COLS / 2, by + cell * VIS_ROWS / 2);
  }
  ctx.restore();
}

export function drawPuyoSnapshot(ctx: CanvasRenderingContext2D, snap: GameSnapshot, rect: Rect) {
  if (snap.kind !== 'puyo') return;
  const { cell, ox, oy } = fit(rect, COLS, VIS_ROWS);
  ctx.save();
  ctx.fillStyle = '#0b0e1a';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = '#141a2e';
  ctx.fillRect(ox, oy, cell * COLS, cell * VIS_ROWS);
  snap.rows.forEach((row, r) => {
    for (let c = 0; c < COLS; c++) {
      const v = row[c];
      if (!v || v === '.') continue;
      drawPuyo(ctx, ox + (c + 0.5) * cell, oy + (r + 0.5) * cell, cell * 0.46, v, 1, cell > 14);
    }
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox, oy, cell * COLS, cell * VIS_ROWS);
  ctx.restore();
}
