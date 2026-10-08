import { describe, it, expect } from 'vitest';
import { SuikaEngine } from '../../src/games/suika/rules';
import { suikaModule } from '../../src/games/suika';
import { emptyInput } from '../../src/core/types';
import { SUIKA } from '../../src/core/balance';

const mk = (initial?: unknown) => new SuikaEngine({ seed: 1, mode: 'versus', initial });
const run = (e: SuikaEngine, ms: number) => { for (let t = 0; t < ms; t += 16) e.update(16, emptyInput()); };

describe('suika', () => {
  it('同じ種類が触れると合体して1つ上になる', () => {
    const e = mk({ fruits: [{ x: 200, y: 560, type: 1 }], queue: [1] }); e.dropAt(200); run(e, 2000);
    const types = e.bodies().map(b => b.type); expect(types).toContain(2); expect(e.stats.merges).toBe(1);
  });
  it('かき(4)ができる合体は AP 1', () => {
    const e = mk({ fruits: [{ x: 200, y: 560, type: 3 }], queue: [3, 0] }); const sent: number[] = []; e.onAttack(a => sent.push(a));
    e.dropAt(200); run(e, 2000); e.dropAt(50); run(e, 100); expect(sent).toEqual([1]);
  });
  it('AP は受け取り予定と相殺される', () => {
    const e = mk({ fruits: [{ x: 200, y: 560, type: 3 }], queue: [3, 0] }); const sent: number[] = []; e.onAttack(a => sent.push(a));
    e.dropAt(200); run(e, 2000); e.receiveAttack(3); e.dropAt(50); run(e, 100);
    expect(sent).toEqual([]); expect(e.pendingAttack).toBe(0); // 3-1=2 個の石が降る
    expect(e.bodies().filter(b => b.type === -1).length).toBe(2);
  });
  it('石は合体しない', () => {
    const e = mk({ stones: [{ x: 190, y: 570 }, { x: 230, y: 570 }] }); run(e, 1500); expect(e.bodies().filter(b => b.type === -1).length).toBe(2);
  });
  it('合体の近くの石は砕ける', () => {
    const e = mk({ fruits: [{ x: 200, y: 578 }].map(f => ({ ...f, type: 2 })), stones: [{ x: 240, y: 582 }], queue: [2] }); e.dropAt(200); run(e, 2000);
    expect(e.stats.stonesBroken).toBe(1); expect(e.bodies().filter(b => b.type === -1).length).toBe(0);
  });
  it('遠くの石は砕けない', () => {
    const e = mk({ fruits: [{ x: 100, y: 578, type: 2 }], stones: [{ x: 360, y: 582 }], queue: [2] }); e.dropAt(100); run(e, 2000);
    expect(e.stats.merges).toBe(1); expect(e.stats.stonesBroken).toBe(0);
  });
  it('スイカ同士は両方消える', () => {
    const e = mk({ fruits: [{ x: 200, y: 515, type: 10 }, { x: 200, y: 340, type: 10 }] }); run(e, 1500);
    expect(e.bodies().length).toBe(0); expect(e.stats.merges).toBe(1);
  });
  it('受け取った石は1回8個まで', () => { const e = mk(); e.receiveAttack(10); e.dropAt(200); run(e, 50); expect(e.bodies().filter(b => b.type === -1).length).toBe(8); expect(e.pendingAttack).toBe(2); });
  it('ラインを越えたまま2秒で負け', () => {
    // 合体しない石を、容器の上まではみ出すように隙間なく積む（11列×22段）
    const stones = Array.from({ length: 11 * 22 }, (_, i) => ({ x: 20 + (i % 11) * 36, y: 582 - Math.floor(i / 11) * 36 }));
    const e = mk({ stones }); run(e, 1000); expect(e.isOver).toBe(false); run(e, 4000); expect(e.isOver).toBe(true);
  });
  it('落としたばかりのフルーツはラインの上でも負けにならない', () => {
    const e = mk(); e.dropAt(200); run(e, 300); expect(e.isOver).toBe(false);
  });
  it('クールダウン中は落とせない', () => { const e = mk(); expect(e.dropAt(200)).toBe(true); expect(e.dropAt(200)).toBe(false); run(e, SUIKA.dropCooldownMs + 20); expect(e.dropAt(200)).toBe(true); });
  it('queue の順で current / next が決まる', () => {
    const e = mk({ queue: [2, 3, 0] }); expect(e.current).toBe(2); expect(e.next).toBe(3); e.dropAt(200); expect(e.current).toBe(3); expect(e.next).toBe(0);
  });
  it('同じシードなら同じ順番', () => {
    const seq = () => { const e = mk(); const r: number[] = []; for (let i = 0; i < 10; i++) { r.push(e.current); e.dropAt(50 + i * 30); run(e, 600); } return r; };
    const a = seq(); expect(a).toEqual(seq()); expect(a.every(t => t >= 0 && t <= SUIKA.spawnMaxType)).toBe(true);
  });
  it('入力: 左右と pointerX と hardDrop', () => {
    const e = mk(); const x0 = e.cursorX;
    e.update(100, { ...emptyInput(), right: true }); expect(e.cursorX).toBeCloseTo(x0 + SUIKA.moveSpeed * 100);
    e.update(16, { ...emptyInput(), pointerX: 5 }); expect(e.cursorX).toBe(SUIKA.radii[e.current]);
    e.update(16, { ...emptyInput(), hardDrop: true }); expect(e.stats.drops).toBe(1);
  });
  it('snapshot は整数の [x,y,type,...]', () => {
    const e = mk({ fruits: [{ x: 100.4, y: 578, type: 2 }], stones: [{ x: 300, y: 582 }] });
    const s = e.snapshot(); expect(s.kind).toBe('suika');
    if (s.kind === 'suika') { expect(s.bodies.length).toBe(6); expect(s.bodies.every(Number.isInteger)).toBe(true); expect(s.bodies.slice(0, 3)).toEqual([100, 578, 2]); expect(s.bodies[5]).toBe(-1); }
  });
  it('AI(normal) は30秒で合体させる', () => {
    const e = new SuikaEngine({ seed: 3, mode: 'solo' }); const ai = suikaModule.createAI(e, 'normal', 7);
    for (let t = 0; t < 30000; t += 1000 / 60) e.update(1000 / 60, ai.next(1000 / 60));
    expect(e.stats.drops).toBeGreaterThan(10); expect(e.stats.merges).toBeGreaterThan(0);
  });
  it('チュートリアルは3ステップでゴール判定できる', () => {
    expect(suikaModule.tutorial.length).toBe(3);
    const s2 = suikaModule.tutorial[1]; const e = suikaModule.create({ seed: 1, mode: 'tutorial', initial: s2.initial }) as SuikaEngine;
    expect(s2.goal(e)).toBe(false); e.dropAt(e.bodies()[0].x); run(e, 2000); expect(s2.goal(e)).toBe(true);
    const s3 = suikaModule.tutorial[2]; const e3 = suikaModule.create({ seed: 1, mode: 'tutorial', initial: s3.initial }) as SuikaEngine;
    const grape = e3.bodies().find(b => b.type === 2)!; e3.dropAt(grape.x); run(e3, 2000); expect(s3.goal(e3)).toBe(true);
  });
});
