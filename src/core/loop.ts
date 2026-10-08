import { FRAME_MS, MAX_FRAME_DT } from './balance';

/** 固定ステップのゲームループ。実時間の差分を MAX_FRAME_DT で切り捨てて、FRAME_MS ごとに step を呼ぶ */
export function createLoop(step: (dtMs: number) => void, render: () => void) {
  let last: number | null = null;
  let acc = 0;
  let raf = 0;
  let running = false;

  const tick = (t: number) => {
    if (last === null) {
      last = t;
      render();
      return;
    }
    acc += Math.min(t - last, MAX_FRAME_DT);
    last = t;
    while (acc >= FRAME_MS) {
      step(FRAME_MS);
      acc -= FRAME_MS;
    }
    render();
  };

  const frame = (t: number) => {
    if (!running) return;
    tick(t);
    raf = requestAnimationFrame(frame);
  };

  return {
    tick,
    start() {
      if (running) return;
      running = true;
      last = null;
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
