import type { TutorialStep } from '../../core/types';
import type { SuikaInitial } from './rules';

export const suikaTutorial: TutorialStep[] = [
  {
    title: '狙って落とそう',
    text: '←→（またはマウス）で動かして Space/クリックで落とそう。3回落とそう',
    goal: e => e.stats.drops >= 3,
  },
  {
    title: '合体させよう',
    text: '同じフルーツをくっつけて合体させよう。いちごの真上に落とすと合体するよ',
    initial: { fruits: [{ x: 200, y: 584, type: 1 }], queue: [1] } satisfies SuikaInitial,
    goal: e => e.stats.merges >= 1,
  },
  {
    title: 'おじゃま石を砕こう',
    text: 'おじゃま石の近くで合体させて砕こう。ぶどうの上にぶどうを落とそう',
    initial: { fruits: [{ x: 180, y: 578, type: 2 }], stones: [{ x: 220, y: 582 }], queue: [2] } satisfies SuikaInitial,
    goal: e => e.stats.stonesBroken >= 1,
  },
];
