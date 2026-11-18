"""Sample submitted model meshes and natural shot launches in the mobile game."""
import argparse
import asyncio
import json
import os
import time
from pathlib import Path

from playwright.async_api import async_playwright

import harness
import seedlib


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    args.directory.mkdir(exist_ok=True, parents=True)
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=os.environ.get("AUDIT_CHROMIUM", "/usr/bin/chromium"),
                                          args=harness.LAUNCH_ARGS)
        try:
            page = await browser.new_page(viewport={"width": 390, "height": 760}, has_touch=True, is_mobile=True)
            page.on("pageerror", lambda error: errors.append(str(error)))
            seed = json.dumps(seedlib.boss_seed(5))
            await page.add_init_script(f"""const seed = {seed}; seed.lastSavedAt = Date.now();
              localStorage.setItem('{seedlib.SAVE_KEY}', JSON.stringify(seed));""")
            await page.goto(args.url, wait_until="domcontentloaded")
            start = time.monotonic()
            while time.monotonic() - start < 420:
                state = await page.evaluate("""() => {
                  const s = window.__gamesync3d;
                  return {towers: s?.towerAnims.size, placed: s?.state.towers.length,
                    pending: s?.placing.size, models: window.__m3dlog?.slice(-1),
                    mapError: document.querySelector('.world-error')?.textContent};
                }""")
                if (state.get("towers") or 0) >= 8:
                    break
                print("Waiting for placed tower meshes", state, flush=True)
                await page.wait_for_timeout(4000)
            else:
                raise RuntimeError(f"seeded scene did not load: {state}; page errors: {errors}")
            # Attach to actual render submissions. Sample mesh world matrices,
            # not camera motion, inactive model nodes or the animation registry.
            await page.evaluate("""() => {
              const s = window.__gamesync3d;
              const rec = window.__submitted = {shots: 0, maxLaunchError: 0, cannonShots: 0, maxYawErrorDeg: 0, sinkingShips: 0, sinkingFrames: 0, families: {}};
              const sinking = new Set();
              const move = s.stepMotion.bind(s);
              s.stepMotion = (...args) => {
                for (const d of s.dying) {
                  sinking.add(d.ent.obj.uuid);
                  if (d.t > 0) rec.sinkingFrames++;
                }
                rec.sinkingShips = sinking.size;
                return move(...args);
              };
              const dispatch = s.dispatchShotFx.bind(s);
              s.dispatchShotFx = function(shot, ...args) {
                const rig = s.towerAnims.get(shot.slot);
                const target = s.ents.get('enemy-' + shot.targetId);
                if (rig?.kind === 'autocannon' && target?.init) {
                  const yaw = rig.yaw[0];
                  const v = target.obj.position.clone();
                  yaw.parent.worldToLocal(v).sub(yaw.position);
                  const diff = Math.atan2(v.x, v.z) - yaw.rotation.y;
                  const degrees = Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))) * 180 / Math.PI;
                  rec.maxYawErrorDeg = Math.max(rec.maxYawErrorDeg, degrees);
                  rec.cannonShots++;
                }
                return dispatch(shot, ...args);
              };
              const shoot = s.fx.shoot.bind(s.fx);
              s.fx.shoot = o => {
                shoot(o);
                const p = s.fx.projs[(s.fx.projCur.i + s.fx.projs.length - 1) % s.fx.projs.length];
                rec.shots++; rec.maxLaunchError = Math.max(rec.maxLaunchError, p.g.position.distanceTo(o.from));
              };
              window.__watchMotion = (name, root) => {
                let mesh;
                root.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
                if (!mesh) throw Error('No rendered child of '+name);
                const stat = rec.families[name] = {draws: 0, maxWorldDelta: 0};
                let first;
                const orig = mesh.onAfterRender;
                mesh.onAfterRender = function(renderer, scene, camera, ...rest) {
                  orig.call(this, renderer, scene, camera, ...rest);
                  if (camera !== s.map.camera) return;
                  const m = this.matrixWorld.elements;
                  if (!first) first = m.slice();
                  stat.draws++;
                  stat.maxWorldDelta = Math.max(stat.maxWorldDelta, ...m.map((x,i)=>Math.abs(x-first[i])));
                };
                const wp = root.getWorldPosition(s.map.camera.position.clone());
                s.map.flyTo(wp.x, wp.z, 24, 0.2);
              };
              const tower = [...s.towerAnims.values()].find(t => t.kind === 'autocannon');
              window.__watchMotion('autocannon', tower.rc[0].obj);
            }""")
            for name in ("autocannon", "dock"):
                if name == "dock":
                    await page.wait_for_function("window.__gamesync3d.genericAnims.get('bld-dock')?.some(n => n.name === 'anim:trolley')", timeout=90000)
                    await page.evaluate("""() => window.__watchMotion('dock',
                      window.__gamesync3d.genericAnims.get('bld-dock').find(n => n.name === 'anim:trolley').obj)""")
                for _ in range(80):
                    await page.evaluate(harness.DISMISS_BULLETIN_JS)
                    ready = await page.evaluate("""name => {
                      const r = window.__submitted, st = r.families[name];
                      return r.shots > 0 && st.draws > 2 && st.maxWorldDelta > .001;
                    }""", name)
                    if ready:
                        break
                    await page.wait_for_timeout(800)
                await page.screenshot(path=args.directory / f"{name}.jpg", type="jpeg", quality=80)
            result = await page.evaluate("""() => ({...window.__submitted,phase:window.__gamesync3d.state.phase,
              battleSeconds:window.__gamesync3d.state.battle?.elapsed,
              scripts:[...document.scripts].filter(s=>s.src).map(s=>new URL(s.src).pathname).sort()})""")
            result["pageErrors"] = errors
            print(json.dumps(result, indent=2))
            (args.directory / "metrics.json").write_text(json.dumps(result, indent=2) + "\n")
            assert not errors and result["shots"] > 0
            assert all(v["draws"] > 2 and v["maxWorldDelta"] > .001 for v in result["families"].values())
            assert result["cannonShots"] > 0 and result["maxYawErrorDeg"] < .1, "autocannon facing away at launch"
            assert result["maxLaunchError"] < .0001, "pooled projectile was visible away from its muzzle"
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
