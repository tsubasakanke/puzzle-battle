import type { AIController, Difficulty, GameEngine, GameModule, GameSnapshot } from '../core/types';
import type { Opponent } from './match';

const NPC_SNAPSHOT_MS = 50;

/** 自分のブラウザの中で、相手のエンジンを AI に操作させる */
export class NpcOpponent implements Opponent {
  readonly paused = false;
  engine: GameEngine | null = null;
  private ai: AIController | null = null;
  private attackCb: (ap: number) => void = () => {};
  private snapCb: (s: GameSnapshot) => void = () => {};
  private loseCb: () => void = () => {};
  private lost = false;
  private snapTimer = 0;

  constructor(private module: GameModule, private level: Difficulty) {}

  start(seed: number) {
    this.engine = this.module.create({ seed, mode: 'versus' });
    this.ai = this.module.createAI(this.engine, this.level, (seed * 7919 + 13) >>> 0);
    this.engine.onAttack(ap => this.attackCb(ap));
    this.lost = false;
    this.snapTimer = NPC_SNAPSHOT_MS;
  }

  update(dtMs: number) {
    const e = this.engine;
    if (!e || !this.ai || this.lost) return;
    e.update(dtMs, this.ai.next(dtMs));
    this.snapTimer += dtMs;
    if (this.snapTimer >= NPC_SNAPSHOT_MS || e.isOver) {
      this.snapTimer = 0;
      this.snapCb(e.snapshot());
    }
    if (e.isOver) {
      this.lost = true;
      this.loseCb();
    }
  }

  get pendingAttack() {
    return this.engine?.pendingAttack ?? 0;
  }

  sendAttack(ap: number) {
    if (!this.lost) this.engine?.receiveAttack(ap);
  }
  onAttack(cb: (ap: number) => void) { this.attackCb = cb; }
  reportSnapshot() {}
  onSnapshot(cb: (s: GameSnapshot) => void) { this.snapCb = cb; }
  reportLose() { this.lost = true; }
  onLose(cb: () => void) { this.loseCb = cb; }
  dispose() { this.engine = null; this.ai = null; }
}
