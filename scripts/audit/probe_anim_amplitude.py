"""Live amplitude probe (Fix Program 2, team ANIM, D-019).

Serves the static build (out/), seeds the 18-configuration tower matrix
(seedlib.tower_matrix_seed, wave 3 — wave 3 brings air units so the AA
kinds engage too), and measures ACTUAL node-transform motion in the live
game: an in-page sampler records min/max of rotation/position/scale for
every animation node gamesync collected (towerAnims dedicated lists +
generic lists + building genericAnims), plus visibility flips for silo
cells / hypersonic missile.

Success criterion (D-019): for every tower kind that FIRED during the
window (gamesync shotIdx > 0 or state fireStats > 0), at least one driven
category shows amplitude > 0; building generic lists are non-empty in the
live game and near-camera buildings show idle amplitude > 0.

Run:  ~/tools/venv-geo/bin/python scripts/audit/probe_anim_amplitude.py [wave|parked|peace]

  wave   — natural wave-3 battle from the matrix seed (auto-start).
  parked — mid-battle seed with perma-stunned fat destroyers parked along
           the whole enemy lane (seedlib.parked_enemies): every strait
           slot has a target from t=0, so the slow-cadence kinds (silo,
           hypersonic) actually run their fire cycles and the silo door /
           erector phase behavior (audit-2 M-1) is exercised on the real
           build. This mode also waits for building genericAnims and
           asserts silo door + hypersonic erector amplitude > 0.
  peace  — rich-economy seed (all 11 buildings placed, no battle): waits
           until building genericAnims are populated, then samples pure
           idle amplitude per building. Buildings whose GLB defines no
           anim nodes (water→desal, city→town, welfare) legitimately stay
           at generic=0. Note updateAnims culls buildings >320 units from
           the camera — a far building may read amp 0 by design.

Prints a per-kind table; exit 0 iff every fired kind moved (and, in
parked mode, doors + erector moved).
"""
from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import time

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import seedlib  # noqa: E402
from harness import open_context, DISMISS_BULLETIN_JS, safe_close  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

PORT = 8937
BASE = f"http://127.0.0.1:{PORT}/index.html"
WALL_CAP_S = 660          # hard wall-clock cap for the whole session
GAME_WINDOW_S = 75        # stop sampling after this much GAME time in battle

SNAPSHOT_JS = """() => {
  const s = window.__gamesync3d;
  if (!s || !s.towerAnims) return null;
  const towers = [];
  for (const [slot, ta] of s.towerAnims) {
    towers.push({ slot, kind: ta.kind,
      yaw: ta.yaw.length, pitch: ta.pitch.length, mz: ta.mz.length,
      rc: ta.rc.length, spin: !!ta.spin, erector: !!ta.erector,
      missile: !!ta.missile, crystal: !!ta.crystal,
      doorsL: ta.doorsL.length, doorsR: ta.doorsR.length,
      cells: ta.cells.length, generic: ta.generic.length });
  }
  const buildings = [];
  if (s.genericAnims) for (const [k, nodes] of s.genericAnims)
    buildings.push({ key: k, generic: nodes.length });
  return { towers, buildings,
           phase: s.state ? s.state.phase : null,
           elapsed: s.state ? s.state.elapsed : null };
}"""

