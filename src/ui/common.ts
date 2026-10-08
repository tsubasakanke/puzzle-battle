import { sfx } from '../audio/sfx';
import { h } from './dom';
import { route } from './router';

export function page(title: string, back: string | null, ...children: (Node | string | null)[]) {
  return h(
    'div',
    { class: 'page' },
    h(
      'header',
      { class: 'page-head' },
      back ? h('button', { class: 'back', onclick: () => go(back) }, '← もどる') : null,
      h('h1', {}, title),
    ),
    ...children,
  );
}

export function go(path: string) {
  sfx.play('select');
  route(path);
}

export function button(label: string, onclick: () => void, cls = '') {
  return h('button', { class: `btn ${cls}`, onclick: () => { sfx.play('select'); onclick(); } }, label);
}

export const DIFFICULTY_LABEL = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい', oni: '鬼' } as const;
