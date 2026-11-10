#!/usr/bin/env python3
"""PERF3 round-2 attribution: live toggles in probe currency (perfInfo)
on the opening peace view (fresh-player seed, settled camera), plus
pure-math simulations (finer terrain tiling, caster radius histogram).
"""
import asyncio, json, os, subprocess, sys, time

os.environ.setdefault("AUDIT_PROFILE", os.path.expanduser("~/.cache/hormuz-audit-profile-perf3"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "audit"))
import harness  # noqa: E402
import seedlib  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))
PORT = 3424
BASE = f"http://localhost:{PORT}"
CENSUS_JS = open(os.path.join(HERE, "CENSUS_JS.js")).read()

SAMPLE_JS = "() => window.__gamesync3d.perfInfo()"


async def ev(pg, js, timeout=120):
    try:
        return await asyncio.wait_for(pg.evaluate(js), timeout=timeout)
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:200]}


async def samples(pg, n=3, gap=1500):
    out = []
    for _ in range(n):
        s = await ev(pg, SAMPLE_JS)
        if s and s.get("tris", 0) > 0:
            out.append(s)
        await pg.wait_for_timeout(gap)
    return out


def med(samples_):
    return harness.median([s["tris"] for s in samples_]) if samples_ else None


async def exp(pg, res, name, apply_js, restore_js):
    await ev(pg, apply_js)
    await pg.wait_for_timeout(1200)
    s = await samples(pg, 3)
    res[name] = {"median": med(s), "samples": s}
    print(f"{name}: {res[name]['median']}", flush=True)
    if restore_js:
        await ev(pg, restore_js)
        await pg.wait_for_timeout(1200)


