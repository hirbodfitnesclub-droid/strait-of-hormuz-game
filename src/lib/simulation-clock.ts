/** Fixed game steps, independent of display refresh. Long stalls have a bounded
 * catch-up budget; background time belongs to the offline economy, never combat. */
export class SimulationClock {
  private previous: number | null = null;
  private remainder = 0;
  constructor(readonly step = 0.125, readonly maxSteps = 4) {}
  reset(now: number) { this.previous = now; this.remainder = 0; }
  advance(now: number, suspended = false): number[] {
    if (suspended || this.previous === null) { this.reset(now); return []; }
    const elapsed = Math.max(0, (now - this.previous) / 1000);
    this.previous = now;
    this.remainder = Math.min(this.remainder + elapsed, this.step * this.maxSteps);
    const steps = Math.floor((this.remainder + 1e-9) / this.step);
    this.remainder -= steps * this.step;
    return Array.from({ length: steps }, () => this.step);
  }
}
