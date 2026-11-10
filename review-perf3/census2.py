#!/usr/bin/env python3
"""PERF3 differential attribution: per scene-child shadow-pass and
main-pass triangle deltas on the opening peace view."""
import asyncio, json, os, sys, time

os.environ.setdefault("AUDIT_PROFILE", os.path.expanduser("~/.cache/hormuz-audit-profile-perf3"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "audit"))
import harness  # noqa: E402
import seedlib  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

BASE = "http://localhost:3417"
HERE = os.path.dirname(os.path.abspath(__file__))


async def ev(pg, js, timeout=120):
    try:
        return await asyncio.wait_for(pg.evaluate(js), timeout=timeout)
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:200]}


async def med_tris(pg, n=2, gap=1600):
    vals = []
    for _ in range(n):
        s = await ev(pg, "() => window.__gamesync3d.perfInfo()")
        if s and s.get("tris", 0) > 0:
            vals.append(s["tris"])
        await pg.wait_for_timeout(gap)
    return harness.median([float(v) for v in vals]) if vals else None


async def main():
    res = {"children": []}
    async with async_playwright() as pw:
        ctx = await harness.open_context(pw)
        try:
            pg, errors = await harness.open_seeded_page(
                ctx, BASE, seedlib.seed_js(seedlib.fresh_player_seed()), model_wait=300.0)
            res["page_errors"] = errors[:3]
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
            res["baseline"] = await med_tris(pg, 4)
            kids = await ev(pg, """() => window.__gamesync3d.map.scene.children.map((c, i) =>
              ({ i, name: c.name || '', type: c.type, kids: c.children ? c.children.length : 0,
                 isMesh: !!c.isMesh, isLight: !!c.isLight }))""")
            res["kids"] = kids
            for k in kids:
                if k["isLight"]:
                    continue
                i = k["i"]
                row = {"i": i, "name": k["name"], "type": k["type"], "kids": k["kids"]}
                # shadow delta: castShadow=false across this child
                await ev(pg, f"""() => {{ const c = window.__gamesync3d.map.scene.children[{i}];
                  c.traverse(o => {{ if (o.isMesh && o.castShadow) {{ o.userData.__p3 = 1; o.castShadow = false; }} }});
                  if (c.isMesh && c.castShadow) {{ c.userData.__p3 = 1; c.castShadow = false; }} }}""")
                await pg.wait_for_timeout(1200)
                row["shadow_delta_base"] = await med_tris(pg, 2)
                await ev(pg, f"""() => {{ const c = window.__gamesync3d.map.scene.children[{i}];
                  c.traverse(o => {{ if (o.userData.__p3) {{ o.castShadow = true; delete o.userData.__p3; }} }}); }}""")
                await pg.wait_for_timeout(1200)
                # main delta: hide this child
                await ev(pg, f"() => {{ window.__gamesync3d.map.scene.children[{i}].visible = false; }}")
                await pg.wait_for_timeout(1200)
                row["main_delta_base"] = await med_tris(pg, 2)
                await ev(pg, f"() => {{ window.__gamesync3d.map.scene.children[{i}].visible = true; }}")
                await pg.wait_for_timeout(1200)
                row["shadow_tris"] = (res["baseline"] or 0) - (row["shadow_delta_base"] or 0)
                row["total_tris_when_hidden"] = (res["baseline"] or 0) - (row["main_delta_base"] or 0)
                res["children"].append(row)
                print(row, flush=True)
                json.dump(res, open(os.path.join(HERE, "census2-out.json"), "w"), indent=1)
            res["after"] = await med_tris(pg, 3)
            json.dump(res, open(os.path.join(HERE, "census2-out.json"), "w"), indent=1)
            print("baseline:", res["baseline"], "after:", res["after"], flush=True)
            await harness.safe_close(pg)
        finally:
            await harness.safe_close(ctx)


if __name__ == "__main__":
    asyncio.run(main())
