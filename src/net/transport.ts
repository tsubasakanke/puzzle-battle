/** Firebase Realtime Database の必要な部分だけを抽象化したもの。テストでは MemoryTransport に差し替える */
export interface Transport {
  uid(): Promise<string>;
  serverNow(): number;
  get(path: string): Promise<any>;
  set(path: string, v: any): Promise<void>;
  update(path: string, v: Record<string, any>): Promise<void>;
  push(path: string, v: any): Promise<void>;
  /** 値を購読する。登録した直後にも今の値で1回呼ぶ。戻り値で解除 */
  on(path: string, cb: (v: any) => void): () => void;
  /** 子の追加を購読する。すでにある子についても呼ぶ */
  onChildAdded(path: string, cb: (v: any) => void): () => void;
  /** 切断されたら path に v を書く */
  onDisconnectSet(path: string, v: any): void;
}

const split = (p: string) => p.split('/').filter(Boolean);
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const related = (a: string[], b: string[]) => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
};

interface Listener { path: string[]; fire: () => void }

/** メモリ上のデータベース。同じ hub を共有した MemoryTransport どうしがつながる */
export class MemoryHub {
  now = 1_000_000;
  private root: any = {};
  private listeners = new Set<Listener>();
  private disconnects = new Map<string, [string, any][]>();
  private counter = 0;

  read(path: string): any {
    let node = this.root;
    for (const k of split(path)) {
      if (node == null || typeof node !== 'object') return null;
      node = node[k];
    }
    return node === undefined ? null : clone(node);
  }

  write(path: string, v: any) {
    const keys = split(path);
    let node = this.root;
    for (const k of keys.slice(0, -1)) {
      if (node[k] == null || typeof node[k] !== 'object') node[k] = {};
      node = node[k];
    }
    const last = keys[keys.length - 1];
    if (v === null || v === undefined) delete node[last];
    else node[last] = clone(v);
    for (const l of [...this.listeners]) if (related(l.path, keys)) l.fire();
  }

  nextKey() {
    return `k${String(this.counter++).padStart(8, '0')}`;
  }

  listen(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  addDisconnect(uid: string, path: string, v: any) {
    const list = this.disconnects.get(uid) ?? [];
    list.push([path, v]);
    this.disconnects.set(uid, list);
  }

  /** uid の接続が切れたことにする（onDisconnectSet の内容を書く） */
  disconnect(uid: string) {
    for (const [p, v] of this.disconnects.get(uid) ?? []) this.write(p, v);
  }
}

export class MemoryTransport implements Transport {
  constructor(private hub: MemoryHub, private id: string) {}
  async uid() { return this.id; }
  serverNow() { return this.hub.now; }
  async get(path: string) { return this.hub.read(path); }
  async set(path: string, v: any) { this.hub.write(path, v); }
  async update(path: string, v: Record<string, any>) {
    for (const [k, val] of Object.entries(v)) this.hub.write(`${path}/${k}`, val);
  }
  async push(path: string, v: any) { this.hub.write(`${path}/${this.hub.nextKey()}`, v); }
  on(path: string, cb: (v: any) => void) {
    const fire = () => cb(this.hub.read(path));
    const off = this.hub.listen({ path: split(path), fire });
    fire();
    return off;
  }
  onChildAdded(path: string, cb: (v: any) => void) {
    const seen = new Set<string>();
    const fire = () => {
      const v = this.hub.read(path) ?? {};
      for (const k of Object.keys(v).sort()) {
        if (seen.has(k)) continue;
        seen.add(k);
        cb(v[k]);
      }
    };
    const off = this.hub.listen({ path: split(path), fire });
    fire();
    return off;
  }
  onDisconnectSet(path: string, v: any) { this.hub.addDisconnect(this.id, path, v); }
}
