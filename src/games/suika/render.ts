import type { GameSnapshot, Rect } from '../../core/types';
import { SUIKA } from '../../core/balance';
import { radiusOf, type SuikaBody, type SuikaEngine } from './rules';

/** 容器の上にある NEXT・スコア用の帯の高さ（論理座標） */
const HEADER = 80;
const LOGICAL_W = SUIKA.width;
const LOGICAL_H = SUIKA.height + HEADER;

/** rect の中に 400x680 の論理座標が収まるよう座標系を合わせる */
function begin(ctx: CanvasRenderingContext2D, rect: Rect) {
  const s = Math.min(rect.w / LOGICAL_W, rect.h / LOGICAL_H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.translate(rect.x + (rect.w - LOGICAL_W * s) / 2, rect.y + (rect.h - LOGICAL_H * s) / 2);
  ctx.scale(s, s);
}

function drawFruit(ctx: CanvasRenderingContext2D, x: number, y: number, type: number, alpha = 1) {
  const r = radiusOf(type);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (type < 0) {
    ctx.fillStyle = '#8a8d91';
    ctx.strokeStyle = '#4a4d52';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r - 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = SUIKA.colors[type];
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // ハイライト
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.18, -0.6, 0, Math.PI * 2);
  ctx.fill();
  // 葉っぱ
  ctx.fillStyle = '#3a8d3a';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.15, y - r * 0.95, r * 0.22, r * 0.1, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // 名前の頭文字
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.font = `bold ${Math.max(10, Math.round(r * 0.8))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(SUIKA.names[type][0], x, y + 1);
  ctx.restore();
}

/** 容器・デッドライン・物体を描く（容器の原点に translate 済みの前提） */
function drawContainer(ctx: CanvasRenderingContext2D, bodies: SuikaBody[]) {
  ctx.fillStyle = '#fff6e0';
  ctx.fillRect(0, 0, SUIKA.width, SUIKA.height);
  ctx.strokeStyle = '#a0784a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, SUIKA.height);
  ctx.lineTo(SUIKA.width, SUIKA.height);
  ctx.lineTo(SUIKA.width, 0);
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = '#e03030';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(0, SUIKA.deadLineY);
  ctx.lineTo(SUIKA.width, SUIKA.deadLineY);
  ctx.stroke();
  ctx.restore();

  for (const b of bodies) drawFruit(ctx, b.x, b.y, b.type);
}

function drawHeader(ctx: CanvasRenderingContext2D, e: SuikaEngine | null) {
  ctx.fillStyle = '#3b2a1a';
  ctx.fillRect(0, 0, LOGICAL_W, HEADER);
  if (!e) return;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`スコア ${e.score}`, 14, 28);
  if (e.pendingAttack > 0) {
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#ff8a80';
    ctx.fillText(`おじゃま石 ×${e.pendingAttack}`, 14, 58);
    const n = Math.min(e.pendingAttack, 10);
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(150 + i * 14, 58);
      ctx.scale(0.35, 0.35);
      drawFruit(ctx, 0, 0, -1);
      ctx.restore();
    }
  }
  // NEXT
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('NEXT', LOGICAL_W - 80, 40);
  const r = radiusOf(e.next);
  const scale = Math.min(1, 30 / r);
  ctx.save();
  ctx.translate(LOGICAL_W - 40, 40);
  ctx.scale(scale, scale);
  drawFruit(ctx, 0, 0, e.next);
  ctx.restore();
}

export function drawSuika(ctx: CanvasRenderingContext2D, e: SuikaEngine, rect: Rect) {
  begin(ctx, rect);
  drawHeader(ctx, e);
  ctx.translate(0, HEADER);
  drawContainer(ctx, e.bodies());
  if (!e.isOver) {
    // 落とす位置のガイド線と、今のフルーツ
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(e.cursorX, SUIKA.dropY);
    ctx.lineTo(e.cursorX, SUIKA.height);
    ctx.stroke();
    ctx.restore();
    drawFruit(ctx, e.cursorX, SUIKA.dropY, e.current, e.canDrop() ? 1 : 0.5);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, SUIKA.width, SUIKA.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ゲームオーバー', SUIKA.width / 2, SUIKA.height / 2);
  }
  ctx.restore();
}

export function drawSuikaSnapshot(ctx: CanvasRenderingContext2D, snap: GameSnapshot, rect: Rect) {
  if (snap.kind !== 'suika') return;
  const bodies: SuikaBody[] = [];
  for (let i = 0; i + 2 < snap.bodies.length; i += 3) {
    const type = snap.bodies[i + 2];
    bodies.push({ x: snap.bodies[i], y: snap.bodies[i + 1], type, r: radiusOf(type) });
  }
  begin(ctx, rect);
  drawHeader(ctx, null);
  ctx.translate(0, HEADER);
  drawContainer(ctx, bodies);
  ctx.restore();
}
