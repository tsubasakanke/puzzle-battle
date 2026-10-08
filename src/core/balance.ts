// ゲームバランスの数値はすべてここに置く（設計書 §4〜§7, §9）

export const FRAME_MS = 1000 / 60;
export const MAX_FRAME_DT = 250;

export const TETRIS = {
  cols: 10, rows: 20, hiddenRows: 2, nextCount: 5,
  dasMs: 133, arrMs: 33, softDropMs: 33,
  lockDelayMs: 500, maxLockResets: 15, linesPerLevel: 10,
  /** レベルごとの落下間隔（最後の値で頭打ち） */
  gravityMs: [1000, 793, 618, 473, 355, 262, 190, 135, 94, 64, 43, 28, 18, 11, 7],
  versusGravityMs: 800,
  attackByLines: [0, 0, 1, 2, 4],
  tspinAttack: [0, 2, 4, 6],
  b2bBonus: 1,
  comboTable: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5],
  perfectClearBonus: 10,
  maxGarbagePerTurn: 8,
};

export const PUYO = {
  cols: 6, rows: 12, hiddenRows: 1, colors: 4, spawnCol: 2,
  fallMs: 600, softDropMs: 40, moveRepeatMs: 100, moveDasMs: 150, lockMs: 300, popMs: 400,
  chainPower: [0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512],
  colorBonus: [0, 0, 3, 6, 12],
  groupBonus: [0, 0, 0, 0, 0, 2, 3, 4, 5, 6, 7, 10],
  targetPoints: 70, nuisancePerAp: 6, maxNuisancePerTurn: 30,
};

export const SUIKA = {
  width: 400, height: 600, deadLineY: 80, dropY: 50,
  radii: [12, 16, 22, 26, 33, 40, 47, 55, 63, 73, 85],
  names: ['さくらんぼ', 'いちご', 'ぶどう', 'デコポン', 'かき', 'りんご', 'なし', 'もも', 'パイナップル', 'メロン', 'スイカ'],
  colors: ['#e0245e', '#ff4d6d', '#8e44ad', '#f39c12', '#e67e22', '#e74c3c', '#f1e05a', '#ffb3c1', '#f4d03f', '#7dcea0', '#27ae60'],
  spawnMaxType: 4, dropCooldownMs: 500, overLimitMs: 2000, graceMs: 1000,
  apByType: [0, 0, 0, 0, 1, 1, 2, 2, 3, 4, 5],
  comboWindowMs: 2000, comboPerBonus: 3,
  stoneRadius: 18, stoneBreakMargin: 10, maxStonesPerTurn: 8,
  /** px/ms */
  moveSpeed: 0.4,
};

export const AI = {
  thinkMs: { easy: 1200, normal: 600, hard: 350, oni: 150 },
};

export const MATCH = {
  winsNeeded: 2,
  countdownMs: 3000,
  disconnectGraceMs: 15000,
  roomTtlMs: 24 * 3600 * 1000,
  snapshotIntervalMs: 100,
};
