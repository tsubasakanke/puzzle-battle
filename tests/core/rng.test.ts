import { describe, it, expect } from 'vitest';
import { mulberry32, shuffle } from '../../src/core/rng';

describe('rng', () => {
  it('同じシードなら同じ列', () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('0以上1未満', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('shuffle は要素を保つ', () => {
    expect(shuffle(mulberry32(3), [1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});
