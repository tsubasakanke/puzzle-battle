import type { Difficulty, GameKind } from '../../core/types';
import { modules } from '../../core/registry';
import { h } from '../dom';
import type { Screen } from '../router';
import { DIFFICULTY_LABEL, go, page } from '../common';
import { gameCards } from './select';

export const npcSetupScreen = (): Screen => ({
  mount(root) {
    let me: GameKind | null = null;
    let opp: GameKind | null = null;
    const body = h('div', {});
    const render = () => {
      if (!me) {
        body.replaceChildren(h('p', { class: 'lead' }, '① あなたが遊ぶゲーム'), gameCards(k => { me = k; render(); }));
      } else if (!opp) {
        body.replaceChildren(
          h('p', { class: 'lead' }, `あなた: ${modules[me].name}　→　② NPC が遊ぶゲーム`),
          gameCards(k => { opp = k; render(); }),
          h('p', { class: 'hint' }, '違うゲームを選ぶと「異種対戦」になるよ'));
      } else {
        const levels: Difficulty[] = ['easy', 'normal', 'hard', 'oni'];
        body.replaceChildren(
          h('p', { class: 'lead' }, `${modules[me].name} vs ${modules[opp].name}　→　③ 強さ`),
          h('div', { class: 'levels' },
            ...levels.map(l => h('button', { class: `level level-${l}`, onclick: () => go(`/versus/npc/${me}/${opp}/${l}`) }, DIFFICULTY_LABEL[l]))));
      }
    };
    render();
    root.append(page('NPC対戦', '/home', body));
  },
  unmount() {},
});
