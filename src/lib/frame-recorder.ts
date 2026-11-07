// Phone frame-time session recorder — evidence tool for the §16 performance
// budget (DoD 16.1) and ticket T-001 (60fps acceptance on the owner's phone).
//
// Activated ONLY by the ?fpslog=1 query flag (WorldView3D dynamic-imports this
// module, so there is zero runtime cost when the flag is absent). It records
// up to 10 minutes of frame times, then lets the tester download a JSON
// report: frame-time percentiles (5/50/95), average FPS for minutes 1/5/10,
// renderer.info draw calls / triangles, effective DPR, and battery drain.

export interface RenderInfoSample {
  calls: number;
  tris: number;
  dpr: number;
}

export interface FrameSessionReport {
  tool: 'hormuz-frame-recorder';
  version: 1;
  startedAt: string;
  durationSec: number;
  frames: number;
  avgFps: number;
  /** Frame-time percentiles in ms. p95 is the §16.1 stall indicator. */
  frameMs: { mean: number; p5: number; p50: number; p95: number };
  /** FPS percentiles derived per frame (1000/ms). fps.p5 is the DoD floor metric. */
  fps: { p5: number; p50: number; p95: number };
  /** Average FPS within minute 1 / 5 / 10 of the session; null when the session ended earlier. */
  minuteAvgFps: Record<'1' | '5' | '10', number | null>;
  render: { lastCalls: number; lastTris: number; maxCalls: number; maxTris: number; dpr: number };
  battery: { startPct: number | null; endPct: number | null; charging: boolean | null };
  userAgent: string;
}

const MAX_SECONDS = 600; // 10 minutes
const MAX_FRAMES = 120 * MAX_SECONDS; // ring cap at 120Hz

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
  const deltas = new Float32Array(MAX_FRAMES);
  let count = 0;
  // per-minute buckets for the minute 1/5/10 averages
  const bucketFrames = new Array<number>(10).fill(0);
  const bucketMs = new Array<number>(10).fill(0);
  const t0 = performance.now();
  let last = t0;
  let rafId = 0;
  let stopped = false;
  let lastInfo: RenderInfoSample = { calls: -1, tris: -1, dpr: -1 };
  let maxCalls = 0;
  let maxTris = 0;
  let infoAt = 0;
  let batteryStart: number | null = null;
  let batteryCharging: boolean | null = null;

  const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }).getBattery;
  if (typeof getBattery === 'function') {
    getBattery.call(navigator).then(b => { batteryStart = Math.round(b.level * 100); batteryCharging = b.charging; }).catch(() => { /* unsupported */ });
  }

  // Minimal tester UI: elapsed time + live average FPS; tap = stop & download.
  const pill = document.createElement('div');
  pill.textContent = '⏺ FPS 0:00';
  pill.title = 'Frame recorder — tap to stop and download the JSON report';
  pill.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:rgba(10,14,20,0.85);color:#7dffb0;font:12px/1.5 monospace;padding:6px 10px;border:1px solid #2f6;border-radius:8px;cursor:pointer;user-select:none';
  document.body.appendChild(pill);

  const loop = (now: number) => {
    if (stopped) return;
    const dt = now - last;
    last = now;
    const elapsed = now - t0;
    if (dt > 0 && dt < 1000 && count < MAX_FRAMES) {
      deltas[count++] = dt;
      const mi = Math.min(9, Math.floor(elapsed / 60000));
      bucketFrames[mi] += 1;
      bucketMs[mi] += dt;
    }
    if (now - infoAt > 1000) {
      infoAt = now;
      try {
        lastInfo = getRenderInfo();
        if (lastInfo.calls > maxCalls) maxCalls = lastInfo.calls;
        if (lastInfo.tris > maxTris) maxTris = lastInfo.tris;
      } catch { /* renderer not ready yet */ }
      const secs = Math.floor(elapsed / 1000);
      const avg = count > 0 ? (count / (elapsed / 1000)).toFixed(1) : '0';
      pill.textContent = `⏺ FPS ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} · avg ${avg} · ${lastInfo.calls} calls`;
    }
    if (elapsed >= MAX_SECONDS * 1000) { finish(); return; }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  async function buildReport(): Promise<FrameSessionReport> {
    const elapsedMs = performance.now() - t0;
    const frames = deltas.subarray(0, count);
    const sorted = Float64Array.from(frames).sort();
    const mean = count > 0 ? frames.reduce((a, b) => a + b, 0) / count : 0;
    const fpsSorted = Float64Array.from(frames, d => (d > 0 ? 1000 / d : 0)).sort();
    const minuteAvg = (m: number): number | null => (bucketMs[m] >= 30000 ? bucketFrames[m] / (bucketMs[m] / 1000) : null);
    let batteryEnd: number | null = null;
    if (typeof getBattery === 'function') {
      try { const b = await getBattery.call(navigator); batteryEnd = Math.round(b.level * 100); batteryCharging = b.charging; } catch { /* unsupported */ }
    }
    return {
      tool: 'hormuz-frame-recorder',
      version: 1,
      startedAt: new Date(Date.now() - elapsedMs).toISOString(),
      durationSec: Math.round(elapsedMs / 100) / 10,
      frames: count,
      avgFps: elapsedMs > 0 ? Math.round((count / (elapsedMs / 1000)) * 10) / 10 : 0,
      frameMs: {
        mean: Math.round(mean * 100) / 100,
        p5: Math.round(percentile(sorted, 5) * 100) / 100,
        p50: Math.round(percentile(sorted, 50) * 100) / 100,
        p95: Math.round(percentile(sorted, 95) * 100) / 100,
      },
      fps: {
        p5: Math.round(percentile(fpsSorted, 5) * 10) / 10,
        p50: Math.round(percentile(fpsSorted, 50) * 10) / 10,
        p95: Math.round(percentile(fpsSorted, 95) * 10) / 10,
      },
      minuteAvgFps: { '1': minuteAvg(0), '5': minuteAvg(4), '10': minuteAvg(9) },
      render: { lastCalls: lastInfo.calls, lastTris: lastInfo.tris, maxCalls, maxTris, dpr: lastInfo.dpr },
      battery: { startPct: batteryStart, endPct: batteryEnd, charging: batteryCharging },
      userAgent: navigator.userAgent,
    };
  }

  function finish() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(rafId);
    pill.textContent = '⏹ building report…';
    buildReport().then(report => {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hormuz-fps-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      pill.textContent = `⏹ saved · avg ${report.avgFps} fps · p5 ${report.fps.p5}`;
      setTimeout(() => pill.remove(), 15000);
    }).catch(() => { pill.textContent = '⏹ report failed'; });
  }

  pill.addEventListener('click', finish);
  return finish;
}
