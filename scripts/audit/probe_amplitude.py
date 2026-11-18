"""Amplitude probe — fix program 2, D-019 gate (team ANIM).

The owner's phone verdict on v0.5.0: «برج‌ها انیمیشن ندارن». Audit-2 team 2
found the root cause: three.js GLTFLoader sanitizes node names
(PropertyBinding.sanitizeNodeName strips ':'), so `anim:yaw` arrives in
the live scene as `animyaw`, gamesync's collectAnims (which searches for
the colon names) finds ZERO nodes for all 18 tower kinds, and updateAnims
is dead code. Branch QA never caught it because no probe ever sampled the
loaded scene's animation nodes.

This probe is that missing gate. It loads the REAL build, seeds all 18
tower configurations (6 families x {T3, T4 branch 0, T4 branch 1}) into a
live battle against parked perma-stunned destroyers (every strait slot
has a target in range), then samples the actual animation-node transforms
on `window.__gamesync3d.towerAnims` over a game-clock window and asserts:

  * every tower config has a NON-EMPTY animation node set, and
  * the measured amplitude (max per-node transform range across samples)
    is > 0 for every config, and
  * building idle animation lists (gamesync.genericAnims, 'bld-' keys)
    are non-empty.

On the CURRENT build (v0.5.0 code) every one of these MUST FAIL with
amplitude exactly 0.000 — a green run today means the probe is broken,
not the game. Sampling is on the game's own clock (state.elapsed):
headless SwiftShader dilates wall time ~10x, game time does not lie.
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

SECTION = "§anim amplitude (D-019)"
WINDOW_GAME_S = 12.0
WALL_DEADLINE_S = 900.0
AMP_EPS = 0.002  # radians / world units — real aim/recoil motion is ~0.05+

SAMPLE_JS = """() => {
  const s = window.__gamesync3d;
  if (!s || !s.towerAnims) return null;
  const flat = (o) => [o.rotation.x, o.rotation.y, o.rotation.z,
                        o.position.x, o.position.y, o.position.z];
  const towers = {};
  for (const [slot, ta] of s.towerAnims.entries()) {
    const vals = [];
    const push = (arr) => { for (const o of arr || []) vals.push(...flat(o)); };
    push(ta.yaw); push(ta.pitch); push(ta.mz);
    for (const r of ta.rc || []) if (r && r.obj) vals.push(...flat(r.obj));
    for (const o of [ta.spin, ta.erector, ta.missile, ta.crystal]) if (o) vals.push(...flat(o));
    push(ta.doorsL); push(ta.doorsR); push(ta.cells);
    for (const n of ta.generic || []) if (n && n.obj) vals.push(...flat(n.obj));
    towers[slot] = {
      kind: ta.kind,
      counts: { yaw: (ta.yaw || []).length, pitch: (ta.pitch || []).length,
                mz: (ta.mz || []).length, rc: (ta.rc || []).length,
                spin: ta.spin ? 1 : 0, erector: ta.erector ? 1 : 0,
                missile: ta.missile ? 1 : 0, crystal: ta.crystal ? 1 : 0,
                doorsL: (ta.doorsL || []).length, doorsR: (ta.doorsR || []).length,
                cells: (ta.cells || []).length, generic: (ta.generic || []).length },
      vals };
  }
  const bld = {};
  if (s.genericAnims) for (const [k, arr] of s.genericAnims.entries()) bld[k] = {
    count: (arr || []).length,
    vals: (arr || []).flatMap(n => [...flat(n.obj), ...n.obj.scale.toArray(), ...(n.mat?.color?.toArray() || []), n.obj.intensity || 0])
  };
  const st = s.state;
  return { towers, bld, elapsed: st ? st.elapsed : null,
           phase: st ? st.phase : null, fireStats: st ? st.fireStats : null };
}"""


def amplitude_seed() -> dict:
    """All 18 configs in a live battle vs parked destroyers — the
    cadence probe's mid-battle context pattern (hydrate refuses a
    context-less battle save and downgrades it to peace)."""
    state = seedlib.tower_matrix_seed(wave=3)
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
    # Hero parked far off-lane: its fire must not be mistaken for a tower's.
    state["hero"] = {"x": 20.0, "y": 66.0, "active": 0}
    return state


def config_label(kind: str, tier: int, branch) -> str:
    return f"{kind}-t{tier}" + (f"b{branch}" if tier == 4 else "")


async def main() -> int:
    args = report.parse_args()
    assertions: list[dict] = []
    meta: dict = {}
    configs = seedlib.tower_configs()
    slots = seedlib.MATRIX_SLOTS
    label_by_slot = {slot: config_label(k, t, b)
                     for (k, t, b), slot in zip(configs, slots)}
    async with async_playwright() as pw:
        ctx = await harness.open_context(pw)
        try:
            pg, errors = await harness.open_seeded_page(
                ctx, args.base_url, seedlib.seed_js(amplitude_seed()),
                model_wait=900.0, towers_expected=len(slots))
            meta["page_errors"] = errors[:3]

            async def ev(js, timeout=90):
                try:
                    return await asyncio.wait_for(pg.evaluate(js), timeout=timeout)
                except Exception:  # noqa: BLE001 - degrade to a verdict
                    return None

            # Wait until every seeded slot has a TowerAnim record (models
            # stream in behind the veil; bindTowerAnim runs per model).
            deadline = time.monotonic() + 600
            snap = None
            while time.monotonic() < deadline:
                snap = await ev(SAMPLE_JS)
                if snap and len(snap["towers"]) >= len(slots):
                    break
                await pg.wait_for_timeout(3000)
            if not snap:
                return report.fatal("probe_amplitude", SECTION,
                                    "gamesync/towerAnims never became readable",
                                    args.out_json)
            meta["anims_bound"] = len(snap["towers"])

            # Sample transforms on the game's own clock.
            samples: list[dict] = [snap]
            g0 = snap["elapsed"] or 0.0
            deadline = time.monotonic() + WALL_DEADLINE_S
            while time.monotonic() < deadline:
                last = samples[-1]
                if last["elapsed"] is not None and last["elapsed"] - g0 >= WINDOW_GAME_S:
                    break
                await pg.wait_for_timeout(2000)
                s = await ev(SAMPLE_JS)
                if s:
                    samples.append(s)
            final = samples[-1]
            meta["samples"] = len(samples)
            meta["game_window_s"] = round((final["elapsed"] or 0) - g0, 2)
            meta["fireStats"] = final["fireStats"]

            # Per-slot amplitude: max range of any transform component
            # across the samples (node order inside a TowerAnim record is
            # stable for the life of the record).
            for slot in slots:
                label = label_by_slot[slot]
                series = [s["towers"].get(str(slot)) or s["towers"].get(slot)
                          for s in samples]
                series = [x for x in series if x]
                counts = series[-1]["counts"] if series else {}
                node_total = sum(counts.values()) if counts else 0
                amp = 0.0
                if series:
                    width = min(len(x["vals"]) for x in series)
                    for i in range(width):
                        col = [x["vals"][i] for x in series]
                        amp = max(amp, max(col) - min(col))
                model_kind = series[-1]["kind"] if series else None
                fired = bool(final["fireStats"] and model_kind
                             and (final["fireStats"].get(model_kind) or {}).get("shots", 0) > 0)
                assertions.append(report.check(
                    SECTION, f"amplitude.{label}",
                    f"{label} animation nodes move in battle",
                    node_total > 0 and amp > AMP_EPS,
                    expected=f"nodes > 0 and amplitude > {AMP_EPS}",
                    actual={"nodes": node_total, "amplitude": round(amp, 4),
                            "modelKind": model_kind, "fired": fired},
                    detail=f"slot {slot}, counts={counts}"))

            bld = final["bld"] or {}
            bld_lists = {k: v for k, v in bld.items() if k.startswith("bld-")}
            live = {k: v for k, v in bld_lists.items() if v["count"] > 0}
            # These four tier-one models in tower_matrix_seed have authored
            # motion. Checking only the loaded subset lets a lost model pass.
            expected_buildings = {"bld-oil", "bld-water", "bld-dock", "bld-power"}
            assertions.append(report.check(
                SECTION, "amplitude.building_idle",
                "every expected animated building is loaded and bound",
                expected_buildings.issubset(live),
                expected=sorted(expected_buildings),
                actual={"buildings": bld_lists},
                detail="gamesync.genericAnims 'bld-' entries (radar/flame/smoke idles)"))
            # Low-tier tanks/houses are authored static. For every loaded
            # building that DOES have moving parts, measure real transforms
            # or beacon colors instead of accepting a non-empty list alone.
            for key in live:
                series = [s["bld"][key]["vals"] for s in samples if key in s["bld"]]
                width = min((len(x) for x in series), default=0)
                amp = max((max(x[i] for x in series) - min(x[i] for x in series) for i in range(width)), default=0)
                assertions.append(report.check(
                    SECTION, f"amplitude.{key}", f"{key} authored transform or beacon color changes",
                    amp > AMP_EPS, expected=f"amplitude > {AMP_EPS}", actual=round(amp, 4)))
            await harness.safe_close(pg)
        finally:
            await harness.safe_close(ctx)
    return report.emit("probe_amplitude", SECTION, assertions,
                       meta=meta, out_path=args.out_json)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
