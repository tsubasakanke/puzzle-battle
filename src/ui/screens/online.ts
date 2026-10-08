import { onlineAvailable, getTransport } from '../../net/connect';
import { Room } from '../../net/room';
import { loadSettings, saveSettings } from '../../settings';
import { h } from '../dom';
import type { Screen } from '../router';
import { button, go, page } from '../common';

export function playerName(): string {
  const s = loadSettings();
  if (s.name) return s.name;
  s.name = `ゲスト${Math.floor(100 + Math.random() * 900)}`;
  saveSettings(s);
  return s.name;
}

export const onlineScreen = (): Screen => ({
  mount(root) {
    if (!onlineAvailable()) {
      root.append(page('オンライン対戦', '/home', h('div', { class: 'panel' }, h('p', {}, '🛠 オンラインは準備中だよ。もう少し待ってね！'))));
      return;
    }
    const s = loadSettings();
    const name = h('input', { type: 'text', maxlength: '12', value: s.name, placeholder: '名前（あとから設定でも変えられる）' });
    const status = h('p', { class: 'hint' });
    const create = button('部屋を作る', async () => {
      const n = name.value.trim();
      if (n) { s.name = n; saveSettings(s); }
      status.textContent = '部屋を作っています…';
      try {
        const t = await getTransport();
        const room = await Room.create(t, playerName());
        room.dispose();
        go(`/room/${room.id}`);
      } catch (e) {
        status.textContent = `部屋を作れませんでした（${(e as Error).message}）。通信状況を確認してね`;
      }
    }, 'primary big');
    const code = h('input', { type: 'text', maxlength: '6', placeholder: '部屋コード（6文字）', style: { textTransform: 'uppercase' } });
    const join = button('参加する', () => {
      const id = code.value.trim().toUpperCase();
      if (id.length === 6) go(`/room/${id}`);
      else status.textContent = '部屋コードは6文字だよ';
    });
    root.append(page('オンライン対戦', '/home',
      h('div', { class: 'panel' },
        h('label', { class: 'set-row' }, h('span', {}, '名前'), name),
        create,
        h('p', { class: 'hint' }, '部屋を作ったら、出てくるリンクを友達に送ってね。友達はリンクを開くだけで参加できるよ')),
      h('div', { class: 'panel' },
        h('h2', {}, 'コードで参加'),
        h('div', { class: 'row' }, code, join)),
      status));
  },
  unmount() {},
});
