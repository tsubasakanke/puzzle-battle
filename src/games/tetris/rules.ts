// テトリスのルール本体（DOM / Canvas / window に依存しない）
import type { EngineOptions, GameEngine, GameSnapshot, InputState } from '../../core/types';
import { mulberry32, randInt, shuffle, type Rng } from '../../core/rng';
import { AttackQueue } from '../../core/attackQueue';
import { TETRIS } from '../../core/balance';

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const PIECES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export interface ActivePiece { type: string; rot: number; x: number; y: number }
export interface TetrisInitial { rows?: string[]; queue?: string[] }

export const EMPTY = '.';
export const SPAWN_X = 3;
export const SPAWN_Y = 1;
const TOTAL_ROWS = TETRIS.rows + TETRIS.hiddenRows;

// TODO(integrator): 得点の数値は balance.ts の TETRIS に移すとよい（core を触れないためここに置いている）
const SCORE = {
  lines: [0, 100, 300, 500, 800],
  tspin: [400, 800, 1200, 1600],
  tspinMini: [100, 200, 400],
  combo: 50,
  b2bMul: 1.5,
  perfectClear: 3000,
  softDrop: 1,
  hardDrop: 2,
};

type Cell = [number, number];

/** 回転 0 の形（bbox 内の [x, y]、y は下向き） */
const BASE: Record<PieceType, { n: number; cells: Cell[] }> = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 4, cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

const SHAPES: Record<string, Cell[][]> = {};
for (const t of PIECES) {
  const { n, cells } = BASE[t];
  const rots: Cell[][] = [cells];
  for (let r = 1; r < 4; r++) {
    const prev = rots[r - 1];
    rots.push(t === 'O' ? cells : prev.map(([x, y]) => [n - 1 - y, x] as Cell));
  }
  SHAPES[t] = rots;
}

/** ミノの形（bbox 内の座標）を返す */
export function cellsOf(type: string, rot: number): Cell[] {
  return SHAPES[type][((rot % 4) + 4) % 4];
}

// SRS 壁蹴り表（標準表は y が上向きなので、ここで y を反転して下向きに直す）
const kicksUp = (s: string) =>
  s.split(' ').map(p => { const [x, y] = p.split(',').map(Number); return [x, -y] as Cell; });
const JLSTZ_KICKS: Record<string, Cell[]> = {
  '01': kicksUp('0,0 -1,0 -1,1 0,-2 -1,-2'),
  '10': kicksUp('0,0 1,0 1,-1 0,2 1,2'),
  '12': kicksUp('0,0 1,0 1,-1 0,2 1,2'),
  '21': kicksUp('0,0 -1,0 -1,1 0,-2 -1,-2'),
  '23': kicksUp('0,0 1,0 1,1 0,-2 1,-2'),
  '32': kicksUp('0,0 -1,0 -1,-1 0,2 -1,2'),
  '30': kicksUp('0,0 -1,0 -1,-1 0,2 -1,2'),
  '03': kicksUp('0,0 1,0 1,1 0,-2 1,-2'),
};
const I_KICKS: Record<string, Cell[]> = {
  '01': kicksUp('0,0 -2,0 1,0 -2,-1 1,2'),
  '10': kicksUp('0,0 2,0 -1,0 2,1 -1,-2'),
  '12': kicksUp('0,0 -1,0 2,0 -1,2 2,-1'),
  '21': kicksUp('0,0 1,0 -2,0 1,-2 -2,1'),
  '23': kicksUp('0,0 2,0 -1,0 2,1 -1,-2'),
  '32': kicksUp('0,0 -2,0 1,0 -2,-1 1,2'),
  '30': kicksUp('0,0 1,0 -2,0 1,-2 -2,1'),
  '03': kicksUp('0,0 -1,0 2,0 -1,2 2,-1'),
};

export function emptyBoard(): string[][] {
  return Array.from({ length: TOTAL_ROWS }, () => Array(TETRIS.cols).fill(EMPTY));
}

