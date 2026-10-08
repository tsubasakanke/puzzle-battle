// ぷよぷよのルールエンジン（DOM / Canvas 非依存）
import type { EngineOptions, GameEngine, GameSnapshot, InputState } from '../../core/types';
import { mulberry32, randInt, shuffle, type Rng } from '../../core/rng';
import { AttackQueue } from '../../core/attackQueue';
import { PUYO } from '../../core/balance';

export const COLS = PUYO.cols;
/** 見えない13段目を含めた行数。row 0 = 見えない段 */
export const ROWS = PUYO.rows + PUYO.hiddenRows;
/** 出現位置の行（見える一番上の段） */
export const SPAWN_ROW = PUYO.hiddenRows;
export const SPAWN_COL = PUYO.spawnCol;
export const COLORS = ['R', 'G', 'B', 'Y'].slice(0, PUYO.colors);
export const EMPTY = '.';
export const NUISANCE = 'N';
/** 連鎖後の落下演出: 1段あたりの時間（ソフトドロップの半分） */
export const FALL_ANIM_PER_ROW_MS = PUYO.softDropMs / 2;

export type Board = string[][];
export type Rot = 0 | 1 | 2 | 3;
export interface Pair { axis: string; child: string; x: number; y: number; rot: Rot }
export type Phase = 'pair' | 'gravity' | 'pop' | 'over';

/** rot ごとの子ぷよの位置（0=上, 1=右, 2=下, 3=左） */
export const ROT_DX = [0, 1, 0, -1];
export const ROT_DY = [-1, 0, 1, 0];

export interface PuyoInitial { rows?: string[]; pairs?: [string, string][] }

// ---------- 盤面の純粋関数 ----------

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<string>(COLS).fill(EMPTY));
}

/** rows は下からの行（各6文字） */
export function boardFromRows(rows: string[]): Board {
  const b = emptyBoard();
  rows.forEach((row, i) => {
    const r = ROWS - 1 - i;
    if (r < 0) return;
    for (let c = 0; c < COLS; c++) {
      const ch = row[c] ?? EMPTY;
      b[r][c] = ch === ' ' ? EMPTY : ch;
    }
  });
  return b;
}

export const cloneBoard = (b: Board): Board => b.map(r => r.slice());

export const isColor = (v: string) => v !== EMPTY && v !== NUISANCE;

/** 列の高さ（下から積まれている個数） */
export function columnHeight(b: Board, c: number): number {
  let r = ROWS - 1;
  while (r >= 0 && b[r][c] !== EMPTY) r--;
  return ROWS - 1 - r;
}

export interface FallMove { col: number; from: number; to: number }

/** 浮いているぷよを落とす。動いたぷよの一覧を返す */
export function applyGravity(b: Board): FallMove[] {
  const moves: FallMove[] = [];
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const v = b[r][c];
      if (v === EMPTY) continue;
      if (r !== write) {
        b[write][c] = v;
        b[r][c] = EMPTY;
        moves.push({ col: c, from: r, to: write });
      }
      write--;
    }
  }
  return moves;
}

/** 同じ色のかたまり（見えない段は含めない）。cell = row*COLS+col */
export function findGroups(b: Board): number[][] {
  const seen = new Uint8Array(ROWS * COLS);
  const groups: number[][] = [];
  for (let r = SPAWN_ROW; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = b[r][c];
      const k = r * COLS + c;
      if (!isColor(v) || seen[k]) continue;
      const g: number[] = [];
      const stack = [k];
      seen[k] = 1;
      while (stack.length) {
        const cur = stack.pop()!;
        g.push(cur);
        const cr = (cur / COLS) | 0, cc = cur % COLS;
        const nb = [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]];
        for (const [nr, nc] of nb) {
          if (nr < SPAWN_ROW || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const nk = nr * COLS + nc;
          if (seen[nk] || b[nr][nc] !== v) continue;
          seen[nk] = 1;
          stack.push(nk);
        }
      }
      groups.push(g);
    }
  }
  return groups;
}

