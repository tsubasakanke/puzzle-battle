import { sfx } from '../../audio/sfx';
import { modules } from '../../core/registry';
import type { GameEngine, GameKind } from '../../core/types';
import { loadHighScore, saveHighScore } from '../../settings';
import { fitRect, h } from '../dom';
import { Playfield } from '../playfield';
import type { Screen } from '../router';
import { button, go } from '../common';

export const soloScreen = (p: Record<string, string>): Screen => {
  const kind = p.kind as GameKind;
  const mod = modules[kind];
  let pf: Playfield;
  let engine: GameEngine;
  let over = false;
  let hs = loadHighScore(kind);
  const hud = h('div', { class: 'hud' });

  const newGame = () => {
    engine = mod.create({ seed: Math.floor(Math.random() * 2 ** 31), mode: 'solo' });
    over = false;
    pf.paused = false;
    pf.overlay.replaceChildren();
  };

  const showOver = () => {
    sfx.play('lose');
    const best = engine.score > hs;
    if (best) { hs = engine.score; saveHighScore(kind, hs); }
    pf.overlay.replaceChildren(
      h('div', { class: 'ov-box' },
        h('h2', {}, 'GAME OVER'),
        h('p', {}, `スコア ${engine.score.toLocaleString()}`),
        best ? h('p', { class: 'best' }, '🎉 ハイスコア更新！') : h('p', {}, `ハイスコア ${hs.toLocaleString()}`),
        h('div', { class: 'ov-btns' }, button('もう一回', newGame, 'primary'), button('ホーム', () => go('/home')))));
  };

  const togglePause = () => {
    if (over) return;
    pf.paused = !pf.paused;
    pf.overlay.replaceChildren(
      ...(pf.paused
        ? [h('div', { class: 'ov-box' }, h('h2', {}, '一時停止'),
            h('div', { class: 'ov-btns' }, button('つづける', togglePause, 'primary'), button('ホーム', () => go('/home'))))]
        : []));
  };
  const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape' || e.code === 'KeyP') togglePause(); };

  return {
    mount(root) {
      pf = new Playfield(kind, {
        step(dt, input) {
          if (over) return;
          engine.update(dt, input);
          if (engine.isOver) { over = true; showOver(); }
        },
        draw(ctx, w, hh) {
          const r = fitRect(8, 8, w - 16, hh - 16, mod.aspect);
          pf.setInputRect(r);
          mod.draw(ctx, engine, r);
          hud.textContent = `${mod.name}　スコア ${engine.score.toLocaleString()}　ハイスコア ${Math.max(hs, engine.score).toLocaleString()}`;
        },
      });
      newGame();
      const pauseBtn = h('button', { class: 'icon-btn', onclick: togglePause, 'aria-label': '一時停止' }, '⏸');
      root.append(h('div', { class: 'game-screen' },
        h('div', { class: 'topbar' }, h('button', { class: 'icon-btn', onclick: () => go('/home') }, '←'), hud, pauseBtn),
        pf.el));
      window.addEventListener('keydown', onKey);
      pf.start();
    },
    unmount() {
      window.removeEventListener('keydown', onKey);
      pf.dispose();
    },
  };
};
