#!/usr/bin/env python3
"""PERF3 census driver: baseline perfInfo + scene census + differential
experiments on the opening peace view (fresh-player seed, probe protocol)."""
import asyncio, json, os, sys, time

os.environ.setdefault("AUDIT_PROFILE", os.path.expanduser("~/.cache/hormuz-audit-profile-perf3"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "audit"))
import harness  # noqa: E402
import seedlib  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

BASE = "http://localhost:3417"
HERE = os.path.dirname(os.path.abspath(__file__))
CENSUS_JS = open(os.path.join(HERE, "CENSUS_JS.js")).read()


async def ev(pg, js, timeout=120):
    try:
        return await asyncio.wait_for(pg.evaluate(js), timeout=timeout)
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:200]}


async def samples(pg, n=3, gap=2000):
    out = []
    for _ in range(n):
        s = await ev(pg, "() => window.__gamesync3d.perfInfo()")
        if s and s.get("tris", 0) > 0:
            out.append(s)
        await pg.wait_for_timeout(gap)
    return out


async def main():
    res = {}
    async with async_playwright() as pw:
        ctx = await harness.open_context(pw)
        try:
            pg, errors = await harness.open_seeded_page(
                ctx, BASE, seedlib.seed_js(seedlib.fresh_player_seed()), model_wait=300.0)
            res["page_errors"] = errors[:3]
            # wait for the opening flight to settle (camera stops moving)
            last = None; stable = 0; t0 = time.monotonic()
            while time.monotonic() - t0 < 300:
                pos = await ev(pg, "() => { const c = window.__gamesync3d.map.camera.position; return [c.x, c.y, c.z]; }")
                if pos and last and max(abs(pos[i] - last[i]) for i in range(3)) < 0.05:
                    stable += 1
                    if stable >= 3:
                        break
                else:
                    stable = 0
                last = pos
                await pg.wait_for_timeout(2000)
            res["camera_settled_pos"] = last
            res["baseline_samples"] = await samples(pg, 6)
            res["baseline_median"] = harness.median([s["tris"] for s in res["baseline_samples"]]) if res["baseline_samples"] else None
            # scene children overview
            res["scene_children"] = await ev(pg, """() => {
              const sc = window.__gamesync3d.map.scene;
              return sc.children.map(c => ({ name: c.name || '', type: c.type, kids: c.children ? c.children.length : 0 }));
            }""")
            # census
            await ev(pg, CENSUS_JS)
            res["census"] = await ev(pg, "() => window.__census()")
            # E1: sun.castShadow = false
            await ev(pg, "() => { const m = window.__gamesync3d.map; m.sun.castShadow = false; return m.sun.castShadow; }")
            await pg.wait_for_timeout(1500)
            res["e1_sun_off"] = await samples(pg, 3)
            await ev(pg, "() => { window.__gamesync3d.map.sun.castShadow = true; }")
            await pg.wait_for_timeout(1500)
            # E2: castShadow=false on all meshes
            res["e2_restore_count"] = await ev(pg, """() => {
              const sc = window.__gamesync3d.map.scene; let n = 0;
              sc.traverse(o => { if (o.isMesh && o.castShadow) { o.userData.__cs = true; o.castShadow = false; n++; } });
              return n; }""")
            await pg.wait_for_timeout(1500)
            res["e2_all_casters_off"] = await samples(pg, 3)
            await ev(pg, """() => {
              const sc = window.__gamesync3d.map.scene;
              sc.traverse(o => { if (o.userData.__cs) { o.castShadow = true; delete o.userData.__cs; } }); }""")
            await pg.wait_for_timeout(1500)
            res["restored_samples"] = await samples(pg, 2)
            json.dump(res, open(os.path.join(HERE, "census-out.json"), "w"), indent=1)
            print("median baseline:", res["baseline_median"], flush=True)
            print("e1 sun off:", [s["tris"] for s in res["e1_sun_off"]], flush=True)
            print("e2 casters off:", [s["tris"] for s in res["e2_all_casters_off"]], flush=True)
            await harness.safe_close(pg)
        finally:
            await harness.safe_close(ctx)


if __name__ == "__main__":
    asyncio.run(main())
