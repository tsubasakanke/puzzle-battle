type Child = Node | string | null | undefined | false;

/** 小さな DOM ヘルパー。on* 属性はイベントリスナーとして登録する */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, any> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

/** キャンバスを親要素いっぱいに広げ、devicePixelRatio に合わせる。CSS ピクセルの大きさを返す */
export function fitCanvas(canvas: HTMLCanvasElement): { w: number; h: number } {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr));
  const hh = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== hh) {
    canvas.width = w;
    canvas.height = hh;
  }
  canvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height };
}

/** 縦横比を保ったまま、領域の中央に収まる矩形を返す */
export function fitRect(x: number, y: number, w: number, hh: number, aspect: number) {
  let rw = w, rh = w / aspect;
  if (rh > hh) { rh = hh; rw = hh * aspect; }
  return { x: x + (w - rw) / 2, y: y + (hh - rh) / 2, w: rw, h: rh };
}
