import json, math, heapq, numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, binary_dilation

ROOT = '/home/hatch/workspace/hormuz-astra5'
d = json.load(open(f'{ROOT}/docs/geo/map-geo-theater.json'))
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
dist = distance_transform_edt(~land)

CELL = 5; gw, gh = W // CELL, H // CELL
clear_g = np.zeros((gh, gw))
for gy in range(gh):
    blk = dist[gy * CELL:(gy + 1) * CELL]
    for gx in range(gw):
        clear_g[gy, gx] = blk[:, gx * CELL:(gx + 1) * CELL].min()

def astar(a, b, min_clear):
    passable = clear_g >= min_clear
    sa = (int(a[0]) // CELL, int(a[1]) // CELL); sb = (int(b[0]) // CELL, int(b[1]) // CELL)
    def h(p): return math.hypot(p[0] - sb[0], p[1] - sb[1])
    openh = [(h(sa), 0.0, sa)]; came = {sa: None}; cost = {sa: 0.0}
    while openh:
        f, g, cur = heapq.heappop(openh)
        if cur == sb: break
        if g > cost.get(cur, 1e18): continue
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == dy == 0: continue
                nx, ny = cur[0] + dx, cur[1] + dy
                if not (0 <= nx < gw and 0 <= ny < gh) or not passable[ny, nx]: continue
                step = math.hypot(dx, dy) * (1.0 + 14.0 / (clear_g[ny, nx] + 4.0))
                ng = g + step
                if ng < cost.get((nx, ny), 1e18):
                    cost[(nx, ny)] = ng; came[(nx, ny)] = cur
                    heapq.heappush(openh, (ng + h((nx, ny)), ng, (nx, ny)))
    if sb not in came: return None
    path, cur = [], sb
    while cur: path.append(cur); cur = came[cur]
    return [(x * CELL + 2.5, y * CELL + 2.5) for x, y in path[::-1]]

def route(stops, min_clear=11.0, last_leg_clear=None):
    pts = []
    for i, (a, b) in enumerate(zip(stops, stops[1:])):
        mc = last_leg_clear if (last_leg_clear is not None and i == len(stops) - 2) else min_clear
        seg = astar(a, b, mc)
        assert seg, f'route failed {a}->{b} clear={mc}'
        pts += seg[1:] if pts else seg
    simp = [pts[0]]
    for p in pts[1:]:
        if math.hypot(p[0] - simp[-1][0], p[1] - simp[-1][1]) >= 30: simp.append(p)
    simp.append(pts[-1])
    return simp

def verify(pts, name, min_ok=7.0):
    bad, minclr, total = 0, 1e9, 0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        L = math.hypot(x2 - x1, y2 - y1); n = max(2, int(L / 2))
        for i in range(n + 1):
            x, y = x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n
            xi, yi = int(x), int(y); total += 1
            if not (0 <= xi < W and 0 <= yi < H) or land[yi, xi]: bad += 1
            elif dist[yi, xi] < minclr: minclr = float(dist[yi, xi])
    print(f'{name}: pts={len(pts)} samples={total} onLand={bad} minClear={round(minclr,1)}')
    assert bad == 0 and minclr >= min_ok, f'{name} FAILED verification'
    return pts

def flat(o):
    r = []
    def w2(x):
        if is_point(x): r.append(x); return
        if isinstance(x, list):
            for c in x: w2(c)
    w2(o); return r

tss = flat(d['tss_inbound'])  # east -> west order in file
seeds_we = [(x, y) for x, y in reversed(tss) if dist[int(y), int(x)] >= 16]  # west -> east
seeds_ew = list(reversed(seeds_we))
print('channel seeds W->E:', len(seeds_we))

enemy = verify(route([(1720, 1170), (1500, 950), (1300, 800), (1250, 650), (1205, 525)]), 'enemy')
trade = verify(route([(60, 1130), (400, 1080), (700, 1000), (820, 780)] + seeds_we + [(1500, 950), (1765, 1090)]), 'trade')
pirate = verify(route([(700, 1000), (920, 1090), (1180, 1010)]), 'pirate')
trade_p = verify(route([(640, 1000), (820, 780)] + seeds_we + [(1500, 950), (1765, 1090)]), 'trade-portrait')

port_route = verify(route([(1090, 560), (1123, 470)], min_clear=6.0), 'port', min_ok=5.0)
BERTH = {'landscape': (61.9, 34.6), 'portrait': (42.2, 34.6)}

PROJ = lambda x, y: (x / W * 100, y / H * 100)
LAYOUTS = {
    'landscape': {'proj': PROJ, 'lanes': {'enemy': enemy, 'trade': trade, 'pirate': pirate}},
    'portrait': {'proj': PROJ, 'lanes': {'enemy': enemy, 'trade': trade, 'pirate': pirate}},
}
SIZE = 180
out = {}
for name, lay in LAYOUTS.items():
    grid = np.zeros((SIZE, SIZE), dtype=bool)
    for j in range(SIZE):
        for i in range(SIZE):
            px, py = (i + 0.5) / SIZE * 100, (j + 0.5) / SIZE * 100
            # invert projection to theater coords
            tx, ty = px / 100 * W, py / 100 * H
            xi, yi = int(tx), int(ty)
            grid[j, i] = land[yi, xi] if 0 <= xi < W and 0 <= yi < H else True
    blocked = binary_dilation(grid, structure=np.ones((3, 3)))
    land_s = ''.join('1' if grid[j, i] else '0' for j in range(SIZE) for i in range(SIZE))
    blocked_s = ''.join('1' if blocked[j, i] else '0' for j in range(SIZE) for i in range(SIZE))
    lanes = {}
    for kind, pts in lay['lanes'].items():
        lanes[kind] = [{'x': round(lay['proj'](x, y)[0], 1), 'y': round(lay['proj'](x, y)[1], 1)} for x, y in pts]
    pl = [{'x': round(lay['proj'](x, y)[0], 1), 'y': round(lay['proj'](x, y)[1], 1)} for x, y in port_route]
    bx, by = BERTH[name]
    pl.append({'x': bx, 'y': by})
    lanes['port'] = pl
    out[name] = {'size': SIZE, 'land': land_s, 'blocked': blocked_s, **lanes}
    print(name, 'land cells:', int(grid.sum()), '/', SIZE * SIZE)
json.dump(out, open(f'{ROOT}/src/data/navigation.json', 'w'))
print('navigation.json written')

# anchors -> % per layout (for game.ts SLOTS / BuildingMarkers)
def show(label, tx, ty):
    r = [label]
    for name, lay in LAYOUTS.items():
        px, py = lay['proj'](tx, ty); r.append(f"{name}=({px:.1f},{py:.1f})")
    onland = bool(land[int(ty), int(tx)])
    print('  ', ' '.join(r), 'land' if onland else 'WATER')
print('SLOTS:')
for lbl, tx, ty in [('main-baba', 1123, 470), ('qeshm-1', 1040, 575), ('hormuz-1', 1155, 474), ('qeshm-2', 1100, 520), ('larak', 1139, 512), ('hormuz-2', 1160, 512), ('tombs', 966, 622), ('kish', 748, 573)]:
    show(lbl, tx, ty)
print('SLOTS_TS:')
SLOT_DEFS = [('main', 'بندرعباس', 1123, 470), ('main', 'بندرعباس', 1085, 462), ('main', 'بندرعباس', 1165, 455), ('main', 'بندرعباس', 1045, 470),
 ('qeshm', 'قشم', 1040, 575), ('qeshm', 'قشم', 1100, 520), ('qeshm', 'قشم', 985, 560), ('qeshm', 'قشم', 1060, 492), ('qeshm', 'قشم', 930, 600),
 ('hormuz', 'هرمز', 1155, 474), ('hormuz', 'هرمز', 1160, 512), ('hormuz', 'هرمز', 1145, 445),
 ('larak', 'لارک', 1130, 505), ('larak', 'لارک', 1125, 532),
 ('hengam', 'هنگام', 1075, 580),
 ('tombs', 'تنب', 966, 622), ('tombs', 'تنب', 943, 631),
 ('abumusa', 'ابوموسی', 920, 613), ('abumusa', 'ابوموسی', 905, 598),
 ('kish', 'کیش', 748, 573), ('kish', 'کیش', 733, 558),
 ('siri', 'سیری', 840, 673), ('farur', 'فارور', 828, 646), ('lavan', 'لاوان', 645, 522),
 ('kharg', 'خارک', 150, 76), ('kharg', 'خارک', 160, 105),
 ('jask', 'جاسک', 1368, 735), ('jask', 'جاسک', 1330, 762), ('farsi', 'فارسی', 125, 306)]
for i, (isl, lbl, tx, ty) in enumerate(SLOT_DEFS):
    px, py = PROJ(tx, ty)
    print(f'  {{ id: {i}, x: {px:.1f}, y: {py:.1f}, island: "{isl}", label: "{lbl}" }},')
print('PLATFORMS_TS:')
for i, (nm, tx, ty) in enumerate([('میدان نفتی سیری', 862, 706), ('میدان نفتی لارک', 1185, 585), ('میدان نفتی خارک', 205, 120), ('میدان نفتی جاسک', 1405, 690), ('میدان نفتی ابوموسی', 880, 655)]):
    px, py = PROJ(tx, ty)
    print(f'  {{ id: {i}, x: {px:.1f}, y: {py:.1f}, name: "{nm}" }},')
print('BUILDINGS:')
for lbl, tx, ty in [('tank', 1040, 415), ('refinery', 1010, 400), ('steel', 1175, 410), ('arms', 1205, 425), ('power', 1075, 425), ('dock', 1123, 450), ('city', 1100, 375), ('water', 1150, 440), ('oil-offshore', 1210, 590)]:
    show(lbl, tx, ty)
