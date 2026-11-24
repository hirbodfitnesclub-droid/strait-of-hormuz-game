"use client";

import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { advance, act, type Harbor, type Intent } from "./session";
import {
  readPortable,
  loadHarbor,
  resume,
  saveHarbor,
  type ClockSample,
} from "./storage";

const nativeClock = registerPlugin<{
  sample(): Promise<{ boot: string; ms: number }>;
}>("HarborClock");
async function sample(): Promise<ClockSample> {
  if (Capacitor.isNativePlatform()) {
    const c = await nativeClock.sample();
    return { ...c, wall: Date.now() };
  }
  return {
    boot: "web/" + performance.timeOrigin,
    ms: performance.now(),
    wall: Date.now(),
  };
}
export class HarborStore {
  h: Harbor | null = null;
  problem = "";
  paused = false;
  speed = 1;
  private tickAt = 0;
  private fraction = 0;
  private sinceSave = 0;
  private hidden: ClockSample | null = null;
  private anchor: ClockSample | null = null;
  private anchorPerf = 0;
  private visible = false;
  private generation = 0;
  constructor(private changed: () => void) {}
  private clock(): ClockSample {
    const c = this.anchor!;
    return {
      boot: c.boot,
      ms: c.ms + Math.max(0, performance.now() - this.anchorPerf),
      wall: Math.max(c.wall, Date.now()),
    };
  }
  async open() {
    try {
      this.anchor = await sample();
      this.anchorPerf = performance.now();
      const record = loadHarbor(localStorage, this.anchor);
      this.h = record.harbor;
      this.anchor.wall = record.wallHigh;
      this.paused = !!this.h.voyage;
      this.visible = !document.hidden;
      this.tickAt = performance.now();
      if (!this.visible) this.hidden = this.anchor;
      this.save();
      this.changed();
    } catch {
      this.problem = "ذخیره خوانده نشد. برای تلاش دوباره بازی را باز کنید.";
      this.changed();
    }
  }
  save() {
    if (!this.h || !this.anchor) return;
    try {
      saveHarbor(localStorage, this.h, this.hidden ?? this.clock());
      this.problem = "";
    } catch {
      this.problem = "ذخیره انجام نشد. فضای آزاد دستگاه را بررسی کنید.";
    }
    this.sinceSave = 0;
  }
  tick(flush = false) {
    if (!this.h || !this.visible) return;
    const now = performance.now(),
      dt = Math.max(0, (now - this.tickAt) / 1000);
    const interval = this.h.voyage && !this.paused ? 0.24 : 0.98;
    if (dt <= 0 || (!flush && dt < interval)) return;
    this.tickAt = now;
    this.fraction +=
      this.paused || !this.h.voyage ? 0 : Math.min(1, dt) * this.speed;
    const steps = Math.floor(this.fraction * 4);
    this.fraction -= steps / 4;
    const prev = this.h.voyage;
    this.h = advance(this.h, dt, steps / 4);
    this.h.port.lastSavedAt += dt * 1000;
    this.sinceSave += dt;
    if (this.sinceSave >= 4 || (prev && !this.h.voyage)) this.save();
    this.changed();
  }
  import(raw: string) {
    if (!this.visible) return false;
    try {
      const candidate = readPortable(raw, this.clock().wall);
      saveHarbor(localStorage, candidate, this.clock());
      this.h = candidate;
      this.paused = !!candidate.voyage;
      this.tickAt = performance.now();
      this.fraction = 0;
      this.changed();
      return true;
    } catch {
      this.problem = "بازیابی فایل انجام نشد.";
      this.changed();
      return false;
    }
  }
  command = (a: Intent) => {
    if (!this.h || !this.visible) return;
    this.tick(true);
    this.h = act(this.h, a);
    if (a.type === "launch") {
      this.paused = false;
      this.speed = 1;
      this.fraction = 0;
    }
    this.save();
    this.changed();
  };
  pause = (on: boolean) => {
    this.tick(true);
    this.paused = on;
    this.changed();
  };
  pace = () => {
    this.tick(true);
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
    this.changed();
  };
  background = () => {
    ++this.generation;
    if (!this.visible || !this.h) return;
    this.tick(true);
    this.visible = false;
    this.hidden = this.clock();
    if (this.h.voyage) this.paused = true;
    this.save();
    this.changed();
  };
  foreground = async () => {
    if (this.visible || !this.h || !this.hidden) return;
    const n = ++this.generation,
      c = await sample();
    if (
      this.visible ||
      n !== this.generation ||
      !this.hidden ||
      document.hidden
    )
      return;
    this.h = resume(this.h, this.hidden, c);
    this.anchor = { ...c, wall: Math.max(this.hidden.wall, c.wall) };
    this.anchorPerf = performance.now();
    this.hidden = null;
    this.visible = true;
    this.tickAt = performance.now();
    this.save();
    this.changed();
  };
}
export function useHarbor() {
  const [, render] = useState(0);
  const [store] = useState(() => new HarborStore(() => render((n) => n + 1)));
  useEffect(() => {
    if (
      !Capacitor.isNativePlatform() &&
      process.env.NODE_ENV === "production" &&
      process.env.NEXT_PUBLIC_STATIC_GAME !== "1" &&
      "serviceWorker" in navigator
    )
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    let disposed = false,
      release: (() => void) | undefined;
    const start = async () => {
      if (disposed) return;
      await store.open();
      if (disposed) return;
      if (document.hidden) store.background();
      await new Promise<void>((r) => {
        release = r;
      });
    };
    if (navigator.locks)
      void navigator.locks.request(
        "hormuz-port-session",
        { ifAvailable: true },
        async (lock) => {
          if (disposed) return;
          if (lock) await start();
          else {
            store.problem =
              "بندر در پنجرهٔ دیگری باز است. آن پنجره را ببندید و دوباره وارد شوید.";
            render((n) => n + 1);
          }
        },
      );
    else void start();
    const visibility = () => {
      if (document.hidden) store.background();
      else void store.foreground();
    };
    const back = () => store.background(),
      front = () => void store.foreground();
    const handle = Capacitor.isNativePlatform()
      ? App.addListener("appStateChange", (s) => {
          if (s.isActive) front();
          else back();
        })
      : null;
    const timer = window.setInterval(() => store.tick(), 100);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", back);
    window.addEventListener("pageshow", front);
    return () => {
      disposed = true;
      release?.();
      clearInterval(timer);
      store.background();
      void handle?.then((h) => h.remove());
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", back);
      window.removeEventListener("pageshow", front);
    };
  }, [store]);
  return store;
}
