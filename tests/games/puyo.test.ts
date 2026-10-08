import { describe, it, expect } from 'vitest';
import { PuyoEngine, boardFromRows } from '../../src/games/puyo/rules';
import { createPuyoAI } from '../../src/games/puyo/ai';
import { puyoModule } from '../../src/games/puyo';
import { emptyInput, type InputState } from '../../src/core/types';
import { FRAME_MS } from '../../src/core/balance';

const mk = (initial?: unknown, seed = 1) => new PuyoEngine({ seed, mode: 'versus', initial });
const countN = (e: PuyoEngine) => e.board.flat().filter(c => c === 'N').length;
const inp = (p: Partial<InputState>): InputState => ({ ...emptyInput(), ...p });

describe('puyo rules', () => {
  it('4つつながると消えて 1連鎖、得点 40', () => {
    const e = mk({ rows: ['RRR...'], pairs: [['R', 'G']] });
    // 子を上に置いたまま列3に落とす: R が (row 下, col 3) に入って4連結
    // 10 × 4 × max(1, 連鎖0 + 連結0 + 色数0) = 40
    e.move(1); e.dropPairNow();
    expect(e.stats.maxChain).toBe(1);
    expect(e.stats.pops).toBe(1);
    expect(e.score).toBe(40);
    // 消えたあと G が一番下に落ちている
    expect(e.board[12].join('')).toBe('...G..');
  });

  it('resolveChains: 2連鎖 (40 + 10×4×8 = 360)', () => {
    // 下から: R×4 を消すと上の G×3 が落ちて col4 の G とつながる
    const b = boardFromRows(['RRRRG.', '.GGG..']);
    expect(PuyoEngine.resolveChains(b)).toEqual({ score: 360, chains: 2 });
    expect(b.flat().every(c => c === '.')).toBe(true);
  });

  it('resolveChains: 同時消し 2色 → 10×8×3 = 240、5連結 → 10×5×2 = 100', () => {
    expect(PuyoEngine.resolveChains(boardFromRows(['RRRGGG', 'R..G..']))).toEqual({ score: 240, chains: 1 });
    expect(PuyoEngine.resolveChains(boardFromRows(['RRRRR.']))).toEqual({ score: 100, chains: 1 });
  });

  it('見えない13段目のぷよはつながらない', () => {
    // 見える12段をつながらない色で埋め、13段目に R を4つ置く
    const b2 = boardFromRows(Array(12).fill('GBYGBY').map((r, i) => (i % 2 ? 'BYGBYG' : r)));
    b2[0][0] = 'R'; b2[0][1] = 'R'; b2[0][2] = 'R'; b2[0][3] = 'R';
    expect(PuyoEngine.resolveChains(b2)).toEqual({ score: 0, chains: 0 });
  });

  it('おじゃま数は 70 点で 1 個、6 個で 1AP、端数持ち越し', () => {
    const e = mk();
    expect(e.pointsToAp(420)).toBe(1); // 6個 → 1AP
    expect(e.pointsToAp(69)).toBe(0);  // 端数 69
    expect(e.pointsToAp(1)).toBe(0);   // 69+1=70 → 1個（おじゃま端数 1）
    expect(e.pointsToAp(350)).toBe(1); // 5個 + 端数1個 = 6個 → 1AP
    expect(e.pointsToAp(0)).toBe(0);
  });

  it('連鎖が終わったら AP を送る（相殺後の余りだけ）', () => {
    const e = mk({ rows: ['BBBG..', 'GGG...'], pairs: [['G', 'B']] });
    const sent: number[] = []; e.onAttack(a => sent.push(a));
    e.move(1); e.dropPairNow();
    expect(e.stats.maxChain).toBe(2);
    // 1連鎖目: G5個 → 10×5×max(1,2)=100、2連鎖目: B4個 → 10×4×8=320 → 420点 = 6個 = 1AP
    expect(e.score).toBe(420);
    expect(sent).toEqual([1]);

    const e2 = mk({ rows: ['BBBG..', 'GGG...'], pairs: [['G', 'B']] });
    const sent2: number[] = []; e2.onAttack(a => sent2.push(a));
    e2.receiveAttack(3); e2.move(1); e2.dropPairNow();
    expect(sent2).toEqual([]);
    // 相殺で 3→2 になり、そのあと 2AP = 12個降ってくる
    expect(e2.pendingAttack).toBe(0);
    expect(countN(e2)).toBe(12);
  });

  it('おじゃまは隣が消えると一緒に消える', () => {
    // 組ぷよ R(軸)/G(子) は列2に落ちる → R が4つつながり、隣の N(col3) は消える。離れた N(col5) は残る
    const e = mk({ rows: ['RRRN.N'], pairs: [['R', 'G']] });
    e.dropPairNow();
    expect(e.stats.pops).toBe(1);
    expect(e.score).toBe(40); // おじゃまは得点の個数に入れない
    expect(countN(e)).toBe(1);
    expect(e.board[12].join('')).toBe('..G..N');
  });

  it('受け取りは1回5AP(30個)まで、残りは持ち越し', () => {
    const e = mk({ pairs: [['R', 'G'], ['B', 'Y']] });
    e.receiveAttack(7); e.dropPairNow();
    expect(countN(e)).toBe(30);
    expect(e.pendingAttack).toBe(2);
    // 6列に均等に5個ずつ
    for (let c = 0; c < 6; c++) expect(e.board.filter(r => r[c] === 'N').length).toBe(5);
  });

  it('端数のおじゃまはシード付き乱数で列を選ぶ（同じシードなら同じ）', () => {
    const pa = new PuyoEngine({ seed: 9, mode: 'versus' }); const pb = new PuyoEngine({ seed: 9, mode: 'versus' });
    pa.receiveAttack(1); pb.receiveAttack(1);
    pa.dropPairNow(); pb.dropPairNow();
    expect(countN(pa)).toBe(6);
    expect(pa.board).toEqual(pb.board);
  });

  it('見えない13段目にあっても出現位置が空なら負けない', () => {
    const e = mk(); e.board[0][0] = 'R'; e.dropPairNow(); expect(e.isOver).toBe(false);
  });

  it('出現位置 (row1, col2) がふさがったら負け', () => {
    // 列2を11段まで交互の色で埋める → 組ぷよを置くと row1 が埋まる
    const rows = Array.from({ length: 11 }, (_, i) => (i % 2 ? '..G...' : '..R...'));
    const e = mk({ rows, pairs: [['B', 'Y']] });
    expect(e.isOver).toBe(false);
    e.dropPairNow();
    expect(e.isOver).toBe(true);
  });

  it('壁際の回転は押し戻す', () => {
    const e = mk({ pairs: [['R', 'G']] });
    while (e.move(1));
    expect(e.pair!.x).toBe(5);
    expect(e.rotate(1)).toBe(true);
    expect(e.pair!.x).toBe(4); expect(e.pair!.rot).toBe(1);
    while (e.move(-1));
    expect(e.pair!.x).toBe(0);
    expect(e.rotate(-1)).toBe(true); // rot 1 → 0
    expect(e.rotate(-1)).toBe(true); // rot 0 → 3 (子が左) → 押し戻し
    expect(e.pair!.x).toBe(1); expect(e.pair!.rot).toBe(3);
  });

  it('両側がふさがっていたら2回回すと上下が入れ替わる（クイックターン）', () => {
    const rows = Array.from({ length: 6 }, (_, i) => (i % 2 ? '.G.B..' : '.R.Y..'));
    const e = mk({ rows, pairs: [['R', 'G']] });
    while (e.tryFall());
    expect(e.pair!.y).toBe(12);
    expect(e.rotate(1)).toBe(false);
    expect(e.rotate(1)).toBe(true);
    expect(e.pair!.rot).toBe(2);
    // 子が下（床）に入るので軸が1段持ち上がる
    expect(e.pair!.y).toBe(11);
  });

  it('自然落下と、着地して lockMs 後に固定', () => {
    const e = mk({ pairs: [['R', 'G'], ['B', 'B']] });
    const y0 = e.pair!.y;
    for (let i = 0; i < 40; i++) e.update(FRAME_MS, emptyInput()); // ~667ms
    expect(e.pair!.y).toBe(y0 + 1);
    // ↓長押しで着地 → 固定 → 次の組ぷよ
    for (let i = 0; i < 40; i++) e.update(FRAME_MS, inp({ down: true })); // 11段 × 40ms < 667ms
    expect(e.board[12][2]).toBe('R');
    expect(e.board[11][2]).toBe('G');
    expect(e.pair!.axis).toBe('B');
  });

  it('左右の押しっぱなしで DAS → リピート', () => {
    const e = mk();
    e.update(FRAME_MS, inp({ left: true }));
    expect(e.pair!.x).toBe(1); // 押した瞬間に1マス
    for (let i = 0; i < 6; i++) e.update(FRAME_MS, inp({ left: true })); // 100ms < DAS
    expect(e.pair!.x).toBe(1);
    for (let i = 0; i < 6; i++) e.update(FRAME_MS, inp({ left: true })); // 200ms > DAS
    expect(e.pair!.x).toBe(0);
    expect(e.stats.moves).toBe(2);
  });

  it('update でも連鎖の演出（popMs）が終わってから次が出る', () => {
    const e = mk({ rows: ['RRR...'], pairs: [['R', 'G'], ['B', 'Y']] });
    e.update(FRAME_MS, inp({ right: true }));
    let frames = 0;
    while (e.stats.pops === 0 && frames < 500) { e.update(FRAME_MS, inp({ down: true })); frames++; }
    expect(e.stats.pops).toBe(1);
    expect(e.pair).toBeNull();
    for (let i = 0; i < 60; i++) e.update(FRAME_MS, emptyInput());
    expect(e.pair!.axis).toBe('B');
    expect(e.score).toBe(40);
  });

  it('snapshot は12行（13段目を除く）で落下中の組ぷよを含む', () => {
    const e = mk({ rows: ['Y.....'], pairs: [['R', 'G']] });
    e.rotate(1); // 子を右に
    const s = e.snapshot();
    expect(s.kind).toBe('puyo');
    if (s.kind !== 'puyo') return;
    expect(s.rows.length).toBe(12);
    expect(s.rows[0]).toBe('..RG..');
    expect(s.rows[11]).toBe('Y.....');
  });

  it('同じシードなら同じ組ぷよ順', () => {
    expect(mk().nextPairs).toEqual(mk().nextPairs);
    expect(mk().nextPairs.length).toBe(2);
  });
});

