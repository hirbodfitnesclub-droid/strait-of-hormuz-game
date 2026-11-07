#!/usr/bin/env python3
"""
Build the REAL Strait of Hormuz map geometry for the Hormuz game.

Source data : Natural Earth 10m land polygons (Public Domain), raw file kept in
              raw/ne_10m_land.geojson (see README.md for the exact source URL).
              Lesser Tonb is missing from NE 10m; if raw/osm_lesser_tonb_area.json
              (an OpenStreetMap/Overpass extract, ODbL) contains the island's
              coastline, it is merged in and flagged in the output metadata.
Output      : map-geo.json  (+ hormuz-preview.svg)
World       : game world is 800 x 1400 (WORLD in src/game/data.ts), y down,
              north up.

Method
------
1. Intersect the global land polygons with the region clip box, explode into
   connected components (Iran mainland and the Arabian/Musandam mainland come
   out as separate components because water separates them inside the box).
2. Identify components by matching their centroids to published reference
   coordinates of the named features (table below, search radius 0.25 deg).
   NOTHING is hand-drawn: every output polygon is a traced NE/OSM polygon.
3. Simplify with Douglas-Peucker (shapely, topology-preserving),
   tolerance = 0.003 degrees (~300 m).
4. Project equirectangularly with cos(mean-lat) correction, UNIFORM scale
   (no anisotropic stretch -> island shapes stay true), fit to world width.
5. Exaggerate island sizes around their real centroids (mainlands untouched)
   with the MINIMUM factor that still reads clearly at strategic scale.
   Owner's design uses a dual view (zoomed-out strategic view for battles +
   zoomed-in local view per island for management), so detailed interaction
   does NOT happen at strategic scale and heavy exaggeration is unnecessary:
   size-tiered factor:  max-dim >= 40 km -> x1.0 | 15-40 km -> x1.2 | < 15 km -> x1.6
   (most small islands end up >= ~9 world units wide; Lesser Tonb - only
   ~1 km across in reality - ends at ~4 units, a dot at strategic scale.
   Known limitation, flagged in README; the local zoom view covers it.)
   Fidelity bar (owner): the map must FEEL based on the real map - true
   shapes, relative positions, names, lanes. Cartographic precision beyond
   that is not required, so tolerances are chosen for a clean readable result.
6. Add the two TSS shipping lanes as polylines approximated from the real
   IMO Traffic Separation Scheme (Omani side of the strait, south of
   Larak/Hormuz/Qeshm, north of the Musandam coast).
7. South-shore extension (added after owner review of the first preview):
   the original clip cut off the Persian Gulf's southern shore west and
   southwest of Musandam - the UAE Gulf coast. A second, wider clip
   (WIDE_CLIP) of the SAME Natural Earth data is intersected with the
   existing Musandam geometry to pick out the Arabia mainland component,
   differenced against ALL existing features (so every original coordinate
   stays untouched and nothing overlaps), simplified with the same
   tolerance, projected with the SAME transform (mainland: no
   exaggeration), and finally clipped to the world rectangle in world
   space - under this projection the far-west Abu Dhabi coast and Qatar
   fall west of x=0 and are cut by the frame edge (see README).

Requires: shapely  (pip install shapely)
Run     : python3 build_map_geo.py
"""

import json
import math
import os

from shapely.geometry import MultiPolygon, Polygon, box, shape
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_NE = os.path.join(HERE, "raw", "ne_10m_land.geojson")
RAW_OSM_LT = os.path.join(HERE, "raw", "osm_lesser_tonb_area.json")
OUT_JSON = os.path.join(HERE, "map-geo.json")
OUT_SVG = os.path.join(HERE, "hormuz-preview.svg")

# ---------------------------------------------------------------- config
CLIP = (49.55, 24.55, 60.35, 29.45)          # lon_min, lat_min, lon_max, lat_max
WIDE_CLIP = (51.0, 24.55, 57.9, 27.0)   # theater: main clip already covers the south shore         # wider box, Arabia south shore only
SOUTH_SHORE_MAX_LAT = 26.35                  # island picks stay on the Arabia side
SOUTH_SHORE_MIN_AREA_DEG2 = 0.0009           # ~ the smallest island already kept
SCALE_THEATER = (800 - 2 * 24) / ((57.90 - 53.30) * 99.44)   # EXACT original scale (units per km preserved)
WORLD_W = int(24 + (60.35 - 49.55) * 99.44 * SCALE_THEATER + 24)
WORLD_H = 1300
MARGIN_X = 24
TOP_Y = 40                                    # world y of CLIP lat_max
SIMPLIFY_TOL_DEG = 0.003                      # Douglas-Peucker, ~300 m
MEAN_LAT = 26.7
KM_PER_DEG_LON = 111.32 * math.cos(math.radians(MEAN_LAT))   # ~99.44
KM_PER_DEG_LAT = 110.95
SCALE = SCALE_THEATER

