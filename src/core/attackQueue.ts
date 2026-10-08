export class AttackQueue {
  pending = 0;

  add(ap: number) {
    if (ap > 0) this.pending += ap;
  }

  /** 自分の攻撃 ap で受け取り予定を相殺し、相手に送る残りを返す */
  offset(ap: number): number {
    const c = Math.min(ap, this.pending);
    this.pending -= c;
    return ap - c;
  }

  /** 実際に受け取る分を最大 max まで取り出す */
  take(max: number): number {
    const t = Math.min(max, this.pending);
    this.pending -= t;
    return t;
  }
}
