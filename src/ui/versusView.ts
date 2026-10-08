import { modules } from '../core/registry';
import type { GameKind, GameModule, GameSnapshot } from '../core/types';
import type { Match } from '../match/match';
import { fitRect } from './dom';
import type { Playfield } from './playfield';

/** スナップショットを描くときの 幅/高さ */
const SNAP_ASPECT: Record<GameKind, number> = { tetris: 10 / 20, puyo: 6 / 12, suika: 400 / 600 };

/** 対戦画面を描く。自分の盤面は大きく、相手はスナップショットを小さく */
export function drawVersus(
  ctx: CanvasRenderingContext2D, w: number, hh: number, pf: Playfield,
  match: Match, myMod: GameModule, oppSnap: GameSnapshot | null, oppKind: GameKind,
) {
  const landscape = w >= hh * 0.9;
  const oppAspect = SNAP_ASPECT[oppKind];
  const mine = landscape
    ? fitRect(8, 8, w * 0.66 - 12, hh - 16, myMod.aspect)
    : fitRect(8, hh * 0.27, w - 16, hh * 0.73 - 8, myMod.aspect);
  const opp = landscape
    ? fitRect(w * 0.68, 36, w * 0.3, hh * 0.7, oppAspect)
    : fitRect(8, 26, w - 16, hh * 0.25 - 26, oppAspect);
  if (match.me) {
    pf.setInputRect(mine);
    myMod.draw(ctx, match.me, mine);
  }
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(opp.x - 4, opp.y - 4, opp.w + 8, opp.h + 8);
  ctx.restore();
  if (oppSnap) modules[oppSnap.kind].drawSnapshot(ctx, oppSnap, fitRect(opp.x, opp.y, opp.w, opp.h, SNAP_ASPECT[oppSnap.kind]));
  ctx.save();
  ctx.fillStyle = '#cfc8ff';
  ctx.font = `bold ${landscape ? 14 : 12}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('あいて', opp.x + opp.w / 2, opp.y - 10);
  ctx.restore();
}
