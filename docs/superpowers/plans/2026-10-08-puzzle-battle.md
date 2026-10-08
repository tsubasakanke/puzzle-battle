# Puzzle Battle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** テトリス・ぷよぷよ・スイカゲームを1サイトで遊べて、NPC戦・チュートリアル・リンク共有のオンライン1対1（同じゲーム／異種）ができる Web ゲームを作り、GitHub Pages で公開する。

**Architecture:** ルール（純粋な TS、DOM 非依存）と描画（Canvas）を分ける。3ゲームは共通の `GameEngine` / `GameModule` インターフェースを実装する。対戦は `Match` が2つのエンジンを AP でつなぎ、相手は `NpcOpponent` か `OnlineOpponent`（Firebase RTDB）に差し替える。

**Tech Stack:** TypeScript, Vite, Canvas 2D, Matter.js, Firebase (RTDB + Anonymous Auth), Vitest, GitHub Actions → Pages

**Spec:** `docs/superpowers/specs/2026-10-08-puzzle-battle-design.md`

## Global Constraints

- Vite `base: '/puzzle-battle/'`、ハッシュルーティング（`#/home`, `#/room/ABC123`）
- 数値はすべて `src/core/balance.ts` に置く（ルールのファイルに直接書かない）
- `src/games/*/rules.ts` と `src/core/*` は DOM / Canvas / window に依存しない（Vitest の node 環境で動く）
- 乱数は `src/core/rng.ts` の `mulberry32` だけを使う（`Math.random` 禁止。ただし部屋 ID の生成と、ゲームに関係ない UI 演出は例外）
- 1フレームは 1000/60 ms の固定ステップ
- 表示テキストは日本語
- `npm run check` = `tsc --noEmit && vitest run && vite build`

## Review Focus

1. **ブラウザのタブが裏に回ったあとの大きな dt** → ループは1回で進める量を最大 250ms に切り捨てる。ゲームが一気に進んで負けたりしない（Task 5 のテスト）
2. **連続して届く大量の AP** → 1回で受け取る上限（テトリス8列 / ぷよ30個 / スイカ8個）を超えた分は持ち越す（Task 1 の AttackQueue テスト + 各ゲームのテスト）
3. **ぷよの見えない13段目、テトリスの見えない2行** → そこにある物が原因で誤ってゲームオーバーにならない。テトリスは出現位置が埋まっているときだけ負け、ぷよは (列2, 段11) だけを見る（Task 2/3 のテスト）
4. **満員の部屋・存在しない部屋・24時間を過ぎた部屋の URL を開いたとき** → 固まらずにエラー文を出してホームに戻れる（Task 8 のテスト）
5. **Firebase 未設定の状態でビルドしたとき** → オンライン以外は全部動く（Task 8 のテスト）

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html
.claude/commands/check.md
src/main.ts                      エントリ。ルーター起動
src/style.css
src/core/types.ts                GameKind, InputState, GameEngine, GameModule, GameSnapshot, Difficulty, Rect, TutorialStep, AIController
src/core/rng.ts                  mulberry32, randInt, shuffle
src/core/balance.ts              全数値
src/core/attackQueue.ts          相殺・受け取り上限
src/core/loop.ts                 固定ステップのゲームループ
src/core/registry.ts             kind → GameModule
src/games/{tetris,puyo,suika}/rules.ts     エンジン本体
src/games/{tetris,puyo,suika}/render.ts    draw / drawSnapshot
src/games/{tetris,puyo,suika}/ai.ts        AIController
src/games/{tetris,puyo,suika}/tutorial.ts  TutorialStep[]
src/games/{tetris,puyo,suika}/index.ts     GameModule をまとめて export
src/input/keyboard.ts            キー → InputState（押した瞬間フラグ付き）
src/input/touch.ts               タッチボタン / ドラッグ → InputState
src/audio/sfx.ts                 WebAudio の効果音
src/settings.ts                  localStorage の設定
src/match/match.ts               2エンジンを AP でつなぎ勝敗を管理
src/match/npcOpponent.ts
src/match/onlineOpponent.ts
src/net/transport.ts             Transport インターフェース + MemoryTransport
src/net/firebaseTransport.ts
src/net/firebaseConfig.ts
src/net/room.ts                  部屋の状態機械（Transport 経由）
src/ui/router.ts, src/ui/dom.ts
src/ui/screens/{home,select,solo,npcSetup,versus,tutorial,online,settings}.ts
tests/**/*.test.ts
.github/workflows/deploy.yml
database.rules.json
```

---

### Task 1: 土台（Vite + TS + Vitest + core）

**Files:** Create `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/style.css`, `src/core/{types,rng,balance,attackQueue}.ts`, `.claude/commands/check.md`, `.gitignore`. Test: `tests/core/rng.test.ts`, `tests/core/attackQueue.test.ts`

**Interfaces (Produces) — `src/core/types.ts`:**
```ts
export type GameKind = 'tetris' | 'puyo' | 'suika';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'oni';
export interface Rect { x: number; y: number; w: number; h: number }

/** 1フレーム分の入力。left/right/down は押しっぱなし、それ以外は押した瞬間だけ true */
export interface InputState {
  left: boolean; right: boolean; down: boolean;
  rotateCW: boolean; rotateCCW: boolean;
  hardDrop: boolean;   // テトリス: ハードドロップ / スイカ: 落とす
  hold: boolean;
  pointerX: number | null; // スイカ: 論理座標 0..400 の位置。null なら使わない
}
export const emptyInput = (): InputState => ({ left: false, right: false, down: false, rotateCW: false, rotateCCW: false, hardDrop: false, hold: false, pointerX: null });

