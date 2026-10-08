import { MATCH } from '../core/balance';
import type { EngineOptions, GameEngine, GameSnapshot, InputState } from '../core/types';

/** 対戦相手。NPC でもオンラインの人でも同じ形で扱う */
export interface Opponent {
  start(seed: number): void;
  /** NPC はここで相手エンジンを進める。オンラインは何もしない */
  update(dtMs: number): void;
  sendAttack(ap: number): void;
  onAttack(cb: (ap: number) => void): void;
  reportSnapshot(s: GameSnapshot): void;
  onSnapshot(cb: (s: GameSnapshot) => void): void;
  reportLose(): void;
  onLose(cb: () => void): void;
  /** 相手が切断中なら true */
  readonly paused: boolean;
  dispose(): void;
}

export type RoundResult = 'win' | 'lose';

/** 自分のエンジンと相手を AP でつなぎ、勝敗を数える */
export class Match {
  me: GameEngine | null = null;
  opponentSnapshot: GameSnapshot | null = null;
  wins = { me: 0, opp: 0 };
  roundOver = true;
  private snapTimer = 0;
  private roundEndCbs: ((r: RoundResult) => void)[] = [];

  constructor(
    private create: (opts: EngineOptions) => GameEngine,
    readonly opponent: Opponent,
    private opts = { snapshotIntervalMs: MATCH.snapshotIntervalMs },
  ) {
    opponent.onAttack(ap => {
      if (!this.roundOver) this.me?.receiveAttack(ap);
    });
    opponent.onSnapshot(s => (this.opponentSnapshot = s));
    opponent.onLose(() => {
      if (this.roundOver) return;
      this.wins.me++;
      this.endRound('win');
    });
  }

  get finished() {
    return this.wins.me >= MATCH.winsNeeded || this.wins.opp >= MATCH.winsNeeded;
  }

  onRoundEnd(cb: (r: RoundResult) => void) {
    this.roundEndCbs.push(cb);
  }

  startRound(seed: number) {
    this.me = this.create({ seed, mode: 'versus' });
    this.me.onAttack(ap => this.opponent.sendAttack(ap));
    this.opponentSnapshot = null;
    this.snapTimer = 0;
    this.roundOver = false;
    this.opponent.start(seed);
  }

  update(dtMs: number, input: InputState) {
    const me = this.me;
    if (!me || this.roundOver) return;
    if (this.opponent.paused) {
      // 相手の切断中は自分を止めて、相手側の待ち時間だけ進める
      this.opponent.update(dtMs);
      return;
    }
    me.update(dtMs, input);
    this.opponent.update(dtMs);
    if (this.roundOver) return;
    this.snapTimer += dtMs;
    if (this.snapTimer >= this.opts.snapshotIntervalMs - 1e-6) {
      this.snapTimer = 0;
      this.opponent.reportSnapshot(me.snapshot());
    }
    if (me.isOver) {
      this.opponent.reportSnapshot(me.snapshot());
      this.opponent.reportLose();
      this.wins.opp++;
      this.endRound('lose');
    }
  }

  private endRound(r: RoundResult) {
    this.roundOver = true;
    for (const cb of this.roundEndCbs) cb(r);
  }

  dispose() {
    this.opponent.dispose();
  }
}
