// Phone frame-time session recorder — evidence tool for the §16 performance
// budget (DoD 16.1) and ticket T-001 (60fps acceptance on the owner's phone).
//
// Activated ONLY by the ?fpslog=1 query flag (WorldView3D dynamic-imports this
// module, so there is zero runtime cost when the flag is absent).
//
// Measurement source (v2): the recorder SUBSCRIBES to the map render loop's
// frame hook — window.__hormuzFrameHook, fired once per actually-rendered
// frame with its timestamp. v1 sampled its own private requestAnimationFrame,
// which (a) reported display-rate FPS while the calm cap rendered the game at
// 30fps, and (b) silently dropped every interval >= 1s, so the worst stalls
// (exactly the thermal-throttle regime this tool exists to measure) vanished
// from the percentiles. v2 records EVERY interval between rendered frames —
// multi-second stalls included — and additionally reports explicit stall
// counters (count / total ms / worst frame) so the distribution can be read
// alongside them. Minute 1/5/10 averages are computed on WALL-CLOCK minutes
// (frames rendered in that minute / 60s), so a frozen minute reads ~0 fps
// instead of null.

import { exportJson } from './export-file';

export interface RenderInfoSample {
  calls: number;
  tris: number;
  dpr: number;
}

export interface FrameSessionReport {
  tool: 'hormuz-frame-recorder';
  version: 3;
  /** Where frame times came from: the game's own render loop, not a private rAF. */
  source: 'render-loop-frame-hook';
  startedAt: string;
  durationSec: number;
  /** All rendered frames seen via the hook (baseline frame included). */
  frames: number;
  /** Intervals actually stored in the ring buffer and used for percentiles. */
  sampledIntervals: number;
  /** Intervals overwritten because the ring wrapped (0 in any realistic session). */
  samplesDropped: number;
  avgFps: number;
  /** Frame-time percentiles in ms over ALL intervals, stalls included. */
  frameMs: { mean: number; p5: number; p50: number; p95: number; max: number };
  /** FPS percentiles derived per frame (1000/ms). fps.p5 is the DoD floor metric. */
  fps: { p5: number; p50: number; p95: number };
  /** Intervals >= 1000ms: how many, their total duration, and the worst one. */
  stalls: { count: number; totalMs: number; worstMs: number };
  /** Average FPS within wall-clock minute 1 / 5 / 10; null when that minute did not complete. */
  minuteAvgFps: Record<'1' | '5' | '10', number | null>;
  render: { lastCalls: number; lastTris: number; maxCalls: number; maxTris: number; dpr: number };
  battery: { startPct: number | null; endPct: number | null; charging: boolean | null };
  /** Render statistics sampled once per second, including the first 30 s. */
  timeline: Array<{ seconds: number; frames: number; calls: number; tris: number; dpr: number }>;
  userAgent: string;
}

const MAX_SECONDS = 600; // 10 minutes
// Ring capacity: 250k intervals covers a full 10-minute session even on a
// 240Hz+ display (240 * 600 = 144k). If it ever wraps, samplesDropped in the
// report says so explicitly instead of silently truncating coverage.
const MAX_FRAMES = 250_000;
const STALL_MS = 1000;

type FrameHook = (nowMs: number) => void;

interface BatteryLike {
  level: number;
  charging: boolean;
}

function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

/**
 * Starts recording. Returns a stop function (also triggered by clicking the
 * on-screen pill). On stop, a JSON report is downloaded automatically.
 */