export type GameSnapshot =
  | { kind: 'tetris'; rows: string[] }        // 20行、各10文字。'.' 空、'IJLOSTZ' ミノ、'G' おじゃま
  | { kind: 'puyo'; rows: string[] }          // 12行、各6文字。'.' 空、'RGBY' 色、'N' おじゃま
  | { kind: 'suika'; bodies: number[] };      // [x, y, type, x, y, type, ...] 整数。type -1 は石

export interface EngineOptions {
  seed: number;
  mode: 'solo' | 'versus' | 'tutorial';
  initial?: unknown; // チュートリアル用の初期盤面（ゲームごとの形式）
}

export interface GameEngine {
  readonly kind: GameKind;
  update(dtMs: number, input: InputState): void;
  receiveAttack(ap: number): void;
  onAttack(cb: (ap: number) => void): void;
  snapshot(): GameSnapshot;
  readonly pendingAttack: number;
  readonly isOver: boolean;
  readonly score: number;
  /** チュートリアルの判定用カウンタ（例: lines, tetrises, holds, maxChain, merges, stonesBroken, rotations, moves, drops） */
  readonly stats: Record<string, number>;
}

export interface AIController { next(dtMs: number): InputState }

export interface TutorialStep {
  title: string;
  text: string;          // 操作説明（改行可）
  initial?: unknown;     // EngineOptions.initial に渡す
  goal: (e: GameEngine) => boolean;
}

