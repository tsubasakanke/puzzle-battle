import Matter from 'matter-js';
import type { EngineOptions, GameEngine, GameSnapshot, InputState } from '../../core/types';
import { mulberry32, randInt, shuffle, type Rng } from '../../core/rng';
import { AttackQueue } from '../../core/attackQueue';
import { FRAME_MS, SUIKA } from '../../core/balance';

export interface SuikaInitial {
  fruits?: { x: number; y: number; type: number }[];
  stones?: { x: number; y: number }[];
  /** 最初の current / next の順番。使い切ったらシード付き乱数 */
  queue?: number[];
}

export interface SuikaBody { x: number; y: number; r: number; type: number }

interface BodyInfo { type: number; bornAt: number }

/** 「ほぼ止まっている」とみなす速さ（Matter の 1ステップあたりの px） */
const REST_SPEED = 0.6;
/** 容器の壁の厚みと、上にはみ出す石を受け止めるための高さ */
const WALL_T = 100;
const WALL_TOP = -1200;

export const radiusOf = (type: number) => (type < 0 ? SUIKA.stoneRadius : SUIKA.radii[type]);

/** 合体の得点: 新しい番号 k で (k+1)(k+2)/2 */
const mergeScore = (k: number) => ((k + 1) * (k + 2)) / 2;

export class SuikaEngine implements GameEngine {
  readonly kind = 'suika' as const;
  cursorX = SUIKA.width / 2;
  current: number;
  next: number;
  score = 0;
  isOver = false;
  readonly stats: Record<string, number> = { drops: 0, merges: 0, stonesBroken: 0, maxType: 0 };

  private readonly engine: Matter.Engine;
  private readonly rng: Rng;
  private readonly queue = new AttackQueue();
  private readonly listeners: ((ap: number) => void)[] = [];
  private readonly info = new Map<number, BodyInfo>();
  private readonly presetQueue: number[];
  private candidates: [Matter.Body, Matter.Body][] = [];
  private acc = 0;
  /** 物理演算で進んだ時間 (ms) */
  private clock = 0;
  private lastDropAt = -Infinity;
  private lastMergeAt = -Infinity;
  private chain = 0;
  private apAccum = 0;
  private overMs = 0;

  constructor(opts: EngineOptions) {
    this.rng = mulberry32(opts.seed);
    const init = (opts.initial ?? {}) as SuikaInitial;
    this.presetQueue = [...(init.queue ?? [])];

    this.engine = Matter.Engine.create({ gravity: { x: 0, y: 1 }, enableSleeping: false });
    this.engine.positionIterations = 10;
    this.engine.velocityIterations = 8;
    const { width: W, height: H } = SUIKA;
    const wallH = H - WALL_TOP + WALL_T;
    const wallCy = (WALL_TOP + H + WALL_T) / 2;
    Matter.Composite.add(this.engine.world, [
      Matter.Bodies.rectangle(W / 2, H + WALL_T / 2, W + WALL_T * 2, WALL_T, { isStatic: true, label: 'wall' }),
      Matter.Bodies.rectangle(-WALL_T / 2, wallCy, WALL_T, wallH, { isStatic: true, label: 'wall' }),
      Matter.Bodies.rectangle(W + WALL_T / 2, wallCy, WALL_T, wallH, { isStatic: true, label: 'wall' }),
    ]);
    const collect = (ev: Matter.IEventCollision<Matter.Engine>) => {
      for (const p of ev.pairs) this.candidates.push([p.bodyA.parent, p.bodyB.parent]);
    };
    Matter.Events.on(this.engine, 'collisionStart', collect);
    Matter.Events.on(this.engine, 'collisionActive', collect);

    for (const f of init.fruits ?? []) this.addBody(f.x, f.y, f.type, -Infinity);
    for (const s of init.stones ?? []) this.addBody(s.x, s.y, -1, -Infinity);

    this.current = this.takeType();
    this.next = this.takeType();
    this.stats.maxType = Math.max(this.current, ...(init.fruits ?? []).map(f => f.type));
  }

  get pendingAttack() { return this.queue.pending; }

  onAttack(cb: (ap: number) => void) { this.listeners.push(cb); }

  receiveAttack(ap: number) { this.queue.add(ap); }

  /** 今落とせるか（クールダウン中でない） */
  canDrop(): boolean {
    return !this.isOver && this.clock - this.lastDropAt >= SUIKA.dropCooldownMs;
  }

  update(dtMs: number, input: InputState) {
    if (this.isOver) return;
    const r = radiusOf(this.current);
    if (input.pointerX !== null) this.cursorX = input.pointerX;
    else {
      if (input.left) this.cursorX -= SUIKA.moveSpeed * dtMs;
      if (input.right) this.cursorX += SUIKA.moveSpeed * dtMs;
    }
    this.cursorX = clamp(this.cursorX, r, SUIKA.width - r);
    if (input.hardDrop) this.dropAt(this.cursorX);
    this.step(dtMs);
  }

