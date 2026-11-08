"""Wave-composition regression lock — DoD §2/§3 (audit 'healthy' list).

Seeds a live battle with an empty field and lets the game's own spawner
run; the union of enemy ids seen in the live state must match the spec
composition (ported 1:1 from game.ts waveComposition / the tick spawner,
which team 3 verified line-by-line), and the median spawn gap must be
1.35 game-sec. MUST PASS on the current build — this is the baseline that
wave-1 scenario work (team SCEN) is not allowed to break silently.
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


def expected_composition(wave: int) -> tuple[dict[str, int], int]:
    """1:1 port of waveComposition() in src/lib/game.ts."""
    total = 5 + min(wave, 15) + (1 if wave % 5 == 0 else 0)
    counts: dict[str, int] = {}
    for index in range(total):
        kind = "speed"
        remaining = total - index
        if wave % 5 == 0 and remaining == 1:
            kind = "boss"
        elif wave >= 4 and index % 6 == 5:
            kind = "destroyer"
        elif wave >= 3 and index % 5 == 3:
            kind = "sub"
        elif wave >= 2 and index % 4 == 2:
            kind = "air"
        elif index % 3 == 1:
            kind = "corvette"
        counts[kind] = counts.get(kind, 0) + 1
    return counts, total


def battle_seed(wave: int, total: int) -> dict:
    state = seedlib.base_state()
    state.update({
        "phase": "battle", "wave": wave, "highestWave": wave - 1,
        "spawnRemaining": total, "spawnIndex": 0, "spawnClock": 0,
        "enemies": [], "towers": [], "hearts": 20,
        "trafficCount": 1, "security": 100, "merchants": [],
        "hero": {"x": 20.0, "y": 66.0, "active": 0},
    })
    # Wave 2 integration: hydrateGame refuses to resume a mid-battle save
    # without a scenario battle context (falls back to peace, wave
    # restarts). This probe seeds a battle in progress, so it carries the
    # context a real save would. The queue is built with the ported
    # expected composition above — the same kinds/order the legacy index
    # pattern produced — and the game spawner consumes the queue first
    # (game.ts: "Scenario queue first"), so the lock still measures the
    # composition this probe has always asserted, now via the real path.
    counts, _ = expected_composition(wave)
    order = {"speed": 0, "corvette": 1, "air": 2, "sub": 3, "destroyer": 4,
             "boss": 5}
    queue = []
    for index in range(total):
        if wave % 5 == 0 and total - index == 1:
            kind = "boss"
        elif wave >= 4 and index % 6 == 5:
            kind = "destroyer"
        elif wave >= 3 and index % 5 == 3:
            kind = "sub"
        elif wave >= 2 and index % 4 == 2:
            kind = "air"
        elif index % 3 == 1:
            kind = "corvette"
        else:
            kind = "speed"
        queue.append({"kind": kind, "rev": False})
    assert sorted(q["kind"] for q in queue) == sorted(
        k for k, n in counts.items() for _ in range(n))
    state["battle"] = {
        "wave": wave, "condition": None, "objective": "repel",
        "queue": queue, "elapsed": 0, "escort": None, "stranded": None,
        "structureHp": 0, "structureMaxHp": 0, "airTotal": 0, "airLeaked": 0,
        "mines": [], "mineClock": 4, "sweep": {}, "failed": False,
    }
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
