#!/usr/bin/env python3
"""PERF3 battle-view regression check: probe_heat's own battle seed
(cannon T3 vs parked destroyers), perfInfo median-of-6 once the battle
camera settles. Run against base and after builds; after must not be
worse than base.

Usage: battle.py <tag> <serve_dir> <port>
"""
import asyncio, json, os, subprocess, sys, time

os.environ.setdefault("AUDIT_PROFILE", os.path.expanduser("~/.cache/hormuz-audit-profile-perf3"))
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts", "audit"))
import harness  # noqa: E402
import seedlib  # noqa: E402
import probe_heat  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

TAG = sys.argv[1]
SERVE = sys.argv[2]
PORT = int(sys.argv[3])
BASE = f"http://localhost:{PORT}"


async def main():
    res = {"tag": TAG, "serve": SERVE}
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--directory", SERVE],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        await asyncio.sleep(1.0)
        async with async_playwright() as pw:
            ctx = await harness.open_context(pw)
            try:
                pg, errors = await harness.open_seeded_page(
                    ctx, BASE, seedlib.seed_js(probe_heat.battle_seed()),
                    model_wait=300.0, towers_expected=1)
                res["page_errors"] = errors[:3]

                async def ev(js, timeout=90):
                    try:
                        return await asyncio.wait_for(pg.evaluate(js), timeout=timeout)
                    except Exception as e:  # noqa: BLE001
                        return {"error": str(e)[:120]}

                # wait for the battle camera to settle
                last = None; stable = 0; t0 = time.monotonic()
                while time.monotonic() - t0 < 300:
                    pos = await ev("() => { const c = window.__gamesync3d.map.camera.position; return [c.x, c.y, c.z]; }")
                    if isinstance(pos, list) and last and max(abs(pos[i] - last[i]) for i in range(3)) < 0.05:
                        stable += 1
                        if stable >= 3:
                            break
                    else:
                        stable = 0
                    if isinstance(pos, list):
                        last = pos
                    await pg.wait_for_timeout(2000)
                res["camera_settled_pos"] = last
                res["phase"] = await ev("() => window.__gamesync3d.perfInfo().phase")

                samples = []
                for _ in range(6):
                    s = await ev("() => window.__gamesync3d.perfInfo()")
                    if s and s.get("tris", 0) > 0:
                        samples.append(s)
                    await pg.wait_for_timeout(2000)
                res["samples"] = samples
                res["median_tris"] = harness.median([s["tris"] for s in samples]) if samples else None
                res["median_calls"] = harness.median([s["calls"] for s in samples]) if samples else None
                print(TAG, "battle median tris:", res["median_tris"], "calls:", res["median_calls"], flush=True)
                await harness.safe_close(pg)
            finally:
                await harness.safe_close(ctx)
    finally:
        server.terminate()
    json.dump(res, open(os.path.join(HERE, f"battle-{TAG}.json"), "w"), indent=1)
    print("WROTE", f"battle-{TAG}.json", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
