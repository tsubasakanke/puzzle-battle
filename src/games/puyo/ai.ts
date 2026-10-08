// ぷよぷよの NPC。盤面をコピーしてシミュレーションし、置き場所を決めて入力を出す
import { emptyInput, type AIController, type Difficulty, type InputState } from '../../core/types';
import { AI } from '../../core/balance';
import { mulberry32, randInt } from '../../core/rng';
import {
  COLS, EMPTY, ROWS, ROT_DX, SPAWN_COL, SPAWN_ROW, cloneBoard, columnHeight, findGroups,
  resolveChainsInPlace, type Board, type Pair, type PuyoEngine, type Rot,
} from './rules';

export interface Placement { x: number; rot: Rot }

/** 読む組ぷよの数（今の組を含む） */
const DEPTH: Record<Difficulty, number> = { easy: 1, normal: 1, hard: 2, oni: 3 };
/** 深い段で残す候補の数 */
const TOP_K = 7;
const DEAD = -1e9;

/** 置き方を列挙する（同じ色なら向きの重複を除く）。最大22通り */
export function listPlacements(colorsSame: boolean): Placement[] {
  const out: Placement[] = [];
  const rots: Rot[] = colorsSame ? [0, 1] : [0, 1, 2, 3];
  for (const rot of rots) {
    for (let x = 0; x < COLS; x++) {
      const cx = x + ROT_DX[rot];
      if (cx < 0 || cx >= COLS) continue;
      out.push({ x, rot });
    }
  }
  return out;
}

/** 出現位置から目標の列まで行けるか（途中の列の見える一番上の段が空いているか） */
function reachable(b: Board, cols: number[]): boolean {
  const lo = Math.min(SPAWN_COL, ...cols), hi = Math.max(SPAWN_COL, ...cols);
  for (let c = lo; c <= hi; c++) if (b[SPAWN_ROW][c] !== EMPTY) return false;
  return true;
}

/** 組ぷよを置いて連鎖まで処理した盤面。置けなければ null */
export function simulate(b: Board, pair: [string, string], pl: Placement): { board: Board; score: number; chains: number } | null {
  const cx = pl.x + ROT_DX[pl.rot];
  if (!reachable(b, [pl.x, cx])) return null;
  const nb = cloneBoard(b);
  const [axis, child] = pair;
  const put = (c: number, v: string) => {
    const r = ROWS - 1 - columnHeight(nb, c);
    if (r >= 0) nb[r][c] = v;
  };
  if (pl.rot === 0) { put(pl.x, axis); put(pl.x, child); }
  else if (pl.rot === 2) { put(pl.x, child); put(pl.x, axis); }
  else { put(pl.x, axis); put(cx, child); }
  const res = resolveChainsInPlace(nb);
  return { board: nb, ...res };
}

/** 盤面の形の評価（大きいほどよい） */
export function evaluateShape(b: Board): number {
  if (b[SPAWN_ROW][SPAWN_COL] !== EMPTY) return DEAD;
  let conn = 0;
  for (const g of findGroups(b)) {
    if (g.length === 2) conn += 1;
    else if (g.length === 3) conn += 3;
  }
  let maxH = 0, bump = 0, prev = -1;
  const hs: number[] = [];
  for (let c = 0; c < COLS; c++) {
    const h = columnHeight(b, c);
    hs.push(h);
    maxH = Math.max(maxH, h);
    if (prev >= 0) bump += Math.abs(h - prev);
    prev = h;
  }
  const danger = Math.max(0, maxH - 8);
  return conn * 2 - maxH * 1 - hs[SPAWN_COL] * 1.5 - bump * 0.5 - danger * danger * 8;
}

/** 連鎖の得点をどれくらい重く見るか（高く積んだら消すのを優先） */
function chainValue(score: number, chains: number, b: Board): number {
  if (chains === 0) return 0;
  let maxH = 0;
  for (let c = 0; c < COLS; c++) maxH = Math.max(maxH, columnHeight(b, c));
  return score * 0.1 + chains * chains * 4 + (maxH >= 9 ? score * 0.2 : 0);
}