INSTALL_SAMPLER_JS = """() => {
  const s = window.__gamesync3d;
  if (!s || !s.towerAnims) return 'no-sync';
  if (window.__amp) return 'already';
  const tracked = [];   // {id, obj, vis, lastVis}
  const add = (id, obj) => { if (obj) tracked.push({ id, obj, vis: 0, lastVis: obj.visible }); };
  for (const [slot, ta] of s.towerAnims) {
    const p = 't' + slot + '/' + ta.kind + '/';
    ta.yaw.forEach((o, i) => add(p + 'yaw' + i, o));
    ta.pitch.forEach((o, i) => add(p + 'pitch' + i, o));
    ta.rc.forEach((r, i) => add(p + 'rc' + i, r.obj));
    add(p + 'spin', ta.spin); add(p + 'erector', ta.erector);
    add(p + 'missile', ta.missile); add(p + 'crystal', ta.crystal);
    ta.doorsL.forEach((o, i) => add(p + 'doorL' + i, o));
    ta.doorsR.forEach((o, i) => add(p + 'doorR' + i, o));
    ta.cells.forEach((o, i) => add(p + 'cell' + i, o));
    ta.mz.forEach((o, i) => add(p + 'mz' + i, o));
    ta.generic.forEach((n, i) => add(p + 'gen:' + n.name + i, n.obj));
  }
  if (s.genericAnims) for (const [k, nodes] of s.genericAnims)
    nodes.forEach((n, i) => add('b/' + k + '/' + n.name + i, n.obj));
  const stats = new Map();
  const sample = () => {
    for (const t of tracked) {
      const o = t.obj;
      let st = stats.get(t.id);
      if (!st) { st = { min: [1e9,1e9,1e9,1e9,1e9,1e9,1e9], max: [-1e9,-1e9,-1e9,-1e9,-1e9,-1e9,-1e9], vis: 0 };
                 stats.set(t.id, st); }
      const v = [o.rotation.x, o.rotation.y, o.rotation.z,
                 o.position.x, o.position.y, o.position.z, o.scale.x];
      for (let i = 0; i < 7; i++) { if (v[i] < st.min[i]) st.min[i] = v[i]; if (v[i] > st.max[i]) st.max[i] = v[i]; }
      if (o.visible !== t.lastVis) { t.lastVis = o.visible; t.vis++; st.vis = t.vis; }
    }
  };
  sample();
  const timer = setInterval(sample, 100);
  window.__amp = { stats, tracked: tracked.length, timer,
    read: () => { const out = {};
      for (const [id, st] of stats) out[id] = { amp: st.max.map((m, i) => +(m - st.min[i]).toFixed(4)), vis: st.vis };
      return out; } };
  return 'installed:' + tracked.length;
}"""

FIRED_JS = """() => {
  const s = window.__gamesync3d;
  if (!s) return null;
  const shots = {};
  if (s.towerAnims) for (const [slot, ta] of s.towerAnims)
    shots[slot] = { kind: ta.kind, shotIdx: ta.shotIdx, period: ta.period };
  let fireStats = null;
  try {
    const fs = s.state && s.state.fireStats;
    if (fs) fireStats = (fs instanceof Map) ? Object.fromEntries(fs) : JSON.parse(JSON.stringify(fs));
  } catch (e) { fireStats = { error: String(e) }; }
  return { shots, fireStats,
           phase: s.state ? s.state.phase : null,
           elapsed: s.state ? s.state.elapsed : null,
           hearts: s.state ? s.state.hearts : null };
}"""


def parked_seed() -> dict:
    """Matrix seed resumed mid-battle against parked targets (mirrors
    probe_cadence.cadence_seed's battle-context requirements)."""
    state = seedlib.tower_matrix_seed(wave=3)
    state["phase"] = "battle"
    state["enemies"] = seedlib.parked_enemies()
    state["battle"] = {
        "wave": state["wave"], "condition": None, "objective": "repel",
        "queue": [], "elapsed": 0, "escort": None, "stranded": None,
        "structureHp": 0, "structureMaxHp": 0, "airTotal": 0, "airLeaked": 0,
        "mines": [], "mineClock": 4, "sweep": {}, "failed": False,
    }
    state["nextId"] = 1000
    state["spawnRemaining"] = 0
    state["trafficCount"] = 1
    state["security"] = 0
    state["merchants"] = []
    state["hero"] = {"x": 20.0, "y": 66.0, "active": 0}
    return state