/** board の上にミノが置けるか（盤外・埋まりは不可） */
export function fits(board: string[][], type: string, rot: number, x: number, y: number): boolean {
  for (const [cx, cy] of cellsOf(type, rot)) {
    const bx = x + cx, by = y + cy;
    if (bx < 0 || bx >= TETRIS.cols || by < 0 || by >= board.length) return false;
    if (board[by][bx] !== EMPTY) return false;
  }
  return true;
}

/** まっすぐ落としたときの y */
export function dropY(board: string[][], type: string, rot: number, x: number, y: number): number {
  while (fits(board, type, rot, x, y + 1)) y++;
  return y;
}

export class TetrisEngine implements GameEngine {
  readonly kind = 'tetris' as const;
  board: string[][] = emptyBoard();
  active: ActivePiece | null = null;
  hold: string | null = null;
  /** このミノでホールドを使ったか */
  holdUsed = false;
  queue: string[] = [];
  score = 0;
  level = 0;
  combo = -1;
  b2b = false;
  /** ミノを固定した回数（AI が新しいミノを見分けるのに使う） */
  locks = 0;
  stats: Record<string, number> = {
    lines: 0, tetrises: 0, tspins: 0, holds: 0, rotations: 0, moves: 0, hardDrops: 0,
  };

  private over = false;
  private mode: EngineOptions['mode'];
  private rng: Rng;
  private garbageRng: Rng;
  private attackQ = new AttackQueue();
  private attackCbs: ((ap: number) => void)[] = [];

  private gravityAcc = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = 0;
  private lastRotate = false;
  private lastKick = 0;
  private leftMs = 0;
  private rightMs = 0;

  constructor(opts: EngineOptions) {
    this.mode = opts.mode;
    this.rng = mulberry32(opts.seed);
    this.garbageRng = mulberry32((opts.seed ^ 0x9e3779b9) >>> 0);
    const init = (opts.initial ?? {}) as TetrisInitial;
    if (init.rows) {
      init.rows.forEach((row, i) => {
        const by = TOTAL_ROWS - 1 - i;
        if (by < 0) return;
        for (let c = 0; c < TETRIS.cols; c++) {
          const ch = row[c] ?? EMPTY;
          this.board[by][c] = ch === EMPTY || ch === ' ' ? EMPTY : ch;
        }
      });
    }
    if (init.queue) this.queue.push(...init.queue);
    this.fillQueue();
    this.spawn(this.queue.shift()!);
  }

  get isOver() { return this.over; }
  get pendingAttack() { return this.attackQ.pending; }

  receiveAttack(ap: number) { this.attackQ.add(ap); }
  onAttack(cb: (ap: number) => void) { this.attackCbs.push(cb); }

  /** 今の落下間隔(ms) */
  gravityMs(): number {
    if (this.mode === 'versus') return TETRIS.versusGravityMs;
    const g = TETRIS.gravityMs;
    if (this.mode === 'tutorial') return g[0];
    return g[Math.min(this.level, g.length - 1)];
  }

  // ---------- 入力 ----------
  update(dtMs: number, input: InputState) {
    if (this.over || !this.active) return;

    if (input.hold) this.holdPiece();
    if (input.rotateCW) this.rotate(1);
    if (input.rotateCCW) this.rotate(-1);
    this.handleShift(dtMs, input);

    if (input.hardDrop) { this.hardDrop(); return; }
    if (!this.active) return;

    // 落下（ソフトドロップ中は速く）
    const interval = input.down ? Math.min(TETRIS.softDropMs, this.gravityMs()) : this.gravityMs();
    this.gravityAcc += dtMs;
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (!this.shift(0, 1)) { this.gravityAcc = 0; break; }
      if (input.down) this.score += SCORE.softDrop;
    }

