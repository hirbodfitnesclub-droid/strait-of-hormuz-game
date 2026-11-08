"""Cadence probe — DoD §0/§1: real fire-event rate per weapon family.

For each family a single-tower seed fights parked, perma-stunned destroyers
(seedlib.parked_enemies), so every shot event on the measured slot belongs
to that family. Two measurement channels:

1. `window.__telemetry` (added by team ROOT in wave 0) — checked FIRST.
   If present, per-family shot counters are sampled at both ends of the
   window and the interval is derived from the diff over game time.
   (Counters cannot express salvo gaps or beam continuity, so MLRS/laser
   structure always uses channel 2.)
2. FX instrumentation (fallback, works on today's build) — wraps
   BattleFX.shoot/rail/flashAt AND gamesync.dispatchShotFx on the live
   sync instance; every dispatch is attributed to its tower slot, so hero
   shots (team-1 finding N-1: attributed to the nearest slot or default)
   never contaminate the measured family.

ALL timing is measured on the game's own clock (state.elapsed): under
headless CPU contention wall time dilates by an order of magnitude while
game-time intervals stay exact.

References (pack design data, ruling R1):
  silo (missile T1)   interval 5.00 game-s   fireRate 0.20
  autocannon (T3)     interval 0.20 game-s   fireRate 5.0
  ew (T3)             NO projectiles at all (support tower)
  laser (air T4b1)    continuous beam while engaged
  mlrs (heavy T4b0)   salvo cycle: bursts separated by a reload pause

On the CURRENT build the silo assertion MUST fail (~0.125 game-s tick
cadence vs 5.0 game-s reference) — that red is the proof the harness
catches F-1.
"""
from __future__ import annotations

import asyncio
import sys
import time

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from playwright.async_api import async_playwright

import harness
import report
import seedlib

SECTION = "§0-§1 combat cadence"
WINDOW_GAME_S = 14.0
WALL_DEADLINE_S = 600.0

# family -> (kind, tier, branch, reference interval in game-s or None)
FAMILIES = [
    ("silo", "missile", 1, None, 5.00),
    ("autocannon", "cannon", 3, None, 0.20),
    ("ew", "ew", 3, None, None),
    ("laser", "air", 4, 1, None),
    ("mlrs", "heavy", 4, 0, None),
]

INSTALL_DISPATCH_JS = """() => {
  const sync = window.__gamesync3d;
  if (!sync || !sync.fx || typeof sync.dispatchShotFx !== 'function') return 'no-dispatch';
  if (window.__shotEvents) return 'already';
  window.__shotEvents = [];
  const orig = sync.dispatchShotFx.bind(sync);
  sync.dispatchShotFx = (slot, baseKind, ...rest) => {
    const L = window.__fxprobe;
    const b = L ? { s: L.shoot.length, f: L.flash.length, r: L.rail.length } : { s: 0, f: 0, r: 0 };
    const out = orig(slot, baseKind, ...rest);
    if (L) window.__shotEvents.push({
      t: performance.now(), g: sync.state ? sync.state.elapsed : null,
      slot, baseKind,
      shoot: L.shoot.length - b.s, flash: L.flash.length - b.f,
      rail: L.rail.length - b.r });
    return out;
  };
  return 'installed';
}"""

READ_SHOT_EVENTS_JS = "() => window.__shotEvents || []"

STATE_SNAP_JS = """() => {
  const s = window.__gamesync3d && window.__gamesync3d.state;
  if (!s) return null;
  return { elapsed: s.elapsed,
           enemyHp: s.enemies.reduce((a, e) => a + e.hp, 0),
           enemies: s.enemies.length };
}"""


def cadence_seed(kind: str, tier: int, branch) -> dict:
    state = seedlib.tower_config_seed(kind, tier, branch)
    state["phase"] = "battle"
    state["enemies"] = seedlib.parked_enemies()
    state["nextId"] = 1000
    state["spawnRemaining"] = 0
    state["trafficCount"] = 1
    # security 0 stretches the merchant interval to 15 game-s, so no
    # merchant (and therefore no pirate) enters the measurement window
    # and contaminates the family's dispatch stream.
    state["security"] = 0
    state["merchants"] = []
    # Park the hero far south-west; its shots (if any) are attributed to a
    # different slot by dispatch and filtered out of the family stream.
    state["hero"] = {"x": 20.0, "y": 66.0, "active": 0}
    return state


