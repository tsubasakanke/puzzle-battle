import { sfx } from '../../audio/sfx';
import { loadSettings, saveSettings } from '../../settings';
import { h } from '../dom';
import type { Screen } from '../router';
import { page } from '../common';

export const settingsScreen = (): Screen => ({
  mount(root) {
    const s = loadSettings();
    const save = () => { saveSettings(s); sfx.setVolume(s.volume); };
    const name = h('input', { type: 'text', maxlength: '12', value: s.name, placeholder: 'オンラインで表示される名前' });
    name.addEventListener('input', () => { s.name = name.value.trim(); save(); });
    const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s.volume) });
    vol.addEventListener('input', () => { s.volume = Number(vol.value); save(); });
    vol.addEventListener('change', () => sfx.play('clear'));
    const touch = h('select', {},
      ...(['auto', 'on', 'off'] as const).map(v =>
        h('option', { value: v, selected: s.touch === v }, { auto: '自動（スマホなら表示）', on: 'いつも表示', off: '表示しない' }[v])));
    touch.addEventListener('change', () => { s.touch = touch.value as typeof s.touch; save(); });
    const row = (label: string, el: HTMLElement) => h('label', { class: 'set-row' }, h('span', {}, label), el);
    root.append(page('設定', '/home',
      h('div', { class: 'panel' },
        row('名前', name),
        row('音量', vol),
        row('タッチ操作ボタン', touch)),
      h('div', { class: 'panel keys' },
        h('h2', {}, 'キー操作'),
        h('table', {},
          ...[
            ['移動', '← →（A D）'],
            ['ソフトドロップ', '↓（S）'],
            ['右回転', '↑ / X'],
            ['左回転', 'Z'],
            ['ハードドロップ / スイカを落とす', 'Space'],
            ['ホールド（テトリス）', 'C / Shift'],
            ['スイカ', 'マウスで動かしてクリックでも OK'],
            ['一時停止', 'Esc'],
          ].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, h('kbd', {}, b))))))));
  },
  unmount() {},
});
