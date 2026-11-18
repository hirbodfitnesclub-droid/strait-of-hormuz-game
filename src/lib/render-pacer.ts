// Deadline carry controls cadence; animation time is measured independently
// from the previous presented frame. Otherwise 90 Hz adds the remainder
// twice and speeds up ships, smoke and camera movement.
export class RenderPacer {
  private next = 0;
  private last: number | null = null;

  reset() { this.last = null; }

  step(nowMs: number, intervalSeconds: number): number | null {
    const interval = intervalSeconds * 1000;
    if (this.last === null) {
      this.last = nowMs;
      this.next = nowMs + interval;
      return 0;
    }
    // A user gesture may transition a calm 30 Hz scene to 60 Hz.
    this.next = Math.min(this.next, this.last + interval);
    if (nowMs + 0.01 < this.next) return null;
    const dt = Math.min(Math.max(0, nowMs - this.last) / 1000, 0.05);
    this.last = nowMs;
    this.next += interval;
    if (this.next <= nowMs) this.next = nowMs + interval;
    return dt;
  }
}