export interface GameModule {
  kind: GameKind;
  name: string;          // 'テトリス' | 'ぷよぷよ' | 'スイカゲーム'
  aspect: number;        // draw に渡す rect の推奨 幅/高さ
  create(opts: EngineOptions): GameEngine;
  draw(ctx: CanvasRenderingContext2D, engine: GameEngine, rect: Rect): void;
  drawSnapshot(ctx: CanvasRenderingContext2D, snap: GameSnapshot, rect: Rect): void;
  createAI(engine: GameEngine, level: Difficulty, seed: number): AIController;
  tutorial: TutorialStep[];
}
```

**`src/core/rng.ts`:**
```ts
export type Rng = () => number; // [0,1)
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randInt = (rng: Rng, n: number) => Math.floor(rng() * n);
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
```

**`src/core/attackQueue.ts`:**
```ts
export class AttackQueue {
  pending = 0;
  add(ap: number) { if (ap > 0) this.pending += ap; }
  /** 自分の攻撃 ap で受け取り予定を相殺し、相手に送る残りを返す */
  offset(ap: number): number { const c = Math.min(ap, this.pending); this.pending -= c; return ap - c; }
  /** 実際に受け取る分を最大 max まで取り出す */
  take(max: number): number { const t = Math.min(max, this.pending); this.pending -= t; return t; }
}
```

**`src/core/balance.ts`:** 設計書 §4〜§7 の数値をそのまま定数にする:
```ts
export const FRAME_MS = 1000 / 60;
export const MAX_FRAME_DT = 250;
export const TETRIS = {
  cols: 10, rows: 20, hiddenRows: 2, nextCount: 5, dasMs: 133, arrMs: 33, softDropMs: 33,
  lockDelayMs: 500, maxLockResets: 15, linesPerLevel: 10,
  gravityMs: [1000, 793, 618, 473, 355, 262, 190, 135, 94, 64, 43, 28, 18, 11, 7], // レベルごと（最後の値で頭打ち）
  versusGravityMs: 800,
  attackByLines: [0, 0, 1, 2, 4], tspinAttack: [0, 2, 4, 6], b2bBonus: 1,
  comboTable: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5], perfectClearBonus: 10,
  maxGarbagePerTurn: 8,
};
export const PUYO = {
  cols: 6, rows: 12, hiddenRows: 1, colors: 4, spawnCol: 2,
  fallMs: 600, softDropMs: 40, moveRepeatMs: 100, moveDasMs: 150, lockMs: 300, popMs: 400,
  chainPower: [0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512],
  colorBonus: [0, 0, 3, 6, 12], groupBonus: [0, 0, 0, 0, 0, 2, 3, 4, 5, 6, 7, 10],
  targetPoints: 70, nuisancePerAp: 6, maxNuisancePerTurn: 30,
};
export const SUIKA = {
  width: 400, height: 600, deadLineY: 80, dropY: 50,
  radii: [12, 16, 22, 26, 33, 40, 47, 55, 63, 73, 85],
  names: ['さくらんぼ', 'いちご', 'ぶどう', 'デコポン', 'かき', 'りんご', 'なし', 'もも', 'パイナップル', 'メロン', 'スイカ'],
  colors: ['#e0245e', '#ff4d6d', '#8e44ad', '#f39c12', '#e67e22', '#e74c3c', '#f1e05a', '#ffb3c1', '#f4d03f', '#7dcea0', '#27ae60'],
  spawnMaxType: 4, dropCooldownMs: 500, overLimitMs: 2000, graceMs: 1000,
  apByType: [0, 0, 0, 0, 1, 1, 2, 2, 3, 4, 5], comboWindowMs: 2000, comboPerBonus: 3,
  stoneRadius: 18, stoneBreakMargin: 10, maxStonesPerTurn: 8, moveSpeed: 0.4, // px/ms
};
export const AI = {
  thinkMs: { easy: 1200, normal: 600, hard: 350, oni: 150 },
};
export const MATCH = { winsNeeded: 2, countdownMs: 3000, disconnectGraceMs: 15000, roomTtlMs: 24 * 3600 * 1000, snapshotIntervalMs: 100 };
```

- [ ] **Step 1:** `npm init -y`、`npm i -D typescript vite vitest @types/node`、`npm i matter-js firebase`、`npm i -D @types/matter-js`。scripts: `"dev": "vite"`, `"build": "vite build"`, `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`, `"check": "npm run typecheck && npm test && npm run build"`。tsconfig は strict、`"lib": ["ES2022","DOM"]`、`"moduleResolution": "bundler"`。
- [ ] **Step 2: Write failing tests**
```ts
// tests/core/rng.test.ts
import { describe, it, expect } from 'vitest';
import { mulberry32, shuffle } from '../../src/core/rng';
describe('rng', () => {
  it('同じシードなら同じ列', () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('0以上1未満', () => { const r = mulberry32(1); for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); } });
  it('shuffle は要素を保つ', () => { expect(shuffle(mulberry32(3), [1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]); });
});
// tests/core/attackQueue.test.ts
import { AttackQueue } from '../../src/core/attackQueue';
describe('AttackQueue', () => {
  it('相殺して余りを返す', () => { const q = new AttackQueue(); q.add(3); expect(q.offset(5)).toBe(2); expect(q.pending).toBe(0); });
  it('相殺しきれないと 0 を返す', () => { const q = new AttackQueue(); q.add(5); expect(q.offset(2)).toBe(0); expect(q.pending).toBe(3); });
  it('take は上限まで、残りは持ち越し', () => { const q = new AttackQueue(); q.add(20); expect(q.take(8)).toBe(8); expect(q.pending).toBe(12); });
});
```
- [ ] **Step 3:** `npx vitest run` → FAIL（モジュールがない）
- [ ] **Step 4:** 上のコードで実装。`index.html` に `<div id="app">`、`main.ts` は仮で「Puzzle Battle」を表示。`.claude/commands/check.md` は「`npm run check` を実行して結果を要約する」。
- [ ] **Step 5:** `npm run check` → PASS。コミット `feat: 土台と core`

---

### Task 2: テトリス（rules / render / ai / tutorial）

**Files:** Create `src/games/tetris/{rules,render,ai,tutorial,index}.ts`。Test: `tests/games/tetris.test.ts`

**Interfaces:**
- Consumes: Task 1 の `types`, `rng`, `balance.TETRIS`, `AttackQueue`
- Produces: `export const tetrisModule: GameModule`（`index.ts`）。`rules.ts` は `export class TetrisEngine implements GameEngine` を持ち、テスト用に次を公開する: `board: string[][]`（[row][col]、row 0 が一番上の見えない行。計 22 行）、`active: { type: string; rot: number; x: number; y: number } | null`、`hold: string | null`、`queue: string[]`、`tryMove(dx: number, dy: number): boolean`、`rotate(dir: 1 | -1): boolean`、`hardDrop(): void`、`holdPiece(): void`、`ghostY(): number`。
- `initial` の形式: `{ rows?: string[]; queue?: string[] }`（rows は下からの行、各10文字、'.' 空 / 'G' ブロック）

**ルール要点（設計書 §4.1, §5）:** 7-bag、SRS（JLSTZ と I の壁蹴り表）、ホールド（1ミノ1回）、NEXT 5、ゴースト、DAS/ARR はエンジン内で left/right の押しっぱなし時間から計算、ソフトドロップ、ロック遅延 500ms・リセット最大15回。Tスピン判定は3コーナールール（T の中心の四隅のうち3つ以上が埋まっている＋最後の操作が回転）。前の2隅が埋まっていればフル、そうでなければミニ。AP は `attackByLines` / `tspinAttack` / B2B / REN / 全消し。出た AP は `queue.offset()` を通し、余りがあれば `onAttack` へ。ライン消しなしでミノを固定したら `queue.take(maxGarbagePerTurn)` 分のおじゃまを下から入れる（穴は同じ列、列はシード付き乱数で選ぶ）。出現位置（x=3, y=0〜1）が埋まっていたら `isOver`。solo は `linesPerLevel` ごとに速くなる、versus は `versusGravityMs` 固定。stats: `lines, tetrises, tspins, holds, rotations, moves, hardDrops`。

**render:** 盤面の左にホールド、右に NEXT、ゴーストは半透明。`aspect = 16/20`。`drawSnapshot` は rows を小さなマスで描く。色: I 水色、O 黄、T 紫、S 緑、Z 赤、J 青、L 橙、G 灰。

**ai:** 今のミノ（hard 以上はホールドも）の全回転 × 全 x について落下位置を計算し、評価 `-0.51*合計高さ + 0.76*消える列 - 0.36*穴 - 0.18*凸凹` で比べる。hard/oni は NEXT 1個先まで読む（2手の評価値の和）。easy は上位半分からランダム。決めた目標に向けて、`AI.thinkMs` 待ってから 1フレーム1操作で回転→移動→hardDrop の入力を出す。

**tutorial:** ①「←→で移動、↑/X/Zで回転。5回動かそう」goal `moves+rotations >= 5` ②「Spaceでハードドロップ。1列消そう」initial: 下9列が穴1つあき goal `lines>=1` ③「C/Shiftでホールド」goal `holds>=1` ④「4列まとめて消そう（I ミノを待とう）」initial: 4行が同じ穴あき, queue に I goal `tetrises>=1`

- [ ] **Step 1: Write failing tests**（`tests/games/tetris.test.ts`）
```ts
import { describe, it, expect } from 'vitest';
import { TetrisEngine } from '../../src/games/tetris/rules';
import { emptyInput } from '../../src/core/types';
const mk = (initial?: unknown) => new TetrisEngine({ seed: 1, mode: 'versus', initial });
describe('tetris', () => {
  it('7-bag: 最初の7個は全種類', () => { const e = mk(); const seen = [e.active!.type, ...e.queue.slice(0, 6)]; expect(new Set(seen).size).toBe(7); });
  it('壁で止まる', () => { const e = mk(); for (let i = 0; i < 20; i++) e.tryMove(-1, 0); expect(e.tryMove(-1, 0)).toBe(false); });
  it('1列消しは AP 0、4列消しは AP 4', () => {
    const rows = Array(4).fill('GGGGGGGGG.');
    const e = mk({ rows, queue: ['I'] }); const sent: number[] = []; e.onAttack(a => sent.push(a));
    e.rotate(1); while (e.tryMove(1, 0)); e.hardDrop();
    expect(e.stats.tetrises).toBe(1); expect(sent).toEqual([4]);
  });
  it('相殺: 受け取り予定 3 で 4列消し → 1 だけ送る', () => {
    const e = mk({ rows: Array(4).fill('GGGGGGGGG.'), queue: ['I'] }); const sent: number[] = []; e.onAttack(a => sent.push(a));
    e.receiveAttack(3); e.rotate(1); while (e.tryMove(1, 0)); e.hardDrop();
    expect(sent).toEqual([1]); expect(e.pendingAttack).toBe(0);
  });
  it('ライン消しなしで固定するとおじゃまが最大8列せり上がり、残りは持ち越し', () => {
    const e = mk({ queue: ['O', 'O'] }); e.receiveAttack(10); e.hardDrop();
    const bottom = e.board.slice(-8); expect(bottom.every(r => r.filter(c => c === 'G').length === 9)).toBe(true);
    expect(e.pendingAttack).toBe(2);
  });
  it('見えない行にブロックがあっても出現位置が空なら負けない', () => {
    const e = mk(); e.board[0][0] = 'G'; e.update(16, emptyInput()); expect(e.isOver).toBe(false);
  });
  it('出現位置が埋まっていたら負け', () => {
    const e = mk({ rows: Array(21).fill('GGGG.GGGGG') }); e.hardDrop(); e.update(16, emptyInput()); expect(e.isOver).toBe(true);
  });
  it('T-spin double は AP 4', () => {
    // 下2行: T を回し入れられる形
    const rows = ['GGGGG.GGGG', 'GGGG...GGG', 'GGG.......'].reverse().reverse();
    const e = mk({ rows: ['GGGG.GGGGG', 'GGG...GGGG', 'GGG.......'.replace(/\./g, '.')].slice(0, 2).concat([]), queue: ['T'] });
    // 実装時に、T を (x,y) に置いて回転で入れる具体的な手順をこのテストに書き、tspins が 1・送った AP が 4 になることを確かめる
    expect(e).toBeDefined();
  });
  it('同じシードなら同じミノ順', () => { expect(mk().queue).toEqual(mk().queue); });
});
```
（T-spin テストは実装者が SRS に合わせて具体的な盤面と手順に書き換えること。最終的に `stats.tspins===1` と `sent==[4]` を確認すること）
- [ ] **Step 2:** 実行して FAIL を確認
- [ ] **Step 3:** rules → render → ai → tutorial → index を実装
- [ ] **Step 4:** AI のテストを追加: `createAI(e,'normal',1)` で 3000 フレーム動かしても `isOver` にならず `stats.lines > 0`
- [ ] **Step 5:** `npm run check` PASS、コミット `feat: テトリス`

---

### Task 3: ぷよぷよ（rules / render / ai / tutorial）

**Files:** Create `src/games/puyo/{rules,render,ai,tutorial,index}.ts`。Test: `tests/games/puyo.test.ts`

**Interfaces:**
- Produces: `export const puyoModule: GameModule`。`PuyoEngine` はテスト用に次を公開する: `board: string[][]`（[row][col]、row 0 = 見えない13段目、計13行。'.' 空 / 'RGBY' / 'N'）、`pair: { axis: string; child: string; x: number; y: number; rot: 0|1|2|3 } | null`（rot 0 = 子が上）、`nextPairs: [string,string][]`、`move(dx: number): boolean`、`rotate(dir: 1|-1): boolean`、`dropPairNow(): void`（その場で落として連鎖まで同期的に全部処理する。テストと AI のシミュレーション用）、`static resolveChains(board): { score: number; chains: number }`（連鎖を純粋関数で計算）
- `initial` の形式: `{ rows?: string[]; pairs?: [string,string][] }`（rows は下からの行、各6文字）

**ルール要点:** 組ぷよは列2に出る。移動・回転（壁は押し戻し、両側がふさがっていたら2回回すと上下が入れ替わる＝クイックターン）、自然落下 `fallMs`、↓でソフトドロップ。着地したら `lockMs` 後に固定。ちぎれたぷよは落とす → 4つ以上つながったら消す（`popMs` の演出）→ 落とす → 繰り返し。おじゃまは隣のぷよが消えると一緒に消える。得点の計算は §4.2。おじゃま数と AP の換算は §5.1（端数は持ち越し）。連鎖が終わったら AP の合計を `queue.offset` に通して送る。その後に `queue.take(5)`（AP 単位、30個 = 5AP）を受け取って、おじゃまを6列に均等に降らせる（端数はシード付き乱数で列を選ぶ）。出現位置 (row 1 = 見える一番上の段, col 2) がふさがったら負け。stats: `pops, maxChain, moves, rotations`

**render:** ぷよは色つきの丸。おじゃまは灰色。右に NEXT 2組。`aspect = 9/12`。

**ai:** 22通りの置き方（列×回転）を列挙して `dropPairNow` をコピーした盤面でシミュレーションし、評価する。評価 = 連鎖スコア × w1 + 同じ色の連結数（3個のかたまり）× w2 − 高さの最大 × w3 − 3列目の高さ × w4。normal は1組、hard は2組、oni は3組先まで読む。easy はランダム。目標が決まったら回転 → 移動 → ↓長押しの入力を出す。

**tutorial:** ①「←→で移動、X/Zで回転。5回動かそう」②「同じ色を4つつなげて消そう」initial: 赤3つが横に並んだ盤面、pairs に赤のペア goal `pops>=1` ③「2連鎖を作ろう」initial: 階段積みの盤面 goal `maxChain>=2`

- [ ] **Step 1: Write failing tests**
```ts
import { describe, it, expect } from 'vitest';
import { PuyoEngine } from '../../src/games/puyo/rules';
const mk = (initial?: unknown) => new PuyoEngine({ seed: 1, mode: 'versus', initial });
describe('puyo', () => {
  it('4つつながると消えて 1連鎖、得点 40', () => {
    const e = mk({ rows: ['RRR...'], pairs: [['R', 'G']] });
    // 子を上に置いたまま列3に落とす: R が (row 下, col 3) に入って4連結
    e.move(1); e.dropPairNow();
    expect(e.stats.maxChain).toBe(1); expect(e.score).toBe(40);
  });
  it('resolveChains: 2連鎖', () => {
    const rows = ['GRRR..', 'GGG...'].reverse(); // 実装者が2連鎖になる盤面を書く
    expect(PuyoEngine).toBeDefined();
  });
  it('おじゃま数は 70 点で 1 個、6 個で 1AP、端数持ち越し', () => {
    const e = mk(); expect(e.pointsToAp(420)).toBe(1); expect(e.pointsToAp(69)).toBe(0); expect(e.pointsToAp(1)).toBe(0); // 69+1=70 → 1個目
  });
  it('おじゃまは隣が消えると一緒に消える', () => {
    const e = mk({ rows: ['RRRN..'], pairs: [['R', 'G']] }); // 実装者: R を4つにして N が巻き込まれることを確認
    expect(e).toBeDefined();
  });
  it('受け取りは1回5AP(30個)まで、残りは持ち越し', () => {
    const e = mk({ pairs: [['R', 'G'], ['B', 'Y']] }); e.receiveAttack(7); e.dropPairNow();
    const n = e.board.flat().filter(c => c === 'N').length; expect(n).toBe(30); expect(e.pendingAttack).toBe(2);
  });
  it('見えない13段目にあっても出現位置が空なら負けない', () => { const e = mk(); e.board[0][0] = 'R'; e.dropPairNow(); expect(e.isOver).toBe(false); });
});
```
（`pointsToAp(points): number` は端数を持ち越すメソッドとして公開する。`resolveChains` とおじゃまのテストは、実装者が具体的な盤面と期待値を書き切ること）
- [ ] **Step 2:** FAIL を確認 **Step 3:** 実装 **Step 4:** AI テスト（normal で 3000 フレーム動かして `stats.pops>0` で負けない） **Step 5:** check PASS、コミット `feat: ぷよぷよ`

---

### Task 4: スイカゲーム（rules / render / ai / tutorial）

**Files:** Create `src/games/suika/{rules,render,ai,tutorial,index}.ts`。Test: `tests/games/suika.test.ts`

**Interfaces:**
- Produces: `export const suikaModule: GameModule`。`SuikaEngine` は次を公開する: `cursorX: number`、`current: number`（次に落とす種類）、`next: number`、`bodies(): { x: number; y: number; r: number; type: number }[]`（type −1 は石）、`dropAt(x: number): boolean`（クールダウン中なら false）、`step(ms: number): void`（物理演算だけ進める）
- `initial` の形式: `{ fruits?: { x: number; y: number; type: number }[]; stones?: { x: number; y: number }[]; queue?: number[] }`

**ルール要点:** Matter.js の `Engine` を固定ステップ（16.67ms）で回す。重力 y=1。壁は左右と床（静的な長方形）。円の restitution 0.2、friction 0.1。`collisionStart` で同じ種類の果物同士がぶつかったら、2つを消して中点に1つ上の種類を作る（1フレームで同じ物体を2回合体させない）。スイカ同士なら両方消える。石（label 'stone'）は合体しない。合体したら、新しいフルーツの中心から `newR + stoneRadius + stoneBreakMargin` 以内の石を消す（`stats.stonesBroken++`）。得点・AP・連鎖ボーナスは §4.3 / §5.1。AP は次に落とすときにまとめて `queue.offset` に通して送る。落とした直後に `queue.take(8)` 個の石を y=−20 のランダムな x に出す。負けの判定は §4.3（`graceMs` 以内に落としたものは無視）。入力: left/right で cursorX を `moveSpeed` で動かす、`pointerX` があればそこに合わせる、`hardDrop` で落とす。stats: `drops, merges, stonesBroken, maxType`

**render:** 容器と点線のデッドライン、フルーツは色つきの円に名前の頭文字、石は灰色。上に NEXT。`aspect = 400/680`。`drawSnapshot` は bodies 配列から描く。

**ai:** 候補 x を 20 個（等間隔）並べる。各候補について評価する: 落下地点の近くに同じ種類のフルーツがあれば +、あれば高さ − 、壁際の大きいフルーツの近く +。easy はランダム、normal は「同じ種類の真上」だけ、hard/oni は評価。決めたら pointerX を目標に合わせて hardDrop。

**tutorial:** ①「←→（またはマウス）で動かして Space/クリックで落とそう。3回落とそう」goal `drops>=3` ②「同じフルーツをくっつけて合体させよう」initial: いちごが1つ、queue [1] goal `merges>=1` ③「おじゃま石の近くで合体させて砕こう」initial: ぶどう1つと隣に石、queue [2] goal `stonesBroken>=1`

- [ ] **Step 1: Write failing tests**
```ts
import { describe, it, expect } from 'vitest';
import { SuikaEngine } from '../../src/games/suika/rules';
import { emptyInput } from '../../src/core/types';
const mk = (initial?: unknown) => new SuikaEngine({ seed: 1, mode: 'versus', initial });
const run = (e: SuikaEngine, ms: number) => { for (let t = 0; t < ms; t += 16) e.update(16, emptyInput()); };
describe('suika', () => {
  it('同じ種類が触れると合体して1つ上になる', () => {
    const e = mk({ fruits: [{ x: 200, y: 560, type: 1 }], queue: [1] }); e.dropAt(200); run(e, 2000);
    const types = e.bodies().map(b => b.type); expect(types).toContain(2); expect(e.stats.merges).toBe(1);
  });
  it('かき(4)ができる合体は AP 1', () => {
    const e = mk({ fruits: [{ x: 200, y: 560, type: 3 }], queue: [3, 0] }); const sent: number[] = []; e.onAttack(a => sent.push(a));
    e.dropAt(200); run(e, 2000); e.dropAt(50); run(e, 100); expect(sent).toEqual([1]);
  });
  it('石は合体しない', () => {
    const e = mk({ stones: [{ x: 190, y: 570 }, { x: 230, y: 570 }] }); run(e, 1500); expect(e.bodies().filter(b => b.type === -1).length).toBe(2);
  });
  it('合体の近くの石は砕ける', () => {
    const e = mk({ fruits: [{ x: 200, y: 570, type: 2 }], stones: [{ x: 250, y: 570 }], queue: [2] }); e.dropAt(200); run(e, 2000);
    expect(e.stats.stonesBroken).toBe(1);
  });
  it('受け取った石は1回8個まで', () => { const e = mk(); e.receiveAttack(10); e.dropAt(200); run(e, 50); expect(e.bodies().filter(b => b.type === -1).length).toBe(8); expect(e.pendingAttack).toBe(2); });
  it('ラインを越えたまま2秒で負け', () => {
    const fruits = Array.from({ length: 40 }, (_, i) => ({ x: 40 + (i % 8) * 45, y: 560 - Math.floor(i / 8) * 90, type: 9 }));
    const e = mk({ fruits }); run(e, 5000); expect(e.isOver).toBe(true);
  });
  it('クールダウン中は落とせない', () => { const e = mk(); expect(e.dropAt(200)).toBe(true); expect(e.dropAt(200)).toBe(false); });
});
```
- [ ] **Step 2:** FAIL 確認 **Step 3:** 実装 **Step 4:** AI テスト（normal で 30秒ぶん動かして `stats.merges>0`） **Step 5:** check PASS、コミット `feat: スイカゲーム`

---

### Task 5: 画面の土台・ひとりで遊ぶ・設定・入力・効果音

**Files:** Create `src/core/loop.ts`, `src/core/registry.ts`, `src/ui/{router,dom}.ts`, `src/ui/screens/{home,select,solo,settings}.ts`, `src/input/keyboard.ts`, `src/audio/sfx.ts`, `src/settings.ts`。Modify `src/main.ts`, `src/style.css`。Test: `tests/core/loop.test.ts`

**Interfaces (Produces):**
```ts
// loop.ts
export function createLoop(step: (dtMs: number) => void, render: () => void, now?: () => number): { start(): void; stop(): void; tick(t: number): void };
// 実時間の差分を MAX_FRAME_DT で切り捨て、FRAME_MS ごとに step を呼ぶ（余りは持ち越す）
// registry.ts
export const modules: Record<GameKind, GameModule>; export const allKinds: GameKind[];
// router.ts
export type Screen = { mount(root: HTMLElement): void; unmount(): void };
export function route(path: string): void;  // location.hash = '#' + path
export function startRouter(routes: Record<string, (params: Record<string,string>) => Screen>): void; // '/room/:id' 形式
// keyboard.ts
export class Keyboard { constructor(target: Window); poll(): InputState; dispose(): void } // 押した瞬間フラグは poll ごとにリセット
// settings.ts
export interface Settings { volume: number; touch: 'auto' | 'on' | 'off'; name: string }
export function loadSettings(): Settings; export function saveSettings(s: Settings): void; // try/catch で localStorage
// sfx.ts
export const sfx: { play(name: 'move'|'rotate'|'drop'|'clear'|'attack'|'garbage'|'win'|'lose'): void; setVolume(v: number): void };
// ui/dom.ts
export function h(tag: string, attrs?: Record<string, any>, ...children: (Node|string)[]): HTMLElement;
export function fitCanvas(canvas: HTMLCanvasElement): { w: number; h: number }; // devicePixelRatio 対応
```
- solo 画面: 選んだゲームの engine を `mode:'solo'` で作り、Canvas 全体に `draw`。スコアとハイスコア（localStorage `hs:<kind>`）、ゲームオーバーで「もう一回 / ホーム」。Esc で一時停止。
- home: タイトルと5つのボタン（ひとりで遊ぶ / チュートリアル / NPC対戦 / オンライン対戦 / 設定）。
- select: `#/select/:next`（next = solo | tutorial）でゲームを3枚のカードから選ぶ。

