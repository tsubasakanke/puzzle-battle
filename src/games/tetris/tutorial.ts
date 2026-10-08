import type { TutorialStep } from '../../core/types';
import type { TetrisInitial } from './rules';

const s = (e: { stats: Record<string, number> }, k: string) => e.stats[k] ?? 0;

export const tetrisTutorial: TutorialStep[] = [
  {
    title: '移動と回転',
    text: '←→ でミノを左右に動かそう。↑ か X で右回転、Z で左回転。合わせて5回動かしてみよう！',
    goal: e => s(e, 'moves') + s(e, 'rotations') >= 5,
  },
  {
    title: 'ハードドロップでライン消し',
    text: 'Space でミノを一気に落とせる（ハードドロップ）。すき間にミノを入れて、横1列をそろえて消そう！',
    initial: { rows: ['GGGG..GGGG', 'GGGG..GGGG'], queue: ['O'] } satisfies TetrisInitial,
    goal: e => s(e, 'lines') >= 1,
  },
  {
    title: 'ホールド',
    text: 'C か Shift で今のミノをしまっておける（ホールド）。あとで取り出して使えるよ。1回ホールドしてみよう！',
    goal: e => s(e, 'holds') >= 1,
  },
  {
    title: '4列消しで攻撃',
    text: '4列まとめて消す「テトリス」は相手に4列分の攻撃になる！ I ミノを縦にして右はしのすき間に入れよう。',
    initial: { rows: Array(4).fill('GGGGGGGGG.'), queue: ['I'] } satisfies TetrisInitial,
    goal: e => s(e, 'tetrises') >= 1,
  },
];