/** 得点 = 10 × 消した数 × max(1, 連鎖ボーナス + 連結ボーナス + 色数ボーナス) */
export function popScore(count: number, chain: number, colorCount: number, groupSizes: number[]): number {
  const cp = PUYO.chainPower[Math.min(chain - 1, PUYO.chainPower.length - 1)];
  const cb = PUYO.colorBonus[Math.min(colorCount, PUYO.colorBonus.length - 1)];
  let gb = 0;
  for (const s of groupSizes) gb += PUYO.groupBonus[Math.min(s, PUYO.groupBonus.length - 1)];
  return 10 * count * Math.max(1, cp + gb + cb);
}

export interface PopResult {
  /** 消えるマス（巻き込まれるおじゃまを含む） */
  cells: number[];
  /** 消える色ぷよの数 */
  colored: number;
  score: number;
}

/** 今の盤面で消えるものを調べる（盤面は変えない）。消えなければ null */
export function evaluatePop(b: Board, chain: number): PopResult | null {
  const groups = findGroups(b).filter(g => g.length >= 4);
  if (groups.length === 0) return null;
  const cells = new Set<number>();
  const colors = new Set<string>();
  let colored = 0;
  for (const g of groups) {
    colors.add(b[(g[0] / COLS) | 0][g[0] % COLS]);
    for (const k of g) { cells.add(k); colored++; }
  }
  // 隣のおじゃまを巻き込む
  for (const g of groups) {
    for (const k of g) {
      const r = (k / COLS) | 0, c = k % COLS;
      const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
      for (const [nr, nc] of nb) {
        if (nr < SPAWN_ROW || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        if (b[nr][nc] === NUISANCE) cells.add(nr * COLS + nc);
      }
    }
  }
  const score = popScore(colored, chain, colors.size, groups.map(g => g.length));
  return { cells: [...cells], colored, score };
}

export function removeCells(b: Board, cells: Iterable<number>) {
  for (const k of cells) b[(k / COLS) | 0][k % COLS] = EMPTY;
}

/** 盤面を直接変えながら連鎖を最後まで処理する */
export function resolveChainsInPlace(b: Board): { score: number; chains: number } {
  let score = 0, chains = 0;
  applyGravity(b);
  for (;;) {
    const res = evaluatePop(b, chains + 1);
    if (!res) break;
    chains++;
    score += res.score;
    removeCells(b, res.cells);
    applyGravity(b);
  }
  return { score, chains };
}

/** 組ぷよを (x, y, rot) に置けるか。見えない段より上 (row < 0) は空き扱い */
export function canPlace(b: Board, x: number, y: number, rot: number): boolean {
  const cells = [[x, y], [x + ROT_DX[rot], y + ROT_DY[rot]]];
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= COLS || cy >= ROWS) return false;
    if (cy >= 0 && b[cy][cx] !== EMPTY) return false;
  }
  return true;
}

// ---------- エンジン ----------

export class PuyoEngine implements GameEngine {
  readonly kind = 'puyo' as const;
  board: Board;
  pair: Pair | null = null;
  nextPairs: [string, string][] = [];
  score = 0;
  stats: Record<string, number> = { pops: 0, maxChain: 0, moves: 0, rotations: 0, popped: 0 };

  // 描画用の状態
  phase: Phase = 'pair';
  phaseTimer = 0;
  phaseDuration = 0;
  /** 消えている最中のマス */
  popping = new Set<number>();
  /** 落下演出中のマス: 落ちた先 (row*COLS+col) → 元の行 */
  fallFrom = new Map<number, number>();
  /** 今の連鎖数（連鎖中だけ 1 以上） */
  chain = 0;
  /** 直前に終わった連鎖の数 */
  lastChain = 0;
  /** 組ぷよの次の段までの進み具合 0..1（なめらかな描画用） */
  fallProgress = 0;