async def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "wave"
    if mode not in ("wave", "parked", "peace"):
        print("usage: probe_anim_amplitude.py [wave|parked|peace]")
        return 2
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
        cwd="out", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if mode == "parked":
            seed_state = parked_seed()
        elif mode == "peace":
            seed_state = seedlib.rich_economy_seed()
        else:
            seed_state = seedlib.tower_matrix_seed(wave=3)
        seed = seedlib.seed_js(seed_state)
        async with async_playwright() as pw:
            ctx = await open_context(pw)
            pg = await ctx.new_page()
            errors: list[str] = []
            pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
            await pg.goto(BASE, wait_until="load", timeout=90000)
            await pg.wait_for_timeout(4000)
            seeded = await pg.evaluate(seed)
            if seeded != "seeded":
                raise RuntimeError(f"seed failed: {seeded}")
            await pg.reload(wait_until="load", timeout=90000)

            # readiness: tower models bound (towerAnims filled by
            # bindTowerAnim when each GLB arrives). Wave mode wants all 18.
            # Parked mode runs a live battle from the first frame, which
            # slows model streaming a lot — its verdict only needs the silo
            # (slot 6) and hypersonic (slot 7) models plus a broad set, and
            # it also waits for building genericAnims so building nodes
            # join the sampler.
            snap = None
            deadline = time.monotonic() + (600 if mode == "parked" else 300)
            while time.monotonic() < deadline:
                snap = await pg.evaluate(SNAPSHOT_JS)
                if not snap:
                    await pg.wait_for_timeout(2000)
                    continue
                slots = {t["slot"] for t in snap["towers"]}
                if mode == "wave":
                    ready = len(snap["towers"]) >= 18
                elif mode == "peace":
                    ready = len(snap["buildings"]) >= 11
                else:
                    ready = {6, 7} <= slots and len(snap["towers"]) >= 13
                if ready:
                    break
                await pg.wait_for_timeout(2000)
            if mode == "peace":
                if not snap or len(snap["buildings"]) < 11:
                    raise RuntimeError(
                        f"buildings not ready: {snap and len(snap['buildings'])}")
            elif not snap or len(snap["towers"]) < (13 if mode == "parked" else 18):
                raise RuntimeError(f"tower models not ready: {snap and len(snap['towers'])}")
            if mode == "parked":
                slots = {t["slot"] for t in snap["towers"]}
                if not {6, 7} <= slots:
                    raise RuntimeError(f"parked mode needs slots 6+7 bound, got {sorted(slots)}")
                if not snap["buildings"]:
                    print("WARNING: building genericAnims still empty at readiness")
            print("=== LIVE COLLECTION (window.__gamesync3d.towerAnims) ===")
            for t in sorted(snap["towers"], key=lambda x: x["slot"]):
                print(f"slot {t['slot']:>2} {t['kind']:<11} yaw={t['yaw']} pitch={t['pitch']} "
                      f"mz={t['mz']} rc={t['rc']} spin={int(t['spin'])} erector={int(t['erector'])} "
                      f"missile={int(t['missile'])} crystal={int(t['crystal'])} "
                      f"doors={t['doorsL']}/{t['doorsR']} cells={t['cells']} generic={t['generic']}")
            print("buildings genericAnims:", json.dumps(snap["buildings"]))

            installed = await pg.evaluate(INSTALL_SAMPLER_JS)
            print("sampler:", installed)

            # dismiss the SCEN briefing bulletin (it pauses the battle)
            for _ in range(12):
                clicked = await pg.evaluate(DISMISS_BULLETIN_JS)
                if clicked:
                    break
                shown = await pg.evaluate("() => !!document.querySelector('.news-bulletin')")
                if not shown:
                    await pg.wait_for_timeout(1500)
                    break
                await pg.wait_for_timeout(1500)

            if mode == "peace":
                # no battle: sample pure idle motion for a fixed window
                await pg.wait_for_timeout(180_000)
                amps = await pg.evaluate("() => window.__amp ? window.__amp.read() : null")
                per_bld: dict[str, float] = {}
                for nid, st in (amps or {}).items():
                    if nid.startswith("b/"):
                        key = nid.split("/")[1]
                        per_bld[key] = max(per_bld.get(key, 0.0), max(st["amp"]))
                print("\n=== BUILDING IDLE AMPLITUDE (peace) ===")
                for e in snap["buildings"]:
                    key = e["key"]
                    amp = per_bld.get(key, 0.0)
                    print(f"{key:<14} generic={e['generic']}  maxAmp={amp:.4f}")
                moved = sum(1 for e in snap["buildings"]
                            if e["generic"] > 0 and per_bld.get(e["key"], 0.0) > 0)
                total = sum(1 for e in snap["buildings"] if e["generic"] > 0)
                print(f"VERDICT: {moved}/{total} buildings with anim nodes show idle motion")
                await safe_close(ctx)
                return 0 if moved >= max(1, total - 1) else 1

            # sample until the game clock advances GAME_WINDOW_S inside the
            # battle, the wave resolves, or the wall cap hits
            t_start = time.monotonic()
            g_start = None
            last = None
            while time.monotonic() - t_start < WALL_CAP_S:
                last = await pg.evaluate(FIRED_JS)
                if last is None:
                    break
                if last["phase"] == "battle" and g_start is None:
                    g_start = last["elapsed"]
                if g_start is not None and last["elapsed"] is not None \
                        and last["elapsed"] - g_start >= GAME_WINDOW_S:
                    break
                if g_start is not None and last["phase"] not in ("battle",):
                    break
                await pg.wait_for_timeout(3000)
            amps = await pg.evaluate("() => window.__amp ? window.__amp.read() : null")
            fired = await pg.evaluate(FIRED_JS)
            end_snap = await pg.evaluate(SNAPSHOT_JS)
            if end_snap:
                print("end-of-run buildings genericAnims:", json.dumps(end_snap["buildings"]))
            print(f"\nwindow: game elapsed {fired and fired['elapsed']} phase={fired and fired['phase']} "
                  f"hearts={fired and fired['hearts']}")
            print("fireStats:", json.dumps(fired and fired["fireStats"]))
            print("per-slot shotIdx:", json.dumps(
                {k: (v["kind"], v["shotIdx"]) for k, v in (fired or {}).get("shots", {}).items()}))

            # aggregate amplitude per tower slot/category and per building
            print("\n=== AMPLITUDE (max component range per category) ===")
            per_slot: dict[str, dict[str, float]] = {}
            per_bld: dict[str, float] = {}
            vis_flips: dict[str, int] = {}
            for nid, st in (amps or {}).items():
                amp = max(st["amp"])
                if nid.startswith("b/"):
                    key = nid.split("/")[1]
                    per_bld[key] = max(per_bld.get(key, 0.0), amp)
                else:
                    slot, kind, cat = nid.split("/")[:3]
                    cat = cat.rstrip("0123456789").replace("gen:", "gen:")
                    per_slot.setdefault(f"{slot} {kind}", {})[cat] = max(
                        per_slot.get(f"{slot} {kind}", {}).get(cat, 0.0), amp)
                if st["vis"]:
                    vis_flips[nid] = st["vis"]
            for k in sorted(per_slot):
                cats = {c: a for c, a in per_slot[k].items() if a > 0}
                print(f"{k:<16} moved: {json.dumps(cats)}")
            print("buildings (max node amp):", json.dumps(
                {k: round(v, 3) for k, v in sorted(per_bld.items())}))
            print("visibility flips:", json.dumps(vis_flips))
            if errors:
                print("page errors:", errors[:5])

            # verdict: every kind that fired must show motion somewhere
            fired_kinds = set()
            for v in (fired or {}).get("shots", {}).values():
                if v["shotIdx"] > 0:
                    fired_kinds.add(v["kind"])
            fs = (fired or {}).get("fireStats") or {}
            if isinstance(fs, dict):
                for k, v in fs.items():
                    n = v.get("shots") if isinstance(v, dict) else v
                    if isinstance(n, (int, float)) and n > 0:
                        fired_kinds.add(k)
            moved_kinds = set()
            for k, cats in per_slot.items():
                if any(a > 0 for a in cats.values()):
                    moved_kinds.add(k.split(" ", 1)[1])
            print("\nfired kinds:", sorted(fired_kinds))
            print("moved kinds:", sorted(moved_kinds))
            silent = sorted(fired_kinds - moved_kinds)
            ok = not silent
            print("VERDICT:", "PASS — every fired kind moved" if ok
                  else f"FAIL — fired but motionless: {silent}")
            if mode == "parked":
                silo = next((c for k, c in per_slot.items() if k.endswith(" silo")), {})
                hyper = next((c for k, c in per_slot.items() if k.endswith(" hypersonic")), {})
                door_amp = max(silo.get("doorL", 0.0), silo.get("doorR", 0.0))
                erec_amp = hyper.get("erector", 0.0)
                print(f"PARKED CHECKS: silo doors amp={door_amp:.4f} (need >0), "
                      f"hypersonic erector amp={erec_amp:.4f} (need >0), "
                      f"silo muzzle-origin cells vis flips in table above")
                if door_amp <= 0 or erec_amp <= 0:
                    ok = False
                    print("VERDICT: FAIL — door/erector cycle did not move")
            await safe_close(ctx)
            return 0 if ok else 1
    finally:
        server.terminate()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
