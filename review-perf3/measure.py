#!/usr/bin/env python3
"""PERF3 measure: probe-protocol opening sampling (perfInfo median of 6,
fresh-player seed, settled camera — same as attrib.py), plus visual proof:
  - partition-invariant terrain face-multiset hash (identical iff the face
    set is unchanged, regardless of tile partitioning),
  - VIS2-style tile checksum (count/tris/s1) for the record,
  - opening frame PNG via the __hormuzFrameHook readPixels path,
  - shadow A/B: sun.castShadow off for one frame -> % pixels changed +
    mean |dRGB| (QA-VIS2 reference: 1.40% / 1.68 on the merged base).

Usage: measure.py <tag> <port>
"""
import asyncio, base64, json, os, subprocess, sys, time

os.environ.setdefault("AUDIT_PROFILE", os.path.expanduser("~/.cache/hormuz-audit-profile-perf3"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "audit"))
import harness  # noqa: E402
import seedlib  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))
TAG = sys.argv[1] if len(sys.argv) > 1 else "base"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 3425
BASE = f"http://localhost:{PORT}"

SAMPLE_JS = "() => window.__gamesync3d.perfInfo()"

FACEHASH_JS = """() => {
  const terr = window.__gamesync3d.map.scene.getObjectByName('terrain');
  if (!terr) return { error: 'no terrain' };
  const faces = [];
  let tris = 0;
  for (const tile of terr.children) {
    const g = tile.geometry; const pos = g.attributes.position; const idx = g.index.array;
    for (let f = 0; f < idx.length; f += 3) {
      const pts = [];
      for (const vi of [idx[f], idx[f+1], idx[f+2]])
        pts.push([Math.round(pos.getX(vi)*1000), Math.round(pos.getY(vi)*1000), Math.round(pos.getZ(vi)*1000)]);
      pts.sort((a, b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2]);
      faces.push(pts.flat().join(','));
      tris++;
    }
  }
  faces.sort();
  let h1 = 0, h2 = 0;
  const joined = faces.join(';');
  for (let i = 0; i < joined.length; i++) {
    const c = joined.charCodeAt(i);
    h1 = (h1 * 31 + c) % 4294967296;
    h2 = (h2 * 131 + c + i) % 4294967296;
  }
  return { tiles: terr.children.length, tris, hash: h1 + '/' + h2, chars: joined.length };
}"""

CHECKSUM_JS = """() => {
  const m = window.__map3d;
  let count = 0, tris = 0, s1 = 0;
  m.scene.traverse(o => {
    if (o.parent && o.parent.name === 'terrain' && o.geometry) {
      const p = o.geometry.attributes.position;
      count += p.count;
      const idx = o.geometry.index;
      tris += (idx ? idx.count : p.count) / 3;
      for (let i = 0; i < p.count; i++) s1 += p.getX(i) * (i + 1) + p.getY(i) * (i + 7) + p.getZ(i) * (i + 13);
    }
  });
  return { count, tris, s1: Math.round(s1 * 1000) / 1000 };
}"""

HOOK_PNG_JS = """() => {
  window.__capFrame = null;
  const cv = document.createElement('canvas');
  window.__hormuzFrameHook = () => {
    try {
      const map = window.__gamesync3d.map;
      const gl = map.renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d');
      const img = cx.createImageData(w, h);
      const row = w * 4;
      for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
      cx.putImageData(img, 0, 0);
      window.__capFrame = cv.toDataURL('image/png');
    } catch (e) { window.__capFrame = 'ERR:' + e.message; }
  };
  return 'hook-set';
}"""

HOOK_PX_JS = """(slot) => {
  window.__hormuzFrameHook = () => {
    try {
      const gl = window.__gamesync3d.map.renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      window[slot] = { px, w, h };
    } catch (e) { window[slot] = { error: String(e) }; }
  };
  return 'armed-' + slot;
}"""

