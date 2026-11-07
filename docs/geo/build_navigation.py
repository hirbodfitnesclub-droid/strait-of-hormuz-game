import json, numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

d = json.load(open('/home/hatch/workspace/hormuz-astra5/docs/geo/map-geo-theater.json'))
W, H = d['_meta']['world']['w'], d['_meta']['world']['h']
img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(img)
def is_point(o): return isinstance(o, list) and len(o) == 2 and all(isinstance(v, (int, float)) for v in o)
def walk(o):
    if is_point(o): return
    if isinstance(o, list) and o and is_point(o[0]): yield o; return
    if isinstance(o, list):
        for c in o: yield from walk(c)
for key, polys in d.items():
    if key.startswith(('tss', '_')): continue
    for ring in walk(polys):
        if len(ring) > 2: dr.polygon([(p[0], p[1]) for p in ring], fill=255)
land = np.array(img) > 0
dist = distance_transform_edt(~land)  # water clearance in world units

CELL = 5
gw, gh = W // CELL, H // CELL
cells = land[:gh * CELL, :gw * CELL].reshape(gh, CELL, gw, CELL)
mask = [''.join('#' if cells[y, :, x].mean() > 0.34 else '.' for x in range(gw)) for y in range(gh)]

def lane_check(name):
    pts = d[name]
    flat = []
    def w2(o):
        if is_point(o): flat.append(o); return
        if isinstance(o, list):
            for c in o: w2(c)
    w2(pts)
    bad, minclr = 0, 1e9
    for x, y in flat[::2]:
        xi, yi = int(x), int(y)
        if 0 <= xi < W and 0 <= yi < H:
            if land[yi, xi]: bad += 1
            minclr = min(minclr, float(dist[yi, xi]))
    return len(flat), bad, round(minclr, 1)

out = {'world': {'w': W, 'h': H}, 'cell': CELL, 'grid': {'w': gw, 'h': gh}, 'mask': mask,
       'waterPct': round(float((~land).mean()) * 100, 1)}
for name in ('tss_inbound', 'tss_outbound'):
    n, bad, clr = lane_check(name)
    out[name] = {'points': n, 'onLand': bad, 'minClearance': clr}
    print(name, 'points', n, 'onLand', bad, 'minClearance', clr)
json.dump(out, open('/home/hatch/workspace/hormuz-astra5/docs/geo/navigation-theater.json', 'w'))
print('nav saved; water %:', out['waterPct'], 'grid:', gw, 'x', gh)
