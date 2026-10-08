import type { GameModule } from '../../core/types';
import { PuyoEngine } from './rules';
import { drawPuyoEngine, drawPuyoSnapshot, LAYOUT_H, LAYOUT_W } from './render';
import { createPuyoAI } from './ai';
import { puyoTutorial } from './tutorial';

export { PuyoEngine } from './rules';

export const puyoModule: GameModule = {
  kind: 'puyo',
  name: 'ぷよぷよ',
  aspect: LAYOUT_W / LAYOUT_H,
  create: opts => new PuyoEngine(opts),
  draw: drawPuyoEngine,
  drawSnapshot: drawPuyoSnapshot,
  createAI: (engine, level, seed) => createPuyoAI(engine as PuyoEngine, level, seed),
  tutorial: puyoTutorial,
};
