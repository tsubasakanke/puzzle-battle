import type { AIController, Difficulty, GameEngine, InputState } from '../../core/types';
import { emptyInput } from '../../core/types';
import { AI, SUIKA } from '../../core/balance';
import { mulberry32, type Rng } from '../../core/rng';
import { radiusOf, type SuikaBody, type SuikaEngine } from './rules';

/** カーソルを動かす速さ (px/ms)。人っぽく見えるよう少しゆっくり */
const AIM_SPEED = SUIKA.moveSpeed * 1.5;
const CANDIDATES = 20;

/** x に半径 r のフルーツを落としたときに最初に触れる位置 */
export function landing(bodies: SuikaBody[], x: number, r: number): { y: number; touching: SuikaBody[] } {
  let y = SUIKA.height - r;
  const hits: { b: SuikaBody; y: number }[] = [];
  for (const b of bodies) {
    const dx = Math.abs(b.x - x);
    const d = b.r + r;
    if (dx >= d) continue;
    const yy = b.y - Math.sqrt(d * d - dx * dx);
    hits.push({ b, y: yy });
    if (yy < y) y = yy;
  }
  return { y, touching: hits.filter(h => h.y <= y + 8).map(h => h.b) };
}

function candidateXs(r: number): number[] {
  const lo = r, hi = SUIKA.width - r;
  return Array.from({ length: CANDIDATES }, (_, i) => lo + ((hi - lo) * i) / (CANDIDATES - 1));
}

/** むずかしい / 鬼 の評価 */
function evaluate(bodies: SuikaBody[], x: number, type: number): number {
  const r = radiusOf(type);
  const { y, touching } = landing(bodies, x, r);
  let s = 0;
  // 高く積むほど悪い
  s -= (SUIKA.height - y) * 0.15;
  if (y - r < SUIKA.deadLineY + 40) s -= 200;
  for (const b of touching) {
    if (b.type === type) s += 60;
    else if (b.type === -1) s -= 5;
    else s -= Math.abs(b.type - type) * 3;
  }
  // 同じ種類が近くにある
  for (const b of bodies) {
    if (b.type === type && Math.hypot(b.x - x, b.y - y) < (b.r + r) * 1.6) s += 15;
  }
  // 大きいフルーツは壁際に寄せる
  const wallDist = Math.min(x - r, SUIKA.width - r - x);
  if (type >= 3) s += Math.max(0, 40 - wallDist) * 0.3;
  return s;
}

function chooseTarget(e: SuikaEngine, level: Difficulty, rng: Rng): number {
  const type = e.current;
  const r = radiusOf(type);
  const xs = candidateXs(r);
  const bodies = e.bodies();
  if (level === 'easy') return xs[Math.floor(rng() * xs.length)];
  if (level === 'normal') {
    // 同じ種類のうち一番上にあるものの真上を狙う。なければ一番低いところ
    const same = bodies.filter(b => b.type === type).sort((a, b) => a.y - b.y);
    if (same.length) return Math.max(r, Math.min(SUIKA.width - r, same[0].x));
    let best = xs[0], bestY = -Infinity;
    for (const x of xs) {
      const y = landing(bodies, x, r).y + rng() * 2;
      if (y > bestY) { bestY = y; best = x; }
    }
    return best;
  }
  let best = xs[0], bestS = -Infinity;
  for (const x of xs) {
    const s = evaluate(bodies, x, type) + rng() * 0.5;
    if (s > bestS) { bestS = s; best = x; }
  }
  return best;
}

export function createSuikaAI(engine: GameEngine, level: Difficulty, seed: number): AIController {
  const e = engine as SuikaEngine;
  const rng = mulberry32(seed);
  const think = AI.thinkMs[level];
  let target: number | null = null;
  let aimX = e.cursorX;
  let timer = 0;
  let dropsAtStart = e.stats.drops;

  return {
    next(dtMs: number): InputState {
      const input = emptyInput();
      if (e.isOver) return input;
      if (e.stats.drops !== dropsAtStart) { target = null; dropsAtStart = e.stats.drops; }
      if (target === null) { target = chooseTarget(e, level, rng); timer = 0; aimX = e.cursorX; }
      timer += dtMs;
      const d = target - aimX;
      const stepPx = AIM_SPEED * dtMs;
      aimX = Math.abs(d) <= stepPx ? target : aimX + Math.sign(d) * stepPx;
      input.pointerX = aimX;
      if (timer >= think && aimX === target && e.canDrop()) input.hardDrop = true;
      return input;
    },
  };
}