async def measure_family(pw, base_url: str, fam: str, kind: str,
                         tier: int, branch, ref_interval: float | None) -> tuple[list[dict], dict]:
    slot = seedlib.HOME_SLOT[kind]
    ctx = await harness.open_context(pw)
    assertions: list[dict] = []
    meta: dict = {"family": fam, "slot": slot}
    try:
        pg, errors = await harness.open_seeded_page(
            ctx, base_url, seedlib.seed_js(cadence_seed(kind, tier, branch)),
            towers_expected=1)
        meta["page_errors"] = errors
        meta["fx_probe"] = await pg.evaluate(harness.INSTALL_FX_PROBE_JS)
        meta["dispatch_probe"] = await pg.evaluate(INSTALL_DISPATCH_JS)

        async def ev(js, timeout=90):
            # A renderer stuck in a long task can stall evaluate forever;
            # the probe must degrade to a verdict, never hang.
            try:
                return await asyncio.wait_for(pg.evaluate(js), timeout=timeout)
            except (asyncio.TimeoutError, Exception):  # noqa: BLE001
                return None

        tele0 = await ev(harness.TELEMETRY_SNAPSHOT_JS)
        snap0 = await ev(STATE_SNAP_JS)
        # Window measured on the game clock; wall time is only a failsafe.
        deadline = time.monotonic() + WALL_DEADLINE_S
        snap1 = snap0
        while time.monotonic() < deadline:
            await pg.wait_for_timeout(2000)
            s = await ev(STATE_SNAP_JS, timeout=60)
            if s:
                snap1 = s
            if snap0 and snap1 and snap1["elapsed"] - snap0["elapsed"] >= WINDOW_GAME_S:
                break
        tele1 = await ev(harness.TELEMETRY_SNAPSHOT_JS)
        fx = await ev(harness.READ_FX_PROBE_JS)
        events = await ev(READ_SHOT_EVENTS_JS) or []

        game_dt = (snap1["elapsed"] - snap0["elapsed"]) if snap0 and snap1 else 0.0
        engaged = bool(snap0 and snap1 and snap1["enemyHp"] < snap0["enemyHp"]) \
            or len(events) > 0
        meta.update({"game_window_s": round(game_dt, 2),
                     "hp_delta": (snap0["enemyHp"] - snap1["enemyHp"]) if snap0 and snap1 else None,
                     "dispatch_events": len(events),
                     "telemetry_present": tele0 is not None})
        mine = [e for e in events if e["slot"] == slot]
        gs = [e["g"] for e in mine if e["g"] is not None]
        gaps = [b - a for a, b in zip(gs, gs[1:])]
        med = harness.median(gaps) if gaps else float("nan")
        meta["family_dispatches"] = len(mine)

        if ref_interval is not None:
            # Interval family (silo / autocannon): telemetry first if usable.
            interval, source = med, "fx-dispatch(game-clock)"
            if tele0 and tele1 and game_dt > 0:
                keys = {"silo": ("missile", "silo"), "autocannon": ("cannon", "autocannon")}[fam]
                for k in keys:
                    if k in tele0 and k in tele1 and tele1[k] > tele0[k]:
                        interval = game_dt / (tele1[k] - tele0[k])
                        source = f"telemetry[{k}]"
                        break
            meta["interval_source"] = source
            ok = engaged and interval == interval and 0.6 * ref_interval <= interval <= 1.8 * ref_interval
            assertions.append(report.check(
                SECTION, f"cadence.{fam}", f"{fam} fire interval",
                ok, expected=f"{ref_interval} game-s ±band[0.6x,1.8x]",
                actual=(round(interval, 3) if interval == interval else None),
                detail=f"{len(mine)} dispatches on slot {slot}, source={source}, "
                       f"engaged={engaged}"))
        elif fam == "ew":
            projs = sum(e["shoot"] for e in mine)
            assertions.append(report.check(
                SECTION, "cadence.ew", "EW fires no projectiles",
                engaged and projs == 0,
                expected=0, actual=projs,
                detail=f"{len(mine)} EW dispatches on slot {slot}, engaged={engaged} "
                       f"(audit critical-7: EW must be aura/pulse only)"))
        elif fam == "laser":
            rails = sum(e["rail"] for e in mine)
            ok = engaged and rails >= 8 and med == med and med <= 0.5
            assertions.append(report.check(
                SECTION, "cadence.laser", "laser beam is continuous while engaged",
                ok, expected="rail re-trigger median <= 0.5 game-s",
                actual=(round(med, 3) if med == med else None),
                detail=f"{rails} beam events over {len(mine)} dispatches, engaged={engaged}"))
        elif fam == "mlrs":
            rockets = [e["g"] for e in (fx["shoot"] if fx else [])
                       if e["kind"] == "rocket" and e["g"] is not None]
            rgaps = [b - a for a, b in zip(rockets, rockets[1:])]
            max_gap = max(rgaps) if rgaps else 0.0
            ok = engaged and len(rockets) >= 12 and max_gap >= 1.0
            assertions.append(report.check(
                SECTION, "cadence.mlrs", "MLRS salvo has a reload pause",
                ok, expected=">=12 rockets and a >=1.0 game-s gap between salvos",
                actual={"rockets": len(rockets), "max_gap_game_s": round(max_gap, 3)},
                detail=f"engaged={engaged} (audit critical-5: burst 12 + pause)"))
        await harness.safe_close(pg)
    finally:
        await harness.safe_close(ctx)
    return assertions, meta


async def main() -> int:
    # --family is probe-specific; strip it before the shared arg parser.
    fam_filter: list[str] = []
    argv = []
    it = iter(range(len(sys.argv)))
    skip = False
    for i in it:
        if skip:
            skip = False
            continue
        if sys.argv[i] == "--family" and i + 1 < len(sys.argv):
            fam_filter.append(sys.argv[i + 1])
            skip = True
        elif i > 0:
            argv.append(sys.argv[i])
    sys.argv = [sys.argv[0]] + argv
    args = report.parse_args()
    families = [f for f in FAMILIES if not fam_filter or f[0] in fam_filter]
    all_assertions: list[dict] = []
    metas: dict[str, dict] = {}
    async with async_playwright() as pw:
        for fam, kind, tier, branch, ref in families:
            try:
                a, m = await measure_family(pw, args.base_url, fam, kind, tier, branch, ref)
            except Exception as exc:  # noqa: BLE001 - reported as infra failure
                a = [report.assertion(SECTION, f"cadence.{fam}", f"{fam} probe",
                                      "fail", expected="probe completes",
                                      actual=f"{type(exc).__name__}: {exc}")]
                m = {"family": fam, "error": str(exc)}
            all_assertions.extend(a)
            metas[fam] = m
            for x in a:
                print(f"[{x['status'].upper()}] {x['id']} actual={x['actual']!r} {x['detail']}", flush=True)
    return report.emit("probe_cadence", SECTION, all_assertions,
                       meta=metas, out_path=args.out_json)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
