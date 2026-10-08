import { allKinds, GAME_INFO, modules } from '../../core/registry';
import type { GameKind } from '../../core/types';
import { h } from '../dom';
import type { Screen } from '../router';
import { go, page } from '../common';

export function gameCards(onPick: (k: GameKind) => void, selected?: GameKind) {
  return h('div', { class: 'cards' },
    ...allKinds.map(k =>
      h('button', { class: `card card-${k}${selected === k ? ' selected' : ''}`, onclick: () => onPick(k) },
        h('span', { class: 'card-emoji' }, GAME_INFO[k].emoji),
        h('b', {}, modules[k].name),
        h('small', {}, GAME_INFO[k].desc))));
}

export const selectScreen = (p: Record<string, string>): Screen => ({
  mount(root) {
    const title = p.next === 'tutorial' ? 'チュートリアル' : 'ひとりで遊ぶ';
    root.append(page(title, '/home', h('p', { class: 'lead' }, 'ゲームを選んでね'), gameCards(k => go(`/${p.next}/${k}`))));
  },
  unmount() {},
});
