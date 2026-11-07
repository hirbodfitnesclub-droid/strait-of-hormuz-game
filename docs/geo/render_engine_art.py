import json, numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter

ROOT = '/home/hatch/workspace/hormuz-astra5'
d = json.load(open(f'{ROOT}/docs/geo/map-geo-theater.json'))
W, H = d['_meta']['world']['w'], d['_meta']['world']['h']
def is_point(o): return isinstance(o, list) and len(o) == 2 and all(isinstance(v, (int, float)) for v in o)
def walk(o):
    if is_point(o): return
    if isinstance(o, list) and o and is_point(o[0]): yield o; return
    if isinstance(o, list):
        for c in o: yield from walk(c)
features = [(k, polys) for k, polys in d.items() if not k.startswith(('tss', '_'))]

def render(proj, iw, ih, out_path, seed):
    img0 = Image.new('L', (iw, ih), 0); dr = ImageDraw.Draw(img0)
    for key, polys in features:
        for ring in walk(polys):
            pts = [proj(p[0], p[1]) for p in ring]
            if len(pts) > 2: dr.polygon(pts, fill=255)
    land = np.array(img0) > 0
    rng = np.random.default_rng(seed)
    unit = iw / 100.0  # px per % unit (x); use for distance thresholds
    depth = distance_transform_edt(~land)
    t = np.clip(np.sqrt(depth) / (5.0 * unit * 0.16), 0, 1)
    deep = np.array([7, 82, 142.]); mid = np.array([15, 128, 182.]); shal = np.array([116, 212, 200.])
    water = np.zeros((*land.shape, 3))
    for c in range(3):
        water[..., c] = np.where(t < .42, shal[c] + (mid[c] - shal[c]) * (t / .42), mid[c] + (deep[c] - mid[c]) * ((t - .42) / .58))
    streak = gaussian_filter(rng.random(land.shape), (unit * 0.25, unit * 3.2))
    reef = (gaussian_filter(rng.random(land.shape), unit * 0.55) > 0.66) & (t > 0.03) & (t < 0.30)
    water[reef] = water[reef] * 0.55 + np.array([64, 196, 178.]) * 0.45
    water *= (0.95 + 0.07 * gaussian_filter(rng.random(land.shape), unit * 3)[..., None] + 0.05 * gaussian_filter(rng.random(land.shape), unit * 0.4)[..., None] + 0.05 * gaussian_filter(rng.random(land.shape), unit * 0.09)[..., None] + 0.06 * (streak - streak.mean())[..., None])
    inland = distance_transform_edt(land)
    n1 = gaussian_filter(rng.random(land.shape), unit * 0.14); n2 = gaussian_filter(rng.random(land.shape), unit * 0.5); n3 = gaussian_filter(rng.random(land.shape), unit * 1.6)
    n0 = gaussian_filter(rng.random(land.shape), unit * 0.045)
    tex = 0.38 * n1 + 0.34 * n2 + 0.28 * n3; tex /= (tex.max() + 1e-9)
    elev = (np.clip(inland / (unit * 1.9), 0, 1) ** 0.75) * (0.45 + 0.75 * tex); elev = gaussian_filter(elev, unit * 0.07)
    gy, gx = np.gradient(elev * 24.0)
    light = np.array([-0.55, -0.75]); norm = np.sqrt(gx ** 2 + gy ** 2 + 1.0)
    shade = np.clip((1.0 + (gx * light[0] + gy * light[1]) / norm * 0.9) * 0.60, 0.52, 1.24)
    edge = np.zeros(land.shape); b = int(unit * 0.7)
    edge[:b, :] = 1; edge[-b:, :] = 1; edge[:, :b] = 1; edge[:, -b:] = 1
    shade = np.where(edge > 0, 1.0, shade)
    grain = gaussian_filter(rng.random(land.shape), 0.8)
    sand = np.array([230, 196, 128.]); rocky = np.array([168, 124, 74.]); dark = np.array([114, 86, 58.]); olive = np.array([146, 128, 74.])
    r = np.clip(elev * 1.3, 0, 1)
    landc = np.zeros((*land.shape, 3))
    for c in range(3):
        base = sand[c] + (rocky[c] - sand[c]) * r
        col = base + (dark[c] - base) * np.clip((tex - .64) * 2.4, 0, 1) * r
        col = col * 0.88 + olive[c] * 0.12 * np.clip((n3 - .42) * 2.0, 0, 1)
        strata = 0.05 * np.sin(elev * 26.0 + tex * 5.0)
        col = col * (1.0 + strata)
        landc[..., c] = col * shade * (0.92 + 0.10 * grain + 0.07 * n0)
    speck = land & (n0 > 0.78) & (elev > 0.35)
    landc[speck] = landc[speck] * 0.72
    beach = land & (inland <= unit * 0.2)
    landc[beach] = landc[beach] * 0.3 + np.array([242, 220, 170.]) * 0.7
    img = np.where(land[..., None], landc, water)
    foam = (~land) & (depth <= unit * 0.11)
    img[foam] = img[foam] * 0.5 + np.array([230, 250, 246.]) * 0.5
    clouds = gaussian_filter(rng.random(land.shape), unit * 2.6)
    shadow = np.clip((clouds - 0.60) * 2.2, 0, 1) * 0.16
    img *= (1.0 - shadow[..., None])
    yy, xx = np.mgrid[0:land.shape[0], 0:land.shape[1]]
    vig = 1.0 - 0.10 * (((xx / land.shape[1] - .5) ** 2 + (yy / land.shape[0] - .5) ** 2) * 2.2)
    img *= np.clip(vig, 0.88, 1.0)[..., None]
    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    out.save(out_path, quality=90)
    print('saved', out_path, out.size)

render(lambda x, y: (x / W * 3200, y / H * 1524), 3200, 1524, f'{ROOT}/public/images/hormuz-map-optimized.jpg', 31)
render(lambda x, y: (x / W * 1760, y / H * 2400), 1760, 2400, f'{ROOT}/public/images/hormuz-map-portrait-optimized.jpg', 32)
