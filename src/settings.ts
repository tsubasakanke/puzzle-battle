export interface Settings {
  volume: number;
  touch: 'auto' | 'on' | 'off';
  name: string;
}

const KEY = 'pb:settings';
const defaults: Settings = { volume: 0.5, touch: 'auto', name: '' };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できない環境（プライベートブラウズなど）では何もしない
  }
}

export function loadHighScore(kind: string): number {
  try {
    return Number(localStorage.getItem(`pb:hs:${kind}`)) || 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(kind: string, score: number) {
  try {
    localStorage.setItem(`pb:hs:${kind}`, String(score));
  } catch {
    // 同上
  }
}
