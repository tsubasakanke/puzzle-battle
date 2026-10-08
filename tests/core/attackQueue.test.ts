import { describe, it, expect } from 'vitest';
import { AttackQueue } from '../../src/core/attackQueue';

describe('AttackQueue', () => {
  it('相殺して余りを返す', () => {
    const q = new AttackQueue();
    q.add(3);
    expect(q.offset(5)).toBe(2);
    expect(q.pending).toBe(0);
  });
  it('相殺しきれないと 0 を返す', () => {
    const q = new AttackQueue();
    q.add(5);
    expect(q.offset(2)).toBe(0);
    expect(q.pending).toBe(3);
  });
  it('take は上限まで、残りは持ち越し', () => {
    const q = new AttackQueue();
    q.add(20);
    expect(q.take(8)).toBe(8);
    expect(q.pending).toBe(12);
  });
});
