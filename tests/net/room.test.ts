import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryHub, MemoryTransport } from '../../src/net/transport';
import { Room, makeRoomId } from '../../src/net/room';
import { OnlineOpponent } from '../../src/match/onlineOpponent';
import { MATCH } from '../../src/core/balance';

let hub: MemoryHub;
const t = (uid: string) => new MemoryTransport(hub, uid);

async function twoPlayers() {
  const a = await Room.create(t('A'), 'あい');
  const b = await Room.join(t('B'), a.id, 'びー');
  return { a, b };
}

async function startRound(a: Room, b: Room) {
  await a.setReady(true);
  await b.setReady(true);
  await vi.runAllTimersAsync();
}

beforeEach(() => {
  hub = new MemoryHub();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('Room', () => {
  it('作成と参加で両方に2人見える', async () => {
    const { a, b } = await twoPlayers();
    expect(Object.keys(a.state.players).sort()).toEqual(['A', 'B']);
    expect(Object.keys(b.state.players).sort()).toEqual(['A', 'B']);
    expect(a.isHost).toBe(true);
    expect(b.isHost).toBe(false);
    expect(a.opponentId()).toBe('B');
  });
  it('3人目は full', async () => {
    const { a } = await twoPlayers();
    await expect(Room.join(t('C'), a.id, 'しー')).rejects.toThrow('full');
  });
  it('同じ人が入り直すのは OK', async () => {
    const { a } = await twoPlayers();
    const b2 = await Room.join(t('B'), a.id, 'びー');
    expect(Object.keys(b2.state.players).length).toBe(2);
  });
  it('存在しない部屋は not_found', async () => {
    await expect(Room.join(t('B'), 'ZZZZZZ', 'x')).rejects.toThrow('not_found');
  });
  it('25時間前の部屋は expired', async () => {
    const a = await Room.create(t('A'), 'あ');
    hub.now += 25 * 3600 * 1000;
    await expect(Room.join(t('B'), a.id, 'び')).rejects.toThrow('expired');
  });
  it('両方 ready で playing になり、シードが同じ', async () => {
    const { a, b } = await twoPlayers();
    await startRound(a, b);
    expect(a.state.info.state).toBe('playing');
    expect(b.state.info.round).toBe(1);
    expect(b.state.info.seed).toBe(a.state.info.seed);
    expect(b.state.info.startAt).toBe(hub.now + MATCH.countdownMs);
  });
  it('ラウンドが始まると ready は false に戻る', async () => {
    const { a, b } = await twoPlayers();
    await startRound(a, b);
    expect(a.state.players.A.ready).toBe(false);
    expect(a.state.players.B.ready).toBe(false);
  });
  it('負けが記録されると次のラウンド、2勝で finished', async () => {
    const { a, b } = await twoPlayers();
    await startRound(a, b);
    await b.reportLose(1);
    await vi.runAllTimersAsync();
    expect(a.state.info.round).toBe(2);
    expect(a.wins('A')).toBe(1);
    await b.reportLose(2);
    await vi.runAllTimersAsync();
    expect(a.state.info.state).toBe('finished');
    expect(b.wins('A')).toBe(2);
    expect(b.wins('B')).toBe(0);
  });
  it('finished のあと両方 ready でまた 0勝から', async () => {
    const { a, b } = await twoPlayers();
    await startRound(a, b);
    await b.reportLose(1); await vi.runAllTimersAsync();
    await b.reportLose(2); await vi.runAllTimersAsync();
    await startRound(a, b);
    expect(a.state.info.state).toBe('playing');
    expect(a.wins('A')).toBe(0);
  });
  it('対戦中に入り直した人はそのラウンド負けになる', async () => {
    const { a, b } = await twoPlayers();
    await startRound(a, b);
    await Room.join(t('B'), a.id, 'びー');
    await vi.runAllTimersAsync();
    expect(a.wins('A')).toBe(1);
  });
  it('link は #/room/ID', async () => {
    const a = await Room.create(t('A'), 'あ');
    expect(a.link('https://x.github.io/puzzle-battle/')).toBe(`https://x.github.io/puzzle-battle/#/room/${a.id}`);
  });
  it('makeRoomId は6文字で、まぎらわしい文字を含まない', () => {
    for (let i = 0; i < 200; i++) expect(makeRoomId()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});

describe('OnlineOpponent', () => {
  async function playing() {
    const { a, b } = await twoPlayers();
    await startRound(a, b);
    const oa = new OnlineOpponent(a, t('A'));
    const ob = new OnlineOpponent(b, t('B'));
    oa.start(a.state.info.seed);
    ob.start(b.state.info.seed);
    return { a, b, oa, ob };
  }
  it('攻撃は相手にだけ届く', async () => {
    const { oa, ob } = await playing();
    const gotA: number[] = [], gotB: number[] = [];
    oa.onAttack(ap => gotA.push(ap));
    ob.onAttack(ap => gotB.push(ap));
    oa.sendAttack(3);
    await vi.runAllTimersAsync();
    expect(gotB).toEqual([3]);
    expect(gotA).toEqual([]);
  });
  it('盤面のようすが届く', async () => {
    const { oa, ob } = await playing();
    const snaps: any[] = [];
    ob.onSnapshot(s => snaps.push(s));
    oa.reportSnapshot({ kind: 'puyo', rows: ['R.....'] });
    await vi.runAllTimersAsync();
    expect(snaps.at(-1)).toEqual({ kind: 'puyo', rows: ['R.....'] });
  });
  it('相手の負けが届く', async () => {
    const { oa, ob } = await playing();
    let lost = 0;
    oa.onLose(() => lost++);
    ob.reportLose();
    await vi.runAllTimersAsync();
    expect(lost).toBe(1);
  });
  it('相手が切断すると paused、15秒戻らなければ相手の負け', async () => {
    const { oa } = await playing();
    let lost = 0;
    oa.onLose(() => lost++);
    hub.disconnect('B');
    expect(oa.paused).toBe(true);
    for (let ms = 0; ms <= MATCH.disconnectGraceMs + 100; ms += 100) oa.update(100);
    await vi.runAllTimersAsync();
    expect(lost).toBe(1);
  });
  it('15秒以内に戻れば続行', async () => {
    const { oa } = await playing();
    let lost = 0;
    oa.onLose(() => lost++);
    hub.disconnect('B');
    for (let ms = 0; ms < 5000; ms += 100) oa.update(100);
    hub.write(`rooms/${oa.roomId}/players/B/online`, true);
    expect(oa.paused).toBe(false);
    for (let ms = 0; ms < 20000; ms += 100) oa.update(100);
    expect(lost).toBe(0);
  });
});