- [ ] **Step 1: failing test** `loop.test.ts`: `tick(0)` → `tick(1000)` で step が 15 回（250ms 切り捨て）。`tick(33.4)` 間隔で2回ずつ呼ばれる。
- [ ] **Step 2:** FAIL **Step 3:** 実装 **Step 4:** `npm run dev` をブラウザで開いて、3ゲームともひとりで遊べることを確かめる（キー操作、ゲームオーバー、ハイスコア）
- [ ] **Step 5:** check PASS、コミット `feat: 画面の土台とひとりで遊ぶ`

---

### Task 6: 対戦（Match）と NPC 対戦

**Files:** Create `src/match/{match,npcOpponent}.ts`, `src/ui/screens/{npcSetup,versus}.ts`。Test: `tests/match/match.test.ts`

**Interfaces:**
```ts
// match.ts
export interface Opponent {
  start(seed: number): void;
  update(dtMs: number): void;              // NPC はここで相手エンジンを進める。オンラインは何もしない
  sendAttack(ap: number): void;
  onAttack(cb: (ap: number) => void): void;
  reportSnapshot(s: GameSnapshot): void;
  onSnapshot(cb: (s: GameSnapshot) => void): void;
  reportLose(): void;
  onLose(cb: () => void): void;
  readonly paused: boolean;                 // 相手が切断中なら true
  dispose(): void;
}
export type RoundResult = 'win' | 'lose';
export class Match {
  constructor(myKind: GameKind, opponent: Opponent, opts: { snapshotIntervalMs: number });
  startRound(seed: number): void;           // 自分のエンジンを作って opponent.start
  update(dtMs: number, input: InputState): void; // paused なら進めない
  readonly me: GameEngine | null;
  readonly opponentSnapshot: GameSnapshot | null;
  readonly wins: { me: number; opp: number };
  onRoundEnd(cb: (r: RoundResult) => void): void;
  readonly finished: boolean;               // どちらかが winsNeeded に達した
}
// npcOpponent.ts
export class NpcOpponent implements Opponent { constructor(kind: GameKind, level: Difficulty) }
```
- versus 画面: 左に自分（大）、右に相手のスナップショット（小）、中央に受け取り予定のゲージと勝敗数。ラウンドの間は「Round 2」「YOU WIN」などを表示して、2秒後に次へ。決着がついたら「もう一回 / ホーム」。
- npcSetup: 自分のゲーム → NPC のゲーム → 難易度（かんたん / ふつう / むずかしい / 鬼）→ `#/versus/npc/:me/:opp/:level`

