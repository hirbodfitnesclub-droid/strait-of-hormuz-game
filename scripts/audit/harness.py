"""Shared Playwright harness for the audit probes.

Follows the repo's hidden_test_* pattern: headless Chromium (SwiftShader),
430x932 portrait @ DSF 2, seed via localStorage + reload. Adds the two
measurement channels the fix program relies on:

1. FX instrumentation — wraps BattleFX.shoot / rail / flashAt on the live
   `window.__gamesync3d` instance and logs every call with a timestamp.
   Every shot event in gamesync.dispatchShotFx ends in exactly one flashAt
   (muzzle flash) and zero+ shoot() projectile spawns, so these counters are
   a precise fire-event stream until ROOT ships `window.__telemetry`.
2. Telemetry reader — if `window.__telemetry` exists (ROOT, wave 0), samples
   its per-family counters twice and diffs them. Shape-tolerant: accepts a
   snapshot()/counters object of family -> number | {shots: n}.
"""
from __future__ import annotations

import os
import time

CHROMIUM = os.environ.get(
    "AUDIT_CHROMIUM",
    "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/"
    "chrome-headless-shell-linux64/chrome-headless-shell",
)
# Small viewport + DSF 1: probes never screenshot, and SwiftShader cost
# (which dilates the game's clock under CPU contention) scales with pixels.
VIEWPORT = {"width": 360, "height": 640}

DISMISS_BULLETIN_JS = """() => {
  const b = document.querySelector('.news-bulletin .news-actions button');
  if (b) { b.click(); return b.textContent; }
  return null;
}"""

STATE_JS = "() => (window.__gamesync3d && window.__gamesync3d.state) || null"

INSTALL_FX_PROBE_JS = """() => {
  const sync = window.__gamesync3d;
  if (!sync || !sync.fx) return 'no-fx';
  if (window.__fxprobe) return 'already';
  const fx = sync.fx;
  // `g` stamps every event with the game's own clock (state.elapsed):
  // under headless CPU contention wall time dilates ~50x, game time does
  // not lie. All cadence math in the probes is done in game seconds.
  const gameNow = () => (sync.state ? sync.state.elapsed : null);
  const log = { t0: performance.now(), g0: gameNow(),
                shoot: [], rail: [], flash: [], explode: [] };
  const wrap = (name, key) => {
    const orig = fx[name].bind(fx);
    fx[name] = (...args) => {
      log[key].push({ t: performance.now(), g: gameNow(),
                      kind: args[0] && args[0].kind });
      return orig(...args);
    };
  };
  wrap('shoot', 'shoot'); wrap('rail', 'rail');
  wrap('flashAt', 'flash'); wrap('explode', 'explode');
  window.__fxprobe = log;
  return 'installed';
}"""

READ_FX_PROBE_JS = """() => {
  const log = window.__fxprobe;
  if (!log) return null;
  const slim = (arr) => arr.map(e => ({ t: e.t, g: e.g, kind: e.kind || null }));
  const sync = window.__gamesync3d;
  return { t0: log.t0, g0: log.g0, shoot: slim(log.shoot), rail: slim(log.rail),
           flash: slim(log.flash), explode: slim(log.explode),
           now: performance.now(),
           gnow: sync && sync.state ? sync.state.elapsed : null };
}"""

TELEMETRY_SNAPSHOT_JS = """() => {
  const t = window.__telemetry;
  if (!t) return null;
  let snap = null;
  try {
    if (typeof t.snapshot === 'function') snap = t.snapshot();
    else if (typeof t.getSnapshot === 'function') snap = t.getSnapshot();
    else if (typeof t.read === 'function') snap = t.read();
    else snap = t.counters || t.families || t;
  } catch (e) { return { error: String(e) }; }
  const out = {};
  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
  for (const [k, v] of Object.entries(snap || {})) {
    if (typeof v === 'number') out[k] = v;
    else if (v && typeof v === 'object') {
      const n = num(v.shots) ?? num(v.fired) ?? num(v.count) ?? num(v.events);
      if (n !== null) out[k] = n;
    }
  }
  return out;
}"""


# Disk-backed (NOT /tmp: the shared 512MB tmpfs fills up with every team's
# artifacts and Chromium renderers start dying when it nears capacity).
PROFILE_DIR = os.environ.get(
    "AUDIT_PROFILE", os.path.expanduser("~/.cache/hormuz-audit-profile"))
LAUNCH_ARGS = ["--no-sandbox", "--use-gl=swiftshader",
               "--enable-unsafe-swiftshader", "--no-zygote"]