describe('puyo AI', () => {
  it('normal で 3000 フレーム動かしても負けず、ぷよを消す', () => {
    const e = mk(undefined, 3);
    const ai = createPuyoAI(e, 'normal', 1);
    for (let i = 0; i < 3000 && !e.isOver; i++) e.update(FRAME_MS, ai.next(FRAME_MS));
    expect(e.isOver).toBe(false);
    expect(e.stats.pops).toBeGreaterThan(0);
  });

  it('easy も置ける手を出し続ける', () => {
    const e = mk(undefined, 4);
    const ai = createPuyoAI(e, 'easy', 2);
    for (let i = 0; i < 1000 && !e.isOver; i++) e.update(FRAME_MS, ai.next(FRAME_MS));
    expect(e.board.flat().filter(c => c !== '.').length).toBeGreaterThan(0);
  });

  it('oni の探索は速い (< 30ms/手)', () => {
    const e = mk(undefined, 7);
    const ai = createPuyoAI(e, 'oni', 1);
    let maxMs = 0;
    for (let i = 0; i < 2000 && !e.isOver; i++) {
      const t = performance.now();
      const input = ai.next(FRAME_MS);
      maxMs = Math.max(maxMs, performance.now() - t);
      e.update(FRAME_MS, input);
    }
    expect(maxMs).toBeLessThan(30);
    expect(e.stats.pops).toBeGreaterThan(0);
  });
});

describe('puyo module / tutorial', () => {
  it('module の形', () => {
    expect(puyoModule.kind).toBe('puyo');
    expect(puyoModule.tutorial.length).toBe(3);
    expect(puyoModule.create({ seed: 1, mode: 'solo' }).kind).toBe('puyo');
  });

  it('チュートリアル②: 右に1つ動かして落とすと消える', () => {
    const step = puyoModule.tutorial[1];
    const e = puyoModule.create({ seed: 1, mode: 'tutorial', initial: step.initial }) as PuyoEngine;
    e.move(1); e.dropPairNow();
    expect(step.goal(e)).toBe(true);
  });

  it('チュートリアル③: 右に1つ動かして落とすと2連鎖', () => {
    const step = puyoModule.tutorial[2];
    const e = puyoModule.create({ seed: 1, mode: 'tutorial', initial: step.initial }) as PuyoEngine;
    expect(step.goal(e)).toBe(false);
    e.move(1); e.dropPairNow();
    expect(step.goal(e)).toBe(true);
  });
});
