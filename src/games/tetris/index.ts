import type { GameModule } from '../../core/types';
import { TetrisEngine } from './rules';
import { drawTetris, drawTetrisSnapshot } from './render';
import { createTetrisAI } from './ai';
import { tetrisTutorial } from './tutorial';

export const tetrisModule: GameModule = {
  kind: 'tetris',
  name: 'テトリス',
  aspect: 16 / 20,
  create: opts => new TetrisEngine(opts),
  draw: drawTetris,
  drawSnapshot: drawTetrisSnapshot,
  createAI: createTetrisAI,
  tutorial: tetrisTutorial,
};

export { TetrisEngine };
