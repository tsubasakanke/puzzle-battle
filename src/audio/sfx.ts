// WebAudio で作る簡単な効果音（音声ファイルは使わない）

type Sfx = 'move' | 'rotate' | 'drop' | 'clear' | 'attack' | 'garbage' | 'win' | 'lose' | 'select';

const TONES: Record<Sfx, { f: number[]; d: number; type: OscillatorType }> = {
  move: { f: [440], d: 0.03, type: 'square' },
  rotate: { f: [660], d: 0.04, type: 'square' },
  drop: { f: [220, 140], d: 0.08, type: 'triangle' },
  clear: { f: [523, 659, 784], d: 0.18, type: 'triangle' },
  attack: { f: [880, 1175], d: 0.15, type: 'sawtooth' },
  garbage: { f: [160, 110], d: 0.2, type: 'sawtooth' },
  win: { f: [523, 659, 784, 1047], d: 0.5, type: 'triangle' },
  lose: { f: [392, 330, 262, 196], d: 0.6, type: 'triangle' },
  select: { f: [784], d: 0.06, type: 'sine' },
};

let ctx: AudioContext | null = null;
let volume = 0.5;

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export const sfx = {
  setVolume(v: number) {
    volume = v;
  },
  play(name: Sfx) {
    if (volume <= 0) return;
    const a = audio();
    if (!a) return;
    const { f, d, type } = TONES[name];
    const t0 = a.currentTime;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    f.forEach((freq, i) => osc.frequency.setValueAtTime(freq, t0 + (d / f.length) * i));
    gain.gain.setValueAtTime(volume * 0.15, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(gain).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + d + 0.02);
  },
};
