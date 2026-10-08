import { emptyInput, type GameKind, type InputState } from '../core/types';
import type { Settings } from '../settings';
import { h } from '../ui/dom';

/** 2つの入力の OR を取る。pointerX は a を優先する */
export function mergeInput(a: InputState, b: InputState): InputState {
  return {
    left: a.left || b.left,
    right: a.right || b.right,
    down: a.down || b.down,
    rotateCW: a.rotateCW || b.rotateCW,
    rotateCCW: a.rotateCCW || b.rotateCCW,
    hardDrop: a.hardDrop || b.hardDrop,
    hold: a.hold || b.hold,
    pointerX: a.pointerX ?? b.pointerX,
  };
}

export function touchEnabled(s: Settings): boolean {
  if (s.touch === 'on') return true;
  if (s.touch === 'off') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}

type Btn = { label: string; action: keyof Omit<InputState, 'pointerX'>; wide?: boolean };

const LAYOUTS: Partial<Record<GameKind, Btn[]>> = {
  tetris: [
    { label: 'HOLD', action: 'hold' },
    { label: '⟲', action: 'rotateCCW' },
    { label: '⟳', action: 'rotateCW' },
    { label: '⤓', action: 'hardDrop' },
    { label: '◀', action: 'left' },
    { label: '▼', action: 'down' },
    { label: '▶', action: 'right' },
  ],
  puyo: [
    { label: '⟲', action: 'rotateCCW' },
    { label: '⟳', action: 'rotateCW' },
    { label: '◀', action: 'left' },
    { label: '▼', action: 'down' },
    { label: '▶', action: 'right' },
  ],
};

/** テトリス・ぷよ用の画面下のボタン */
export class TouchButtons {
  readonly el: HTMLElement;
  private held = new Set<string>();
  private pressed = new Set<string>();

  constructor(kind: GameKind) {
    const btns = LAYOUTS[kind] ?? [];
    this.el = h('div', { class: `touchpad touchpad-${kind}` });
    for (const b of btns) {
      const el = h('button', { class: `tbtn tbtn-${b.action}`, type: 'button' }, b.label);
      const on = (e: PointerEvent) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        this.held.add(b.action);
        this.pressed.add(b.action);
        el.classList.add('on');
      };
      const off = () => {
        this.held.delete(b.action);
        el.classList.remove('on');
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('contextmenu', e => e.preventDefault());
      this.el.append(el);
    }
    if (!btns.length) this.el.style.display = 'none';
  }

  poll(): InputState {
    const s = emptyInput();
    for (const a of ['left', 'right', 'down'] as const) s[a] = this.held.has(a);
    for (const a of this.pressed) (s as any)[a] = true;
    this.pressed.clear();
    return s;
  }

  dispose() {
    this.el.remove();
  }
}

/** スイカ用: マウス / 指で位置を決め、離すと落とす */
export class PointerControls {
  private x: number | null = null;
  private drop = false;

  constructor(private canvas: HTMLCanvasElement, private toLogicalX: (clientX: number) => number | null) {
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerdown', this.move);
    canvas.addEventListener('pointerup', this.up);
  }

  private move = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') e.preventDefault();
    const x = this.toLogicalX(e.clientX);
    if (x !== null) this.x = x;
  };

  private up = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.move(e);
    this.drop = true;
  };

  poll(): InputState {
    const s = emptyInput();
    s.pointerX = this.x;
    s.hardDrop = this.drop;
    this.x = null;
    this.drop = false;
    return s;
  }

  dispose() {
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerdown', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
  }
}