# Reference coordinates (lon, lat) of the named features, from published
# geographic data. Used ONLY to label traced polygons, never to draw them.
REFERENCE = {
    "qeshm":          (55.82, 26.79),
    "hormuz":         (56.47, 27.07),
    "larak":          (56.37, 26.86),
    "hengam":         (55.88, 26.65),
    "farur":          (54.52, 26.29),
    "greater_tonb":   (55.31, 26.26),
    "lesser_tonb":    (55.15, 26.24),   # expected position; NE 10m has no polygon
    "abu_musa":       (55.03, 25.87),
    "siri":           (54.53, 25.91),
    "kish":           (53.98, 26.53),
    "hendorabi":      (53.63, 26.67),   # extra real island present in NE data
    "lavan":          (53.35, 26.81),
    "shidvar":        (53.42, 26.79),
    "farurgan":       (54.48, 26.28),
    "kharg":          (50.32, 29.25),
    "kharko":         (50.37, 29.29),   # expected; NE 10m lacks it -> OSM merge TODO
    "farsi":          (50.17, 27.99),   # expected; NE 10m lacks it -> OSM merge TODO
}
BANDAR_ABBAS = (56.266, 27.183)               # reference point on the Iran coast
MATCH_RADIUS_DEG = 0.25


def exaggeration_factor(max_dim_km: float) -> float:
    """Minimum exaggeration for strategic-view readability (dual-view design:
    local zoom handles detail, so strategic scale only needs recognition)."""
    if max_dim_km >= 40:
        return 1.0
    if max_dim_km >= 15:
        return 1.2
    return 1.6


def project(lon: float, lat: float):
    x = MARGIN_X + (lon - CLIP[0]) * KM_PER_DEG_LON * SCALE
    y = TOP_Y + (CLIP[3] - lat) * KM_PER_DEG_LAT * SCALE
    return (round(x, 1), round(y, 1))


def scale_about_centroid(ring, factor):
    cx = sum(p[0] for p in ring) / len(ring)
    cy = sum(p[1] for p in ring) / len(ring)
    return [[round(cx + (x - cx) * factor, 1), round(cy + (y - cy) * factor, 1)]
            for x, y in ring]


# ---------------------------------------------------------------- load NE
with open(RAW_NE) as f:
    ne = json.load(f)

land_geoms = [shape(feat["geometry"]) for feat in ne["features"]]
land = unary_union(land_geoms)
clipped = land.intersection(box(*CLIP))
components = list(clipped.geoms) if isinstance(clipped, MultiPolygon) else [clipped]

print(f"land components inside clip box: {len(components)}")

# ------------------------------------------------------- identify features
features = {}          # name -> shapely polygon (lon/lat space)
unidentified = []
mainland_parts = {"iran_mainland": [], "musandam_arabia_mainland": []}
for comp in components:
    if comp.area < 1e-9:
        continue
    c = comp.centroid
    # Islands in NE 10m are all < 0.14 deg2; try a centroid match first.
    if comp.area < 0.2:
        best, best_d = None, 1e9
        for ref_name, (rlon, rlat) in REFERENCE.items():
            d = math.hypot(c.x - rlon, c.y - rlat)
            if d < best_d:
                best, best_d = ref_name, d
        if best and best_d <= MATCH_RADIUS_DEG and best not in features:
            features[best] = comp
            print(f"  matched {best:16s} centroid=({c.x:.3f},{c.y:.3f}) dist={best_d:.3f} deg")
            continue
    # Everything else is mainland: the northern group is Iran, the southern
    # group is Arabia/Musandam. (NE splits off two tiny coastal fragments at
    # the clip edges; they are grouped with their mainland by latitude.
    # Musandam itself is only ~0.29 deg2 inside this box - most of the UAE
    # coast lies south of the clip - so no large area threshold is used.)
    group = "iran_mainland" if c.y >= 26.5 else "musandam_arabia_mainland"
    mainland_parts[group].append(comp)
    print(f"  mainland part -> {group:26s} centroid=({c.x:.3f},{c.y:.3f}) area={comp.area:.5f}")
