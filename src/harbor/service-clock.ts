import { Capacitor, registerPlugin } from "@capacitor/core";
import type { ClockSample } from "./storage";

const native = registerPlugin<{
  sample(): Promise<{ boot: string; ms: number }>;
}>("HarborClock");
let base: { boot: string; ms: number; performanceMs: number } | undefined;

export async function refreshServiceClock() {
  if (Capacitor.isNativePlatform()) {
    try {
      const value = await native.sample();
      base = { ...value, performanceMs: performance.now() };
    } catch {
      /* A document clock remains usable until Android supplies a boot clock. */
    }
  }
  return serviceClock();
}

export function serviceClock(): ClockSample {
  const now = performance.now();
  return base
    ? {
        boot: base.boot,
        ms: base.ms + Math.max(0, now - base.performanceMs),
        wall: Date.now(),
      }
    : { boot: "web/" + performance.timeOrigin, ms: now, wall: Date.now() };
}
