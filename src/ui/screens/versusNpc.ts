import { sfx } from '../../audio/sfx';
import { MATCH } from '../../core/balance';
import { modules } from '../../core/registry';
import type { Difficulty, GameKind } from '../../core/types';
import { Match } from '../../match/match';
import { NpcOpponent } from '../../match/npcOpponent';
import { h } from '../dom';
import { Playfield } from '../playfield';
import type { Screen } from '../router';
import { button, DIFFICULTY_LABEL, go } from '../common';
import { drawVersus } from '../versusView';

const RESULT_MS = 2000;

export const versusNpcScreen = (p: Record<string, string>): Screen => {
  const myKind = p.me as GameKind;
  const oppKind = p.opp as GameKind;
  const level = p.level as Difficulty;
  const myMod = modules[myKind];
  let pf: Playfield;
  let match: Match;
  /** 0 より大きい間はカウントダウン中 */
  let countdown = 0;
  /** 0 より大きい間はラウンド結果の表示中 */
  let resultTimer = 0;
  const hud = h('div', { class: 'hud' });

  const overlayText = (big: string, small = '') =>
    pf.overlay.replaceChildren(h('div', { class: 'ov-big' }, h('b', {}, big), small ? h('small', {}, small) : ''));

  const newMatch = () => {
    match?.dispose();
    match = new Match(o => myMod.create(o), new NpcOpponent(modules[oppKind], level));
    match.onRoundEnd(r => {
      sfx.play(r === 'win' ? 'win' : 'lose');
      overlayText(r === 'win' ? 'WIN!' : 'LOSE…', `${match.wins.me} - ${match.wins.opp}`);
      resultTimer = RESULT_MS;
    });
    nextRound();
  };

  const nextRound = () => {
    match.startRound(Math.floor(Math.random() * 2 ** 31));
    countdown = MATCH.countdownMs;
  };

  const showFinal = () => {
    const won = match.wins.me > match.wins.opp;
    pf.overlay.replaceChildren(
      h('div', { class: 'ov-box' },
        h('h2', {}, won ? '🏆 あなたの勝ち！' : '😢 NPC の勝ち'),
        h('p', {}, `${match.wins.me} - ${match.wins.opp}`),
        h('div', { class: 'ov-btns' },
          button('もう一回', () => { pf.overlay.replaceChildren(); newMatch(); }, 'primary'),
          button('設定を変える', () => go('/npc')),
          button('ホーム', () => go('/home')))));
  };

  return {
    mount(root) {
      pf = new Playfield(myKind, {
        step(dt, input) {
          if (countdown > 0) {
            const before = Math.ceil(countdown / 1000);
            countdown -= dt;
            const now = Math.ceil(countdown / 1000);
            if (countdown <= 0) { pf.overlay.replaceChildren(); sfx.play('attack'); }
            else if (now !== before || !pf.overlay.childElementCount) { overlayText(String(now), `Round ${match.wins.me + match.wins.opp + 1}`); sfx.play('select'); }
            return;
          }
          if (resultTimer > 0) {
            resultTimer -= dt;
            if (resultTimer <= 0) {
              if (match.finished) showFinal();
              else { pf.overlay.replaceChildren(); nextRound(); }
            }
            return;
          }
          match.update(dt, input);
        },
        draw(ctx, w, hh) {
          drawVersus(ctx, w, hh, pf, match, myMod, match.opponentSnapshot, oppKind);
          hud.textContent = `あなた ${'●'.repeat(match.wins.me)}${'○'.repeat(MATCH.winsNeeded - match.wins.me)}　vs　${'●'.repeat(match.wins.opp)}${'○'.repeat(MATCH.winsNeeded - match.wins.opp)} NPC（${DIFFICULTY_LABEL[level]}）`;
        },
      });
      newMatch();
      root.append(h('div', { class: 'game-screen' },
        h('div', { class: 'topbar' }, h('button', { class: 'icon-btn', onclick: () => go('/npc') }, '←'), hud),
        pf.el));
      pf.start();
    },
    unmount() {
      pf.dispose();
      match?.dispose();
    },
  };
};
