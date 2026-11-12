/** A pinch must never finish as a tower purchase or a support strike. */
export class TapGesture {
  private pointers = new Set<number>();
  private origin: { x: number; y: number; time: number } | null = null;
  private cancelled = false;
  down(id: number, x: number, y: number, time: number) {
    if (!this.pointers.size) { this.cancelled = false; this.origin = { x, y, time }; }
    this.pointers.add(id);
    if (this.pointers.size > 1) this.cancelled = true;
  }
  move(x: number, y: number) {
    if (this.origin && Math.hypot(x - this.origin.x, y - this.origin.y) > 8) this.cancelled = true;
  }
  up(id: number, x: number, y: number, time: number, cancel = false): boolean {
    const known = this.pointers.delete(id);
    this.move(x, y);
    const tapped = known && !cancel && !this.cancelled && !this.pointers.size && !!this.origin && time - this.origin.time < 600;
    if (cancel) this.cancelled = true;
    if (!this.pointers.size) this.origin = null;
    return tapped;
  }
}
