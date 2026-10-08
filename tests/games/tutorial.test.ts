import { describe, it, expect } from 'vitest';
import { modules, allKinds } from '../../src/core/registry';

describe('チュートリアル', () => {
  for (const kind of allKinds) {
    it(`${kind}: 3ステップ以上あり、各ステップは初期盤面で作れて、最初は未達成`, () => {
      const steps = modules[kind].tutorial;
      expect(steps.length).toBeGreaterThanOrEqual(3);
      steps.forEach((s, i) => {
        const e = modules[kind].create({ seed: 1 + i, mode: 'tutorial', initial: s.initial });
        expect(e.isOver).toBe(false);
        expect(s.goal(e)).toBe(false);
      });
    });
  }
});