export function startFrameRecorder(getRenderInfo: () => RenderInfoSample): () => void {
  const w = window as unknown as { __hormuzFrameHook?: FrameHook };
  const ring = new Float64Array(MAX_FRAMES);
  let head = 0;          // next write slot in the ring
  let stored = 0;        // intervals currently held (<= MAX_FRAMES)
  let dropped = 0;       // intervals overwritten after wrap
  let framesTotal = 0;   // every hook call, baseline included
  let lastTs: number | null = null;
  const timeline: FrameSessionReport['timeline'] = [];
  let previousFrames = 0;
  let stallCount = 0;
  let stallMs = 0;
  let worstMs = 0;
  // per-wall-clock-minute rendered-frame buckets for minute 1/5/10 averages
  const bucketFrames = new Array<number>(10).fill(0);
  const t0 = performance.now();
  let stopped = false;
  let timer = 0;
  let lastInfo: RenderInfoSample = { calls: -1, tris: -1, dpr: -1 };
  let maxCalls = 0;
  let maxTris = 0;
  let batteryStart: number | null = null;
  let batteryCharging: boolean | null = null;

  const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }).getBattery;
  if (typeof getBattery === 'function') {
    getBattery.call(navigator).then(b => { batteryStart = Math.round(b.level * 100); batteryCharging = b.charging; }).catch(() => { /* unsupported */ });
  }

  // Minimal tester UI: elapsed time + live average FPS; tap = stop & download.
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.textContent = '⏺ FPS 0:00';
  pill.title = 'توقف ثبت فریم و دریافت گزارش';
  pill.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:rgba(10,14,20,0.85);color:#7dffb0;font:12px/1.5 monospace;padding:6px 10px;border:1px solid #2f6;border-radius:8px;cursor:pointer;user-select:none';
  document.body.appendChild(pill);

  const hook: FrameHook = (now) => {
    if (stopped) return;
    framesTotal += 1;
    const minute = Math.floor((now - t0) / 60000);
    if (minute >= 0 && minute < bucketFrames.length) bucketFrames[minute] += 1;
    if (lastTs !== null) {
      const dt = now - lastTs;
      if (dt > 0) {
        ring[head] = dt;
        head = (head + 1) % MAX_FRAMES;
        if (stored < MAX_FRAMES) stored += 1; else dropped += 1;
        if (dt >= STALL_MS) { stallCount += 1; stallMs += dt; }
        if (dt > worstMs) worstMs = dt;
      }
    }
    lastTs = now;
  };
  w.__hormuzFrameHook = hook;

  // 1s housekeeping (pill, render-info sample, 10-minute auto-stop). This
  // timer NEVER feeds frame statistics — it only reads what the hook saw.
  const housekeeping = () => {
    if (stopped) return;
    const elapsed = performance.now() - t0;
    try {
      lastInfo = getRenderInfo();
      if (lastInfo.calls > maxCalls) maxCalls = lastInfo.calls;
      if (lastInfo.tris > maxTris) maxTris = lastInfo.tris;
    } catch { /* renderer not ready yet */ }
    timeline.push({ seconds: Math.round(elapsed / 100) / 10, frames: framesTotal - previousFrames, ...lastInfo });
    previousFrames = framesTotal;
    const secs = Math.floor(elapsed / 1000);
    const avg = elapsed > 0 ? (framesTotal / (elapsed / 1000)).toFixed(1) : '0';
    pill.textContent = `⏺ FPS ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} · avg ${avg} · ${lastInfo.calls} calls`;
    if (elapsed >= MAX_SECONDS * 1000) finish();
  };
  timer = window.setInterval(housekeeping, 1000);

  function collectIntervals(): Float64Array {
    // Ring may have wrapped; chronological order does not matter for percentiles/mean.
    return ring.slice(0, stored);
  }

  async function buildReport(): Promise<FrameSessionReport> {
    const elapsedMs = performance.now() - t0;
    const intervals = collectIntervals();
    const sorted = Float64Array.from(intervals).sort();
    const mean = stored > 0 ? intervals.reduce((a, b) => a + b, 0) / stored : 0;
    const fpsSorted = Float64Array.from(intervals, d => (d > 0 ? 1000 / d : 0)).sort();
    // Wall-clock minute average: frames rendered during that minute / 60s.
    // A minute counts only once it has fully elapsed; a stalled minute
    // therefore reports its true (near-zero) rate instead of null.
    const minuteAvg = (m: number): number | null =>
      (elapsedMs >= (m + 1) * 60000 ? Math.round((bucketFrames[m] / 60) * 10) / 10 : null);
    let batteryEnd: number | null = null;
    if (typeof getBattery === 'function') {
      try { const b = await getBattery.call(navigator); batteryEnd = Math.round(b.level * 100); batteryCharging = b.charging; } catch { /* unsupported */ }
    }
    return {
      tool: 'hormuz-frame-recorder',
      version: 3,
      source: 'render-loop-frame-hook',
      startedAt: new Date(Date.now() - elapsedMs).toISOString(),
      durationSec: Math.round(elapsedMs / 100) / 10,
      frames: framesTotal,
      sampledIntervals: stored,
      samplesDropped: dropped,
      avgFps: elapsedMs > 0 ? Math.round((framesTotal / (elapsedMs / 1000)) * 10) / 10 : 0,
      frameMs: {
        mean: Math.round(mean * 100) / 100,
        p5: Math.round(percentile(sorted, 5) * 100) / 100,
        p50: Math.round(percentile(sorted, 50) * 100) / 100,
        p95: Math.round(percentile(sorted, 95) * 100) / 100,
        max: Math.round(worstMs * 100) / 100,
      },
      fps: {
        p5: Math.round(percentile(fpsSorted, 5) * 10) / 10,
        p50: Math.round(percentile(fpsSorted, 50) * 10) / 10,
        p95: Math.round(percentile(fpsSorted, 95) * 10) / 10,
      },
      stalls: { count: stallCount, totalMs: Math.round(stallMs), worstMs: Math.round(worstMs) },
      minuteAvgFps: { '1': minuteAvg(0), '5': minuteAvg(4), '10': minuteAvg(9) },
      render: { lastCalls: lastInfo.calls, lastTris: lastInfo.tris, maxCalls, maxTris, dpr: lastInfo.dpr },
      battery: { startPct: batteryStart, endPct: batteryEnd, charging: batteryCharging },
      timeline,
      userAgent: navigator.userAgent,
    };
  }

  function finish() {
    if (stopped) return;
    stopped = true;
    window.clearInterval(timer);
    if (w.__hormuzFrameHook === hook) delete w.__hormuzFrameHook;
    pill.textContent = '⏹ building report…';
    void buildReport().then(report => {
      const filename = `hormuz-fps-${report.startedAt.replace(/[:.]/g, '-')}.json`;
      let exporting = false;
      const share = async () => {
        if (exporting) return;
        exporting = true;
        try {
          await exportJson(filename, report);
          pill.removeEventListener('click', share);
          pill.textContent = `⏹ ${report.avgFps} FPS · p5 ${report.fps.p5}`;
          setTimeout(() => pill.remove(), 5000);
        } catch {
          pill.textContent = 'دریافت دوبارهٔ گزارش فریم';
        } finally { exporting = false; }
      };
      pill.removeEventListener('click', finish);
      pill.addEventListener('click', share);
      void share();
    }).catch(() => { pill.textContent = 'خطا در تهیهٔ گزارش فریم'; });
  }

  pill.addEventListener('click', finish);
  return finish;
}
