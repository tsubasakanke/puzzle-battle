import { describe, it, expect } from 'vitest';
import { Match } from '../../src/match/match';
import { emptyInput } from '../../src/core/types';
import { FakeEngine, FakeOpponent } from './fakes';

function setup() {
  const opp = new FakeOpponent();
  let engine!: FakeEngine;
  const m = new Match(() => (engine = new FakeEngine()), opp, { snapshotIntervalMs: 100 });
  const results: string[] = [];
  m.onRoundEnd(r => results.push(r));
  m.startRound(1);
  return { opp, m, results, engine: () => engine };
}

describe('Match', () => {
  it('自分の攻撃が相手に届く', () => {
    const { opp, engine } = setup();
    engine().attack(3);
    expect(opp.sent).toEqual([3]);
  });
  it('相手の攻撃は自分の受け取り予定に入る', () => {
    const { opp, m } = setup();
    opp.attackCb(4);
    expect(m.me!.pendingAttack).toBe(4);
  });
  it('自分が負けると reportLose して相手に1勝', () => {
    const { opp, m, results, engine } = setup();
    engine().isOver = true;
    m.update(16, emptyInput());
    expect(opp.loseReported).toBe(1);
    expect(m.wins).toEqual({ me: 0, opp: 1 });
    expect(results).toEqual(['lose']);
  });
  it('相手が負けると自分に1勝', () => {
    const { opp, m, results } = setup();
    opp.loseCb();
    expect(m.wins).toEqual({ me: 1, opp: 0 });
    expect(results).toEqual(['win']);
  });
  it('ラウンドが終わったあとの攻撃や負けの通知は無視する', () => {
    const { opp, m } = setup();
    opp.loseCb();
    opp.loseCb();
    opp.attackCb(5);
    expect(m.wins.me).toBe(1);
    expect(m.me!.pendingAttack).toBe(0);
  });
  it('2勝で finished', () => {
    const { opp, m } = setup();
    opp.loseCb();
    expect(m.finished).toBe(false);
    m.startRound(2);
    opp.loseCb();
    expect(m.finished).toBe(true);
  });
  it('相手が一時停止中は自分も進まない', () => {
    const { opp, m, engine } = setup();
    opp.paused = true;
    m.update(16, emptyInput());
    expect(engine().frames).toBe(0);
    opp.paused = false;
    m.update(16, emptyInput());
    expect(engine().frames).toBe(1);
  });
  it('盤面のようすは snapshotIntervalMs ごとに送る', () => {
    const { opp, m } = setup();
    for (let i = 0; i < 30; i++) m.update(1000 / 60, emptyInput());
    expect(opp.snapshots).toBe(5);
  });
  it('相手の盤面のようすを保持する', () => {
    const { opp, m } = setup();
    opp.snapCb({ kind: 'puyo', rows: ['......'] });
    expect(m.opponentSnapshot).toEqual({ kind: 'puyo', rows: ['......'] });
  });
});
