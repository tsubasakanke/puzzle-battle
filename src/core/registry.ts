import type { GameKind, GameModule } from './types';
import { tetrisModule } from '../games/tetris';
import { puyoModule } from '../games/puyo';
import { suikaModule } from '../games/suika';

export const modules: Record<GameKind, GameModule> = {
  tetris: tetrisModule,
  puyo: puyoModule,
  suika: suikaModule,
};

export const allKinds: GameKind[] = ['tetris', 'puyo', 'suika'];

export const isKind = (s: string): s is GameKind => (allKinds as string[]).includes(s);

export const GAME_INFO: Record<GameKind, { emoji: string; desc: string }> = {
  tetris: { emoji: '🧱', desc: 'ブロックを並べてラインを消す' },
  puyo: { emoji: '🟢', desc: '同じ色を4つつなげて連鎖' },
  suika: { emoji: '🍉', desc: '同じフルーツをくっつけて大きく' },
};
