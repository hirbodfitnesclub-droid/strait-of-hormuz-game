# PERF3 — Opening-view triangle budget fix (D-020 gate B-1)

- Team: PERF3 (second dispatch). Branch: `fix2/perf3`, base `origin/main @ 2aafce1`.
- Blocker: INT-RUN B-1 — audit2 heat probe `heat.tris_budget` FAIL on merged tree:
  819,592 and 804,871 drawn tris vs ≤ 800,000 budget (probe protocol).
- Target: ≤ 760,000 by the probe protocol, two runs, no visible regression.
- Manager constraint: budget NOT raised; shadows must stay visibly present (D-025);
  PERF2 ladder/cap/freeze untouched; ship models not degraded (D-012).

## Surviving data from dispatch 1 (census-out.json, same base)

- Baseline perfInfo sampling (their protocol variant): median 792,923 tris, ~1,271 calls.
- E2 (castShadow=false on ALL 1,478 caster meshes): 637,728 tris, 603 calls →
  **shadow pass ≈ 155k tris / ~668 calls** of the opening view cost.
- E1 (map.sun.castShadow=false) saved only ~15k — explained: `hormuz-map.js` setTime
  re-assigns `this.sun.castShadow = night < 0.9` every frame, undoing the toggle.
  Only the sun casts shadows (line 2530); moon castShadow=false (VIS2, deliberate).
- Scene census: 1,403,720 tris scene graph, 4,069 objects. Census frustum flags are
  crude (bounding spheres) — attribution below is done in probe currency instead.

## Attribution (probe currency, live toggles — review-perf3/attrib.py on base build)

Baseline opening view (fresh-player seed, settled camera at (85, 68.96, 78.2),
target (85,0,-20)): median **793,985 tris / ~1,271 calls** (attrib sampling;
measure.py base run: 793,693 — INT-RUN's probe-protocol readings on the same
tree were 804,871 / 819,592, i.e. the probe reads ~10–25k higher).

| Toggle (restore-after-each) | Median tris | Δ vs baseline | Meaning |
|---|---|---|---|
| casters_all_off | 637,752 | −156,233 | whole shadow pass |
| terrain_off | 319,752 | **−474,233** | terrain color pass — the dominant cost |
| statics_off (towers/buildings/slots) | 616,070 | −177,915 | incl. their shadow renders |
| dyn_off (ships/FX/sprites) | 720,550 | −73,435 | |
| map_props_off (scenery groups) | 679,120 | −114,865 | |
| casters r<0.75 off | 743,268 | −50,717 | small-caster shadow trim curve |
| casters r<1.25 off | 724,642 | −69,343 | |
| casters r<2.0 off | 708,594 | −85,391 | |
| casters r<3.0 off | 704,594 | −89,391 | saturates — big casters dominate |

Terrain tile simulation (bounding-sphere frustum test vs the live opening
camera, faces rebuilt from the live tile geometries — 1,089,440 faces total):
4×3 (current) draws 454,080 · 6×4 → 317,319 · **8×6 → 204,270** · 12×9 →
181,573 · 16×12 → 158,895. (Live terrain-off delta 474,233 ≈ sim's 4×3
figure, so the sim tracks reality.)

Note: the live terrain face total is 1,089,440 (tile checksum on the merged
tree: count 551,600 / tris 1,089,440 / s1 327,635,191,123.251) — the older
506,400-tri figure in earlier reports does not reproduce on this tree; the
partition-invariant face-multiset hash below is the identity proof used here
(it is independent of both the total and the partitioning).

## Levers chosen

1. **Terrain tiling 4×3 → 8×6** (`src/three-map/hormuz-map.js`, buildTerrainMesh).
   PERF2's own mechanism, extended: the split shares the EXACT same
   vertices/normals/colors (normals computed on the full grid before the
   split), so the rendered image is identical by construction — only the
   draw partitioning gets finer and frustum culling can drop off-frame
   tiles. Expected saving ≈ −250k tris at the opening framing. Zero visual
   risk; no shadow, ship, ladder, cap or probe code touched.
