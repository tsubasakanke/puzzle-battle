import { sfx } from '../../audio/sfx';
import { MATCH } from '../../core/balance';
import { GAME_INFO, isKind, modules } from '../../core/registry';
import type { GameKind } from '../../core/types';
import { Match } from '../../match/match';
import { OnlineOpponent } from '../../match/onlineOpponent';
import { getTransport, onlineAvailable } from '../../net/connect';
import { Room } from '../../net/room';
import type { Transport } from '../../net/transport';
import { h } from '../dom';
import { Playfield } from '../playfield';
import type { Screen } from '../router';
import { button, go, page } from '../common';
import { drawVersus } from '../versusView';
import { gameCards } from './select';
import { playerName } from './online';

const ERRORS: Record<string, string> = {
  not_found: 'この部屋は見つからなかったよ。リンクが正しいか確認してね',
  full: 'この部屋はもう2人そろってるよ',
  expired: 'この部屋は期限切れ（24時間）だよ。新しく部屋を作ってね',
  not_configured: 'オンラインは準備中だよ',
};

export const roomScreen = (p: Record<string, string>): Screen => {
  const id = p.id.toUpperCase();
  let root: HTMLElement;
  let t: Transport;
  let room: Room | null = null;
  let off: (() => void) | null = null;
  let disposed = false;

  // 対戦まわり
  let pf: Playfield | null = null;
  let match: Match | null = null;
  let opp: OnlineOpponent | null = null;
  let playingRound = 0;
  /** 入った時点で進行中だったラウンド（そのラウンドは見送る） */
  let skipRound = -1;
  let roundOverShown = false;
  const hud = h('div', { class: 'hud' });

  const baseUrl = () => location.origin + location.pathname;

  const showError = (code: string) => {
    root.replaceChildren(page('オンライン対戦', '/home',
      h('div', { class: 'panel' }, h('p', {}, ERRORS[code] ?? `つながりませんでした（${code}）。通信状況を確認してね`),
        h('div', { class: 'ov-btns' }, button('もう一度', () => location.reload(), 'primary'), button('ホーム', () => go('/home'))))));
  };

  const myGame = (): GameKind => {
    const g = room!.state.players[room!.myId]?.game;
    return g && isKind(g) ? g : 'tetris';
  };

  const name = (uid: string | null) => (uid && room!.state.players[uid]?.name) || '？';

  const winsText = () => {
    const r = room!;
    const oid = r.opponentId();
    const dots = (n: number) => '●'.repeat(n) + '○'.repeat(Math.max(0, MATCH.winsNeeded - n));
    return `${name(r.myId)} ${dots(r.wins(r.myId))}　vs　${oid ? dots(r.wins(oid)) : ''} ${name(oid)}`;
  };

  // ---------- ロビー ----------
  const renderLobby = () => {
    const r = room!;
    const { info, players } = r.state;
    const me = players[r.myId];
    const oid = r.opponentId();
    const link = r.link(baseUrl());
    const linkInput = h('input', { type: 'text', readonly: true, value: link, class: 'link-input', onclick: (e: Event) => (e.target as HTMLInputElement).select() });
    const copyBtn = button('リンクをコピー', async () => {
      try { await navigator.clipboard.writeText(link); copyBtn.textContent = 'コピーした！'; }
      catch { linkInput.select(); copyBtn.textContent = '選択したのでコピーしてね'; }
    }, 'primary');
    const shareBtn = 'share' in navigator
      ? button('共有…', () => void navigator.share({ title: 'Puzzle Battle', text: '対戦しよう！', url: link }).catch(() => {}))
      : null;

    const slot = (uid: string | null) => {
      if (!uid) return h('div', { class: 'slot empty' }, h('b', {}, '友達を待っています…'), h('small', {}, '上のリンクを送ってね'));
      const pl = players[uid];
      const g = isKind(pl.game) ? pl.game : 'tetris';
      return h('div', { class: `slot${pl.ready ? ' ready' : ''}${pl.online ? '' : ' offline'}` },
        h('b', {}, `${pl.name}${uid === r.myId ? '（あなた）' : ''}`),
        h('span', {}, `${GAME_INFO[g].emoji} ${modules[g].name}`),
        h('small', {}, !pl.online ? '📴 接続が切れています' : pl.ready ? '✅ 準備OK' : '⌛ 準備中'));
    };

    const result = info.state === 'finished' && oid
      ? h('div', { class: 'panel result' },
          h('h2', {}, r.wins(r.myId) > r.wins(oid) ? '🏆 あなたの勝ち！' : '😢 負けちゃった…'),
          h('p', {}, `${r.wins(r.myId)} - ${r.wins(oid)}`),
          h('p', { class: 'hint' }, 'もう一回やるなら、2人とも「準備OK」を押してね'))
      : null;

    const readyBtn = button(me?.ready ? '準備OKを取り消す' : '準備OK！', () => void r.setReady(!me?.ready), me?.ready ? '' : 'primary big');
    if (!oid) readyBtn.setAttribute('disabled', '');

    root.replaceChildren(page('オンライン対戦', '/home',
      result,
      h('div', { class: 'panel' },
        h('p', { class: 'room-code' }, '部屋コード ', h('b', {}, r.id)),
        h('div', { class: 'row' }, linkInput),
        h('div', { class: 'row' }, copyBtn, shareBtn)),
      h('div', { class: 'slots' }, slot(r.myId), h('span', { class: 'vs' }, 'VS'), slot(oid)),
      h('div', { class: 'panel' },
        h('h2', {}, 'あなたが遊ぶゲーム'),
        gameCards(k => void r.setGame(k), myGame()),
        h('p', { class: 'hint' }, '相手と同じゲームなら同じゲーム対戦、違うゲームなら異種対戦になるよ')),
      readyBtn));
  };

  // ---------- 対戦 ----------
  const overlay = (big: string, small = '') =>
    pf?.overlay.replaceChildren(h('div', { class: 'ov-big' }, h('b', {}, big), small ? h('small', {}, small) : ''));

  const startRound = () => {
    const r = room!;
    const kind = myGame();
    const myMod = modules[kind];
    playingRound = r.state.info.round;
    roundOverShown = false;
    match?.dispose();
    opp = new OnlineOpponent(r, t);
    match = new Match(o => myMod.create(o), opp);
    match.onRoundEnd(res => {
      sfx.play(res === 'win' ? 'win' : 'lose');
      roundOverShown = true;
      overlay(res === 'win' ? 'WIN!' : 'LOSE…');
    });
    match.startRound(r.state.info.seed);

    if (!pf) {
      pf = new Playfield(kind, {
        step: (dt, input) => {
          const m = match, o = opp, rm = room;
          if (!m || !o || !rm || m.roundOver) return;
          const left = rm.state.info.startAt - t.serverNow();
          if (left > 0) {
            overlay(String(Math.ceil(left / 1000)), `Round ${rm.state.info.round - rm.state.info.baseRound}`);
            return;
          }
          if (o.paused) overlay('⌛', `相手の接続を待っています… あと ${Math.ceil(o.offlineRemainingMs / 1000)} 秒`);
          else if (pf!.overlay.childElementCount && !roundOverShown) pf!.overlay.replaceChildren();
          m.update(dt, input);
        },
        draw: (ctx, w, hh) => {
          if (!match || !room) return;
          const oid = room.opponentId();
          const og = oid ? room.state.players[oid]?.game : 'tetris';
          drawVersus(ctx, w, hh, pf!, match, modules[myGame()], match.opponentSnapshot, og && isKind(og) ? og : 'tetris');
          hud.textContent = winsText();
        },
      });
      root.replaceChildren(h('div', { class: 'game-screen' },
        h('div', { class: 'topbar' }, h('button', { class: 'icon-btn', onclick: () => go('/home') }, '←'), hud),
        pf.el));
      pf.start();
    } else {
      pf.setKind(kind);
    }
  };

  const stopBattle = () => {
    match?.dispose();
    match = null;
    opp = null;
    pf?.dispose();
    pf = null;
  };

  const onChange = () => {
    if (!room) return;
    const { info } = room.state;
    if (info.state === 'playing') {
      if (info.round === skipRound) {
        if (!pf) root.replaceChildren(page('オンライン対戦', '/home', h('div', { class: 'panel' }, h('p', {}, '今のラウンドが終わるまで待っててね…'))));
        return;
      }
      if (info.round !== playingRound) startRound();
      return;
    }
    if (pf) stopBattle();
    renderLobby();
  };

  return {
    mount(r) {
      root = r;
      if (!onlineAvailable()) return showError('not_configured');
      root.append(page('オンライン対戦', '/home', h('div', { class: 'panel' }, h('p', {}, '部屋に接続しています…'))));
      getTransport()
        .then(tr => { t = tr; return Room.join(tr, id, playerName()); })
        .then(rm => {
          if (disposed) return rm.leave();
          room = rm;
          if (rm.state.info.state === 'playing') skipRound = rm.state.info.round;
          off = rm.onChange(onChange);
          onChange();
        })
        .catch(e => showError((e as Error).message));
    },
    unmount() {
      disposed = true;
      off?.();
      stopBattle();
      room?.leave();
    },
  };
};
