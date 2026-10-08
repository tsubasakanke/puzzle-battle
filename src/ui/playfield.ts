import { createLoop } from '../core/loop';
import { emptyInput, type GameKind, type InputState, type Rect } from '../core/types';
import { Keyboard } from '../input/keyboard';
import { mergeInput, PointerControls, TouchButtons, touchEnabled } from '../input/touch';
import { loadSettings } from '../settings';
import { fitCanvas, h } from './dom';
import { SUIKA } from '../core/balance';

export interface PlayfieldHooks {
  step(dtMs: number, input: InputState): void;
  draw(ctx: CanvasRenderingContext2D, w: number, hh: number): void;
}

/**
 * キャンバス・ゲームループ・キーボード・タッチ操作をまとめた部品。
 * draw の中で setInputRect(rect) を呼ぶと、スイカのマウス / 指の位置をその盤面の論理座標に変換する
 */
export class Playfield {
  readonly el: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLElement;
  private ctx: CanvasRenderingContext2D;
  private keyboard = new Keyboard(window);
  private buttons: TouchButtons | null = null;
  private pointer: PointerControls | null = null;
  private loop;
  private inputRect: Rect | null = null;
  paused = false;

  constructor(private kind: GameKind | null, private hooks: PlayfieldHooks) {
    this.canvas = h('canvas', { class: 'pf-canvas' });
    this.overlay = h('div', { class: 'pf-overlay' });
    this.el = h('div', { class: 'playfield' }, h('div', { class: 'pf-stage' }, this.canvas, this.overlay));
    this.ctx = this.canvas.getContext('2d')!;
    this.setKind(kind);
    this.loop = createLoop(
      dt => {
        if (this.paused) return;
        this.hooks.step(dt, this.poll());
      },
      () => this.render(),
    );
  }

  /** 操作するゲームを変える（オンラインのロビーでゲームを選び直したときなど） */
  setKind(kind: GameKind | null) {
    this.kind = kind;
    this.buttons?.dispose();
    this.pointer?.dispose();
    this.buttons = null;
    this.pointer = null;
    if (!kind) return;
    if (kind === 'suika') {
      this.pointer = new PointerControls(this.canvas, x => this.toLogicalX(x));
    } else if (touchEnabled(loadSettings())) {
      this.buttons = new TouchButtons(kind);
      this.el.append(this.buttons.el);
    }
  }

  setInputRect(r: Rect) {
    this.inputRect = r;
  }

  private toLogicalX(clientX: number): number | null {
    const r = this.inputRect;
    if (!r) return null;
    const box = this.canvas.getBoundingClientRect();
    return ((clientX - box.left - r.x) / r.w) * SUIKA.width;
  }

  private poll(): InputState {
    let s = this.keyboard.poll();
    if (this.buttons) s = mergeInput(s, this.buttons.poll());
    if (this.pointer) s = mergeInput(this.pointer.poll(), s);
    return this.kind ? s : emptyInput();
  }

  private render() {
    const { w, h: hh } = fitCanvas(this.canvas);
    this.ctx.clearRect(0, 0, w, hh);
    this.hooks.draw(this.ctx, w, hh);
  }

  start() {
    this.loop.start();
  }

  stop() {
    this.loop.stop();
  }

  dispose() {
    this.loop.stop();
    this.keyboard.dispose();
    this.buttons?.dispose();
    this.pointer?.dispose();
  }
}