2. Caster trim (r<1.25, −69k) held in reserve — only if lever 1 alone does
   not reach ≤760k by the official probe.

## Proof

- **Measure (measure.py, same protocol both builds):**
  - perfInfo median of 6, opening view: base **793,693** → after **531,711**
    (−261,983; the tile sim predicted ≈ −250k).
  - **Face-multiset hash IDENTICAL**: 1194464356/1227585802, 1,089,440 faces
    in both; tiles 12 → 48. The rendered terrain geometry is provably the
    same face set — the image cannot change. (Tile-vertex count 551,600 →
    557,616: border duplication grows ~1.1% with the finer grid; tris
    identical.)
  - Shadow A/B (sun.castShadow off for one frame, same method both builds):
    pixels changing by >10 RGB-sum: base 3.61% → after **4.09%**; mean
    |ΔRGB| 1.02 → 0.79. Same magnitude — cast shadows remain fully present
    (lever 1 touches no shadow code, no casters, no materials). QA-VIS2's
    1.40% figure used their own freeze/threshold; the same-method
    before/after control here is the comparison that isolates this change.
  - Frames: frame-base.png / frame-after.png (readPixels via frame hook,
    opening framing; ambient traffic positions differ between captures).
- **Battle view (battle.py, probe_heat's own battle seed — cannon T3 vs
  parked destroyers — perfInfo median of 6, settled battle camera):**
  base build (wt2-intrun out/, 37e713a, same terrain code) **856,190 tris /
  1,978 calls** → after **589,195 tris / 1,934 calls**. Battle view improved
  −31%; no regression.
- **tsc:** `npx tsc --noEmit` = 0.
- **Official audit2 heat probe ×2 (the gate): BOTH GREEN.**
  - Run 1 (full audit2, port 3427): `heat.tris_budget` PASS — **527,999 tris**
    (calls 1255, DPR 1); all 4 heat assertions PASS. Same run: amplitude
    **19/19 PASS**, wave3 **2/2 PASS** (7/7 attempts, both lines), i5 PASS —
    run total **26 pass / 0 fail** (review-perf3/audit2-full.json).
  - Run 2 (heat-only, port 3428): **4/4 PASS** — `heat.tris_budget`
    **522,359 tris** (review-perf3/heat-run2.json).
  - Both readings are ≤ the 760,000 target with ~233k headroom and ≤ the
    800,000 D-020 budget with ~273k headroom. Base readings on the same
    protocol were 804,871 / 819,592 (INT-RUN) — a ~285k improvement.
- Caster trim NOT needed — lever 1 alone overshoots the ≤760k target by
  ~200k in sampling currency, so no shadow-affecting change was made at all.

## Status log

- Round 2 started: census re-analyzed; probe protocol read (probe_heat.py samples
  gamesync.perfInfo() = renderer.info.render, 6 samples, median, fresh-player seed,
  settled opening view).
- Fresh `out/` build completed in the worktree (rm -rf out && build-android-web.mjs).
- Official baseline heat probe (port 3423, own AUDIT_PROFILE) ran ~28 min but the VM
  rebooted mid-run (battle section) before any result was written — no baseline JSON.
  Attribution run (review-perf3/attrib.py: probe-protocol opening sampling + restore-
  after-each toggles + terrain tile-grid simulation) launched; the official probe is
  reserved for the two final proof runs.
- Attribution complete: terrain color pass = 474k of the ~794k opening view;
  tile sim predicted 8×6 saves ≈250k. Lever chosen: terrain tiling 4×3 → 8×6
  only (zero visual risk); caster trim held in reserve and NOT needed.
- measure.py before/after: 793,693 → 531,711; face-multiset hash identical;
  shadow A/B comparable (3.61% → 4.09% >10-band); frames visually identical.
- battle.py (probe_heat battle seed): base 856,190 → after 589,195 tris.
- tsc --noEmit = 0. Full audit2 on branch: 26 pass / 0 fail (heat 527,999).
  Heat-only confirmation run: 4/4 PASS (522,359). DONE — branch ready for
  the independent spot-check; no self-approval claimed.
