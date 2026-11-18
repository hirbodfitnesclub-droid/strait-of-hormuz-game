"""I5 retest — fix program 2, Wave-0 GATE (D-020).

Team 5's open suspicion (audit-2, finding I5, «مشکوک قوی»): in the
browser, a seeded boss battle (seedlib.boss_seed(5): 8 tier-3 towers
incl. AA + garrison) showed ZERO FX calls and state.fireStats = {} in
every sample across two independent runs, while the SAME defense + wave
in the raw reducer fires from battle t=3.0 and reaches 134 shots by
t=30. Their caveat: headless game time ran ~0.03-0.1x and chunky, and
enemy progress was not sampled — so a runtime-path regression was
suspected, not proven.

This retest replays that exact seed on a REAL frame and removes the
confounders:
  * samples are taken on the game's own clock until battle t >= 35
    game-s (5 s past the reducer's t=30 checkpoint), however long that
    takes in wall time;
  * every sample records the full causal chain: phase, battle presence,
    towers in state, enemies alive + max lane progress (are they even
    moving?), destroyed, fireStats from state, FX counters from the
    harness wrap, and window.__telemetry read BOTH through the legacy
    harness reader and a direct read of its real shape
    ({shots, impacts, fizzled} maps — gamesync telemetry field);
  * the reducer half (probe_i5_ref.cjs) replays the identical seed JSON
    through hydrateGame + raw ticks, so both sides start from the same
    hydrated state.

VERDICT RULES:
  * browser fireStats total at battle t>=30 > 0 and FX fired -> I5 NOT
    reproduced (the live path fires; team 5's windows were a headless
    time-dilation artifact);
  * enemies demonstrably advance/die in state but fireStats stays {}
    and FX stays 0 through battle t=35 -> I5 REPRODUCED: a runtime-path
    regression, and per D-020 it becomes a Wave-0 BLOCKER to be fixed
    before any other fix-program-2 work;
  * the battle never runs in the browser (no phase/battle/enemies) ->
    the question is settled differently: a seed/hydrate-path divergence,
    also reported as a blocker with the evidence.
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from playwright.async_api import async_playwright

import harness
import report
import seedlib

SECTION = "§I5 retest (D-020 gate)"
WALL_DEADLINE_S = 900.0
TARGET_BATTLE_S = 35.0

SAMPLE_JS = """() => {
  const s = window.__gamesync3d;
  if (!s || !s.state) return null;
  const st = s.state;
  const tele = window.__telemetry;
  return {
    elapsed: st.elapsed, phase: st.phase,
    battle: st.battle ? { wave: st.battle.wave, objective: st.battle.objective,
                          elapsed: st.battle.elapsed } : null,
    towersState: st.towers.length,
    towersSync: s.towers ? s.towers.size : -1,
    enemies: st.enemies.length,
    maxProgress: st.enemies.reduce((a, e) => Math.max(a, e.progress), 0),
    destroyed: st.destroyed,
    fireStats: st.fireStats || {},
    teleDirect: tele && tele.shots ? { shots: tele.shots, impacts: tele.impacts } : null,
  };
}"""


def total_shots(fire_stats: dict) -> int:
    return sum((v or {}).get("shots", 0) for v in (fire_stats or {}).values())


def reducer_reference(seed: dict) -> dict:
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", ".."))
    tmp = os.path.join(here, ".tmp")
    os.makedirs(tmp, exist_ok=True)
    seed_path = os.path.join(tmp, "i5-seed.json")
    with open(seed_path, "w", encoding="utf-8") as f:
        json.dump(seed, f)
    r = subprocess.run(["node", os.path.join(here, "probe_i5_ref.cjs"), seed_path],
                       cwd=repo, capture_output=True, text=True)
    try:
        block = r.stdout.split("I5REF_JSON_BEGIN")[1].split("I5REF_JSON_END")[0]
        return json.loads(block)
    except Exception:  # noqa: BLE001
        return {"error": f"exit {r.returncode}: {(r.stderr or r.stdout)[-300:]}"}


async def main() -> int:
    args = report.parse_args()
    assertions: list[dict] = []
    meta: dict = {}
    seed = seedlib.boss_seed(5)
    meta["reducer_reference"] = reducer_reference(seed)

    samples: list[dict] = []
    fx_final = None
    tele_legacy = None
    async with async_playwright() as pw:
        ctx = await harness.open_context(pw)
        try:
            pg, errors = await harness.open_seeded_page(
                ctx, args.base_url, seedlib.seed_js(seed),
                model_wait=300.0, towers_expected=8)
            meta["page_errors"] = errors[:3]
            meta["fx_install"] = await pg.evaluate(harness.INSTALL_FX_PROBE_JS)

            async def ev(js, timeout=90):
                try:
                    return await asyncio.wait_for(pg.evaluate(js), timeout=timeout)
                except Exception:  # noqa: BLE001 - degrade to a verdict
                    return None

            deadline = time.monotonic() + WALL_DEADLINE_S
            while time.monotonic() < deadline:
                # Auto-start opens a real briefing after the page is ready.
                # Acknowledge it as a player does; economy elapsed continues
                # while that dialog pauses combat, so it is not battle time.
                await ev(harness.DISMISS_BULLETIN_JS)
                smp = await ev(SAMPLE_JS)
                if smp:
                    smp["battleT"] = round(smp["battle"]["elapsed"], 2) if smp["battle"] else None
                    samples.append(smp)
                    if smp["battleT"] is not None and smp["battleT"] >= TARGET_BATTLE_S:
                        break
                    if smp["phase"] in ("defeat", "victory"):
                        break
                await pg.wait_for_timeout(2000)
            fx_final = await ev(harness.READ_FX_PROBE_JS)
            tele_legacy = await ev(harness.TELEMETRY_SNAPSHOT_JS)
            await harness.safe_close(pg)
        finally:
            await harness.safe_close(ctx)

    meta["samples"] = samples
    meta["fx_totals"] = ({"shoot": len(fx_final["shoot"]), "rail": len(fx_final["rail"]),
                          "flash": len(fx_final["flash"]), "explode": len(fx_final["explode"])}
                         if fx_final else None)
    meta["telemetry_legacy_reader"] = tele_legacy

    last = samples[-1] if samples else {}
    battle_ran = any(smp["battle"] is not None or smp["phase"] == "battle"
                     for smp in samples)
    enemies_seen = max((smp["enemies"] for smp in samples), default=0)
    enemies_advanced = max((smp["maxProgress"] for smp in samples), default=0)
    browser_shots = total_shots(last.get("fireStats") or {})
    reached_t = last.get("battleT")
    fx_shots = (len(fx_final["shoot"]) + len(fx_final["flash"]) + len(fx_final["rail"])
                if fx_final else 0)
    ref = meta["reducer_reference"]
    ref_shots = ((ref.get("at30") or {}).get("totalShots")
                 if isinstance(ref, dict) else None)

    if not battle_ran or enemies_seen == 0:
        verdict, ok = "battle never materialised in the browser", False
        detail = (f"samples={len(samples)} lastPhase={last.get('phase')} "
                  f"towersState={last.get('towersState')} enemiesSeen={enemies_seen} — "
                  "seed/hydrate-path divergence, BLOCKER (different mechanism than I5)")
    elif browser_shots > 0 and fx_shots > 0:
        verdict, ok = "I5 NOT reproduced — the live path fires", True
        detail = (f"browser fireStats total={browser_shots} at battle t={reached_t}, "
                  f"FX events={fx_shots}, reducer reference at t=30: {ref_shots} shots — "
                  "team 5's zero readings were a headless time-dilation/window artifact")
    elif enemies_advanced > 0.05 and browser_shots == 0 and fx_shots == 0:
        verdict, ok = "I5 REPRODUCED — runtime-path regression, WAVE-0 BLOCKER", False
        detail = (f"enemies advanced to progress {round(enemies_advanced, 3)} and "
                  f"{last.get('destroyed')} were destroyed, yet fireStats={{}} and FX=0 "
                  f"through battle t={reached_t} while the reducer fires "
                  f"{ref_shots} shots by t=30 on the identical seed — per D-020 this "
                  "blocks all other fix-program-2 work until fixed")
    else:
        verdict, ok = "inconclusive window", False
        detail = (f"battleT reached={reached_t} (target {TARGET_BATTLE_S}), "
                  f"browserShots={browser_shots} fx={fx_shots} "
                  f"maxProgress={round(enemies_advanced, 3)} destroyed={last.get('destroyed')}")

    assertions.append(report.check(
        SECTION, "i5.browser_fires", "seeded boss battle fires on a real frame",
        ok, expected="browser fireStats > 0 and FX > 0 by battle t=30, matching the reducer",
        actual={"verdict": verdict, "browserShots": browser_shots,
                "fxEvents": fx_shots, "battleT": reached_t,
                "reducerShotsAt30": ref_shots,
                "enemiesSeen": enemies_seen,
                "maxProgress": round(enemies_advanced, 3),
                "destroyed": last.get("destroyed")},
        detail=detail))
    return report.emit("probe_i5", SECTION, assertions,
                       meta=meta, out_path=args.out_json)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
