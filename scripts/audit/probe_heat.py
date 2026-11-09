"""Heat-budget probe — fix program 2, D-020 gate (team PERF2).

The owner's phone heats after 2-3 minutes on v0.5.0. Audit-2 team 1
proved the merges did NOT regress the wave-0 PERF mechanisms; the heat
is (1) NO frame-rate cap in battle — the map loop renders on unbounded
rAF (90-120 full 3D renders/s on a high-refresh phone), (2) scene weight
~1.19M triangles in the opening peace view, (3) a resolution ladder that
parks at max until throttling. D-020 turns those into budgets:

  * opening peace view <= 800,000 triangles (renderer.info via perfInfo)
  * battle render cap = 60 fps HARD — never above 60 in any state
    (peace stays at the existing 30 fps calm cap)
  * DPR never above 1.5

This probe measures, on the merged static build:
  A. peace opening view: triangles / draw calls / scene object count /
     drawing-buffer pixels / DPR (several perfInfo samples, median tris);
  B. battle: rendered frames counted through window.__hormuzFrameHook
     (fired once per RENDERED frame by the map loop) over a game-clock
     window, reported per wall second and per game second;
  C. structure: whether a battle-path frame-rate gate exists in the map
     loop / gamesync source at all. SwiftShader on this VM renders far
     below 60 wall-fps, so a missing cap can NEVER be caught by the live
     rate here — the structural check is the gate, the live count is
     supporting evidence. On the current build C MUST fail: the only
     frame gate in hormuz-map.js is inside `if (calm)`, and WorldView3D
     sets the calm flag only when phase !== 'battle'.

On the CURRENT build the tris budget and the battle-cap structure MUST
FAIL (1,186,852 tris measured by team 1; no battle cap exists).
"""
from __future__ import annotations

import asyncio
import os
import re
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
           elapsed: s && s.state ? s.state.elapsed : null,
           phase: s && s.state ? s.state.phase : null,
           wall: performance.now() };
}"""

CAP_PATTERNS = [r"1\s*/\s*60", r"1000\s*/\s*60", r"fpsCap", r"maxFps",
                r"frameCap", r"BATTLE_FPS", r"battleCap", r"capBattleFps"]


def battle_cap_structure() -> tuple[bool, dict]:
    """Does any frame-rate gate exist on the battle render path?
    Searches the map loop + gamesync sources for a 60fps cap mechanism.
    The v0.5.0 loop's only gate is the 1/30 calm branch (phase != battle),
    so today this returns False — the expected red."""
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", ".."))
    src = ""
    for rel in ("src/three-map/hormuz-map.js", "src/three-map/gamesync.ts"):
        try:
            with open(os.path.join(repo, rel), encoding="utf-8") as f:
                src += f.read() + "\n"
        except OSError:
            pass
    hits = {p: bool(re.search(p, src)) for p in CAP_PATTERNS}
    calm_gate = "1 / 30" in src or "1/30" in src
    return any(hits.values()), {"patterns": hits, "calm_30_gate_present": calm_gate}


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
                if s and s["tris"] > 0:
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
                0 < last["dpr"] <= 1.5 + 1e-6,
                expected="0 < dpr <= 1.5", actual=last["dpr"],
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
            end = start
            while time.monotonic() < deadline:
                await pg.wait_for_timeout(2000)
                e = await ev(pg, FRAME_COUNT_JS)
                if e:
                    end = e
                if start and end and (end["elapsed"] or 0) - (start["elapsed"] or 0) >= 10.0:
                    break
            rate_wall = rate_game = None
            if start and end:
                d_frames = end["frames"] - start["frames"]
                d_wall = (end["wall"] - start["wall"]) / 1000.0
                d_game = (end["elapsed"] or 0) - (start["elapsed"] or 0)
                rate_wall = round(d_frames / d_wall, 2) if d_wall > 0 else None
                rate_game = round(d_frames / d_game, 2) if d_game > 0 else None
                meta["battle_window"] = {"frames": d_frames,
                                          "wall_s": round(d_wall, 2),
                                          "game_s": round(d_game, 2),
                                          "phase": end["phase"]}
            assertions.append(report.check(
                SECTION, "heat.battle_render_rate",
                "rendered frames per wall second in battle (live count)",
                rate_wall is not None and rate_wall <= 60.5,
                expected="<= 60.5 renders/wall-s",
                actual={"renders_per_wall_s": rate_wall,
                        "renders_per_game_s": rate_game},
                detail="counted via window.__hormuzFrameHook; NOTE: "
                       "SwiftShader renders far below 60 wall-fps, so this "
                       "live rate passes vacuously here — the structural "
                       "check below is the real cap gate"))
            await harness.safe_close(pg)
        finally:
            await harness.safe_close(ctx)

    # ---- C. structural battle cap --------------------------------------
    found, detail = battle_cap_structure()
    assertions.append(report.check(
        SECTION, "heat.battle_cap_structure",
        "a 60 fps render cap exists on the battle path (D-020)",
        found,
        expected="frame-rate gate applying during battle (not calm-only)",
        actual=detail,
        detail="v0.5.0: the map loop's only gate is the 1/30 calm branch, "
               "and calm is false during battle -> unbounded rAF"))
    return report.emit("probe_heat", SECTION, assertions,
                       meta=meta, out_path=args.out_json)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
