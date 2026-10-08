import { describe, it, expect } from 'vitest';
import { createLoop } from '../../src/core/loop';

describe('loop', () => {
  it('タブが裏に回ったあとの大きな dt は 250ms で切り捨てる', () => {
    let steps = 0;
    const loop = createLoop(() => steps++, () => {});
    loop.tick(0);
    loop.tick(1000);
    expect(steps).toBe(15);
  });
  it('約2フレーム分の間隔なら2回進める', () => {
    let steps = 0;
    const loop = createLoop(() => steps++, () => {});
    loop.tick(0);
    loop.tick(33.4);
    expect(steps).toBe(2);
    loop.tick(66.8);
    expect(steps).toBe(4);
  });
  it('step には固定の dt を渡す', () => {
    const dts: number[] = [];
    const loop = createLoop(dt => dts.push(dt), () => {});
    loop.tick(0);
    loop.tick(20);
    expect(dts).toEqual([1000 / 60]);
  });
});