/** 先読み探索で一番いい置き方を返す */
export function searchBest(board: Board, pairs: [string, string][], depth: number): Placement | null {
  const d = Math.min(depth, pairs.length);
  let best: Placement | null = null;
  let bestVal = -Infinity;
  const rec = (b: Board, idx: number): number => {
    const pair = pairs[idx];
    const cands: { board: Board; now: number; shape: number }[] = [];
    for (const pl of listPlacements(pair[0] === pair[1])) {
      const s = simulate(b, pair, pl);
      if (!s) continue;
      const shape = evaluateShape(s.board);
      cands.push({ board: s.board, now: chainValue(s.score, s.chains, b), shape });
    }
    if (cands.length === 0) return DEAD;
    if (idx === d - 1) return Math.max(...cands.map(c => c.now + c.shape));
    cands.sort((a, c) => (c.now + c.shape) - (a.now + a.shape));
    let v = -Infinity;
    for (const c of cands.slice(0, TOP_K)) {
      if (c.shape <= DEAD) { v = Math.max(v, DEAD); continue; }
      v = Math.max(v, c.now + rec(c.board, idx + 1));
    }
    return v;
  };
  const first = pairs[0];
  const top: { pl: Placement; board: Board; now: number; shape: number }[] = [];
  for (const pl of listPlacements(first[0] === first[1])) {
    const s = simulate(board, first, pl);
    if (!s) continue;
    top.push({ pl, board: s.board, now: chainValue(s.score, s.chains, board), shape: evaluateShape(s.board) });
  }
  if (d <= 1) {
    for (const t of top) {
      const v = t.now + t.shape;
      if (v > bestVal) { bestVal = v; best = t.pl; }
    }
    return best;
  }
  top.sort((a, c) => (c.now + c.shape) - (a.now + a.shape));
  for (const t of top.slice(0, TOP_K * 2)) {
    const v = t.shape <= DEAD ? DEAD : t.now + rec(t.board, 1);
    if (v > bestVal) { bestVal = v; best = t.pl; }
  }
  return best ?? top[0]?.pl ?? null;
}

export function createPuyoAI(engine: PuyoEngine, level: Difficulty, seed: number): AIController {
  const rng = mulberry32(seed);
  let lastPair: Pair | null = null;
  let wait = 0;
  let target: Placement | null = null;
  let released = true;
  let frames = 0;

  const decide = (p: Pair): Placement => {
    const pairs: [string, string][] = [[p.axis, p.child], ...engine.nextPairs];
    if (level === 'easy') {
      const opts = listPlacements(p.axis === p.child).filter(pl => simulate(engine.board, pairs[0], pl));
      if (opts.length === 0) return { x: p.x, rot: p.rot };
      return opts[randInt(rng, opts.length)];
    }
    return searchBest(engine.board, pairs, DEPTH[level]) ?? { x: p.x, rot: p.rot };
  };

  return {
    next(dtMs: number): InputState {
      const inp = emptyInput();
      if (engine.isOver) return inp;
      const p = engine.pair;
      if (!p || engine.phase !== 'pair') { lastPair = null; return inp; }
      if (p !== lastPair) {
        lastPair = p; wait = AI.thinkMs[level]; target = null; released = true; frames = 0;
      }
      if (wait > 0) { wait -= dtMs; return inp; }
      if (!target) target = decide(p);
      frames++;
      // 目標に届かないときはあきらめて落とす
      if (frames > 90) { inp.down = true; return inp; }
      // 1回押したら1フレーム離す（押した瞬間だけ動く）
      if (!released) { released = true; return inp; }
      if (p.rot !== target.rot) {
        const diff = (target.rot - p.rot + 4) % 4;
        if (diff === 3) inp.rotateCCW = true; else inp.rotateCW = true;
        released = false;
        return inp;
      }
      if (p.x !== target.x) {
        if (p.x < target.x) inp.right = true; else inp.left = true;
        released = false;
        return inp;
      }
      inp.down = true;
      return inp;
    },
  };
}