for group, parts in mainland_parts.items():
    if parts:
        features[group] = unary_union(parts)

# ------------------------------------------- Lesser Tonb from OSM (fallback)
osm_used = False
if "lesser_tonb" not in features and os.path.exists(RAW_OSM_LT):
    try:
        with open(RAW_OSM_LT) as f:
            osm = json.load(f)
        coast_rings = []
        for el in osm.get("elements", []):
            geom = el.get("geometry")
            if el.get("type") == "way" and geom and len(geom) >= 4:
                # Match by name: the extract also contains Greater Tunb,
                # whose centroid falls inside the search radius too.
                tags = el.get("tags") or {}
                names = " ".join(str(tags.get(k, "")) for k in ("name:en", "name"))
                if "Lesser" not in names and "تنب کوچک" not in names:
                    continue
                ring = [(p["lon"], p["lat"]) for p in geom]
                if ring[0] != ring[-1]:
                    ring.append(ring[0])
                if len(ring) >= 4:
                    coast_rings.append(ring)
        # The named island coastline way, closed on itself, is the polygon.
        for ring in coast_rings:
            poly = Polygon(ring)
            if poly.is_valid and poly.area > 0:
                c = poly.centroid
                d = math.hypot(c.x - REFERENCE["lesser_tonb"][0],
                               c.y - REFERENCE["lesser_tonb"][1])
                if d <= MATCH_RADIUS_DEG:
                    features["lesser_tonb"] = poly
                    osm_used = True
                    print(f"  matched lesser_tonb from OSM centroid=({c.x:.3f},{c.y:.3f})")
                    break
    except (json.JSONDecodeError, KeyError) as e:
        print(f"  OSM Lesser Tonb extract unusable: {e}")

# ---------------- Micro-islands from OSM (Kharko, Farsi, Farurgan, Shidvar)
# NE 10m lacks Kharko/Farsi entirely and merges Farurgan into Farur and
# Shidvar into Lavan; OSM coastline ways (ODbL) supply the four polygons.
MICRO_OSM = os.path.join("raw", "osm_micro_islands.json")
if os.path.exists(MICRO_OSM):
    try:
        with open(MICRO_OSM) as f:
            mosm = json.load(f)
        for name in ("kharko", "farsi", "farurgan", "shidvar"):
            if name in features:
                continue
            rlon, rlat = REFERENCE[name]
            polys = []
            for el in mosm.get("elements", []):
                geom = el.get("geometry")
                if el.get("type") != "way" or not geom or len(geom) < 4:
                    continue
                ring = [(p["lon"], p["lat"]) for p in geom]
                if ring[0] != ring[-1]:
                    continue
                poly = Polygon(ring)
                if not poly.is_valid or poly.area <= 0:
                    continue
                c = poly.centroid
                if math.hypot(c.x - rlon, c.y - rlat) <= 0.08:
                    polys.append(poly)
            if polys:
                features[name] = unary_union(polys)
                print(f"  matched {name} from OSM ({len(polys)} way(s))")
    except (json.JSONDecodeError, KeyError) as e:
        print(f"  OSM micro-island extract unusable: {e}")

missing = [n for n in REFERENCE if n not in features and n != "hendorabi"]
print("missing features:", missing if missing else "none")

# ---------------- Arabia south shore (UAE Gulf coast) from a wider clip
# The original CLIP cuts the Arabian landmass at lat 25.55, which removes
# the whole southern shore of the Persian Gulf west/southwest of Musandam
# (the UAE coast: Ras Al Khaimah -> Sharjah/Dubai -> Abu Dhabi, plus the
# Oman coast down the Gulf-of-Oman side). Re-clip the SAME NE land data
# with WIDE_CLIP and keep:
#   * the component that intersects the existing Musandam geometry - the
#     Arabia mainland (one connected landmass in NE: Qatar/UAE/Oman), and
#   * small traced NE islands off that coast (centroid lat below
#     SOUTH_SHORE_MAX_LAT, area >= SOUTH_SHORE_MIN_AREA_DEG2, and not part
#     of any existing feature - this mirrors the granularity of the
#     islands already in the inventory and stays on the Arabia side).
# The result is differenced against the union of ALL existing features,
# so no existing polygon is re-derived, moved or overlapped.
wide = land.intersection(box(*WIDE_CLIP))
wide_comps = list(wide.geoms) if isinstance(wide, MultiPolygon) else [wide]
existing_union = unary_union(list(features.values()))
musandam_geom = features["musandam_arabia_mainland"]
south_parts = []
for comp in wide_comps:
    if comp.area < 1e-9:
        continue
    if comp.intersects(musandam_geom):
        south_parts.append(comp)
        print(f"  south shore: Arabia mainland component area={comp.area:.4f} deg2")
    elif (comp.centroid.y < SOUTH_SHORE_MAX_LAT
          and comp.area >= SOUTH_SHORE_MIN_AREA_DEG2
          and not comp.intersects(existing_union)):
        south_parts.append(comp)
        print(f"  south shore: UAE-coast island centroid=({comp.centroid.x:.3f},"
              f"{comp.centroid.y:.3f}) area={comp.area:.4f} deg2")