    // 固定猶予
    if (!fits(this.board, this.active.type, this.active.rot, this.active.x, this.active.y + 1)) {
      this.lockTimer += dtMs;
      if (this.lockTimer >= TETRIS.lockDelayMs) this.lock();
    } else {
      this.lockTimer = 0;
    }
  }

  /** DAS/ARR: 押した瞬間に1マス、dasMs 後から arrMs ごとに1マス */
  private handleShift(dt: number, input: InputState) {
    const prevL = this.leftMs, prevR = this.rightMs;
    this.leftMs = input.left ? this.leftMs + dt : 0;
    this.rightMs = input.right ? this.rightMs + dt : 0;
    let dir = 0, prev = 0, now = 0;
    if (input.left && input.right) {
      // 両方押しているときは後から押したほうを優先
      if (this.leftMs <= this.rightMs) { dir = -1; prev = prevL; now = this.leftMs; }
      else { dir = 1; prev = prevR; now = this.rightMs; }
    } else if (input.left) { dir = -1; prev = prevL; now = this.leftMs; }
    else if (input.right) { dir = 1; prev = prevR; now = this.rightMs; }
    if (dir === 0) return;
    const due = (t: number) => (t >= TETRIS.dasMs ? 1 + Math.floor((t - TETRIS.dasMs) / TETRIS.arrMs) : 0);
    let n = (prev === 0 ? 1 : 0) + due(now) - due(prev);
    n = Math.min(n, TETRIS.cols);
    for (let i = 0; i < n; i++) if (!this.tryMove(dir, 0)) break;
  }

  // ---------- 操作（テストからも呼ぶ） ----------
  tryMove(dx: number, dy: number): boolean {
    const ok = this.shift(dx, dy);
    if (ok && dx !== 0) this.stats.moves++;
    return ok;
  }

  private shift(dx: number, dy: number): boolean {
    const a = this.active;
    if (!a || this.over) return false;
    if (!fits(this.board, a.type, a.rot, a.x + dx, a.y + dy)) return false;
    a.x += dx; a.y += dy;
    this.lastRotate = false;
    this.afterMove();
    return true;
  }

  rotate(dir: 1 | -1): boolean {
    const a = this.active;
    if (!a || this.over) return false;
    const from = a.rot, to = (a.rot + dir + 4) % 4;
    if (a.type === 'O') {
      a.rot = to;
      this.stats.rotations++;
      return true;
    }
    const table = a.type === 'I' ? I_KICKS : JLSTZ_KICKS;
    const kicks = table[`${from}${to}`];
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      if (fits(this.board, a.type, to, a.x + kx, a.y + ky)) {
        a.rot = to; a.x += kx; a.y += ky;
        this.lastRotate = true;
        this.lastKick = i;
        this.stats.rotations++;
        this.afterMove();
        return true;
      }
    }
    return false;
  }

  private afterMove() {
    const a = this.active!;
    if (a.y > this.lowestY) { this.lowestY = a.y; this.lockResets = 0; }
    if (this.lockResets < TETRIS.maxLockResets) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  ghostY(): number {
    const a = this.active;
    if (!a) return 0;
    return dropY(this.board, a.type, a.rot, a.x, a.y);
  }

  hardDrop() {
    const a = this.active;
    if (!a || this.over) return;
    const y = this.ghostY();
    const d = y - a.y;
    if (d > 0) { a.y = y; this.lastRotate = false; }
    this.score += d * SCORE.hardDrop;
    this.stats.hardDrops++;
    this.lock();
  }

  holdPiece() {
    if (!this.active || this.holdUsed || this.over) return;
    const cur = this.active.type;
    this.stats.holds++;
    if (this.hold === null) {
      this.hold = cur;
      this.fillQueue();
      this.spawn(this.queue.shift()!);
    } else {
      const h = this.hold;
      this.hold = cur;
      this.spawn(h);
    }
    this.holdUsed = true;
  }

  // ---------- 内部 ----------
  private fillQueue() {
    while (this.queue.length < TETRIS.nextCount + 2) {
      this.queue.push(...shuffle(this.rng, [...PIECES]));
    }
  }

  private spawn(type: string) {
    this.active = { type, rot: 0, x: SPAWN_X, y: SPAWN_Y };
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = SPAWN_Y;
    this.lastRotate = false;
    this.lastKick = 0;
    this.fillQueue();
    if (!fits(this.board, type, 0, SPAWN_X, SPAWN_Y)) {
      this.over = true;
      this.active = null;
    }
  }

  private filled(x: number, y: number): boolean {
    if (x < 0 || x >= TETRIS.cols || y < 0 || y >= this.board.length) return true;
    return this.board[y][x] !== EMPTY;
  }

  /** 3コーナールール。0=なし 1=ミニ 2=フル */
  private tspinKind(): 0 | 1 | 2 {
    const a = this.active!;
    if (a.type !== 'T' || !this.lastRotate) return 0;
    const tl = this.filled(a.x, a.y), tr = this.filled(a.x + 2, a.y);
    const bl = this.filled(a.x, a.y + 2), br = this.filled(a.x + 2, a.y + 2);
    const count = [tl, tr, bl, br].filter(Boolean).length;
    if (count < 3) return 0;
    const front = [[tl, tr], [tr, br], [bl, br], [tl, bl]][a.rot];
    if ((front[0] && front[1]) || this.lastKick === 4) return 2;
    return 1;
  }

  private lock() {
    const a = this.active!;
    const tspin = this.tspinKind();
    for (const [cx, cy] of cellsOf(a.type, a.rot)) this.board[a.y + cy][a.x + cx] = a.type;
    this.active = null;
    this.locks++;

    // ライン消し
    const kept = this.board.filter(r => r.some(c => c === EMPTY));
    const n = this.board.length - kept.length;
    while (kept.length < TOTAL_ROWS) kept.unshift(Array(TETRIS.cols).fill(EMPTY));
    this.board = kept;

    if (tspin === 2) this.stats.tspins++;

    if (n > 0) {
      this.combo++;
      this.stats.lines += n;
      if (n === 4) this.stats.tetrises++;
      const difficult = n === 4 || tspin > 0;
      let ap = tspin === 2 ? TETRIS.tspinAttack[Math.min(n, 3)] : tspin === 1 ? 0 : TETRIS.attackByLines[n];
      let pts = tspin === 2 ? SCORE.tspin[Math.min(n, 3)] : tspin === 1 ? SCORE.tspinMini[Math.min(n, 2)] : SCORE.lines[n];
      if (difficult && this.b2b) { ap += TETRIS.b2bBonus; pts *= SCORE.b2bMul; }
      this.b2b = difficult;
      const ct = TETRIS.comboTable;
      ap += ct[Math.min(this.combo, ct.length - 1)];
      pts += SCORE.combo * this.combo;
      if (this.board.every(r => r.every(c => c === EMPTY))) {
        ap += TETRIS.perfectClearBonus;
        pts += SCORE.perfectClear;
      }
      this.score += Math.round(pts * (this.level + 1));
      if (this.mode === 'solo') this.level = Math.floor(this.stats.lines / TETRIS.linesPerLevel);
      if (ap > 0) {
        const send = this.attackQ.offset(ap);
        if (send > 0) for (const cb of this.attackCbs) cb(send);
      }
    } else {
      this.combo = -1;
      if (tspin > 0) this.score += Math.round((tspin === 2 ? SCORE.tspin[0] : SCORE.tspinMini[0]) * (this.level + 1));
      const g = this.attackQ.take(TETRIS.maxGarbagePerTurn);
      if (g > 0) this.addGarbage(g);
    }

    this.holdUsed = false;
    this.fillQueue();
    this.spawn(this.queue.shift()!);
  }

  /** 下からおじゃまを g 行入れる（穴は同じ列） */
  private addGarbage(g: number) {
    const hole = randInt(this.garbageRng, TETRIS.cols);
    this.board.splice(0, g);
    for (let i = 0; i < g; i++) {
      const row = Array(TETRIS.cols).fill('G');
      row[hole] = EMPTY;
      this.board.push(row);
    }
  }

  snapshot(): GameSnapshot {
    const b = this.board.map(r => [...r]);
    const a = this.active;
    if (a) for (const [cx, cy] of cellsOf(a.type, a.rot)) b[a.y + cy][a.x + cx] = a.type;
    return { kind: 'tetris', rows: b.slice(TETRIS.hiddenRows).map(r => r.join('')) };
  }
}