async def launch(pw):
    # 180s launch timeout: Playwright's 30s default is far too tight when
    # the shared VM is CPU-saturated (browser starts, then gets killed
    # mid-handshake and the probe sees a misleading SIGTRAP).
    try:
        return await pw.chromium.launch(executable_path=CHROMIUM,
                                        args=LAUNCH_ARGS, timeout=180_000)
    except Exception:
        return await pw.chromium.launch(args=LAUNCH_ARGS, timeout=180_000)


async def open_context(pw):
    """Persistent browser context: the HTTP cache (24MB of GLB models)
    survives across probes and runs, which keeps model-load waits sane.
    The save key is overwritten by every seed, so profile reuse is safe.

    Launch is RETRIED: on the shared wave-0 VM, Chromium startup
    intermittently dies with SIGTRAP when every team spawns browsers at
    once (process/thread limits). The failure is transient — a couple of
    retries with backoff ride it out."""
    import asyncio as _aio
    last_exc: Exception | None = None
    for attempt in range(4):
        try:
            return await pw.chromium.launch_persistent_context(
                PROFILE_DIR, executable_path=CHROMIUM, args=LAUNCH_ARGS,
                viewport=VIEWPORT, device_scale_factor=1, timeout=180_000)
        except Exception as exc:  # noqa: BLE001 - retried below
            last_exc = exc
            await _aio.sleep(3 * (attempt + 1))
    try:
        browser = await launch(pw)
        return await browser.new_context(viewport=VIEWPORT, device_scale_factor=1)
    except Exception:
        raise last_exc  # type: ignore[misc]


async def open_seeded_page(ctx, base_url: str, seed_js: str, *,
                           model_wait: float = 240.0, towers_expected: int = 0):
    """Load the game once (creates the default save), install the seed,
    reload, dismiss the scenario bulletin, and wait until gamesync is live
    (and, if requested, until the seeded tower models have loaded)."""
    pg = await ctx.new_page()
    errors: list[str] = []
    pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
    await pg.goto(base_url, wait_until="load", timeout=90000)
    await pg.wait_for_timeout(4000)
    seeded = await pg.evaluate(seed_js)
    if seeded != "seeded":
        raise RuntimeError(f"seed failed: {seeded}")
    await pg.reload(wait_until="load", timeout=90000)
    # Models stream in behind the loading veil; poll for sync + towers.
    deadline = time.monotonic() + model_wait
    sync_ready = False
    while time.monotonic() < deadline:
        state = await pg.evaluate(
            "() => { const s = window.__gamesync3d; if (!s || !s.state) return null;"
            " return { towers: s.towers ? s.towers.size : -1,"
            "          pads: s.pads ? [...s.pads.keys()].filter(k => k >= 0).length : -1 }; }"
        )
        # An occupied slot's pad leaves the pads map, so with towers seeded
        # the count is 29 - (occupied slots); >= 28 is the safe ready gate.
        if state and state["towers"] >= towers_expected and state["pads"] >= 28:
            sync_ready = True
            break
        await pg.wait_for_timeout(2000)
    # Wave 2 integration: SCEN's briefing bulletin now genuinely pauses
    # the battle (bulletin !== null -> battlePaused -> the tick skips all
    # battle mechanics). A seeded mid-battle save raises the briefing on
    # load (previousPhase starts non-battle), and the bulletin can appear
    # AFTER sync-ready — a single dismiss raced it and left the battle
    # frozen for the whole measurement window (cadence/wavecomp read
    # "0 dispatches / 0 spawns" on a healthy build). Dismiss in a loop:
    # up to ~20s of wall time, stopping as soon as no bulletin is shown.
    for _ in range(10):
        clicked = await pg.evaluate(DISMISS_BULLETIN_JS)
        if clicked:
            break
        shown = await pg.evaluate(
            "() => !!document.querySelector('.news-bulletin')")
        if not shown:
            # No bulletin yet; it may still be about to appear — give the
            # phase-transition effect one more beat before concluding.
            await pg.wait_for_timeout(2000)
            clicked = await pg.evaluate(DISMISS_BULLETIN_JS)
            break
        await pg.wait_for_timeout(2000)
    if not sync_ready:
        raise RuntimeError("gamesync/tower models did not become ready in time")
    return pg, errors


async def safe_close(closable) -> None:
    """Close a page/context, swallowing driver errors: under VM contention
    the browser connection can die at close-time, and that must never eat
    a verdict the probe already produced."""
    try:
        await closable.close()
    except Exception:
        pass


async def read_state(pg) -> dict | None:
    return await pg.evaluate(STATE_JS)


def median(values: list[float]) -> float:
    if not values:
        return float("nan")
    s = sorted(values)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def intervals_ms(events: list[dict]) -> list[float]:
    ts = [e["t"] for e in events]
    return [b - a for a, b in zip(ts, ts[1:])]