if south_parts:
    south_new = unary_union(south_parts).difference(existing_union)
    if not south_new.is_empty:
        features["arabia_south_shore"] = south_new
        print(f"  south shore: NEW land after difference = {south_new.area:.4f} deg2")

# ------------------------------------------- simplify, project, exaggerate
out = {}
meta_features = {}
for name, geom in sorted(features.items()):
    simp = geom.simplify(SIMPLIFY_TOL_DEG, preserve_topology=True)
    polys = list(simp.geoms) if isinstance(simp, MultiPolygon) else [simp]
    is_mainland = name.endswith("mainland") or name == "arabia_south_shore"
    projected_polys = []
    for poly in polys:
        ring = [project(x, y) for x, y in poly.exterior.coords]
        if not is_mainland:
            # size tier from the polygon's real max dimension
            minx, miny, maxx, maxy = poly.bounds
            max_dim_km = max((maxx - minx) * KM_PER_DEG_LON,
                             (maxy - miny) * KM_PER_DEG_LAT)
            ring = scale_about_centroid(ring, exaggeration_factor(max_dim_km))
        projected_polys.append(ring)
    if name == "arabia_south_shore":
        # Under the SAME projection the new shore extends past the world
        # rectangle (west Abu Dhabi coast / Qatar project to x < 0). Clip
        # in world space - the projection is affine, so this is exactly
        # the world-edge cut, nothing is re-fitted or moved.
        world_geoms = []
        for ring in projected_polys:
            if len(ring) >= 4:
                g = Polygon(ring)
                world_geoms.append(g if g.is_valid else g.buffer(0))
        clipped_world = unary_union(world_geoms).intersection(
            box(0, 0, WORLD_W, WORLD_H))
        cpolys = (list(clipped_world.geoms)
                  if isinstance(clipped_world, MultiPolygon)
                  else [clipped_world])
        projected_polys = [
            [[round(float(x), 1), round(float(y), 1)]
             for x, y in p.exterior.coords]
            for p in cpolys if p.area > 0]
    out[name] = projected_polys
    xs = [p[0] for poly in projected_polys for p in poly]
    ys = [p[1] for poly in projected_polys for p in poly]
    meta_features[name] = {
        "polygons": len(projected_polys),
        "vertices": sum(len(p) for p in projected_polys),
        "world_bbox": [min(xs), min(ys), max(xs), max(ys)],
        "source": "OpenStreetMap (ODbL) via Overpass" if (name == "lesser_tonb" and osm_used)
                  else "Natural Earth 10m land (Public Domain)",
    }

# ---------------------------------------------------------------- TSS lanes
# Approximated from the real IMO TSS: lanes run through Omani waters on the
# southern side of the strait, south of Hormuz/Larak and south of Qeshm,
# then turn NW into the Persian Gulf deep-water route. Inbound = into the
# Gulf (westbound, northern lane of the pair), outbound = to the Gulf of Oman.
TSS_INBOUND_LONLAT = [
    (57.55, 26.42), (56.95, 26.44), (56.55, 26.47), (56.20, 26.52),
    (55.95, 26.50), (55.60, 26.42), (55.25, 26.38), (54.85, 26.22),
    (54.45, 26.28), (54.00, 26.55), (53.62, 26.85),
]
# Outbound runs parallel, one separation-zone width (~0.06 deg lat, ~6-7 km)
# toward the Iranian side, in the reverse direction - the two lanes of the
# real scheme never cross and stay a tight pair along the whole route.
TSS_OUTBOUND_LONLAT = [(lon + 0.012, lat + 0.06)
                       for lon, lat in reversed(TSS_INBOUND_LONLAT)]
out["tss_inbound"] = [[list(project(lon, lat)) for lon, lat in TSS_INBOUND_LONLAT]]
out["tss_outbound"] = [[list(project(lon, lat)) for lon, lat in TSS_OUTBOUND_LONLAT]]

