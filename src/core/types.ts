export type GameKind = 'tetris' | 'puyo' | 'suika';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'oni';
export interface Rect { x: number; y: number; w: number; h: number }

/** 1フレーム分の入力。left/right/down は押しっぱなし、それ以外は押した瞬間だけ true */
export interface InputState {
  left: boolean;
  right: boolean;
  down: boolean;
  rotateCW: boolean;
  rotateCCW: boolean;
  /** テトリス: ハードドロップ / スイカ: 落とす */
  hardDrop: boolean;
  hold: boolean;
  /** スイカ: 論理座標 0..400 の位置。null なら使わない */
  pointerX: number | null;
}

export const emptyInput = (): InputState => ({
  left: false, right: false, down: false,
  rotateCW: false, rotateCCW: false, hardDrop: false, hold: false,
  pointerX: null,
});

export type GameSnapshot =
  /** 20行、各10文字。'.' 空、'IJLOSTZ' ミノ、'G' おじゃま */
  | { kind: 'tetris'; rows: string[] }
  /** 12行、各6文字。'.' 空、'RGBY' 色、'N' おじゃま */
  | { kind: 'puyo'; rows: string[] }
  /** [x, y, type, x, y, type, ...] 整数。type -1 は石 */
  | { kind: 'suika'; bodies: number[] };

export interface EngineOptions {
  seed: number;
  mode: 'solo' | 'versus' | 'tutorial';
  /** チュートリアル用の初期盤面（ゲームごとの形式） */
  initial?: unknown;
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
  /** チュートリアルの判定用カウンタ */
  readonly stats: Record<string, number>;
}

export interface AIController { next(dtMs: number): InputState }

export interface TutorialStep {
  title: string;
  text: string;
  initial?: unknown;
  goal: (e: GameEngine) => boolean;
}

export interface GameModule {
  kind: GameKind;
  name: string;
  /** draw に渡す rect の推奨 幅/高さ */
  aspect: number;
  create(opts: EngineOptions): GameEngine;
  draw(ctx: CanvasRenderingContext2D, engine: GameEngine, rect: Rect): void;
  drawSnapshot(ctx: CanvasRenderingContext2D, snap: GameSnapshot, rect: Rect): void;
  createAI(engine: GameEngine, level: Difficulty, seed: number): AIController;
  tutorial: TutorialStep[];
}
