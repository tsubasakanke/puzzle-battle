import { h } from '../dom';
import type { Screen } from '../router';
import { go } from '../common';

export const homeScreen = (): Screen => ({
  mount(root) {
    const item = (emoji: string, label: string, sub: string, path: string) =>
      h('button', { class: 'menu-item', onclick: () => go(path) },
        h('span', { class: 'mi-emoji' }, emoji),
        h('span', { class: 'mi-text' }, h('b', {}, label), h('small', {}, sub)));
    root.append(
      h('div', { class: 'page home' },
        h('div', { class: 'logo' }, h('span', {}, '🧱🟢🍉'), h('h1', {}, 'Puzzle Battle'), h('p', {}, 'テトリス × ぷよぷよ × スイカゲーム')),
        h('nav', { class: 'menu' },
          item('🎮', 'ひとりで遊ぶ', 'ハイスコアをめざそう', '/select/solo'),
          item('📖', 'チュートリアル', 'はじめての人はここから', '/select/tutorial'),
          item('🤖', 'NPC対戦', '4段階の強さのコンピューターと', '/npc'),
          item('🌐', 'オンライン対戦', 'リンクを送って友達と', '/online'),
          item('⚙️', '設定', '音量・タッチ操作・名前', '/settings'),
        ),
      ),
    );
  },
  unmount() {},
});
