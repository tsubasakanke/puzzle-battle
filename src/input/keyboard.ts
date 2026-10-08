import { emptyInput, type InputState } from '../core/types';

type Action = keyof Omit<InputState, 'pointerX'>;

const KEYMAP: Record<string, Action> = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowDown: 'down', KeyS: 'down',
  ArrowUp: 'rotateCW', KeyX: 'rotateCW', KeyW: 'rotateCW',
  KeyZ: 'rotateCCW',
  Space: 'hardDrop', Enter: 'hardDrop',
  KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
};

const HELD: Action[] = ['left', 'right', 'down'];

/** キー入力を InputState にまとめる。押した瞬間のフラグは poll ごとにリセットする */
export class Keyboard {
  private held = new Set<Action>();
  private pressed = new Set<Action>();

  constructor(private target: Window = window) {
    target.addEventListener('keydown', this.down);
    target.addEventListener('keyup', this.up);
    target.addEventListener('blur', this.clear);
  }

  private down = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (!a) return;
    e.preventDefault();
    if (!e.repeat) this.pressed.add(a);
    this.held.add(a);
  };

  private up = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (a) this.held.delete(a);
  };

  private clear = () => {
    this.held.clear();
    this.pressed.clear();
  };

  poll(): InputState {
    const s = emptyInput();
    for (const a of HELD) s[a] = this.held.has(a);
    for (const a of this.pressed) s[a] = true;
    this.pressed.clear();
    return s;
  }

  dispose() {
    this.target.removeEventListener('keydown', this.down);
    this.target.removeEventListener('keyup', this.up);
    this.target.removeEventListener('blur', this.clear);
  }
}
