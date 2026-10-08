import { describe, it, expect } from 'vitest';
import { TetrisEngine } from '../../src/games/tetris/rules';
import { tetrisModule } from '../../src/games/tetris';
import { emptyInput, type InputState } from '../../src/core/types';
import { FRAME_MS } from '../../src/core/balance';

const mk = (initial?: unknown, mode: 'solo' | 'versus' | 'tutorial' = 'versus') =>
  new TetrisEngine({ seed: 1, mode, initial });
const inp = (p: Partial<InputState>): InputState => ({ ...emptyInput(), ...p });

// 一番下の1行は消えない行（全消しボーナスが入らないようにするため）
const tetrisRows = () => ['GGGGGGGG.G', ...Array(4).fill('GGGGGGGGG.')];

describe('tetris', () => {
  it('7-bag: 最初の7個は全種類', () => {
    const e = mk();
    const seen = [e.active!.type, ...e.queue.slice(0, 6)];
    expect(new Set(seen).size).toBe(7);
  });

  it('NEXT 用に常に5個以上キューがある', () => {
    const e = mk();
    for (let i = 0; i < 20; i++) {
      expect(e.queue.length).toBeGreaterThanOrEqual(5);
      e.hardDrop();
      if (e.isOver) break;
    }
  });

  it('initial.queue が先に来て、そのあと 7-bag', () => {
    const e = mk({ queue: ['I', 'O'] });
    expect(e.active!.type).toBe('I');
    expect(e.queue[0]).toBe('O');
    expect(new Set(e.queue.slice(1, 8)).size).toBe(7);
  });

  it('壁で止まる', () => {
    const e = mk();
    for (let i = 0; i < 20; i++) e.tryMove(-1, 0);
    expect(e.tryMove(-1, 0)).toBe(false);
  });

  it('1列消しは AP 0', () => {
    // 一番下だけそろう。2行目は残る（全消しにならない）
    const e = mk({ rows: ['GGGGGGGGG.', 'GGGGGGG...'], queue: ['I'] });
    const sent: number[] = [];
    e.onAttack(a => sent.push(a));
    e.rotate(1);
    while (e.tryMove(1, 0));
    e.hardDrop();
    expect(e.stats.lines).toBe(1);
    expect(sent).toEqual([]);
  });

  it('4列消しは AP 4', () => {
    const e = mk({ rows: tetrisRows(), queue: ['I'] });
    const sent: number[] = [];
    e.onAttack(a => sent.push(a));
    e.rotate(1);
    while (e.tryMove(1, 0));
    e.hardDrop();
    expect(e.stats.tetrises).toBe(1);
    expect(sent).toEqual([4]);
  });

  it('全消しは +10', () => {
    const e = mk({ rows: Array(4).fill('GGGGGGGGG.'), queue: ['I'] });
    const sent: number[] = [];
    e.onAttack(a => sent.push(a));
    e.rotate(1);
    while (e.tryMove(1, 0));
    e.hardDrop();
    expect(sent).toEqual([14]);
  });

  it('相殺: 受け取り予定 3 で 4列消し → 1 だけ送る', () => {
    const e = mk({ rows: tetrisRows(), queue: ['I'] });
    const sent: number[] = [];
    e.onAttack(a => sent.push(a));
    e.receiveAttack(3);
    e.rotate(1);
    while (e.tryMove(1, 0));
    e.hardDrop();
    expect(sent).toEqual([1]);
    expect(e.pendingAttack).toBe(0);
  });

  it('ライン消しなしで固定するとおじゃまが最大8列せり上がり、残りは持ち越し', () => {
    const e = mk({ queue: ['O', 'O'] });
    e.receiveAttack(10);
    e.hardDrop();
    const bottom = e.board.slice(-8);
    expect(bottom.every(r => r.filter(c => c === 'G').length === 9)).toBe(true);
    // 1回で受け取る分は穴が同じ列
    const hole = bottom[0].indexOf('.');
    expect(bottom.every(r => r[hole] === '.')).toBe(true);
    expect(e.pendingAttack).toBe(2);
  });

  it('見えない行にブロックがあっても出現位置が空なら負けない', () => {
    const e = mk();
    e.board[0][0] = 'G';
    e.board[1][9] = 'G';
    e.update(16, emptyInput());
    e.hardDrop();
    expect(e.isOver).toBe(false);
  });

  it('出現位置が埋まっていたら負け', () => {
    const e = mk({ rows: Array(21).fill('GGGG.GGGGG') });
    e.hardDrop();
    e.update(16, emptyInput());
    expect(e.isOver).toBe(true);
  });

  it('T-spin double は AP 4', () => {
    // 下から: 穴1つ / 穴3つ / 左に屋根（col 3 が埋まっている）
    // ....G.....  <- 屋根は col 0..3
    const e = mk({ rows: ['GGGG.GGGGG', 'GGG...GGGG', 'GGGG......'], queue: ['T'] });
    const sent: number[] = [];
    e.onAttack(a => sent.push(a));
    // T を右向き(R)にして col 4 の縦穴の上に下ろし、もう一度右回転で T を下向きにして差し込む
    expect(e.rotate(1)).toBe(true);
    while (e.tryMove(0, 1));
    expect(e.rotate(1)).toBe(true);
    expect(e.active!.rot).toBe(2);
    e.hardDrop();
    expect(e.stats.tspins).toBe(1);
    expect(e.stats.lines).toBe(2);
    expect(sent).toEqual([4]);
  });

  it('3隅が埋まっていても最後の操作が移動なら T-spin にならない', () => {
    const e = mk({ rows: ['GGGG.GGGGG', 'GGG...GGGG', 'GGGG......'], queue: ['T'] });
    e.rotate(1);
    while (e.tryMove(0, 1)); // 最後の操作は移動
    e.hardDrop();
    expect(e.stats.lines).toBe(1);
    expect(e.stats.tspins).toBe(0);
  });

  it('SRS: 壁際の I を回すと壁蹴りされる', () => {
    const e = mk({ queue: ['I'] });
    e.rotate(1);
    while (e.tryMove(-1, 0));
    expect(e.rotate(1)).toBe(true); // R -> 2 で左壁を蹴る
  });

  it('ホールドは1ミノ1回', () => {
    const e = mk({ queue: ['T', 'S', 'Z'] });
    e.holdPiece();
    expect(e.hold).toBe('T');
    expect(e.active!.type).toBe('S');
    e.holdPiece();
    expect(e.active!.type).toBe('S');
    expect(e.stats.holds).toBe(1);
    e.hardDrop();
    e.holdPiece();
    expect(e.hold).toBe('Z');
    expect(e.active!.type).toBe('T');
  });

  it('ゴーストは底を指す', () => {
    const e = mk({ queue: ['O'] });
    expect(e.ghostY()).toBe(20); // O は bbox の 0,1 行目 → 盤面 20,21 行
  });

  it('DAS/ARR: 押しっぱなしで最初1マス、133ms 後から 33ms ごと', () => {
    const e = mk({ queue: ['T'] });
    const x0 = e.active!.x;
    e.update(FRAME_MS, inp({ right: true }));
    expect(e.active!.x).toBe(x0 + 1);
    for (let i = 0; i < 6; i++) e.update(FRAME_MS, inp({ right: true }));
    expect(e.active!.x).toBe(x0 + 1); // 7フレーム ≒ 117ms、まだ DAS 前
    for (let i = 0; i < 3; i++) e.update(FRAME_MS, inp({ right: true }));
    expect(e.active!.x).toBe(x0 + 3); // 10フレーム ≒ 167ms
  });

  it('入力: hardDrop フラグで固定、ソフトドロップで速く落ちる', () => {
    const e = mk({ queue: ['T', 'O'] });
    const y0 = e.active!.y;
    for (let i = 0; i < 6; i++) e.update(FRAME_MS, inp({ down: true }));
    expect(e.active!.y).toBeGreaterThan(y0);
    e.update(FRAME_MS, inp({ hardDrop: true }));
    expect(e.active!.type).toBe('O');
    expect(e.stats.hardDrops).toBe(1);
  });

  it('ロック遅延: 接地して 500ms で固定', () => {
    const e = mk({ queue: ['T', 'O'] });
    while (e.tryMove(0, 1));
    for (let i = 0; i < 25; i++) e.update(FRAME_MS, emptyInput());
    expect(e.active!.type).toBe('T');
    for (let i = 0; i < 10; i++) e.update(FRAME_MS, emptyInput());
    expect(e.active!.type).toBe('O');
  });

  it('snapshot は見える20行で、操作中のミノも入る', () => {
    const e = mk({ queue: ['O'] });
    const s = e.snapshot();
    expect(s.kind).toBe('tetris');
    if (s.kind !== 'tetris') return;
    expect(s.rows.length).toBe(20);
    expect(s.rows.every(r => r.length === 10)).toBe(true);
    e.hardDrop();
    const s2 = e.snapshot();
    if (s2.kind !== 'tetris') return;
    expect(s2.rows[19]).toBe('....OO....');
  });

  it('同じシードなら同じミノ順', () => {
    expect(mk().queue).toEqual(mk().queue);
  });

  it('AI(normal) は 3000 フレーム動かしても負けず、ラインを消す', () => {
    const e = tetrisModule.create({ seed: 1, mode: 'versus' }) as TetrisEngine;
    const ai = tetrisModule.createAI(e, 'normal', 1);
    for (let i = 0; i < 3000; i++) e.update(FRAME_MS, ai.next(FRAME_MS));
    expect(e.isOver).toBe(false);
    expect(e.stats.lines).toBeGreaterThan(0);
  });

  it('AI は全難易度で動く', () => {
    for (const lv of ['easy', 'hard', 'oni'] as const) {
      const e = tetrisModule.create({ seed: 7, mode: 'versus' }) as TetrisEngine;
      const ai = tetrisModule.createAI(e, lv, 3);
      for (let i = 0; i < 1500; i++) e.update(FRAME_MS, ai.next(FRAME_MS));
      expect(e.isOver).toBe(false);
      expect(e.stats.hardDrops).toBeGreaterThan(5);
    }
  });

  it('チュートリアルは4ステップで、初期盤面から目標を達成できる', () => {
    expect(tetrisModule.tutorial.length).toBe(4);
    const step4 = tetrisModule.tutorial[3];
    const e = tetrisModule.create({ seed: 1, mode: 'tutorial', initial: step4.initial }) as TetrisEngine;
    expect(step4.goal(e)).toBe(false);
    e.rotate(1);
    while (e.tryMove(1, 0));
    e.hardDrop();
    expect(step4.goal(e)).toBe(true);
  });
});