async def main():
    res = {}
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(REPO, "out")],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        await asyncio.sleep(1.0)
        async with async_playwright() as pw:
            ctx = await harness.open_context(pw)
            try:
                pg, errors = await harness.open_seeded_page(
                    ctx, BASE, seedlib.seed_js(seedlib.fresh_player_seed()), model_wait=300.0)
                res["page_errors"] = errors[:3]
                # settle camera
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
                base = await samples(pg, 6, gap=2000)
                res["baseline"] = {"median": med(base), "samples": base}
                print("baseline:", res["baseline"]["median"], flush=True)

                # E-cast: all casters off (shadow pass total)
                await exp(pg, res, "casters_all_off",
                          """() => { const sc = window.__gamesync3d.map.scene; let n=0;
                             sc.traverse(o => { if (o.isMesh && o.castShadow) { o.userData.__p3 = 1; o.castShadow = false; n++; } });
                             return n; }""",
                          """() => { const sc = window.__gamesync3d.map.scene;
                             sc.traverse(o => { if (o.userData.__p3) { o.castShadow = true; delete o.userData.__p3; } }); }""")

                # E-terrain: terrain group invisible
                await exp(pg, res, "terrain_off",
                          """() => { const t = window.__gamesync3d.map.scene.getObjectByName('terrain'); if (t) t.visible = false; return !!t; }""",
                          """() => { const t = window.__gamesync3d.map.scene.getObjectByName('terrain'); if (t) t.visible = true; }""")

                # E-statics / E-dyn off
                await exp(pg, res, "statics_off",
                          """() => { const t = window.__gamesync3d.map.scene.getObjectByName('gamesync-statics'); if (t) t.visible = false; return !!t; }""",
                          """() => { const t = window.__gamesync3d.map.scene.getObjectByName('gamesync-statics'); if (t) t.visible = true; }""")
                await exp(pg, res, "dyn_off",
                          """() => { const t = window.__gamesync3d.map.scene.getObjectByName('gamesync-dyn'); if (t) t.visible = false; return !!t; }""",
                          """() => { const t = window.__gamesync3d.map.scene.getObjectByName('gamesync-dyn'); if (t) t.visible = true; }""")

                # E-scenery: every other direct scene child (map props) off, one group at a time is slow;
                # combined first: all scene children except terrain, gamesync-root, lights, water-ish meshes
                res["scene_children"] = await ev(pg, """() => {
                  const sc = window.__gamesync3d.map.scene;
                  return sc.children.map((c, i) => ({ i, name: c.name || '', type: c.type, kids: c.children ? c.children.length : 0 }));
                }""")
                await exp(pg, res, "map_props_off",
                          """() => { const sc = window.__gamesync3d.map.scene; window.__p3props = [];
                             for (const c of sc.children) {
                               if (c.name === 'terrain' || c.name === 'gamesync-root') continue;
                               if (c.isLight || c.isCamera) continue;
                               window.__p3props.push(c); c.visible = false;
                             } return window.__p3props.length; }""",
                          """() => { for (const c of window.__p3props || []) c.visible = true; window.__p3props = []; }""")

                # E-radius: casters with world radius < threshold off
                for t in (0.75, 1.25, 2.0, 3.0):
                    await exp(pg, res, f"casters_r_lt_{t}",
                              f"""() => {{ const sc = window.__gamesync3d.map.scene; let n = 0, tris = 0;
                                 sc.traverse(o => {{
                                   if (!o.isMesh || !o.castShadow || o.isInstancedMesh) return;
                                   const g = o.geometry; if (!g) return;
                                   if (!g.boundingSphere) g.computeBoundingSphere();
                                   const e = o.matrixWorld.elements;
                                   const sc_ = Math.max(Math.hypot(e[0],e[1],e[2]), Math.hypot(e[4],e[5],e[6]), Math.hypot(e[8],e[9],e[10]));
                                   const rad = (g.boundingSphere ? g.boundingSphere.radius : 0) * sc_;
                                   if (rad < {t}) {{ o.userData.__p3 = 1; o.castShadow = false; n++;
                                     tris += Math.round((g.index ? g.index.count : g.attributes.position.count) / 3); }}
                                 }});
                                 return {{ n, tris }}; }}""",
                              """() => { const sc = window.__gamesync3d.map.scene;
                                 sc.traverse(o => { if (o.userData.__p3) { o.castShadow = true; delete o.userData.__p3; } }); }""")

                # census (structure + frustum math) for the tiling simulation inputs
                await ev(pg, CENSUS_JS)
                res["census"] = await ev(pg, "() => window.__census()")

                # tiling simulation: rebuild face list from live tile geometries,
                # bucket by candidate grids, sphere-test vs live camera frustum.
                res["tile_sim"] = await ev(pg, """() => {
                  const s = window.__gamesync3d; const map = s.map; const cam = map.camera;
                  const terr = map.scene.getObjectByName('terrain');
                  if (!terr) return { error: 'no terrain' };
                  // frustum planes from camera (pure math)
                  const mul = (a, b) => { const o = new Array(16).fill(0);
                    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
                      for (let k = 0; k < 4; k++) o[c*4+r] += a[k*4+r] * b[c*4+k];
                    return o; };
                  const m = mul(cam.projectionMatrix.elements, cam.matrixWorldInverse.elements);
                  const row = i => [m[i], m[4+i], m[8+i], m[12+i]];
                  const r3 = row(3); const planes = [];
                  for (const [ra, sign] of [[row(0),1],[row(0),-1],[row(1),1],[row(1),-1],[row(2),1],[row(2),-1]]) {
                    const p = [r3[0]+sign*ra[0], r3[1]+sign*ra[1], r3[2]+sign*ra[2], r3[3]+sign*ra[3]];
                    const len = Math.hypot(p[0],p[1],p[2]) || 1;
                    planes.push([p[0]/len, p[1]/len, p[2]/len, p[3]/len]);
                  }
                  const inFrustum = (cx, cy, cz, rad) => planes.every(p => p[0]*cx + p[1]*cy + p[2]*cz + p[3] >= -rad);
                  // collect all terrain faces (world coords; tiles at origin)
                  let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9;
                  const faces = [];
                  for (const tile of terr.children) {
                    const g = tile.geometry; const pos = g.attributes.position; const idx = g.index.array;
                    for (let f = 0; f < idx.length; f += 3) {
                      const cx = (pos.getX(idx[f]) + pos.getX(idx[f+1]) + pos.getX(idx[f+2])) / 3;
                      const cz = (pos.getZ(idx[f]) + pos.getZ(idx[f+1]) + pos.getZ(idx[f+2])) / 3;
                      faces.push([cx, cz, idx[f], idx[f+1], idx[f+2], pos]);
                      if (cx<minX)minX=cx; if (cx>maxX)maxX=cx; if (cz<minZ)minZ=cz; if (cz>maxZ)maxZ=cz;
                    }
                  }
                  const W = maxX-minX, H = maxZ-minZ;
                  const sim = (TX, TZ) => {
                    const buckets = new Map();
                    for (const [cx, cz] of faces) {
                      const tx = Math.min(TX-1, Math.max(0, Math.floor((cx-minX)/W*TX)));
                      const tz = Math.min(TZ-1, Math.max(0, Math.floor((cz-minZ)/H*TZ)));
                      const k = tx + tz*TX;
                      buckets.set(k, (buckets.get(k) || 0) + 1);
                    }
                    // bounding sphere per bucket needs vertex extents: second pass with positions
                    const sph = new Map();
                    for (const [cx, cz, a, b, c, pos] of faces) {
                      const tx = Math.min(TX-1, Math.max(0, Math.floor((cx-minX)/W*TX)));
                      const tz = Math.min(TZ-1, Math.max(0, Math.floor((cz-minZ)/H*TZ)));
                      const k = tx + tz*TX;
                      let s2 = sph.get(k);
                      if (!s2) { s2 = { minx:1e9,maxx:-1e9,miny:1e9,maxy:-1e9,minz:1e9,maxz:-1e9, n:0 }; sph.set(k, s2); }
                      for (const vi of [a,b,c]) {
                        const x=pos.getX(vi), y=pos.getY(vi), z=pos.getZ(vi);
                        if(x<s2.minx)s2.minx=x; if(x>s2.maxx)s2.maxx=x;
                        if(y<s2.miny)s2.miny=y; if(y>s2.maxy)s2.maxy=y;
                        if(z<s2.minz)s2.minz=z; if(z>s2.maxz)s2.maxz=z;
                      }
                      s2.n++;
                    }
                    let drawn = 0, tilesDrawn = 0;
                    for (const [k, s2] of sph) {
                      const cx=(s2.minx+s2.maxx)/2, cy=(s2.miny+s2.maxy)/2, cz=(s2.minz+s2.maxz)/2;
                      const rad = 0.5*Math.hypot(s2.maxx-s2.minx, s2.maxy-s2.miny, s2.maxz-s2.minz);
                      if (inFrustum(cx, cy, cz, rad)) { drawn += s2.n; tilesDrawn++; }
                    }
                    return { tiles: sph.size, tilesDrawn, drawnTris: drawn };
                  };
                  return { faces: faces.length, W, H,
                           g4x3: sim(4,3), g6x4: sim(6,4), g8x6: sim(8,6), g12x9: sim(12,9), g16x12: sim(16,12) };
                }""")
                print("tile_sim:", json.dumps(res["tile_sim"])[:400], flush=True)

                await harness.safe_close(pg)
            finally:
                await harness.safe_close(ctx)
    finally:
        server.terminate()
    json.dump(res, open(os.path.join(HERE, "attrib-out.json"), "w"), indent=1)
    print("WROTE attrib-out.json", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
