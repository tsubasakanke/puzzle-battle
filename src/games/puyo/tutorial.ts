// ぷよぷよのチュートリアル
import type { TutorialStep } from '../../core/types';
import type { PuyoInitial } from './rules';

const step2: PuyoInitial = { rows: ['RRR...'], pairs: [['R', 'R']] };
// 右に1つ動かして落とすと: G が5つつながって消える → 子の B が落ちて B が4つ → 2連鎖
const step3: PuyoInitial = { rows: ['BBBG..', 'GGG...'], pairs: [['G', 'B']] };

export const puyoTutorial: TutorialStep[] = [
  {
    title: '移動と回転',
    text: '←→で左右に動かして、X/↑で右回転、Zで左回転。合わせて5回動かしてみよう',
    goal: e => (e.stats.moves ?? 0) + (e.stats.rotations ?? 0) >= 5,
  },
  {
    title: '4つつなげて消す',
    text: '同じ色を4つつなげると消えるよ。赤いぷよを→で1つ右に動かして、↓で落とそう',
    initial: step2,
    goal: e => (e.stats.pops ?? 0) >= 1,
  },
  {
    title: '2連鎖を組む',
    text: '消えたあとに落ちてきたぷよがまた4つそろうと「連鎖」になるよ。→で1つ右に動かして落とし、2連鎖を起こそう',
    initial: step3,
    goal: e => (e.stats.maxChain ?? 0) >= 2,
  },
];
