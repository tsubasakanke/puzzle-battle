import type { GameModule } from '../../core/types';
import { SUIKA } from '../../core/balance';
import { SuikaEngine } from './rules';
import { drawSuika, drawSuikaSnapshot } from './render';
import { createSuikaAI } from './ai';
import { suikaTutorial } from './tutorial';

export const suikaModule: GameModule = {
  kind: 'suika',
  name: 'スイカゲーム',
  aspect: SUIKA.width / (SUIKA.height + 80),
  create: opts => new SuikaEngine(opts),
  draw: (ctx, engine, rect) => drawSuika(ctx, engine as SuikaEngine, rect),
  drawSnapshot: drawSuikaSnapshot,
  createAI: createSuikaAI,
  tutorial: suikaTutorial,
};
