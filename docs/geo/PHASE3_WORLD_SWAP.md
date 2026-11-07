# Phase 3 — World swap plan (prepared 2026-11-05)

## Current engine world (Astra v5)
- `src/data/navigation.json`: `{ landscape: NavMap, portrait: NavMap }`,
  `NavMap = { size, land: string, blocked: string, enemy: Point[], trade: Point[], pirate: Point[] }`.
- Coordinates are % of a square world (0–100 × 0–100) per layout. `land` = raw
  shoreline grid ('0' water / '1' land), `blocked` = dilated land for pathing.
  Grid strings are row-major, `size`×`size`. `src/lib/navigation.ts` provides
  isWater / isSurfaceWater / nearestWater / safeSegment on top.
- Backgrounds: `public/images/hormuz-map-optimized.jpg` (landscape),
  `hormuz-map-portrait-optimized.jpg` (portrait). MapScene renders bg + markers
  in % space; game distance() already compensates anisotropy (dy × 0.72).

## Target world (our theater, Phase 1 output)
- `docs/geo/map-geo-theater.json` — 18 land features, world 1813×1300 units,
  uniform scale (same as the original Sonnet build).
- `docs/geo/navigation-theater.json` — 5-unit mask grid (362×260) + verified
  A* transit lane (1,478 samples, 0 on land, min clearance 14.6u).
- Art master: `public/images/hormuz-theater.jpg` (2900×2080, ratio = world ratio).

## Conversion steps
1. **Grids**: rasterize theater polygons → per-layout grids at the engine's
   `size`; `blocked` = land dilated ~1 cell; `land` = raw.
   - landscape: full theater projected x/1813·100, y/1300·100 (non-uniform —
     consistent with the engine's anisotropic distance).
   - portrait: strait-core window (theater x ≈ 700–1813, full height) mapped
     to % space; portrait art = matching crop rendered from the same geo at
     portrait aspect (never a rescaled photo — same mask-locked recipe).
2. **Lanes** (A* on the theater mask, ≥10u clearance, densely verified —
   reuse `docs/geo/build_lanes.py` machinery with deliberate endpoints):
   - enemy: Gulf of Oman spawn (SE, off-frame) → southern channel → Bandar
     Abbas / Qeshm approach (defense target zone).
   - trade: full W↔E transit through the channel + a port branch to the
     Bandar Abbas berth (Phase 3 tanker cycle rides this branch).
   - pirate: southern Gulf loop around Abu Musa / Tonbs.
3. **Art swap**: landscape bg ← hormuz-theater.jpg; portrait bg ← portrait
   render. Keep file names or update MapScene references (check MapScene).
4. **Anchors** (Phase 4): island ids/zones/slots/building positions re-anchored
   to theater % coords from map-geo-theater.json centroids/coasts.

## Risks / notes
- The Phase-1 transit lane is a valid shipping route but its endpoints were
  auto-picked (SW/SE deep water); Phase-3 lanes must be re-run with the
  deliberate endpoints above, not copied blindly.
- Portrait window choice affects where early-game content sits; the strait
  core (Bandar Abbas–Qeshm–Hormuz–Larak) must be fully inside it.
