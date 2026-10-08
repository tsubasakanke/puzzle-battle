import { MATCH } from '../core/balance';
import type { GameSnapshot } from '../core/types';
import type { Room } from '../net/room';
import type { Transport } from '../net/transport';
import type { Opponent } from './match';

/** Firebase（Transport）経由でつながった相手 */
export class OnlineOpponent implements Opponent {
  private attackCb: (ap: number) => void = () => {};
  private snapCb: (s: GameSnapshot) => void = () => {};
  private loseCb: () => void = () => {};
  private offs: (() => void)[] = [];
  private round = 0;
  private loseFired = false;
  /** 相手が切断してからの時間 */
  offlineMs = 0;
  private forfeited = false;

  constructor(private room: Room, private t: Transport) {}

  get roomId() {
    return this.room.id;
  }

  private get oppId() {
    return this.room.opponentId();
  }

  get paused() {
    const opp = this.oppId;
    return !this.loseFired && (!opp || this.room.state.players[opp]?.online === false);
  }

  get offlineRemainingMs() {
    return Math.max(0, MATCH.disconnectGraceMs - this.offlineMs);
  }

  start(_seed: number) {
    this.stop();
    this.round = this.room.state.info.round;
    this.loseFired = false;
    this.forfeited = false;
    this.offlineMs = 0;
    const base = this.room.base;
    const me = this.room.myId;
    this.offs.push(
      this.t.onChildAdded(`${base}/attacks/${this.round}`, v => {
        if (v && v.from !== me && !this.loseFired) this.attackCb(v.ap);
      }),
      this.room.onChange(() => this.checkLose()),
    );
    const opp = this.oppId;
    if (opp) {
      this.offs.push(
        this.t.on(`${base}/boards/${opp}`, v => {
          if (typeof v !== 'string') return;
          try {
            this.snapCb(JSON.parse(v));
          } catch {
            // 壊れたデータは無視する
          }
        }),
      );
    }
    this.checkLose();
  }

  private checkLose() {
    const opp = this.oppId;
    if (this.loseFired || !opp) return;
    if (this.room.state.losses[this.round]?.[opp]) {
      this.loseFired = true;
      this.loseCb();
    }
  }

  update(dtMs: number) {
    if (!this.paused) {
      this.offlineMs = 0;
      return;
    }
    this.offlineMs += dtMs;
    const opp = this.oppId;
    if (opp && !this.forfeited && this.offlineMs > MATCH.disconnectGraceMs) {
      this.forfeited = true;
      void this.room.reportLose(this.round, opp);
    }
  }

  sendAttack(ap: number) {
    void this.t.push(`${this.room.base}/attacks/${this.round}`, { from: this.room.myId, ap });
  }

  reportSnapshot(s: GameSnapshot) {
    void this.t.set(`${this.room.base}/boards/${this.room.myId}`, JSON.stringify(s));
  }

  reportLose() {
    void this.room.reportLose(this.round);
  }

  onAttack(cb: (ap: number) => void) { this.attackCb = cb; }
  onSnapshot(cb: (s: GameSnapshot) => void) { this.snapCb = cb; }
  onLose(cb: () => void) { this.loseCb = cb; }

  private stop() {
    for (const off of this.offs) off();
    this.offs = [];
  }

  dispose() {
    this.stop();
  }
}
