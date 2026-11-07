import json, math, heapq, numpy as np
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
dist = distance_transform_edt(~land)
CELL = 5; gw, gh = W // CELL, H // CELL
clear_g = np.zeros((gh, gw))
for gy in range(gh):
    for gx in range(gw):
        clear_g[gy, gx] = dist[gy * CELL:(gy + 1) * CELL, gx * CELL:(gx + 1) * CELL].min()
passable = clear_g >= 11.0

def astar(start, goal, avoid=None):
    def h(a, b): return math.hypot(a[0] - b[0], a[1] - b[1])
    openh = [(h(start, goal), 0.0, start)]; came = {start: None}; cost = {start: 0.0}
    while openh:
        f, g, cur = heapq.heappop(openh)
        if cur == goal: break
        if g > cost.get(cur, 1e18): continue
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == dy == 0: continue
                nx, ny = cur[0] + dx, cur[1] + dy
                if not (0 <= nx < gw and 0 <= ny < gh) or not passable[ny, nx]: continue
                step = math.hypot(dx, dy) * (1.0 + 14.0 / (clear_g[ny, nx] + 4.0))  # hug deep water
                if avoid is not None:
                    ax, ay = avoid[ny, nx]
                    step += 2.2 * math.exp(-((ax) ** 2 + (ay) ** 2) / (2 * 4.0 ** 2)) if False else 0.0
                ng = g + step
                if ng < cost.get((nx, ny), 1e18):
                    cost[(nx, ny)] = ng; came[(nx, ny)] = cur
                    heapq.heappush(openh, (ng + h((nx, ny), goal), ng, (nx, ny)))
    if goal not in came: return None
    path, cur = [], goal
    while cur: path.append(cur); cur = came[cur]
    return path[::-1]

def flat(o):
    r = []
    def w2(x):
        if is_point(x): r.append(x); return
        if isinstance(x, list):
            for c in x: w2(c)
    w2(o); return r

orig = flat(d['tss_inbound'])
seeds = [(x, y) for x, y in orig if 0 <= int(x) < W and 0 <= int(y) < H and dist[int(y), int(x)] >= 16]
print('orig points:', len(orig), 'safe seeds:', len(seeds))
def best_point(x0, x1, y0, y1):
    sub = dist[y0:y1, x0:x1]
    i = int(np.argmax(sub)); y, x = np.unravel_index(i, sub.shape)
    return (x0 + int(x), y0 + int(y)), float(sub[y, x])
entry, ec = best_point(10, 220, 480, 1150)      # western Gulf open water
exitp, xc = best_point(1560, W - 10, 880, H - 10)  # Gulf of Oman open water
print('entry', entry, 'clearance', round(ec, 1), '| exit', exitp, 'clearance', round(xc, 1))
assert ec > 40 and xc > 40
stops = [entry] + seeds + [exitp]
cells_path = []
for a, b in zip(stops, stops[1:]):
    sa = (int(a[0]) // CELL, int(a[1]) // CELL); sb = (int(b[0]) // CELL, int(b[1]) // CELL)
    seg = astar(sa, sb)
    assert seg, f'A* failed {a}->{b}'
    cells_path += seg[1:] if cells_path else seg
world = [(x * CELL + 2.5, y * CELL + 2.5) for x, y in cells_path]
# simplify: keep points >=35u apart + endpoints
simp = [world[0]]
for p in world[1:]:
    if math.hypot(p[0] - simp[-1][0], p[1] - simp[-1][1]) >= 35: simp.append(p)
simp.append(world[-1])

def verify(pts, step=2.0):
    bad, minclr, total = 0, 1e9, 0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        L = math.hypot(x2 - x1, y2 - y1); n = max(2, int(L / step))
        for i in range(n + 1):
            x, y = x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n
            xi, yi = int(x), int(y); total += 1
            if not (0 <= xi < W and 0 <= yi < H) or land[yi, xi]: bad += 1
            elif dist[yi, xi] < minclr: minclr = float(dist[yi, xi])
    return total, bad, round(minclr, 1)

n, bad, clr = verify(simp)
print('LANE_IN simplified points:', len(simp), '| samples:', n, 'onLand:', bad, 'minClearance:', clr)
assert bad == 0 and clr >= 10, 'lane verification FAILED'

out = json.load(open('/home/hatch/workspace/hormuz-astra5/docs/geo/navigation-theater.json'))
out['lane_in'] = [[round(x, 1), round(y, 1)] for x, y in simp]
out['lane_out'] = [[round(x, 1), round(y, 1)] for x, y in reversed(simp)]  # offset applied at engine level via lane separation
out['laneVerification'] = {'samples': n, 'onLand': bad, 'minClearance': clr}
json.dump(out, open('/home/hatch/workspace/hormuz-astra5/docs/geo/navigation-theater.json', 'w'))
print('lanes written to navigation-theater.json')
