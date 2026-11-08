"""Scene/map regression lock — DoD map & render basics.

Verifies on the current build, through the live gamesync instance:
  1. all 29 strait slot pads exist (SLOTS in game.ts);
  2. the renderer is alive (perfInfo reports draw calls > 0) and the
     loading veil has lifted;
  3. a seeded tier-3 tower actually loads its GLB model into the scene.
MUST PASS on the current build.
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

SECTION = "§map/scene basics"

PADS_JS = """() => {
  const s = window.__gamesync3d;
  if (!s) return null;
  const pads = [...s.pads.keys()].filter(k => k >= 0);
  const perf = s.perfInfo ? s.perfInfo() : null;
  const veil = [...document.querySelectorAll('div')].some(d =>
    (d.textContent || '').includes('در حال آماده‌سازی'));
  return { pads: pads.length, padIds: pads.sort((a, b) => a - b),
           calls: perf ? perf.calls : null, fps: perf ? perf.fps : null,
           veil };
}"""

TOWER_LOADED_JS = """() => {
  const s = window.__gamesync3d;
  if (!s) return null;
  // towers Map values are records {url, obj, born, base}; obj is the
  // loaded THREE subtree (null while the GLB is still streaming in).
  const count = (o) => {
    let n = 0;
    const walk = (x) => { n++; ((x && x.children) || []).forEach(walk); };
    if (o && typeof o === 'object') walk(o);
    return n;
  };
  const out = {};
  for (const [slot, rec] of s.towers.entries()) {
    out[slot] = { url: rec && rec.url ? String(rec.url) : null,
                  descendants: rec && rec.obj ? count(rec.obj) : 0 };
  }
  return out;
}"""


async def main() -> int:
    args = report.parse_args()
    assertions: list[dict] = []
    async with async_playwright() as pw:
        ctx = await harness.open_context(pw)
        try:
            pg, errors = await harness.open_seeded_page(
                ctx, args.base_url, seedlib.seed_js(seedlib.fresh_player_seed()),
                model_wait=240.0)
            info = await pg.evaluate(PADS_JS)
            assertions.append(report.check(
                SECTION, "scene.pads29", "29 slot pads present",
                info is not None and info["pads"] == 29,
                expected=29, actual=(info or {}).get("pads"),
                detail=f"pad ids={(info or {}).get('padIds')}"))
            assertions.append(report.check(
                SECTION, "scene.render_alive", "renderer drawing, veil lifted",
                info is not None and (info["calls"] or 0) > 0 and not info["veil"],
                expected="calls > 0 and no loading veil",
                actual={"calls": (info or {}).get("calls"),
                        "fps": (info or {}).get("fps"),
                        "veil": (info or {}).get("veil")},
                detail=f"page errors: {errors[:3]}"))
            await harness.safe_close(pg)

            one = seedlib.tower_config_seed("cannon", 3, None)
            one["phase"] = "peace"
            one["idle"]["autoBattle"] = False
            slot = seedlib.HOME_SLOT["cannon"]
            try:
                pg, _ = await harness.open_seeded_page(
                    ctx, args.base_url, seedlib.seed_js(one),
                    model_wait=240.0, towers_expected=1)
                # The towers-map record appears before its GLB obj is
                # attached; poll until the model subtree actually exists.
                loaded = {}
                deadline = time.monotonic() + 180
                while time.monotonic() < deadline:
                    loaded = await pg.evaluate(TOWER_LOADED_JS) or {}
                    entry = loaded.get(str(slot)) or {}
                    if entry.get("descendants", 0) > 3:
                        break
                    await pg.wait_for_timeout(3000)
                entry = (loaded or {}).get(str(slot)) or {}
                assertions.append(report.check(
                    SECTION, "scene.tower_model", "tower GLB model loads",
                    entry.get("descendants", 0) > 3 and bool(entry.get("url")),
                    expected=f"slot {slot} record with loaded model obj",
                    actual=loaded,
                    detail="cannon tier 3 on the Bandar Abbas slot"))
                await harness.safe_close(pg)
            except Exception as exc:  # noqa: BLE001 - verdict, not a crash
                assertions.append(report.assertion(
                    SECTION, "scene.tower_model", "tower GLB model loads",
                    "fail", expected=f"slot {slot} model loaded",
                    actual=f"{type(exc).__name__}: {exc}"))
        finally:
            await harness.safe_close(ctx)
    return report.emit("probe_scene", SECTION, assertions, out_path=args.out_json)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