- [ ] **Step 1: failing tests**: FakeOpponent（メモリ上で動く）を使う。(a) 自分の AP が `sendAttack` に届く (b) `onAttack` で受けた AP が `me.pendingAttack` に入る (c) 自分が負ける → `reportLose` が呼ばれ `wins.opp==1` (d) 相手が負ける → `wins.me==1` (e) 2勝で `finished` (f) paused 中は `me` が進まない
- [ ] **Step 2–4:** FAIL → 実装 → PASS。ブラウザで「テトリス vs NPC ぷよ（ふつう）」を最後まで遊ぶ
- [ ] **Step 5:** コミット `feat: 対戦と NPC`

---

### Task 7: チュートリアル画面

**Files:** Create `src/ui/screens/tutorial.ts`。Test: `tests/games/tutorial.test.ts`

- 各ステップで `module.create({ seed: 1, mode: 'tutorial', initial: step.initial })`。上に説明、毎フレーム `goal(engine)` を見て、満たしたら「クリア！」→ 次へ。ゲームオーバーになったらそのステップをやり直す。最後に「チュートリアル完了」と「NPC対戦へ」ボタン。
- [ ] **Step 1: failing test**: 3ゲームの tutorial がそれぞれ 3 ステップ以上あって、各 `initial` で `create` してもエラーにならず、最初は `goal===false`
- [ ] **Step 2–4:** FAIL → 実装 → PASS、ブラウザで各ゲームのチュートリアルを最後まで進める
- [ ] **Step 5:** コミット `feat: チュートリアル`

