"""Measure opening scene geometry, DPR and rendered frames over a live battle.

Run the separate frame pacing test for the scheduler's behavior on high refresh
displays. A wall-clock rate from this software renderer describes this host only.
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

SECTION = "§heat budget (D-020)"
TRIS_BUDGET = 800_000
WALL_DEADLINE_S = 600.0
MIN_BATTLE_SECONDS = 10.0

PEACE_SAMPLE_JS = """() => {
  const s = window.__gamesync3d; const m = window.__map3d;
  if (!s) return null;
  const perf = s.perfInfo();
  let objects = -1;
  const scene = (m && m.scene) || (s.map && s.map.scene);
  if (scene) { objects = 0; scene.traverse(() => { objects++; }); }
  const cv = (s.map && s.map.renderer) ? s.map.renderer.domElement : null;
  return { calls: perf.calls, tris: perf.tris, dpr: perf.dpr, fps: perf.fps,
           objects, bufW: cv ? cv.width : -1, bufH: cv ? cv.height : -1,
           phase: s.state ? s.state.phase : null };
}"""

INSTALL_FRAME_HOOK_JS = """() => {
  if (typeof window.__frameCount !== 'number') window.__frameCount = 0;
  window.__hormuzFrameHook = () => { window.__frameCount++; };
  return window.__frameCount;
}"""

FRAME_COUNT_JS = """() => {
  const s = window.__gamesync3d;
  return { frames: window.__frameCount || 0,
           elapsed: s?.state?.battle?.elapsed ?? null,
           phase: s && s.state ? s.state.phase : null,
           wall: performance.now() };
}"""

def battle_window(start, end):
    if not start or not end or start["elapsed"] is None or end["elapsed"] is None:
        return None
    return {
        "frames": end["frames"] - start["frames"],
        "wall_s": (end["wall"] - start["wall"]) / 1000.0,
        "game_s": end["elapsed"] - start["elapsed"],
        "battle": start["phase"] == end["phase"] == "battle",
    }


def battle_seed() -> dict:
    """One cannon T3 in a live battle vs parked destroyers — the cadence
    probe's mid-battle context pattern, so hydrate keeps the battle."""
    state = seedlib.tower_config_seed("cannon", 3, None, wave=3)
    state["phase"] = "battle"
    state["battle"] = {
        "wave": state["wave"], "condition": None, "objective": "repel",
        "queue": [], "elapsed": 0, "escort": None, "stranded": None,
        "structureHp": 0, "structureMaxHp": 0, "airTotal": 0, "airLeaked": 0,
        "mines": [], "mineClock": 4, "sweep": {}, "failed": False,
    }
    state["enemies"] = seedlib.parked_enemies()
    state["nextId"] = 1000
    state["spawnRemaining"] = 0
    state["security"] = 0
    state["merchants"] = []
    state["hero"] = {"x": 20.0, "y": 66.0, "active": 0}
    return state


async def main() -> int:
    args = report.parse_args()
    assertions: list[dict] = []
    meta: dict = {}
    async with async_playwright() as pw:
        ctx = await harness.open_context(pw)
        try:
            # ---- A. peace opening view ---------------------------------
            pg, errors = await harness.open_seeded_page(
                ctx, args.base_url, seedlib.seed_js(seedlib.fresh_player_seed()),
                model_wait=300.0)
            meta["page_errors"] = errors[:3]

            async def ev(page, js, timeout=90):
                try:
                    return await asyncio.wait_for(page.evaluate(js), timeout=timeout)
                except Exception:  # noqa: BLE001 - degrade to a verdict
                    return None

            samples = []
            for _ in range(6):
                s = await ev(pg, PEACE_SAMPLE_JS)
                if s and s["phase"] == "peace" and s["tris"] > 0:
                    samples.append(s)
                await pg.wait_for_timeout(2000)
            if not samples:
                return report.fatal("probe_heat", SECTION,
                                    "perfInfo never reported a rendered frame",
                                    args.out_json)
            tris = int(harness.median([float(s["tris"]) for s in samples]))
            last = samples[-1]
            meta["peace_samples"] = samples
            assertions.append(report.check(
                SECTION, "heat.tris_budget",
                "opening peace view triangle budget (D-020)",
                tris <= TRIS_BUDGET,
                expected=f"<= {TRIS_BUDGET} tris",
                actual={"tris": tris, "calls": last["calls"],
                        "objects": last["objects"],
                        "buffer_px": last["bufW"] * last["bufH"],
                        "dpr": last["dpr"]},
                detail="renderer.info on the merged build, median of "
                       f"{len(samples)} perfInfo samples"))
            assertions.append(report.check(
                SECTION, "heat.dpr_cap", "pixel ratio never above 1.5",
                all(0 < sample["dpr"] <= 1.5 + 1e-6 for sample in samples),
                expected="all observed DPR values in (0, 1.5]",
                actual=[sample["dpr"] for sample in samples],
                detail="wave-0 PERF cap, re-asserted as a heat input"))
            await harness.safe_close(pg)

            # ---- B. battle render counting ------------------------------
            pg, errors = await harness.open_seeded_page(
                ctx, args.base_url, seedlib.seed_js(battle_seed()),
                model_wait=300.0, towers_expected=1)
            meta["battle_page_errors"] = errors[:3]
            await ev(pg, INSTALL_FRAME_HOOK_JS)
            start = await ev(pg, FRAME_COUNT_JS)
            deadline = time.monotonic() + WALL_DEADLINE_S
            window = None
            while start and time.monotonic() < deadline:
                await pg.wait_for_timeout(2000)
                end = await ev(pg, FRAME_COUNT_JS)
                window = battle_window(start, end)
                if end and end["phase"] != "battle":
                    break
                if window and window["game_s"] >= MIN_BATTLE_SECONDS:
                    break
            meta["battle_window"] = window
            rate = window["frames"] / window["wall_s"] if window and window["wall_s"] > 0 else None
            assertions.append(report.check(
                SECTION, "heat.live_battle_window",
                "renderer and combat both advance during the sample",
                bool(window and window["battle"] and window["game_s"] >= MIN_BATTLE_SECONDS
                     and window["frames"] > 1),
                expected=">= 10 battle seconds and >= 2 rendered frames in battle",
                actual=window))
            assertions.append(report.check(
                SECTION, "heat.battle_render_rate",
                "observed battle render rate on this host",
                rate is not None and 0 < rate <= 60.5,
                expected="0 < renders per wall second <= 60.5",
                actual=round(rate, 2) if rate is not None else None,
                detail="SwiftShader rate does not measure mobile thermal or GPU performance"))
            await harness.safe_close(pg)
        finally:
            await harness.safe_close(ctx)

    return report.emit("probe_heat", SECTION, assertions,
                       meta=meta, out_path=args.out_json)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