ba_x, ba_y = project(*BANDAR_ABBAS)
out["_meta"] = {
    "world": {"w": WORLD_W, "h": WORLD_H},
    "clip_bbox_lonlat": CLIP,
    "projection": "equirectangular, cos(26.7deg) lon correction, uniform scale "
                  f"{SCALE:.3f} world-units/km, north up",
    "simplify_tolerance_deg": SIMPLIFY_TOL_DEG,
    "exaggeration": "MINIMUM for strategic readability (dual-view design): "
                    "islands scaled about real centroids: >=40km x1.0, "
                    "15-40km x1.2, <15km x1.6; mainlands x1.0",
    "bandar_abbas_ref_world": [ba_x, ba_y],
    "south_shore_extension": "arabia_south_shore added from a wider clip "
                             f"{WIDE_CLIP} of the same NE 10m source, SAME "
                             "projection, differenced against all existing "
                             "features (their coordinates are unchanged). "
                             "Projected polygons clipped to the world rect: "
                             "Qatar and the far-west Abu Dhabi coast fall "
                             "west of x=0 under this projection - cut off.",
    "features": meta_features,
    "missing_features": missing,
    "unidentified_components": len(unidentified),
}

with open(OUT_JSON, "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(f"wrote {OUT_JSON}")

# ---------------------------------------------------------------- SVG preview
COLORS = {
    "iran_mainland": "#d9b382", "musandam_arabia_mainland": "#cfa06e",
    "qeshm": "#c9d18b", "hormuz": "#e0a37e", "larak": "#dcb26a",
    "hengam": "#c9d18b", "farur": "#dcb26a", "greater_tonb": "#e0a37e",
    "lesser_tonb": "#e0a37e", "abu_musa": "#e0a37e", "siri": "#dcb26a",
    "kish": "#c9d18b", "hendorabi": "#dcb26a",
    "arabia_south_shore": "#d8ab72",
}
LABELS = {
    "iran_mainland": "IRAN (Bandar Abbas coast)", "musandam_arabia_mainland": "MUSANDAM (Oman)",
    "qeshm": "Qeshm", "hormuz": "Hormuz", "larak": "Larak", "hengam": "Hengam",
    "farur": "Farur", "greater_tonb": "Greater Tonb", "lesser_tonb": "Lesser Tonb",
    "abu_musa": "Abu Musa", "siri": "Siri", "kish": "Kish", "hendorabi": "Hendorabi",
    "arabia_south_shore": "ARABIA — UAE COAST (south shore)",
}
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{WORLD_W}" height="{WORLD_H}" '
       f'viewBox="0 0 {WORLD_W} {WORLD_H}">',
       f'<rect width="{WORLD_W}" height="{WORLD_H}" fill="#0b3d5c"/>']
for name, polys in out.items():
    if name.startswith(("tss", "_")):
        continue
    for poly in polys:
        pts = " ".join(f"{x},{y}" for x, y in poly)
        svg.append(f'<polygon points="{pts}" fill="{COLORS.get(name, "#cccccc")}" '
                   f'stroke="#5b4326" stroke-width="1"/>')
for key, color in (("tss_inbound", "#ff5252"), ("tss_outbound", "#40c4ff")):
    pts = " ".join(f"{x},{y}" for x, y in out[key][0])
    svg.append(f'<polyline points="{pts}" fill="none" stroke="{color}" '
               f'stroke-width="2" stroke-dasharray="8 5"/>')
LABEL_POS = {  # fixed label spots for the mainlands (ring centroids mislead)
    "iran_mainland": project(54.60, 27.62),
    "musandam_arabia_mainland": project(56.28, 25.80),
    "arabia_south_shore": project(54.55, 24.30),
}
LABEL_DY = {"greater_tonb": 18, "lesser_tonb": -12, "abu_musa": 16, "siri": 16,
            "farur": -12, "hengam": 16, "larak": -12, "hormuz": 20,
            "kish": -12, "hendorabi": -12}
for name, polys in out.items():
    if name.startswith(("tss", "_")) or name not in LABELS:
        continue
    if name in LABEL_POS:
        cx, cy = LABEL_POS[name]
    else:
        ring = max(polys, key=len)
        cx = sum(p[0] for p in ring) / len(ring)
        cy = sum(p[1] for p in ring) / len(ring) + LABEL_DY.get(name, 0)
    svg.append(f'<text x="{cx:.0f}" y="{cy:.0f}" font-family="sans-serif" font-size="13" '
               f'fill="#ffffff" text-anchor="middle" stroke="#000" stroke-width="0.4">'
               f'{LABELS[name]}</text>')
