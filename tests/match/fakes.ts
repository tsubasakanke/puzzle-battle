import type { GameEngine, GameSnapshot, InputState } from '../../src/core/types';
import { AttackQueue } from '../../src/core/attackQueue';
import type { Opponent } from '../../src/match/match';

/** テスト用の何もしないエンジン。attack()/lose() で外から操作する */
export class FakeEngine implements GameEngine {
  readonly kind = 'tetris' as const;
  q = new AttackQueue();
  frames = 0;
  isOver = false;
  score = 0;
  stats = {};
  private cb: (ap: number) => void = () => {};
  update(_dt: number, _input: InputState) { this.frames++; }
  receiveAttack(ap: number) { this.q.add(ap); }
  onAttack(cb: (ap: number) => void) { this.cb = cb; }
  attack(ap: number) { const left = this.q.offset(ap); if (left > 0) this.cb(left); }
  snapshot(): GameSnapshot { return { kind: 'tetris', rows: [] }; }
  get pendingAttack() { return this.q.pending; }
}

export class FakeOpponent implements Opponent {
  sent: number[] = [];
  snapshots = 0;
  loseReported = 0;
  paused = false;
  attackCb: (ap: number) => void = () => {};
  loseCb: () => void = () => {};
  snapCb: (s: GameSnapshot) => void = () => {};
  start() {}
  update() {}
  sendAttack(ap: number) { this.sent.push(ap); }
  onAttack(cb: (ap: number) => void) { this.attackCb = cb; }
  reportSnapshot() { this.snapshots++; }
  onSnapshot(cb: (s: GameSnapshot) => void) { this.snapCb = cb; }
  reportLose() { this.loseReported++; }
  onLose(cb: () => void) { this.loseCb = cb; }
  dispose() {}
}