  private readonly queue = new AttackQueue();
  private readonly attackCbs: ((ap: number) => void)[] = [];
  private readonly pairRng: Rng;
  private readonly nuisanceRng: Rng;
  private readonly given: [string, string][];
  private chainPoints = 0;
  private pointRemainder = 0;
  private nuisanceRemainder = 0;
  private afterAnim: 'checkPop' | 'spawn' = 'checkPop';
  private prevLeft = false;
  private prevRight = false;
  private dasDir = 0;
  private dasTimer = 0;
  private repeating = false;
  private fallTimer = 0;
  private lockTimer = 0;
  private quickTurnReady = false;

  constructor(opts: EngineOptions) {
    const init = (opts.initial ?? {}) as PuyoInitial;
    this.board = boardFromRows(init.rows ?? []);
    this.given = (init.pairs ?? []).map(p => [p[0], p[1]] as [string, string]);
    this.pairRng = mulberry32(opts.seed);
    this.nuisanceRng = mulberry32((opts.seed ^ 0x9e3779b9) >>> 0);
    this.nextPairs = [this.pullPair(), this.pullPair(), this.pullPair()];
    this.spawn();
  }

  /** 連鎖を純粋関数として計算する（渡した盤面は変える） */
  static resolveChains(board: Board): { score: number; chains: number } {
    return resolveChainsInPlace(board);
  }

  get pendingAttack() { return this.queue.pending; }
  get isOver() { return this.phase === 'over'; }

  onAttack(cb: (ap: number) => void) { this.attackCbs.push(cb); }
  receiveAttack(ap: number) { this.queue.add(ap); }

  /** 得点を AP に換算する。点の端数(70未満)とおじゃまの端数(6未満)を持ち越す */
  pointsToAp(points: number): number {
    const total = points + this.pointRemainder;
    const nuisance = Math.floor(total / PUYO.targetPoints);
    this.pointRemainder = total - nuisance * PUYO.targetPoints;
    const n = nuisance + this.nuisanceRemainder;
    const ap = Math.floor(n / PUYO.nuisancePerAp);
    this.nuisanceRemainder = n - ap * PUYO.nuisancePerAp;
    return ap;
  }

  snapshot(): GameSnapshot {
    const rows = this.board.map(r => r.slice());
    if (this.pair) {
      for (const [x, y, v] of this.pairCells(this.pair)) if (y >= 0) rows[y][x] = v;
    }
    return { kind: 'puyo', rows: rows.slice(SPAWN_ROW).map(r => r.join('')) };
  }

  /** [x, y, 色] の組（軸、子） */
  pairCells(p: Pair): [number, number, string][] {
    return [[p.x, p.y, p.axis], [p.x + ROT_DX[p.rot], p.y + ROT_DY[p.rot], p.child]];
  }

  // ----- 操作 -----

  move(dx: number): boolean {
    const p = this.pair;
    if (!p || this.phase !== 'pair') return false;
    if (!canPlace(this.board, p.x + dx, p.y, p.rot)) return false;
    p.x += dx;
    this.stats.moves++;
    this.quickTurnReady = false;
    return true;
  }

  rotate(dir: 1 | -1): boolean {
    const p = this.pair;
    if (!p || this.phase !== 'pair') return false;
    const b = this.board;
    const nr = ((p.rot + dir + 4) % 4) as Rot;
    let ok = false;
    if (nr === 1 || nr === 3) {
      if (canPlace(b, p.x, p.y, nr)) { p.rot = nr; ok = true; }
      else if (canPlace(b, p.x - ROT_DX[nr], p.y, nr)) { p.x -= ROT_DX[nr]; p.rot = nr; ok = true; }
      else if (this.quickTurnReady) {
        // 両側がふさがっている: 2回目で上下を入れ替える
        ok = this.tryVertical(((p.rot + 2) % 4) as Rot);
      } else {
        this.quickTurnReady = true;
        return false;
      }
    } else {
      ok = this.tryVertical(nr);
    }
    if (ok) { this.stats.rotations++; this.quickTurnReady = false; }
    return ok;
  }

