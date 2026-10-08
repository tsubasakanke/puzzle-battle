import { MATCH } from '../core/balance';
import type { GameKind } from '../core/types';
import type { Transport } from './transport';

export type RoomError = 'not_found' | 'full' | 'expired';

export interface RoomInfo {
  createdAt: number;
  hostId: string;
  state: 'lobby' | 'playing' | 'finished';
  round: number;
  /** 今の試合の最初のラウンドの1つ前。勝ち数はこれより後のラウンドだけ数える */
  baseRound: number;
  seed: number;
  startAt: number;
}

export interface PlayerInfo {
  name: string;
  game: GameKind;
  ready: boolean;
  online: boolean;
}

export interface RoomState {
  info: RoomInfo;
  players: Record<string, PlayerInfo>;
  /** losses[round][uid] = true */
  losses: Record<string, Record<string, boolean>>;
}

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROUND_END_DELAY_MS = 2500;

export function makeRoomId(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return s;
}

/** オンライン対戦の部屋。ホストがラウンドの開始と終了を書き込む */
export class Room {
  state: RoomState;
  private cbs = new Set<() => void>();
  private offs: (() => void)[] = [];
  private scheduledRound = -1;

  private constructor(
    private t: Transport,
    readonly id: string,
    readonly myId: string,
    info: RoomInfo,
  ) {
    this.state = { info, players: {}, losses: {} };
  }

  get base() {
    return `rooms/${this.id}`;
  }

  get isHost() {
    return this.state.info.hostId === this.myId;
  }

  static async create(t: Transport, name: string): Promise<Room> {
    const uid = await t.uid();
    let id = makeRoomId();
    while (await t.get(`rooms/${id}/info`)) id = makeRoomId();
    const info: RoomInfo = {
      createdAt: t.serverNow(), hostId: uid, state: 'lobby',
      round: 0, baseRound: 0, seed: 0, startAt: 0,
    };
    await t.set(`rooms/${id}/info`, info);
    return Room.join(t, id, name);
  }

  static async join(t: Transport, id: string, name: string): Promise<Room> {
    const uid = await t.uid();
    const info: RoomInfo | null = await t.get(`rooms/${id}/info`);
    if (!info) throw new Error('not_found');
    if (t.serverNow() - info.createdAt > MATCH.roomTtlMs) throw new Error('expired');
    const players: Record<string, PlayerInfo> = (await t.get(`rooms/${id}/players`)) ?? {};
    const existing = players[uid];
    if (!existing && Object.keys(players).length >= 2) throw new Error('full');

    const base = `rooms/${id}`;
    t.onDisconnectSet(`${base}/players/${uid}/online`, false);
    await t.set(`${base}/players/${uid}`, {
      name: name || existing?.name || 'プレイヤー',
      game: existing?.game ?? 'tetris',
      ready: false,
      online: true,
    } satisfies PlayerInfo);

    // 対戦中にページを開き直した人は、そのラウンドは負けにする
    if (existing && info.state === 'playing') {
      const lost = await t.get(`${base}/losses/${info.round}`);
      if (!lost) await t.set(`${base}/losses/${info.round}/${uid}`, true);
    }

    const room = new Room(t, id, uid, info);
    room.subscribe();
    return room;
  }

  private subscribe() {
    const b = this.base;
    this.offs.push(
      this.t.on(`${b}/info`, v => v && this.changed({ info: v })),
      this.t.on(`${b}/players`, v => this.changed({ players: v ?? {} })),
      this.t.on(`${b}/losses`, v => this.changed({ losses: v ?? {} })),
    );
  }

  private changed(part: Partial<RoomState>) {
    this.state = { ...this.state, ...part };
    const { info, players } = this.state;
    const me = players[this.myId];
    // ラウンドが始まったら自分の ready を下ろす（次の試合のときにもう一度押してもらう）
    if (info.state === 'playing' && me?.ready) void this.t.set(`${this.base}/players/${this.myId}/ready`, false);
    if (this.isHost) this.hostLogic();
    for (const cb of this.cbs) cb();
  }

  private hostLogic() {
    const { info, players, losses } = this.state;
    const list = Object.values(players);
    if (info.state !== 'playing') {
      if (list.length === 2 && list.every(p => p.ready && p.online)) {
        void this.startRound(info.round);
      }
      return;
    }
    if (losses[info.round] && this.scheduledRound !== info.round) {
      this.scheduledRound = info.round;
      const round = info.round;
      setTimeout(() => {
        if (this.state.info.round !== round) return;
        const done = Object.keys(this.state.players).some(uid => this.wins(uid) >= MATCH.winsNeeded);
        if (done) void this.t.update(`${this.base}/info`, { state: 'finished' });
        else void this.startRound(this.state.info.baseRound);
      }, ROUND_END_DELAY_MS);
    }
  }

  private async startRound(baseRound: number) {
    const { info } = this.state;
    const next = {
      state: 'playing',
      round: info.round + 1,
      baseRound,
      seed: Math.floor(Math.random() * 2 ** 31),
      startAt: this.t.serverNow() + MATCH.countdownMs,
    };
    // 書き込みが反映されるまでに二重に始めないよう、先に手元の状態を進めておく
    this.state = { ...this.state, info: { ...info, ...next } as RoomInfo };
    await this.t.update(`${this.base}/info`, next);
  }

  /** uid の今の試合での勝ち数（相手だけが負けたラウンドの数） */
  wins(uid: string): number {
    const { info, losses } = this.state;
    let n = 0;
    for (let r = info.baseRound + 1; r <= info.round; r++) {
      const l = losses[r];
      if (!l) continue;
      const losers = Object.keys(l);
      if (losers.length === 1 && losers[0] !== uid) n++;
    }
    return n;
  }

  opponentId(): string | null {
    return Object.keys(this.state.players).find(id => id !== this.myId) ?? null;
  }

  onChange(cb: () => void) {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }

  setGame(kind: GameKind) {
    return this.t.set(`${this.base}/players/${this.myId}/game`, kind);
  }

  setReady(r: boolean) {
    return this.t.set(`${this.base}/players/${this.myId}/ready`, r);
  }

  reportLose(round: number, uid = this.myId) {
    return this.t.set(`${this.base}/losses/${round}/${uid}`, true);
  }

  /** 画面を離れるときに呼ぶ。相手には切断と同じに見える */
  leave() {
    void this.t.set(`${this.base}/players/${this.myId}/online`, false);
    this.dispose();
  }

  link(baseUrl: string) {
    return `${baseUrl}#/room/${this.id}`;
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs = [];
    this.cbs.clear();
  }
}