DELTA_JS = """() => {
  const A = window.__pxA, B = window.__pxB;
  if (!A || !B || A.error || B.error) return { error: 'missing', A: A && A.error, B: B && B.error };
  if (A.w !== B.w || A.h !== B.h) return { error: 'size mismatch' };
  let changed = 0, changed10 = 0, sum = 0; const n = A.w * A.h;
  for (let i = 0; i < n * 4; i += 4) {
    const d = Math.abs(A.px[i]-B.px[i]) + Math.abs(A.px[i+1]-B.px[i+1]) + Math.abs(A.px[i+2]-B.px[i+2]);
    if (d > 0) changed++;
    if (d > 10) changed10++;
    sum += d / 3;
  }
  return { pixels: n, pctChanged: Math.round(changed / n * 10000) / 100,
           pctChangedGt10: Math.round(changed10 / n * 10000) / 100,
           meanAbsDRGB: Math.round(sum / n * 100) / 100 };
}"""


async def ev(pg, js, timeout=120):
    try:
        return await asyncio.wait_for(pg.evaluate(js), timeout=timeout)
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:200]}


async def wait_slot(pg, slot, timeout=90):
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        v = await ev(pg, f"() => !!window.{slot}")
        if v is True:
            return True
        await pg.wait_for_timeout(1500)
    return False


async def main():
    res = {"tag": TAG}
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

                samples = []
                for _ in range(6):
                    s = await ev(pg, SAMPLE_JS)
                    if s and s.get("tris", 0) > 0:
                        samples.append(s)
                    await pg.wait_for_timeout(2000)
                res["perf_samples"] = samples
                res["perf_median_tris"] = harness.median([s["tris"] for s in samples]) if samples else None
                print("perf median:", res["perf_median_tris"], flush=True)

                res["facehash"] = await ev(pg, FACEHASH_JS, timeout=300)
                print("facehash:", res["facehash"], flush=True)
                res["tile_checksum"] = await ev(pg, CHECKSUM_JS, timeout=300)
                print("tile checksum:", res["tile_checksum"], flush=True)
                res["sun_cast"] = await ev(pg, "() => window.__gamesync3d.map.sun.castShadow")

                # opening frame PNG
                await ev(pg, HOOK_PNG_JS)
                if await wait_slot(pg, "__capFrame"):
                    data = await ev(pg, "() => window.__capFrame")
                    if isinstance(data, str) and data.startswith("data:image"):
                        path = os.path.join(HERE, f"frame-{TAG}.png")
                        open(path, "wb").write(base64.b64decode(data.split(",", 1)[1]))
                        res["frame_png"] = path
                        print("frame saved", path, flush=True)
                await ev(pg, "() => { window.__hormuzFrameHook = undefined; }")

                # shadow A/B: frame A shadows on, frame B sun.castShadow=false
                await pg.evaluate("() => { window.__pxA = null; window.__pxB = null; }")
                await pg.evaluate(HOOK_PX_JS, "__pxA")
                got_a = await wait_slot(pg, "__pxA")
                await pg.evaluate("() => { window.__gamesync3d.map.sun.castShadow = false; }")
                await pg.evaluate(HOOK_PX_JS, "__pxB")
                got_b = await wait_slot(pg, "__pxB")
                await pg.evaluate("() => { window.__gamesync3d.map.sun.castShadow = true; window.__hormuzFrameHook = undefined; }")
                res["shadow_ab_got"] = [got_a, got_b]
                if got_a and got_b:
                    res["shadow_delta"] = await ev(pg, DELTA_JS)
                print("shadow delta:", res.get("shadow_delta"), flush=True)

                await harness.safe_close(pg)
            finally:
                await harness.safe_close(ctx)
    finally:
        server.terminate()
    json.dump(res, open(os.path.join(HERE, f"measure-{TAG}.json"), "w"), indent=1)
    print("WROTE", f"measure-{TAG}.json", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
