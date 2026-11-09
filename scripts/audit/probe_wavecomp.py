"""Wave-composition regression lock — DoD §2/§3 (audit 'healthy' list).

Seeds at intermission and lets the game's own startWave + spawner run;
the union of enemy ids seen in the live state must match the locked
SCEN scenario composition for the wave (EXPECTED_COMPOSITIONS below,
read off the real buildSpawnQueue), and the median spawn gap must be
1.35 game-sec. This is the regression lock for the scenario system:
composition changes must be deliberate and re-pinned here.
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

SECTION = "§2-§3 enemies & waves"
WAVES = [1, 3, 5, 10]


# Wave 2 re-base (SCEN): compositions are no longer produced by the old
# index pattern in game.ts — startWave rolls the wave's authored scenario
# and buildSpawnQueue (src/lib/scenario-mechanics.ts) builds the queue
# from that operation's class weights (CAMPAIGN_COMPOSITION), with the
# class-availability gates (air from wave 2, sub from wave 3, destroyer
# from wave 4) and the boss appended last on boss waves. The tables
# below were read off the REAL buildSpawnQueue for the four locked
# waves (manager-verified 2026-11-08) and are pinned here as the new
# regression lock: if scenario weights or gates change deliberately,
# update them from buildSpawnQueue's live output, never by hand-tuning.
EXPECTED_COMPOSITIONS: dict[int, tuple[dict[str, int], int]] = {
    1: ({"speed": 6}, 6),                                            # op 1 سپر ساحل (pirates rewritten as speed)
    3: ({"speed": 2, "air": 6}, 8),                                  # op 3 چشم بیدار (drone wave, air-heavy)
    5: ({"air": 4, "corvette": 2, "destroyer": 2, "speed": 2, "boss": 1}, 11),  # op 5 دیوار آتش (+ boss 1) — re-pinned 2026-11-09 with the D-024 boss-5 retune (destroyer share .10→.20 shifted distributor rounding: speed 4→2, corvette 0→2); measured 3× through startWave by QA-BALANCE
    10: ({"sub": 6, "destroyer": 4, "corvette": 3, "speed": 2, "boss": 1}, 16),  # op 10 نگهبان شعله (+ boss 2)
}


def expected_composition(wave: int) -> tuple[dict[str, int], int]:
    """The locked composition for a probed wave (SCEN scenario queue)."""
    if wave not in EXPECTED_COMPOSITIONS:
        raise ValueError(f"no locked composition for wave {wave}")
    counts, total = EXPECTED_COMPOSITIONS[wave]
    return dict(counts), total


def battle_seed(wave: int, total: int) -> dict:
    state = seedlib.base_state()
    state.update({
        # Wave 2: seed at INTERMISSION with autoBattle on — the game's own
        # startWave then builds the scenario spawn queue (the composition
        # this probe locks). Seeding phase="battle" directly no longer
        # works: hydrateGame refuses a context-less mid-battle save.
        "phase": "intermission", "wave": wave, "highestWave": wave - 1,
        "countdown": 2, "spawnRemaining": 0, "spawnIndex": 0, "spawnClock": 0,
        "enemies": [], "towers": [], "hearts": 20,
        "trafficCount": 1, "security": 100, "merchants": [],
        "hero": {"x": 20.0, "y": 66.0, "active": 0},
    })
    state["idle"]["autoBattle"] = True
    return state


SNAP_JS = """() => {
  const s = window.__gamesync3d && window.__gamesync3d.state;
  if (!s) return null;
  return { elapsed: s.elapsed, spawnRemaining: s.spawnRemaining,
           enemies: s.enemies.map(e => ({ id: e.id, kind: e.kind })) };
}"""


async def run_wave(pg, wave: int) -> tuple[dict[str, int], list[float], int]:
    """Poll the live state; first-seen stamps use the GAME clock
    (state.elapsed), so spawn gaps are exact game seconds even when
    headless wall time dilates under CPU contention."""
    expected, total = expected_composition(wave)
    seen: dict[int, str] = {}
    first_seen: dict[int, float] = {}
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        await pg.evaluate(harness.DISMISS_BULLETIN_JS)
        st = await pg.evaluate(SNAP_JS)
        if st:
            for e in st["enemies"]:
                if e["id"] not in seen:
                    seen[e["id"]] = e["kind"]
                    first_seen[e["id"]] = st["elapsed"]
            if st["spawnRemaining"] == 0 and len(seen) >= total:
                break
        await pg.wait_for_timeout(1500)
    counts: dict[str, int] = {}
    for kind in seen.values():
        counts[kind] = counts.get(kind, 0) + 1
    times = [first_seen[i] for i in sorted(first_seen)]
    gaps = [b - a for a, b in zip(times, times[1:])]
    return counts, gaps, total


async def main() -> int:
    args = report.parse_args()
    assertions: list[dict] = []
    async with async_playwright() as pw:
        ctx = await harness.open_context(pw)
        try:
            for wave in WAVES:
                expected, total = expected_composition(wave)
                try:
                    pg, _ = await harness.open_seeded_page(
                        ctx, args.base_url, seedlib.seed_js(battle_seed(wave, total)),
                        model_wait=240.0)
                    # Wave 2: the seed loads at intermission with autoBattle
                    # on; the game's own startWave builds the scenario queue
                    # when the countdown ends. The briefing bulletin pauses
                    # the battle at spawn 0, so keep dismissing it while
                    # waiting for the battle phase to actually begin.
                    start_deadline = time.monotonic() + 300
                    while time.monotonic() < start_deadline:
                        await pg.evaluate(harness.DISMISS_BULLETIN_JS)
                        phase = await pg.evaluate(
                            "() => { const s = window.__gamesync3d; "
                            "return s && s.state ? s.state.phase : null; }")
                        if phase == "battle":
                            break
                        await pg.wait_for_timeout(2000)
                    try:
                        counts, gaps, _ = await run_wave(pg, wave)
                    finally:
                        await harness.safe_close(pg)
                except Exception as exc:  # noqa: BLE001 - verdict, not a crash
                    assertions.append(report.assertion(
                        SECTION, f"wavecomp.w{wave}", f"wave {wave} composition",
                        "fail", expected=expected,
                        actual=f"{type(exc).__name__}: {exc}"))
                    continue
                assertions.append(report.check(
                    SECTION, f"wavecomp.w{wave}", f"wave {wave} composition",
                    counts == expected, expected=expected, actual=counts,
                    detail=f"total={total} spawned kinds observed live"))
                med = harness.median(gaps) if gaps else float("nan")
                assertions.append(report.check(
                    SECTION, f"wavecomp.w{wave}.interval", f"wave {wave} spawn interval",
                    med == med and 0.85 <= med <= 1.95,
                    expected="1.35 game-s", actual=(round(med, 2) if med == med else None),
                    detail=f"{len(gaps)} spawn gaps on the game clock"))
        finally:
            await harness.safe_close(ctx)
    return report.emit("probe_wavecomp", SECTION, assertions,
                       out_path=args.out_json)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
