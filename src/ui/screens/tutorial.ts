import { sfx } from '../../audio/sfx';
import { modules } from '../../core/registry';
import type { GameEngine, GameKind } from '../../core/types';
import { fitRect, h } from '../dom';
import { Playfield } from '../playfield';
import type { Screen } from '../router';
import { button, go } from '../common';

const CLEAR_MS = 1500;

export const tutorialScreen = (p: Record<string, string>): Screen => {
  const kind = p.kind as GameKind;
  const mod = modules[kind];
  const steps = mod.tutorial;
  let pf: Playfield;
  let idx = 0;
  let engine: GameEngine;
  let clearTimer = 0;
  let done = false;
  const title = h('b', {});
  const text = h('p', {});
  const progress = h('span', { class: 'tut-progress' });
  const panel = h('div', { class: 'tut-panel' }, progress, title, text);

  const load = (i: number) => {
    idx = i;
    const s = steps[i];
    engine = mod.create({ seed: 1 + i, mode: 'tutorial', initial: s.initial });
    clearTimer = 0;
    progress.textContent = `ステップ ${i + 1} / ${steps.length}`;
    title.textContent = s.title;
    text.textContent = s.text;
    pf.overlay.replaceChildren();
  };

  const finish = () => {
    done = true;
    sfx.play('win');
    pf.overlay.replaceChildren(
      h('div', { class: 'ov-box' },
        h('h2', {}, '🎓 チュートリアル完了！'),
        h('p', {}, `${mod.name}の基本はバッチリ`),
        h('div', { class: 'ov-btns' },
          button('NPC対戦へ', () => go('/npc'), 'primary'),
          button('ひとりで遊ぶ', () => go(`/solo/${kind}`)),
          button('ホーム', () => go('/home')))));
  };

  return {
    mount(root) {
      pf = new Playfield(kind, {
        step(dt, input) {
          if (done) return;
          if (clearTimer > 0) {
            clearTimer -= dt;
            if (clearTimer <= 0) {
              if (idx + 1 < steps.length) load(idx + 1);
              else finish();
            }
            return;
          }
          engine.update(dt, input);
          if (steps[idx].goal(engine)) {
            sfx.play('clear');
            clearTimer = CLEAR_MS;
            pf.overlay.replaceChildren(h('div', { class: 'ov-big' }, h('b', {}, 'クリア！')));
          } else if (engine.isOver) {
            sfx.play('lose');
            load(idx); // そのステップをやり直す
          }
        },
        draw(ctx, w, hh) {
          const r = fitRect(8, 8, w - 16, hh - 16, mod.aspect);
          pf.setInputRect(r);
          mod.draw(ctx, engine, r);
        },
      });
      root.append(h('div', { class: 'game-screen' },
        h('div', { class: 'topbar' },
          h('button', { class: 'icon-btn', onclick: () => go('/select/tutorial') }, '←'),
          h('div', { class: 'hud' }, `${mod.name} チュートリアル`),
          h('button', { class: 'icon-btn small', onclick: () => (idx + 1 < steps.length ? load(idx + 1) : finish()) }, 'スキップ')),
        panel, pf.el));
      load(0);
      pf.start();
    },
    unmount() {
      pf.dispose();
    },
  };
};