  /** 縦向きへの回転。ふさがっていたら軸を上下に押し戻す */
  private tryVertical(nr: Rot): boolean {
    const p = this.pair!;
    const kick = nr === 2 ? -1 : 1;
    if (canPlace(this.board, p.x, p.y, nr)) { p.rot = nr; return true; }
    if (canPlace(this.board, p.x, p.y + kick, nr)) { p.y += kick; p.rot = nr; return true; }
    return false;
  }

  canFall(): boolean {
    const p = this.pair;
    return !!p && canPlace(this.board, p.x, p.y + 1, p.rot);
  }

  /** 1段落とす。落ちられなければ false */
  tryFall(): boolean {
    if (!this.canFall()) return false;
    this.pair!.y++;
    return true;
  }

  /** その場で落として、連鎖・おじゃま・次の組ぷよまで同期的に全部処理する */
  dropPairNow(): void {
    this.flush();
    if (!this.pair || this.phase !== 'pair') return;
    while (this.tryFall());
    this.lock(true);
  }

  /** 演出中なら一気に終わらせる */
  flush(): void {
    while (this.phase === 'gravity' || this.phase === 'pop') this.completePhase(true);
  }

  update(dtMs: number, input: InputState): void {
    if (this.phase === 'over') return;
    if (this.phase === 'gravity' || this.phase === 'pop') {
      this.phaseTimer += dtMs;
      if (this.phaseTimer >= this.phaseDuration) this.completePhase(false);
    } else if (this.phase === 'pair' && this.pair) {
      this.handleInput(dtMs, input);
      this.handleFall(dtMs, input);
    }
    this.prevLeft = input.left;
    this.prevRight = input.right;
  }

  private handleInput(dtMs: number, input: InputState) {
    if (input.rotateCW) this.rotate(1);
    if (input.rotateCCW) this.rotate(-1);
    const dir = input.left && !input.right ? -1 : input.right && !input.left ? 1 : 0;
    if (dir === 0) { this.dasDir = 0; return; }
    const pressed = dir < 0 ? !this.prevLeft : !this.prevRight;
    if (pressed || dir !== this.dasDir) {
      this.move(dir);
      this.dasDir = dir;
      this.dasTimer = 0;
      this.repeating = false;
      return;
    }
    this.dasTimer += dtMs;
    for (;;) {
      const th = this.repeating ? PUYO.moveRepeatMs : PUYO.moveDasMs;
      if (this.dasTimer < th) break;
      this.dasTimer -= th;
      this.repeating = true;
      if (!this.move(dir)) { this.dasTimer = 0; break; }
    }
  }

  private handleFall(dtMs: number, input: InputState) {
    const interval = input.down ? PUYO.softDropMs : PUYO.fallMs;
    this.fallTimer = Math.min(this.fallTimer + dtMs, interval * 2);
    if (this.canFall()) {
      this.lockTimer = 0;
      while (this.fallTimer >= interval) {
        this.fallTimer -= interval;
        if (!this.tryFall()) break;
      }
    }
    if (this.canFall()) {
      this.fallProgress = Math.min(1, this.fallTimer / interval);
      return;
    }
    this.fallProgress = 0;
    this.fallTimer = 0;
    this.lockTimer += dtMs;
    if (input.down || this.lockTimer >= PUYO.lockMs) this.lock(false);
  }

  // ----- 固定・連鎖・おじゃま -----

  private lock(instant: boolean) {
    const p = this.pair;
    if (!p) return;
    for (const [x, y, v] of this.pairCells(p)) if (y >= 0 && y < ROWS) this.board[y][x] = v;
    this.pair = null;
    this.chain = 0;
    this.chainPoints = 0;
    this.startGravity(applyGravity(this.board), 'checkPop', instant);
  }

