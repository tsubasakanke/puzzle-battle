// テトリスの NPC。エンジンの中身を読んで目標位置を決め、InputState を1フレーム1操作で出す
import type { AIController, Difficulty, GameEngine, InputState } from '../../core/types';
import { emptyInput } from '../../core/types';
import { AI } from '../../core/balance';
import { mulberry32, randInt } from '../../core/rng';
import { TetrisEngine, cellsOf, fits, dropY, EMPTY, SPAWN_Y } from './rules';

// Dellacherie 系の重み（AI 専用の調整値）
const W = { height: -0.51, lines: 0.76, holes: -0.36, bump: -0.18 };
/** 目標に届かないまま待つ最大フレーム数（届かなければその場で落とす） */
const MAX_PLAN_FRAMES = 60;
/** かんたん: ミスする確率と、ミスのとき選ぶ上位の割合 */
const EASY_MISS_RATE = 0.3;
const EASY_POOL = 0.25;

interface Placement { rot: number; x: number; score: number; hold: boolean }

function place(board: string[][], type: string, rot: number, x: number): { board: string[][]; lines: number } | null {
  if (!fits(board, type, rot, x, SPAWN_Y)) return null;
  const y = dropY(board, type, rot, x, SPAWN_Y);
  const b = board.map(r => [...r]);
  for (const [cx, cy] of cellsOf(type, rot)) b[y + cy][x + cx] = type;
  const kept = b.filter(r => r.some(c => c === EMPTY));
  const lines = b.length - kept.length;
  while (kept.length < b.length) kept.unshift(Array(b[0].length).fill(EMPTY));
  return { board: kept, lines };
}

export function evaluate(board: string[][], lines: number): number {
  const rows = board.length, cols = board[0].length;
  const heights: number[] = [];
  let holes = 0;
  for (let c = 0; c < cols; c++) {
    let top = rows;
    for (let r = 0; r < rows; r++) if (board[r][c] !== EMPTY) { top = r; break; }
    heights.push(rows - top);
    for (let r = top + 1; r < rows; r++) if (board[r][c] === EMPTY) holes++;
  }
  const agg = heights.reduce((s, h) => s + h, 0);
  let bump = 0;
  for (let c = 0; c < cols - 1; c++) bump += Math.abs(heights[c] - heights[c + 1]);
  return W.height * agg + W.lines * lines + W.holes * holes + W.bump * bump;
}

/** type を置ける全回転 × 全 x */
function candidates(board: string[][], type: string): { rot: number; x: number; board: string[][]; score: number }[] {
  const out: { rot: number; x: number; board: string[][]; score: number }[] = [];
  const rots = type === 'O' ? 1 : 4;
  for (let rot = 0; rot < rots; rot++) {
    for (let x = -3; x < board[0].length; x++) {
      const p = place(board, type, rot, x);
      if (p) out.push({ rot, x, board: p.board, score: evaluate(p.board, p.lines) });
    }
  }
  return out;
}

function bestScore(board: string[][], type: string | undefined): number {
  if (!type) return 0;
  let best = -Infinity;
  for (const c of candidates(board, type)) if (c.score > best) best = c.score;
  return best === -Infinity ? -1e6 : best;
}

export function createTetrisAI(engine: GameEngine, level: Difficulty, seed: number): AIController {
  const e = engine as TetrisEngine;
  const rng = mulberry32(seed);
  const smart = level === 'hard' || level === 'oni';
  let lastLocks = -1;
  let wait = 0;
  let plan: Placement | null = null;
  let held = false;
  let frames = 0;
  let prevDir = 0;

  function think(): Placement | null {
    const a = e.active;
    if (!a) return null;
    const options: { type: string; hold: boolean; next: string | undefined }[] = [
      { type: a.type, hold: false, next: e.queue[0] },
    ];
    if (smart && !e.holdUsed) {
      if (e.hold) options.push({ type: e.hold, hold: true, next: e.queue[0] });
      else options.push({ type: e.queue[0], hold: true, next: e.queue[1] });
    }
    const all: Placement[] = [];
    for (const o of options) {
      for (const c of candidates(e.board, o.type)) {
        const s = smart ? c.score + bestScore(c.board, o.next) : c.score;
        all.push({ rot: c.rot, x: c.x, score: s, hold: o.hold });
      }
    }
    if (all.length === 0) return null;
    all.sort((p, q) => q.score - p.score);
    // かんたん: ときどき上位の中からランダムに選ぶ（上位半分から毎回ランダムだと1分もたずに積み上がるため弱め調整）
    if (level === 'easy' && rng() < EASY_MISS_RATE) return all[randInt(rng, Math.max(1, Math.ceil(all.length * EASY_POOL)))];
    return all[0];
  }

  return {
    next(dtMs: number): InputState {
      const out = emptyInput();
      if (e.isOver || !e.active) return out;
      if (e.locks !== lastLocks) {
        lastLocks = e.locks;
        wait = AI.thinkMs[level];
        plan = null;
        held = false;
        frames = 0;
        prevDir = 0;
      }
      if (wait > 0) { wait -= dtMs; return out; }
      if (!plan) plan = think();
      if (!plan) { out.hardDrop = true; return out; }
      frames++;

      if (plan.hold && !held) { held = true; out.hold = true; return out; }
      const a = e.active;
      if (frames > MAX_PLAN_FRAMES) { out.hardDrop = true; return out; }
      if (a.rot !== plan.rot && a.type !== 'O') {
        if ((a.rot + 3) % 4 === plan.rot) out.rotateCCW = true;
        else out.rotateCW = true;
        prevDir = 0;
        return out;
      }
      const dir = Math.sign(plan.x - a.x);
      if (dir !== 0) {
        // 押しっぱなしだと DAS 待ちになるので、同じ向きが続くときは1フレーム離す
        if (prevDir === dir) { prevDir = 0; return out; }
        prevDir = dir;
        if (dir < 0) out.left = true; else out.right = true;
        return out;
      }
      out.hardDrop = true;
      return out;
    },
  };
}