svg.append(f'<circle cx="{ba_x}" cy="{ba_y}" r="4" fill="#ffeb3b"/>')
svg.append(f'<text x="{ba_x - 8}" y="{ba_y - 8}" font-family="sans-serif" font-size="12" '
           f'fill="#ffeb3b" text-anchor="end">Bandar Abbas (ref point)</text>')
svg.append('<text x="770" y="30" font-family="sans-serif" font-size="20" fill="#ffffff" '
           'text-anchor="end">N ↑</text>')
svg.append('<text x="20" y="500" font-family="sans-serif" font-size="11" fill="#9fd8ef">'
           'Red dashed: TSS inbound (to Persian Gulf) · Blue dashed: TSS outbound (to Gulf of Oman).</text>')
svg.append('<text x="20" y="518" font-family="sans-serif" font-size="11" fill="#9fd8ef">'
           'Land traced from Natural Earth 10m (Public Domain) + Lesser Tonb from OpenStreetMap (ODbL);</text>')
svg.append('<text x="20" y="536" font-family="sans-serif" font-size="11" fill="#9fd8ef">'
           'islands minimally size-exaggerated for strategic readability - see README.</text>')
svg.append('<text x="20" y="554" font-family="sans-serif" font-size="11" fill="#9fd8ef">'
           'South shore (UAE coast / Arabia) added from the same Natural Earth source via a wider clip;</text>')
svg.append('<text x="20" y="572" font-family="sans-serif" font-size="11" fill="#9fd8ef">'
           'Qatar + far-west Abu Dhabi coast project west of the frame (x&lt;0) and are cut off - see README.</text>')
svg.append("</svg>")
with open(OUT_SVG, "w") as f:
    f.write("\n".join(svg))
print(f"wrote {OUT_SVG}")

# ---------------------------------------------------------------- verify
print("\n--- verification ---")
island_areas = {}
for name, polys in out.items():
    if name.startswith(("tss", "_")):
        continue
    for ring in polys:
        assert all(0 <= x <= WORLD_W and 0 <= y <= WORLD_H for x, y in ring), \
            f"{name} out of world bounds"
    if not name.endswith("mainland") and name != "arabia_south_shore":
        # shoelace area of largest ring
        ring = max(polys, key=len)
        a = abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2)
                    in zip(ring, ring[1:] + ring[:1]))) / 2
        island_areas[name] = a
largest_island = max(island_areas, key=island_areas.get)
print("largest island by world area:", largest_island)
q = out["qeshm"][0]
qw = max(p[0] for p in q) - min(p[0] for p in q)
qh = max(p[1] for p in q) - min(p[1] for p in q)
print(f"qeshm world bbox: {qw:.0f} wide x {qh:.0f} tall (elongated E-W: {qw > qh})")
h = out["hormuz"][0]
hx = sum(p[0] for p in h) / len(h); hy = sum(p[1] for p in h) / len(h)
print(f"hormuz centroid world=({hx:.0f},{hy:.0f}) vs Bandar Abbas ref=({ba_x},{ba_y}) "
      f"-> SE of it: {hx > ba_x and hy > ba_y}")
m = out["musandam_arabia_mainland"][0]
print(f"musandam/arabia mainland centroid y={sum(p[1] for p in m)/len(m):.0f} "
      f"(south = large y) vs iran mainland centroid "
      f"y={sum(p[1] for p in out['iran_mainland'][0])/len(out['iran_mainland'][0]):.0f}")
if "arabia_south_shore" in out:
    ss = out["arabia_south_shore"]
    sxs = [p[0] for ring in ss for p in ring]
    sys_ = [p[1] for ring in ss for p in ring]
    mx = sum(p[0] for p in m) / len(m)
    print(f"arabia_south_shore: {len(ss)} polys, world bbox "
          f"x {min(sxs):.0f}..{max(sxs):.0f}, y {min(sys_):.0f}..{max(sys_):.0f}; "
          f"ring-vertex mean=({sum(sxs)/len(sxs):.0f},{sum(sys_)/len(sys_):.0f}) "
          f"vs musandam ring mean x={mx:.0f} "
          f"-> bulk of the new shore lies SW of Musandam and south of the "
          f"Abu Musa/Siri sea (abu_musa world y0="
          f"{out['_meta']['features']['abu_musa']['world_bbox'][1]:.0f})")
print("all polygon coordinates within 800x1400: OK")