---

### Task 8: オンライン対戦（部屋・Firebase・ロビー）

**Files:** Create `src/net/{transport,firebaseTransport,firebaseConfig,room}.ts`, `src/match/onlineOpponent.ts`, `src/ui/screens/online.ts`, `database.rules.json`。Test: `tests/net/room.test.ts`

**Interfaces:**
```ts
// transport.ts — Firebase の必要な部分だけを抽象化
export interface Transport {
  uid(): Promise<string>;
  serverNow(): number;
  get(path: string): Promise<any>;
  set(path: string, v: any): Promise<void>;
  update(path: string, v: Record<string, any>): Promise<void>;
  push(path: string, v: any): Promise<void>;
  on(path: string, cb: (v: any) => void): () => void;           // 値の購読
  onChildAdded(path: string, cb: (v: any) => void): () => void;
  onDisconnectSet(path: string, v: any): void;
}
export class MemoryTransport implements Transport { constructor(hub: MemoryHub, uid: string) } // テスト用。同じ hub を共有すると2人がつながる
export class MemoryHub { /* path → 値のツリー。listener に通知 */ setOnline(uid: string, online: boolean): void }
// room.ts
export type RoomError = 'not_found' | 'full' | 'expired';
export class Room {
  static create(t: Transport, name: string): Promise<Room>;
  static join(t: Transport, id: string, name: string): Promise<Room>; // 失敗したら Error(RoomError)
  readonly id: string; readonly isHost: boolean; readonly myId: string;
  readonly state: { info: RoomInfo; players: Record<string, PlayerInfo> };
  onChange(cb: () => void): () => void;
  setGame(kind: GameKind): Promise<void>; setReady(r: boolean): Promise<void>;
  link(baseUrl: string): string; // baseUrl + '#/room/' + id
  opponentId(): string | null;
  dispose(): void;
}
export function makeRoomId(): string; // 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' から6文字
// onlineOpponent.ts
export class OnlineOpponent implements Opponent { constructor(room: Room, t: Transport) } // attacks/{round} と boards を使う、切断15秒の扱い
// firebaseConfig.ts
export const firebaseConfig: Record<string, string> | null; // 未設定なら null
```
- 部屋のロジックは §9 のとおり（ホストが countdown と seed を書き、勝ち数を数える）。
- online 画面: `#/online` → 名前を入力 →「部屋を作る」→ `#/room/:id`。`#/room/:id` を開くと自動で参加する。ロビーには、リンクのコピー・共有ボタン、両プレイヤーの名前・選んだゲーム・準備OK、ゲームを選ぶ3枚のカード、準備OKボタンを置く。両方 ready になったらカウントダウン → versus 画面（Opponent は OnlineOpponent）。
- `firebaseConfig === null` なら「オンラインは準備中」と表示する。
- `database.rules.json` は §9.5 のとおり。

