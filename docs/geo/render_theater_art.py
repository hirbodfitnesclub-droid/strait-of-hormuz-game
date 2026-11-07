import json, numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter

S = 1.6
d = json.load(open('/home/hatch/workspace/hormuz-astra5/docs/geo/map-geo-theater.json'))
W = int(d['_meta']['world']['w'] * S); H = int(d['_meta']['world']['h'] * S)
land_img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(land_img)
def is_point(o): return isinstance(o, list) and len(o) == 2 and all(isinstance(v, (int, float)) for v in o)
def walk(o):
    if is_point(o): return
    if isinstance(o, list) and o and is_point(o[0]): yield o; return
    if isinstance(o, list):
        for c in o: yield from walk(c)
for key, polys in d.items():
    if key.startswith(('tss', '_')): continue
    for ring in walk(polys):
        pts = [(p[0] * S, p[1] * S) for p in ring]
        if len(pts) > 2: dr.polygon(pts, fill=255)
land = np.array(land_img) > 0
rng = np.random.default_rng(21)

# water
depth = distance_transform_edt(~land)
t = np.clip(np.sqrt(depth) / (9.0 * S), 0, 1)
deep = np.array([7, 82, 142.]); mid = np.array([15, 128, 182.]); shal = np.array([116, 212, 200.])
water = np.zeros((*land.shape, 3))
for c in range(3):
    water[..., c] = np.where(t < .42, shal[c] + (mid[c] - shal[c]) * (t / .42), mid[c] + (deep[c] - mid[c]) * ((t - .42) / .58))
bands = gaussian_filter(rng.random(land.shape), 60 * S)
water *= (0.96 + 0.06 * bands[..., None] + 0.04 * gaussian_filter(rng.random(land.shape), 6)[..., None])

# land: golden sand + richer relief; frame-clip artifact suppressed near edges
inland = distance_transform_edt(land)
n1 = gaussian_filter(rng.random(land.shape), 2.2 * S); n2 = gaussian_filter(rng.random(land.shape), 8 * S); n3 = gaussian_filter(rng.random(land.shape), 26 * S)
tex = 0.38 * n1 + 0.34 * n2 + 0.28 * n3; tex /= (tex.max() + 1e-9)
elev = (np.clip(inland / (30 * S), 0, 1) ** 0.75) * (0.45 + 0.75 * tex); elev = gaussian_filter(elev, 1.1 * S)
gy, gx = np.gradient(elev * 24.0)
light = np.array([-0.55, -0.75]); norm = np.sqrt(gx ** 2 + gy ** 2 + 1.0)
shade = np.clip((1.0 + (gx * light[0] + gy * light[1]) / norm * 0.9) * 0.60, 0.52, 1.24)
edge = np.zeros(land.shape); edge[:int(10*S), :] = 1; edge[-int(10*S):, :] = 1; edge[:, :int(10*S)] = 1; edge[:, -int(10*S):] = 1
shade = np.where(edge > 0, 1.0, shade)  # no fake relief where the frame clips land
grain = gaussian_filter(rng.random(land.shape), 0.8)
sand = np.array([230, 196, 128.]); rocky = np.array([168, 124, 74.]); dark = np.array([114, 86, 58.]); olive = np.array([146, 128, 74.])
r = np.clip(elev * 1.3, 0, 1)
landc = np.zeros((*land.shape, 3))
for c in range(3):
    base = sand[c] + (rocky[c] - sand[c]) * r
    col = base + (dark[c] - base) * np.clip((tex - .64) * 2.4, 0, 1) * r
    col = col * 0.88 + olive[c] * 0.12 * np.clip((n3 - .42) * 2.0, 0, 1)  # dry scrub patches
    landc[..., c] = col * shade * (0.94 + 0.10 * grain)
beach = land & (inland <= 3.2 * S)
landc[beach] = landc[beach] * 0.3 + np.array([242, 220, 170.]) * 0.7

img = np.where(land[..., None], landc, water)
foam = (~land) & (depth <= 1.8 * S)
img[foam] = img[foam] * 0.5 + np.array([230, 250, 246.]) * 0.5
out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
out.save('/home/hatch/workspace/hormuz-astra5/public/images/hormuz-theater.jpg', quality=90)
out.resize((1450, 1040)).save('/home/hatch/workspace/hormuz-astra5/review/theater-art-preview.png')
print('art v2 saved', out.size)