  private startGravity(moves: FallMove[], next: 'checkPop' | 'spawn', instant: boolean) {
    this.afterAnim = next;
    this.fallFrom.clear();
    if (instant || moves.length === 0) { this.runNext(instant); return; }
    let maxDist = 0;
    for (const m of moves) {
      this.fallFrom.set(m.to * COLS + m.col, m.from);
      maxDist = Math.max(maxDist, m.to - m.from);
    }
    this.phase = 'gravity';
    this.phaseTimer = 0;
    this.phaseDuration = maxDist * FALL_ANIM_PER_ROW_MS;
  }

  private runNext(instant: boolean) {
    if (this.afterAnim === 'checkPop') this.checkPop(instant);
    else this.spawn();
  }

  private completePhase(instant: boolean) {
    if (this.phase === 'gravity') {
      this.fallFrom.clear();
      this.runNext(instant);
    } else if (this.phase === 'pop') {
      removeCells(this.board, this.popping);
      this.popping.clear();
      this.startGravity(applyGravity(this.board), 'checkPop', instant);
    }
  }

  private checkPop(instant: boolean) {
    const res = evaluatePop(this.board, this.chain + 1);
    if (!res) { this.finishChain(instant); return; }
    this.chain++;
    this.score += res.score;
    this.chainPoints += res.score;
    this.stats.pops++;
    this.stats.popped += res.colored;
    this.stats.maxChain = Math.max(this.stats.maxChain, this.chain);
    if (instant) {
      removeCells(this.board, res.cells);
      this.startGravity(applyGravity(this.board), 'checkPop', true);
      return;
    }
    this.popping = new Set(res.cells);
    this.phase = 'pop';
    this.phaseTimer = 0;
    this.phaseDuration = PUYO.popMs;
  }

  private finishChain(instant: boolean) {
    if (this.chain > 0) {
      const ap = this.pointsToAp(this.chainPoints);
      const out = this.queue.offset(ap);
      if (out > 0) for (const cb of this.attackCbs) cb(out);
    }
    this.lastChain = this.chain;
    this.chain = 0;
    this.chainPoints = 0;
    const take = this.queue.take(PUYO.maxNuisancePerTurn / PUYO.nuisancePerAp);
    if (take > 0) {
      const moves = this.dropNuisance(take * PUYO.nuisancePerAp);
      this.startGravity(moves, 'spawn', instant);
    } else {
      this.spawn();
    }
  }

  /** おじゃまを6列に均等に降らせる（端数はシード付き乱数で列を選ぶ）。見えない段より上は捨てる */
  private dropNuisance(n: number): FallMove[] {
    const per = Math.floor(n / COLS);
    const extra = new Set(shuffle(this.nuisanceRng, [...Array(COLS).keys()]).slice(0, n % COLS));
    const moves: FallMove[] = [];
    for (let c = 0; c < COLS; c++) {
      const k = per + (extra.has(c) ? 1 : 0);
      let r = ROWS - 1 - columnHeight(this.board, c);
      for (let i = 0; i < k && r >= 0; i++, r--) {
        this.board[r][c] = NUISANCE;
        moves.push({ col: c, from: r - ROWS, to: r });
      }
    }
    return moves;
  }

  private pullPair(): [string, string] {
    const g = this.given.shift();
    if (g) return g;
    return [COLORS[randInt(this.pairRng, COLORS.length)], COLORS[randInt(this.pairRng, COLORS.length)]];
  }

  private spawn() {
    this.fallFrom.clear();
    this.popping.clear();
    if (this.board[SPAWN_ROW][SPAWN_COL] !== EMPTY) {
      this.phase = 'over';
      this.pair = null;
      return;
    }
    const [axis, child] = this.nextPairs.shift()!;
    this.pair = { axis, child, x: SPAWN_COL, y: SPAWN_ROW, rot: 0 };
    while (this.nextPairs.length < 2) this.nextPairs.push(this.pullPair());
    this.phase = 'pair';
    this.fallTimer = 0;
    this.lockTimer = 0;
    this.fallProgress = 0;
    this.quickTurnReady = false;
  }
}