  /** current を x に落とす。クールダウン中・ゲームオーバーなら false */
  dropAt(x: number): boolean {
    if (!this.canDrop()) return false;
    const type = this.current;
    const r = radiusOf(type);
    this.addBody(clamp(x, r, SUIKA.width - r), SUIKA.dropY, type, this.clock);
    this.current = this.next;
    this.next = this.takeType();
    this.lastDropAt = this.clock;
    this.stats.drops++;

    // 前に落としてから今までに出た AP をまとめて送る（相殺してから）
    if (this.apAccum > 0) {
      const rest = this.queue.offset(this.apAccum);
      this.apAccum = 0;
      if (rest > 0) for (const cb of this.listeners) cb(rest);
    }
    // 受け取り予定の石を降らせる（重ならないよう 40px の枠から選ぶ）
    const n = this.queue.take(SUIKA.maxStonesPerTurn);
    if (n > 0) {
      const slotW = SUIKA.stoneRadius * 2 + 4;
      const slots = Math.floor(SUIKA.width / slotW);
      const order = shuffle(this.rng, Array.from({ length: slots }, (_, i) => i));
      for (let i = 0; i < n; i++) {
        const slot = order[i % slots];
        const row = Math.floor(i / slots);
        const sx = slot * slotW + slotW / 2 + (this.rng() - 0.5) * 4;
        this.addBody(sx, -20 - row * slotW, -1, this.clock);
      }
    }
    return true;
  }

  /** 物理演算（合体・負けの判定を含む）だけを進める */
  step(ms: number) {
    this.acc += ms;
    while (this.acc >= FRAME_MS - 1e-9) {
      this.acc -= FRAME_MS;
      if (this.isOver) { this.acc = 0; return; }
      this.physicsStep();
    }
  }

  bodies(): SuikaBody[] {
    const out: SuikaBody[] = [];
    for (const b of Matter.Composite.allBodies(this.engine.world)) {
      const inf = this.info.get(b.id);
      if (!inf) continue;
      out.push({ x: b.position.x, y: b.position.y, r: radiusOf(inf.type), type: inf.type });
    }
    return out;
  }

  snapshot(): GameSnapshot {
    const arr: number[] = [];
    for (const b of this.bodies()) arr.push(Math.round(b.x), Math.round(b.y), b.type);
    return { kind: 'suika', bodies: arr };
  }

  // ---- 内部 ----

  private takeType(): number {
    const q = this.presetQueue.shift();
    return q ?? randInt(this.rng, SUIKA.spawnMaxType + 1);
  }

  private addBody(x: number, y: number, type: number, bornAt: number): Matter.Body {
    const body = Matter.Bodies.circle(x, y, radiusOf(type), {
      restitution: 0.2,
      friction: 0.1,
      label: type < 0 ? 'stone' : 'fruit',
    });
    this.info.set(body.id, { type, bornAt });
    Matter.Composite.add(this.engine.world, body);
    if (type > this.stats.maxType) this.stats.maxType = type;
    return body;
  }

  private removeBody(b: Matter.Body) {
    this.info.delete(b.id);
    Matter.Composite.remove(this.engine.world, b);
  }

  private physicsStep() {
    this.candidates = [];
    Matter.Engine.update(this.engine, FRAME_MS);
    this.clock += FRAME_MS;
    this.resolveMerges();
    this.checkOver();
  }

  private resolveMerges() {
    const consumed = new Set<number>();
    for (const [a, b] of this.candidates) {
      if (a === b || consumed.has(a.id) || consumed.has(b.id)) continue;
      const ia = this.info.get(a.id);
      const ib = this.info.get(b.id);
      if (!ia || !ib || ia.type < 0 || ia.type !== ib.type) continue;
      consumed.add(a.id);
      consumed.add(b.id);
      this.merge(a, b, ia.type);
    }
    this.candidates = [];
  }

  private merge(a: Matter.Body, b: Matter.Body, type: number) {
    const cx = (a.position.x + b.position.x) / 2;
    const cy = (a.position.y + b.position.y) / 2;
    this.removeBody(a);
    this.removeBody(b);
    const last = SUIKA.radii.length - 1;
    const newType = type + 1;
    let newR: number;
    if (type >= last) {
      // スイカ同士は両方消える
      newR = SUIKA.radii[last];
    } else {
      newR = SUIKA.radii[newType];
      this.addBody(cx, cy, newType, this.clock);
    }
    this.stats.merges++;
    this.score += mergeScore(newType);

    // AP と連鎖
    let ap = SUIKA.apByType[Math.min(newType, last)];
    if (this.clock - this.lastMergeAt <= SUIKA.comboWindowMs) {
      this.chain++;
      if (this.chain % SUIKA.comboPerBonus === 0) ap += 1;
    } else this.chain = 0;
    this.lastMergeAt = this.clock;
    this.apAccum += ap;

    // 近くの石を砕く
    const reach = newR + SUIKA.stoneRadius + SUIKA.stoneBreakMargin;
    for (const s of Matter.Composite.allBodies(this.engine.world)) {
      const inf = this.info.get(s.id);
      if (!inf || inf.type !== -1) continue;
      if (Math.hypot(s.position.x - cx, s.position.y - cy) <= reach) {
        this.removeBody(s);
        this.stats.stonesBroken++;
      }
    }
  }

  private checkOver() {
    let over = false;
    for (const b of Matter.Composite.allBodies(this.engine.world)) {
      const inf = this.info.get(b.id);
      if (!inf || this.clock - inf.bornAt < SUIKA.graceMs) continue;
      if (b.position.y - radiusOf(inf.type) < SUIKA.deadLineY && b.speed < REST_SPEED) { over = true; break; }
    }
    this.overMs = over ? this.overMs + FRAME_MS : 0;
    if (this.overMs >= SUIKA.overLimitMs) this.isOver = true;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
