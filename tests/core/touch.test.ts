import { describe, it, expect } from 'vitest';
import { mergeInput } from '../../src/input/touch';
import { emptyInput } from '../../src/core/types';

describe('mergeInput', () => {
  it('どちらかが true なら true', () => {
    const a = { ...emptyInput(), left: true };
    const b = { ...emptyInput(), hardDrop: true };
    const m = mergeInput(a, b);
    expect(m.left).toBe(true);
    expect(m.hardDrop).toBe(true);
    expect(m.right).toBe(false);
  });
  it('pointerX は a を優先し、a が null なら b', () => {
    expect(mergeInput({ ...emptyInput(), pointerX: 10 }, { ...emptyInput(), pointerX: 20 }).pointerX).toBe(10);
    expect(mergeInput(emptyInput(), { ...emptyInput(), pointerX: 20 }).pointerX).toBe(20);
  });
});