- [ ] **Step 1: failing tests**（MemoryTransport で2人）: (a) create → join で両方に2人見える (b) 3人目は `full` (c) 存在しない ID は `not_found` (d) createdAt が25時間前なら `expired` (e) 両方 ready → info.state が countdown になり seed が同じ (f) A の攻撃が B の onAttack に届き、自分の攻撃は自分に届かない (g) B が reportLose → ホストが A の wins を +1 (h) B が offline → A の Opponent.paused が true、15秒（偽の時計）で A のラウンド勝ち (i) makeRoomId は6文字で、使わない文字が入っていない
- [ ] **Step 2–4:** FAIL → 実装 → PASS
- [ ] **Step 5:** コミット `feat: オンライン対戦`

---

### Task 9: タッチ操作

**Files:** Create `src/input/touch.ts`。Modify solo / versus / tutorial の各画面。

```ts
export class TouchControls {
  constructor(root: HTMLElement, kind: GameKind, toLogicalX: (clientX: number) => number);
  poll(): InputState; dispose(): void;
}
export function mergeInput(a: InputState, b: InputState): InputState; // OR を取る。pointerX は a ?? b
export function touchEnabled(s: Settings): boolean; // auto のときは matchMedia('(pointer: coarse)')
```
- テトリスとぷよは画面下にボタン（pointerdown / pointerup で押しっぱなしを扱う）。スイカはキャンバス上のドラッグで pointerX、指を離すと hardDrop。
- [ ] **Step 1: failing test**: `mergeInput` の単体テスト
- [ ] **Step 2–4:** 実装 → ブラウザのモバイル表示（375×812）で3ゲームを操作して確かめる
- [ ] **Step 5:** コミット `feat: タッチ操作`

---

### Task 10: 公開（GitHub Pages + Firebase）

**Files:** Create `.github/workflows/deploy.yml`, `README.md`

- deploy.yml: `on: push: branches: [main]`、`actions/checkout@v4` → `actions/setup-node@v4`（node 20、npm cache）→ `npm ci` → `npm run check` → `actions/upload-pages-artifact@v3`（dist）→ `actions/deploy-pages@v4`。permissions は `pages: write`, `id-token: write`。
- README: 遊び方、ローカルでの起動方法（`npm i` → `npm run dev`）、Firebase の設定手順。
- [ ] **Step 1:** GitHub に公開リポジトリ `puzzle-battle` を作り（Chrome で操作）、push する。Settings → Pages の Source を「GitHub Actions」にする
- [ ] **Step 2:** Firebase: プロジェクトを作る（規約への同意はユーザー）→ Web アプリを登録 → Realtime Database を作る → Authentication で匿名認証を有効にする → ルールを貼る → config を `firebaseConfig.ts` に入れて push
- [ ] **Step 3:** 公開 URL を開いて、2つのタブ（片方はモバイル表示）でリンクからつながって1試合最後まで遊べることを確かめる
- [ ] **Step 4:** コミット `chore: デプロイ設定`
