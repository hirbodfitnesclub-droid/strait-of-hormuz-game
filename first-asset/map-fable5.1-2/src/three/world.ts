// ============================================================
// world.ts — جغرافیای واقعی خلیج فارس (مبتنی بر طول/عرض جغرافیایی)
// تمام داده‌ها به مختصات (lon, lat) تعریف و با تصویر «لنز تاکتیکی» به
// فضای بازی نگاشت می‌شوند: شکل کلی = واقعی ، ناحیه تنگه = ۱.۴× بزرگ‌تر
// محورها: X = شرق (+) ، Z = جنوب (+) ، Y = ارتفاع   (۱ واحد ≈ ۱.۸ کیلومتر)
// ============================================================

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ss = smoothstep;

// ---------- نویز ----------
export function hash2(x: number, y: number): number { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, oct = 4): number {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
export function ridged(x: number, y: number, oct = 4): number {
  let a = 0.5, f = 1, s = 0, n = 0, w = 1;
  for (let i = 0; i < oct; i++) { let r = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1); r = r * r * w; w = clamp(r * 1.7, 0, 1); s += a * r; n += a; a *= 0.5; f *= 2.1; }
  return s / n;
}
export function mulberry(seed: number) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

// ============================================================
// تصویر جغرافیایی + لنز
// ============================================================
const LON0 = 55.9, LAT0 = 26.6;
const KX = 0.55 * 111.32 * Math.cos((26.5 * Math.PI) / 180); // واحد بر درجه طول
const KZ = 0.55 * 111.32;                                     // واحد بر درجه عرض
const LENS = { cx: (56.3 - LON0) * KX, cz: -(26.95 - LAT0) * KZ, mag: 0.4, r0: 40, r1: 260 };
export function proj(lon: number, lat: number): [number, number] {
  const x = (lon - LON0) * KX, z = -(lat - LAT0) * KZ;
  const dx = x - LENS.cx, dz = z - LENS.cz, r = Math.hypot(dx, dz);
  const m = 1 + LENS.mag * (1 - ss(LENS.r0, LENS.r1, r));
  return [LENS.cx + dx * m, LENS.cz + dz * m];
}
const P = (lon: number, lat: number) => proj(lon, lat);
export const OUTER = { x0: -470, x1: 190, z0: -250, z1: 230 };
export const CORE = { x0: -150, x1: 150, z0: -100, z1: 125 };
export const OUTER_W = OUTER.x1 - OUTER.x0, OUTER_D = OUTER.z1 - OUTER.z0;
export const CORE_W = CORE.x1 - CORE.x0, CORE_D = CORE.z1 - CORE.z0;

// ============================================================
// خطوط ساحلی واقعی (lon, lat)
// ============================================================
export const IRAN_COAST_GEO: [number, number][] = [
  [48.60, 29.95], [49.00, 30.08], [49.55, 30.15], [49.95, 30.02], [50.15, 29.80], [50.40, 29.60], [50.65, 29.40],
  [50.78, 29.15], [50.83, 28.98], [50.90, 28.80], [51.05, 28.60], [51.30, 28.35], [51.60, 28.10], [51.93, 27.85],
  [52.10, 27.80], [52.40, 27.62], [52.62, 27.47], [52.95, 27.28], [53.25, 27.05], [53.60, 26.82], [53.95, 26.75],
  [54.30, 26.72], [54.60, 26.62], [54.88, 26.56], [55.00, 26.62], [55.20, 26.76], [55.40, 26.90], [55.58, 26.99],
  [55.78, 27.04], [56.00, 27.09], [56.08, 27.12], [56.27, 27.18], [56.45, 27.16], [56.65, 27.10], [56.85, 27.03],
  [56.98, 26.92], [57.05, 26.70], [57.10, 26.50], [57.25, 26.25], [57.50, 25.90], [57.77, 25.64], [58.10, 25.48],
  [58.60, 25.38], [59.20, 25.30], [59.60, 25.30],
];
export const ARABIA_COAST_GEO: [number, number][] = [
  [48.45, 29.95], [48.20, 29.70], [48.05, 29.40], [48.15, 29.10], [48.35, 28.75], [48.52, 28.40], [48.75, 28.00],
  [49.10, 27.60], [49.45, 27.20], [49.70, 26.95], [49.95, 26.65], [50.12, 26.45], [50.20, 26.15], [50.15, 25.85],
  [50.22, 25.60], [50.45, 25.20], [50.70, 24.85], [50.82, 24.72],
  [50.80, 25.00], [50.76, 25.30], [50.80, 25.60], [50.92, 25.85], [51.05, 26.02], [51.22, 26.16], [51.42, 26.00],
  [51.52, 25.72], [51.56, 25.40], [51.54, 25.20], [51.60, 25.00], [51.56, 24.85], [51.48, 24.65], [51.40, 24.55],
  [51.55, 24.30], [51.80, 24.12], [52.20, 24.08], [52.70, 24.12], [53.20, 24.10], [53.70, 24.18], [54.10, 24.30],
  [54.45, 24.45], [54.75, 24.58], [54.95, 24.85], [55.15, 25.08], [55.30, 25.26], [55.42, 25.38], [55.55, 25.52],
  [55.75, 25.68], [55.96, 25.80], [56.05, 25.98], [56.12, 26.12], [56.22, 26.22], [56.33, 26.33], [56.45, 26.38],
  [56.52, 26.28], [56.48, 26.08], [56.40, 25.85], [56.30, 25.62], [56.37, 25.38], [56.36, 25.13], [56.42, 24.90],
  [56.58, 24.60], [56.75, 24.35], [57.10, 24.05], [57.60, 23.80], [58.10, 23.65], [58.55, 23.60], [59.00, 23.40], [59.60, 23.00],
];
const IRAN_POLY = [...IRAN_COAST_GEO, [60.5, 25.3], [60.5, 33.0], [47.0, 33.0], [47.0, 30.4], [48.40, 30.12]].map(([a, b]) => P(a, b));
const ARAB_POLY = [...ARABIA_COAST_GEO, [60.5, 23.0], [60.5, 19.5], [45.5, 19.5], [45.5, 29.95]].map(([a, b]) => P(a, b));
export const IRAN_COAST_P = IRAN_COAST_GEO.map(([a, b]) => P(a, b));
export const ARABIA_COAST_P = ARABIA_COAST_GEO.map(([a, b]) => P(a, b));
const HAJAR_P = ([[56.40, 26.30], [56.30, 26.08], [56.22, 25.85], [56.18, 25.60], [56.10, 25.30], [56.15, 25.00], [56.35, 24.60], [56.70, 24.20], [57.30, 23.85], [58.00, 23.50], [58.60, 23.20]] as [number, number][]).map(([a, b]) => P(a, b));
const MUSANDAM_C = P(56.3, 26.12);
const MINAB_C = P(56.95, 27.08);
const SIRIK_C = P(57.1, 26.55);

// ---------- SDF چندضلعی ----------
function polySDF(poly: number[][], x: number, z: number): number {
  let inside = false, d2 = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    const ex = xj - xi, ez = zj - zi;
    const t = clamp(((x - xi) * ex + (z - zi) * ez) / (ex * ex + ez * ez || 1), 0, 1);
    const px = xi + ex * t - x, pz = zi + ez * t - z;
    const dd = px * px + pz * pz; if (dd < d2) d2 = dd;
    if ((zi > z) !== (zj > z)) { const xint = xi + ((z - zi) * ex) / ez; if (x < xint) inside = !inside; }
  }
  return (inside ? 1 : -1) * Math.sqrt(d2);
}
const SD = { cell: 1.5, w: 0, h: 0, iran: new Float32Array(0), arab: new Float32Array(0), ready: false };
function ensureSDF() {
  if (SD.ready) return;
  const w = Math.ceil(OUTER_W / SD.cell) + 2, h = Math.ceil(OUTER_D / SD.cell) + 2;
  SD.w = w; SD.h = h; SD.iran = new Float32Array(w * h); SD.arab = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = OUTER.x0 + i * SD.cell, z = OUTER.z0 + j * SD.cell, k = j * w + i;
    SD.iran[k] = polySDF(IRAN_POLY, x, z); SD.arab[k] = polySDF(ARAB_POLY, x, z);
  }
  SD.ready = true;
}
function sampleSD(arr: Float32Array, x: number, z: number): number {
  const fx = clamp((x - OUTER.x0) / SD.cell, 0, SD.w - 1.001), fz = clamp((z - OUTER.z0) / SD.cell, 0, SD.h - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, w = SD.w;
  const a = arr[j * w + i], b = arr[j * w + i + 1], c = arr[(j + 1) * w + i], d = arr[(j + 1) * w + i + 1];
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function distToPolyline(x: number, z: number, pts: number[][]): number {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], vx = bx - ax, vz = bz - az;
    const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
    const px = ax + vx * t - x, pz = az + vz * t - z;
    best = Math.min(best, px * px + pz * pz);
  }
  return Math.sqrt(best);
}

// ============================================================
// جزایر (مرکز واقعی + شعاع بازی + جابه‌جایی جزئی برای فضای لمس)
// ============================================================
export type IslandKind = 'ridge' | 'rock' | 'sand' | 'city' | 'oil' | 'red';
export interface IslandDef { id: string; fa: string; x: number; z: number; rx: number; rz: number; rot: number; h: number; kind: IslandKind; label: boolean; }
const I = (id: string, fa: string, lon: number, lat: number, rx: number, rz: number, rot: number, h: number, kind: IslandKind, nx = 0, nz = 0, label = true): IslandDef => {
  const [x, z] = P(lon, lat); return { id, fa, x: x + nx, z: z + nz, rx, rz, rot, h, kind, label };
};
export const ISLANDS: IslandDef[] = [
  I('qeshm1', 'قشم', 55.45, 26.70, 14, 7.5, 15, 2.8, 'ridge', 0, 0, false),
  I('qeshm2', 'قشم', 55.70, 26.80, 16, 8, 18, 3.4, 'ridge', 0, 0, true),
  I('qeshm3', 'قشم', 55.98, 26.88, 15, 6, 12, 3.0, 'ridge', 0, 0, false),
  I('qeshm4', 'قشم', 56.20, 26.93, 6, 3.6, 8, 2.2, 'ridge', 0, 0, false),
  I('hormuz', 'هرمز', 56.46, 27.06, 8, 7.5, 20, 5.2, 'red', 4.5, 5),
  I('larak', 'لارک', 56.36, 26.87, 6, 5, 25, 4.8, 'rock', 5.5, 5.5),
  I('hengam', 'هنگام', 55.88, 26.65, 5.2, 3.6, 15, 3.0, 'rock', 0, 3),
  I('gtunb', 'تنب بزرگ', 55.30, 26.27, 4.2, 3.8, 0, 2.8, 'rock'),
  I('ltunb', 'تنب کوچک', 55.15, 26.24, 3.8, 3.6, 0, 2.2, 'rock', -2.5, 0.5),
  I('abumusa', 'ابوموسی', 55.03, 25.87, 5, 4.5, 10, 3.6, 'sand'),
  I('sirri', 'سیری', 54.54, 25.90, 4.5, 3.5, 0, 2.2, 'oil'),
  I('farur', 'فارور', 54.52, 26.28, 3.8, 3.4, 0, 3.0, 'rock'),
  I('farurgan', 'فارورگان', 54.50, 26.12, 2, 1.8, 0, 1.4, 'sand'),
  I('kish', 'کیش', 53.98, 26.53, 8.5, 5, 10, 1.6, 'city'),
  I('hendurabi', 'هندورابی', 53.63, 26.67, 3.5, 2.5, 30, 1.6, 'sand'),
  I('shidvar', 'شیدور', 53.44, 26.80, 1.5, 1.3, 0, 1.0, 'sand', 2.5, 0),
  I('lavan', 'لاوان', 53.28, 26.80, 10, 4, 10, 2.2, 'oil'),
  I('farsi', 'فارسی', 50.17, 27.98, 2, 1.8, 0, 1.6, 'rock'),
  I('kharg', 'خارگ', 50.32, 29.23, 4.5, 3, 10, 2.4, 'oil'),
  I('kharko', 'خارکو', 50.36, 29.31, 1.5, 1.2, 0, 1.2, 'sand', 0, -1),
  I('bahrain', 'بحرین', 50.55, 26.03, 8, 24, 5, 1.6, 'city'),
  I('sirbaniyas', 'صیر بنی‌یاس', 52.60, 24.32, 4, 3.5, 0, 1.6, 'sand', 0, 0, false),
  I('dalma', 'دلما', 52.32, 24.50, 3, 2.6, 0, 1.4, 'sand', 0, 0, false),
  I('halul', 'حالول', 52.41, 25.67, 1.6, 1.4, 0, 1.2, 'oil', 0, 0, false),
  I('das', 'داس', 52.87, 25.15, 1.6, 1.4, 0, 1.2, 'oil', 0, 0, false),
  I('quoin', 'دیدمار', 56.52, 26.47, 1.6, 1.3, 0, 2.4, 'rock', 0, 0, false),
];
export const islandById = (id: string) => ISLANDS.find((i) => i.id === id)!;
export function islandField(x: number, z: number, isl: IslandDef): number {
  const dx = x - isl.x, dz = z - isl.z, a = (isl.rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const lx = (dx * ca - dz * sa) / isl.rx, lz = (dx * sa + dz * ca) / isl.rz;
  const d = Math.sqrt(lx * lx + lz * lz);
  return 1 - d + (fbm(x * 0.17 + isl.x, z * 0.17 + isl.z, 3) - 0.5) * 0.34;
}
export function islandEdge(isl: IslandDef, angDeg: number, extra = 1.2): { x: number; z: number } {
  const t = (angDeg * Math.PI) / 180, a = (isl.rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const lx = Math.cos(t) * (isl.rx + extra), lz = Math.sin(t) * (isl.rz + extra);
  return { x: isl.x + lx * ca + lz * sa, z: isl.z - lx * sa + lz * ca };
}

// ============================================================
// نمونه‌برداری زمین
// ============================================================
export type Region = 'iran' | 'arabia' | 'sea' | 'island';
export interface TerrainSample { h: number; island: IslandDef | null; region: Region; d: number; mtn: number; }
function gauss(v: number) { return Math.exp(-v * v); }
export function sampleTerrain(x: number, z: number): TerrainSample {
  ensureSDF();
  const wob = (fbm(x * 0.06 + 7.3, z * 0.06, 3) - 0.5) * 3.2;
  const dI = sampleSD(SD.iran, x, z) + wob, dA = sampleSD(SD.arab, x, z) - wob * 0.8;
  const d = Math.max(dI, dA);
  let region: Region = dI > dA ? 'iran' : 'arabia';
  let h: number, mtn = 0;
  if (d > 0) {
    h = 0.42 * ss(0, 1.2, d) + 0.9 * ss(1, 10, d);
    if (region === 'iran') {
      const near = gauss((x - 25) / 70);
      const d0 = lerp(21, 11, near);
      const mask = ss(d0, d0 + 24, d) * (0.6 + 0.4 * fbm(x * 0.01, z * 0.01 + 3, 2));
      const across = (x - z) * 0.7071, along = (x + z) * 0.7071;
      const r = ridged(across * 0.07, along * 0.018, 4);
      const foot = ss(5, 18, d) * fbm(x * 0.05, z * 0.05, 3) * 2.4;
      h += foot + mask * (3 + r * 15 + fbm(x * 0.03, z * 0.03, 3) * 4.5);
      // دلتای میناب: پست و سبز
      h *= 1 - 0.55 * gauss(Math.hypot(x - MINAB_C[0], z - MINAB_C[1]) / 12) * (1 - mask);
      mtn = mask;
    } else {
      const hj = gauss(distToPolyline(x, z, HAJAR_P) / 11);
      const blob = ss(34, 14, Math.hypot(x - MUSANDAM_C[0], (z - MUSANDAM_C[1]) * 0.8));
      const mask = Math.max(hj, blob) * ss(0.5, 4, d);
      h += mask * (3.5 + ridged(x * 0.085, z * 0.085, 4) * 13);
      const dune = Math.pow(0.5 + 0.5 * Math.sin(x * 0.35 + z * 0.15 + fbm(x * 0.04, z * 0.04, 2) * 8), 2.4);
      h += (1 - mask) * ss(4, 22, d) * dune * 1.0 * ss(55, 20, x);
      mtn = mask;
    }
    h += (fbm(x * 0.12, z * 0.12, 3) - 0.5) * (0.5 + mtn * 1.6);
  } else {
    region = 'sea';
    const deepK = ss(42, 70, x) * ss(-22, 5, z);
    const maxD = lerp(5, 17, deepK), shelf = lerp(9, 13, deepK);
    const sd = -d;
    h = lerp(0.04, -maxD, ss(0, shelf, sd)) - fbm(x * 0.03, z * 0.03, 2) * 0.8 * ss(0, 4, sd);
    h -= gauss((z - 11) / 8) * ss(18, 36, x) * ss(62, 44, x) * 2.5 * ss(0, 4, sd);
  }
  let island: IslandDef | null = null;
  for (const isl of ISLANDS) {
    if (Math.abs(x - isl.x) > isl.rx + 7 || Math.abs(z - isl.z) > isl.rz + 7) continue;
    const t = islandField(x, z, isl);
    if (t > -0.45) {
      const flat = isl.kind === 'city' || isl.kind === 'sand' || isl.kind === 'oil' ? 0.3 : 1;
      let ih = lerp(-2.4, isl.h, ss(-0.3, isl.kind === 'red' ? 0.7 : 0.6, t));
      ih += (fbm(x * 0.16, z * 0.16, 3) - 0.5) * 1.4 * ss(0.05, 0.7, t) * flat;
      if (isl.kind === 'red') ih += ridged(x * 0.22, z * 0.22, 3) * 1.5 * ss(0.15, 0.8, t) + fbm(x * 0.4, z * 0.4, 2) * 0.6 * ss(0.2, 0.8, t);
      if (isl.kind === 'rock') ih += ridged(x * 0.3, z * 0.3, 3) * 1.5 * ss(0.15, 0.8, t);
      if (isl.kind === 'ridge') ih += ridged(x * 0.09, z * 0.09, 3) * 1.6 * ss(0.3, 0.9, t);
      if (ih > h) { h = ih; island = isl; region = 'island'; }
    }
  }
  return { h, island, region, d, mtn };
}
export const groundHeight = (x: number, z: number) => sampleTerrain(x, z).h;

// ---------- پالت رنگ زمین ----------
const C = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const PAL = {
  wet: C(0xb8a07a), seabed: C(0x3b7f8a), abyss: C(0x0d3550), beach: C(0xeee2bd),
  iranLow: C(0xd3bd8e), iranMid: C(0xb89d72), rock: C(0x857260), peak: C(0xcfc5b8), oasis: C(0x8fa061), minab: C(0x7f9f58),
  desert: C(0xe8d09f), dune: C(0xd4ab72), sabkha: C(0xf3eee4), hajar: C(0x6f6155), hajarHi: C(0x9d9184),
  red1: C(0xb94a2a), red2: C(0x6e2614), ochre: C(0xd9a441), salt: C(0xf1ebe0),
  green: C(0x9fb36a), mangrove: C(0x33583a), qeshm: C(0xcbb087), qeshmHi: C(0xa89a84), city: C(0xcfc6ae),
};
const mix3 = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const KHURAN = { x0: P(55.42, 26.9)[0], x1: P(56.0, 26.9)[0], z0: P(55.7, 27.03)[1], z1: P(55.7, 26.8)[1] };
export const inKhuran = (x: number, z: number) => x > KHURAN.x0 && x < KHURAN.x1 && z > KHURAN.z0 && z < KHURAN.z1;

export function terrainColor(x: number, z: number, s: TerrainSample, slope: number, ao: number): number[] {
  const n = fbm(x * 0.07 + 40, z * 0.07, 3), n2 = fbm(x * 0.021 + 9, z * 0.021 + 4, 2);
  const h = s.h;
  let c: number[];
  if (h < -0.35) { c = mix3(PAL.wet, PAL.seabed, ss(-0.35, -3, h)); c = mix3(c, PAL.abyss, ss(-3.5, -14, h)); }
  else if (h < 0.08) c = PAL.wet;
  else if (h < 0.42) c = mix3(PAL.beach, PAL.salt, n * 0.3);
  else if (s.region === 'island' && s.island) {
    const k = s.island.kind;
    if (k === 'red') {
      const band = 0.5 + 0.5 * Math.sin(h * 2.6 + n * 9 + x * 0.3);
      c = mix3(PAL.red1, PAL.ochre, band * 0.55);
      c = mix3(c, PAL.red2, ss(0.25, 0.6, slope) * 0.7);
      const vein = fbm(x * 0.5 + 3, z * 0.5, 2);
      if (vein > 0.6) c = mix3(c, PAL.salt, (vein - 0.6) * 2.2);
      if (n2 > 0.55) c = mix3(c, PAL.iranMid, (n2 - 0.55) * 1.4);
      if (h < 0.9) c = mix3(c, PAL.beach, 0.5);
    } else if (k === 'city') c = mix3(PAL.beach, PAL.green, 0.3 + n * 0.5);
    else if (k === 'ridge') { c = mix3(PAL.qeshm, PAL.qeshmHi, ss(1.8, 3.6, h) * 0.7); if (inKhuran(x, z) && h < 1.2) c = mix3(c, PAL.mangrove, 0.6); }
    else if (k === 'oil' || k === 'sand') c = mix3(PAL.beach, PAL.iranMid, 0.25 + n * 0.35);
    else c = mix3(PAL.iranMid, PAL.rock, 0.3 + n * 0.5);
  } else if (s.region === 'iran') {
    c = mix3(PAL.iranLow, PAL.iranMid, ss(1.4, 5, h) * 0.75 + n * 0.25);
    if (s.d < 9 && n > 0.56) c = mix3(c, PAL.oasis, (n - 0.56) * 2.2);
    const minab = gauss(Math.hypot(x - MINAB_C[0], z - MINAB_C[1]) / 10) + gauss(Math.hypot(x - SIRIK_C[0], z - SIRIK_C[1]) / 5) * 0.6;
    c = mix3(c, PAL.minab, clamp(minab, 0, 1) * (0.4 + n * 0.5));
    c = mix3(c, PAL.rock, ss(3.5, 9, h) * 0.85);
    c = mix3(c, PAL.peak, ss(12, 19, h) * 0.75);
    if (inKhuran(x, z) && h < 1.2) c = mix3(c, PAL.mangrove, 0.55);
  } else {
    const desert = ss(60, 35, x);
    c = mix3(PAL.desert, PAL.dune, n2 * 0.9 * desert);
    if (s.d < 14 && n > 0.58 && h < 1.3) c = mix3(c, PAL.sabkha, (n - 0.58) * 2.4);
    c = mix3(c, PAL.hajar, ss(2.2, 6, h) * s.mtn);
    c = mix3(c, PAL.hajarHi, ss(9, 15, h) * s.mtn * 0.8);
  }
  if (h > 0.6) {
    const rockCol = s.region === 'island' && s.island?.kind === 'red' ? PAL.red2 : PAL.rock;
    c = mix3(c, rockCol, ss(0.32, 0.6, slope) * 0.7);
  }
  const shade = (0.93 + n * 0.14) * ao;
  return [c[0] * shade, c[1] * shade, c[2] * shade];
}

// ---------- چسباندن به خشکی ----------
export function snapToLand(x: number, z: number, ax: number, az: number, minH = 0.6): { x: number; z: number; h: number } {
  let px = x, pz = z;
  const dx = ax - px, dz = az - pz, len = Math.hypot(dx, dz) || 1, sx = dx / len, sz = dz / len;
  let h = groundHeight(px, pz), g = 0;
  while (h < minH && g++ < 90) { px += sx * 0.4; pz += sz * 0.4; h = groundHeight(px, pz); }
  g = 0;
  while (g++ < 12) { const nx = px - sx * 0.35, nz = pz - sz * 0.35, nh = groundHeight(nx, nz); if (nh < minH) break; px = nx; pz = nz; h = nh; }
  return { x: px, z: pz, h };
}

// ============================================================
// مناطق
// ============================================================
export interface ZoneDef { id: string; fa: string; desc: string; x: number; z: number; dist: number; locked?: boolean; cost?: number; lockR?: number; color: string; prd: string; }
const Z = (id: string, fa: string, desc: string, lon: number, lat: number, dist: number, color: string, prd: string, extra: Partial<ZoneDef> = {}): ZoneDef => { const [x, z] = P(lon, lat); return { id, fa, desc, x, z, dist, color, prd, ...extra }; };
export const ZONES: ZoneDef[] = [
  Z('overview', 'نمای راهبردی', 'کل خلیج فارس', 55.3, 26.4, 1300, '#38bdf8', '—'),
  Z('bandar', 'بندرعباس', 'قلب دفاع • پالایشگاه و اسکله', 56.15, 27.08, 95, '#f43f5e', 'منطقه ۱'),
  Z('hormuz', 'هرمز و لارک', 'گلوگاه ورودی شرقی', 56.45, 26.95, 92, '#fb923c', 'منطقه ۲'),
  Z('qeshm', 'قشم و خوران', 'کانال میانی و تنگناها', 55.75, 26.88, 130, '#22d3ee', 'منطقه ۳'),
  Z('midsea', 'آب‌های میانی', 'سکوهای نفتی و شناورها', 54.6, 25.95, 210, '#facc15', 'منطقه ۴'),
  Z('tunbs', 'تنب و ابوموسی', 'خط مقدم غربی', 55.12, 26.08, 135, '#a78bfa', 'منطقه ۵', { locked: true, cost: 2500000, lockR: 42 }),
  Z('kish', 'کیش', 'قطب مالی و فرماندهی', 53.98, 26.53, 80, '#34d399', 'منطقه ۶', { locked: true, cost: 4000000, lockR: 26 }),
];

// ============================================================
// اسلات‌ها
// ============================================================
export type SlotKind = 'defense' | 'oil' | 'city';
export interface SlotDef { id: string; kind: SlotKind; x: number; z: number; ax: number; az: number; zone: string; name: string; built?: string; }
let sid = 0;
const DI = (isl: string, ang: number, zone: string, name: string): SlotDef => { const i = islandById(isl); const p = islandEdge(i, ang, 1.4); return { id: `d${++sid}`, kind: 'defense', x: p.x, z: p.z, ax: i.x, az: i.z, zone, name }; };
const DC = (lon: number, lat: number, zone: string, name: string, dLat = 0.3, dLon = 0): SlotDef => { const [x, z] = P(lon, lat); const [ax, az] = P(lon + dLon, lat + dLat); return { id: `d${++sid}`, kind: 'defense', x, z, ax, az, zone, name }; };
const OG = (id: string, lon: number, lat: number, zone: string, name: string): SlotDef => { const [x, z] = P(lon, lat); return { id, kind: 'oil', x, z, ax: x, az: z, zone, name }; };
const CG = (id: string, lon: number, lat: number, zone: string, name: string, built?: string): SlotDef => { const [x, z] = P(lon, lat); return { id, kind: 'city', x, z, ax: x, az: z, zone, name, built }; };
const CI = (id: string, isl: string, ox: number, oz: number, zone: string, name: string, built?: string): SlotDef => { const i = islandById(isl); return { id, kind: 'city', x: i.x + ox, z: i.z + oz, ax: i.x, az: i.z, zone, name, built }; };

export const DEFENSE_SLOTS: SlotDef[] = [
  // ساحل بندرعباس (قلب دفاع)
  DC(55.93, 27.085, 'bandar', 'غرب شهید رجایی'), DC(56.03, 27.11, 'bandar', 'شهید رجایی'), DC(56.17, 27.16, 'bandar', 'غرب بندرعباس'),
  DC(56.30, 27.18, 'bandar', 'ساحل بندرعباس'), DC(56.44, 27.16, 'bandar', 'شرق بندرعباس'), DC(56.60, 27.12, 'bandar', 'دماغه خلیج میناب'),
  DC(56.93, 27.03, 'bandar', 'دلتای میناب'),
  // ساحل خور خوران
  DC(55.50, 26.95, 'bandar', 'بندر خمیر'), DC(55.70, 27.03, 'bandar', 'بندر پل'), DC(55.85, 27.07, 'bandar', 'شرق خوران'),
  // قشم
  DI('qeshm1', 180, 'qeshm', 'دماغه باسعیدو'), DI('qeshm1', 250, 'qeshm', 'شمال‌غرب قشم'), DI('qeshm1', 110, 'qeshm', 'جنوب‌غرب قشم'),
  DI('qeshm2', 268, 'qeshm', 'لافت'), DI('qeshm2', 92, 'qeshm', 'جنوب قشم'),
  DI('qeshm3', 275, 'qeshm', 'درگهان'), DI('qeshm3', 85, 'qeshm', 'جنوب‌شرق قشم'),
  DI('qeshm4', 300, 'qeshm', 'شمال قشم‌شهر'), DI('qeshm4', 20, 'qeshm', 'گلوگاه قشم-لارک'),
  // هرمز — ۶ جایگاه طلایی
  DI('hormuz', 0, 'hormuz', 'هرمز شرقی'), DI('hormuz', 60, 'hormuz', 'هرمز جنوب‌شرقی'), DI('hormuz', 120, 'hormuz', 'هرمز جنوب‌غربی'),
  DI('hormuz', 180, 'hormuz', 'هرمز غربی'), DI('hormuz', 240, 'hormuz', 'قلعه پرتغالی‌ها'), DI('hormuz', 300, 'hormuz', 'هرمز شمال‌شرقی'),
  // لارک
  DI('larak', 45, 'hormuz', 'لارک جنوب‌شرقی'), DI('larak', 135, 'hormuz', 'لارک جنوب‌غربی'), DI('larak', 225, 'hormuz', 'لارک شمال‌غربی'), DI('larak', 315, 'hormuz', 'لارک شمال‌شرقی'),
  // هنگام
  DI('hengam', 90, 'qeshm', 'هنگام جنوبی'), DI('hengam', 210, 'qeshm', 'هنگام غربی'), DI('hengam', 330, 'qeshm', 'هنگام شرقی'),
  // زون ۵
  DI('gtunb', 30, 'tunbs', 'تنب بزرگ شرقی'), DI('gtunb', 150, 'tunbs', 'تنب بزرگ غربی'), DI('gtunb', 270, 'tunbs', 'تنب بزرگ شمالی'),
  DI('ltunb', 90, 'tunbs', 'تنب کوچک جنوبی'), DI('ltunb', 270, 'tunbs', 'تنب کوچک شمالی'),
  DI('abumusa', 30, 'tunbs', 'ابوموسی شرقی'), DI('abumusa', 150, 'tunbs', 'ابوموسی غربی'), DI('abumusa', 270, 'tunbs', 'ابوموسی شمالی'),
  DI('sirri', 60, 'tunbs', 'سیری جنوبی'), DI('sirri', 240, 'tunbs', 'سیری شمالی'),
  DI('farur', 90, 'tunbs', 'فارور جنوبی'), DI('farur', 270, 'tunbs', 'فارور شمالی'),
  // کیش
  DI('kish', 20, 'kish', 'کیش شرقی'), DI('kish', 110, 'kish', 'کیش جنوبی'), DI('kish', 200, 'kish', 'کیش غربی'), DI('kish', 290, 'kish', 'کیش شمالی'),
  // ساحل لنگه و جاسک
  DC(54.75, 26.6, 'bandar', 'بندر لنگه'), DC(55.08, 26.68, 'bandar', 'بندر کنگ'),
  DC(57.2, 26.32, 'hormuz', 'ساحل سیریک', 0.05, 0.3), DC(57.58, 25.86, 'hormuz', 'ساحل جاسک', 0.25, 0.1),
];
export const OIL_SLOTS: SlotDef[] = [
  OG('o1', 55.95, 26.50, 'qeshm', 'میدان گازی هنگام'), OG('o2', 55.42, 26.45, 'qeshm', 'میدان تنب'),
  OG('o3', 54.95, 25.70, 'tunbs', 'میدان مبارک'), OG('o4', 54.28, 25.78, 'tunbs', 'میدان سیری A'),
  OG('o5', 54.68, 25.70, 'tunbs', 'میدان سیری E'), OG('o6', 54.88, 25.48, 'midsea', 'میدان سلمان'),
  OG('o7', 54.66, 26.20, 'tunbs', 'میدان نصرت'), OG('o8', 53.85, 26.33, 'kish', 'میدان گازی کیش'),
  OG('o9', 53.75, 26.55, 'kish', 'میدان هندورابی'), OG('o10', 54.28, 26.42, 'midsea', 'میدان مرکزی'),
  OG('o11', 56.62, 27.0, 'hormuz', 'سکوی خلیج هرمز'), OG('o12', 54.92, 26.40, 'bandar', 'میدان لنگه'),
  OG('o13', 55.02, 25.33, 'midsea', 'میدان فاتح'), OG('o14', 54.35, 26.05, 'midsea', 'میدان رشادت'),
];
export const CITY_SLOTS: SlotDef[] = [
  CG('c1', 56.17, 27.22, 'bandar', 'پالایشگاه بندرعباس', 'refinery'),
  CG('c2', 56.08, 27.135, 'bandar', 'اسکله شهید رجایی', 'pier'),
  CG('c3', 56.00, 27.17, 'bandar', 'مجتمع فولاد هرمزگان', 'steel'),
  CG('c4', 56.36, 27.26, 'bandar', 'صنایع دفاعی', 'arms'),
  CG('c5', 56.50, 27.21, 'bandar', 'نیروگاه گازی', 'power'),
  CG('c6', 56.65, 27.15, 'bandar', 'آب‌شیرین‌کن', 'desal'),
  CG('c7', 56.12, 26.90, 'qeshm', 'قشم‌شهر', 'town'),
  CG('c8', 55.86, 26.84, 'qeshm', 'زمین صنعتی قشم'),
  CG('c20', 55.72, 26.86, 'qeshm', 'بندر لافت'),
  CI('c9', 'kish', -3, -1, 'kish', 'برج‌های کیش', 'kish'),
  CI('c10', 'kish', 3.5, 1, 'kish', 'فرماندهی کل', 'command'),
  CI('c11', 'kish', 0, 3, 'kish', 'تفرجگاه جنوبی'),
  CI('c12', 'hormuz', 1.5, 1.5, 'hormuz', 'معدن خاک سرخ', 'mine'),
  CI('c13', 'larak', 0, 0, 'hormuz', 'رادار لارک', 'radar'),
  CI('c14', 'abumusa', 0, 0, 'tunbs', 'پایگاه ابوموسی', 'base'),
  CI('c15', 'gtunb', 0, 0, 'tunbs', 'پاسگاه تنب بزرگ', 'outpost'),
  CI('c16', 'sirri', 0, 0, 'tunbs', 'پایانه نفتی سیری', 'terminal'),
  CI('c22', 'hengam', 0, 0, 'qeshm', 'انبار هنگام'),
  CG('c18', 55.88, 27.12, 'bandar', 'شهرک صنعتی پل'),
  CG('c23', 54.88, 26.63, 'bandar', 'بندر لنگه', 'town'),
  CG('c24', 57.0, 27.10, 'bandar', 'نخلستان میناب'),
  CG('c25', 57.78, 25.70, 'hormuz', 'پایگاه جاسک', 'base'),
];
export const ALL_SLOTS = [...DEFENSE_SLOTS, ...OIL_SLOTS, ...CITY_SLOTS];

// ============================================================
// مسیرها (S-Curve طبق PRD)
// ============================================================
const near = (isl: string, ang: number, e: number) => { const p = islandEdge(islandById(isl), ang, e); return [p.x, p.z]; };
const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const gp = (lon: number, lat: number) => { const [x, z] = P(lon, lat); return [x, z]; };
export const BASE_POS = (() => { const [x, z] = P(56.09, 27.085); return { x, z }; })();
export const LANE_A: number[][] = [
  gp(57.35, 25.72), gp(57.0, 26.25), gp(56.78, 26.68),           // دریای عمان → خلیج میناب
  near('hormuz', 35, 7), near('hormuz', 95, 6),                   // پیچ تند هرمز
  mid(near('hormuz', 125, 3), near('larak', 330, 3)),            // گذرگاه هرمز-لارک
  mid(near('qeshm4', 10, 2.5), near('larak', 265, 2.5)),          // کانال باریک قشم-لارک
  mid(near('qeshm4', 320, 2.8), near('hormuz', 185, 3)),          // شمال، بین دماغه قشم و هرمز
  [BASE_POS.x + 14, BASE_POS.z + 6], [BASE_POS.x + 2, BASE_POS.z + 3],
];
export const LANE_B: number[][] = [
  gp(54.55, 25.62), near('abumusa', 200, 8), near('abumusa', 290, 8),
  near('ltunb', 200, 7), near('ltunb', 290, 7),
  gp(54.98, 26.52), gp(55.18, 26.66),                             // ساحل لنگه/کنگ
  mid(gp(55.45, 26.92), near('qeshm1', 275, 2)), mid(gp(55.65, 27.0), near('qeshm2', 270, 2)),
  mid(gp(55.86, 27.05), near('qeshm3', 275, 2)), mid(gp(56.02, 27.08), near('qeshm4', 290, 2)),
  [BASE_POS.x - 6, BASE_POS.z + 4], [BASE_POS.x - 1, BASE_POS.z + 3],
];
export const TRADE_LANE: number[][] = [
  gp(58.7, 24.8), gp(57.8, 25.55), gp(57.15, 26.15), gp(56.72, 26.52),
  mid(near('larak', 120, 4), gp(56.45, 26.40)), gp(56.1, 26.38),
  mid(near('gtunb', 110, 3), near('abumusa', 300, 3)), gp(54.85, 26.03), gp(54.55, 26.02), gp(54.0, 26.1),
  gp(53.3, 26.35), gp(52.4, 26.65), gp(51.4, 27.1), gp(50.6, 27.7), gp(50.25, 28.4), gp(50.42, 29.05),
];
export const TRADE_SPUR: number[][] = [
  gp(56.72, 26.52), mid(near('hormuz', 125, 3), near('larak', 330, 3)), mid(near('qeshm4', 320, 2.8), near('hormuz', 185, 3)),
  [BASE_POS.x + 14, BASE_POS.z + 7], [BASE_POS.x + 3, BASE_POS.z + 4],
];
export const SPAWN_A = { x: LANE_A[0][0], z: LANE_A[0][1] };
export const SPAWN_B = { x: LANE_B[0][0], z: LANE_B[0][1] };
export const PIPE_TERMINALS = [P(56.09, 27.09), P(54.54, 25.9), P(55.03, 25.87), P(53.98, 26.53), P(54.88, 26.56), P(56.12, 26.9), P(56.55, 27.1)].map(([x, z]) => ({ x, z }));

// ============================================================
// شهرها، دکور، برچسب‌ها
// ============================================================
export interface CityDecor { fa: string; x: number; z: number; r: number; n: number; maxH: number; lights: number; }
const CT = (fa: string, lon: number, lat: number, r: number, n: number, maxH: number, lights: number): CityDecor => { const [x, z] = P(lon, lat); return { fa, x, z, r, n, maxH, lights }; };
export const CITIES: CityDecor[] = [
  CT('بندرعباس', 56.27, 27.22, 11, 260, 5, 1100), CT('قشم', 56.22, 26.95, 2.5, 30, 2.2, 150), CT('درگهان', 55.95, 26.9, 2, 18, 1.8, 90),
  CT('لافت', 55.75, 26.84, 1.5, 14, 1.6, 60), CT('بندر لنگه', 54.88, 26.6, 4, 60, 2.4, 260), CT('بندر خمیر', 55.58, 27.05, 2, 20, 1.8, 90),
  CT('میناب', 57.08, 27.14, 4, 50, 2.2, 220), CT('جاسک', 57.77, 25.68, 3, 28, 2, 120), CT('سیریک', 57.16, 26.58, 1.5, 12, 1.5, 50),
  CT('بوشهر', 50.97, 28.9, 5, 90, 3, 420), CT('عسلویه', 52.66, 27.56, 4, 45, 2.5, 320), CT('کنگان', 52.12, 27.9, 2.5, 25, 2, 110),
  CT('کیش', 53.95, 26.55, 3, 44, 4, 280), CT('دبی', 55.32, 25.18, 9, 320, 15, 1700), CT('شارجه', 55.48, 25.32, 5, 150, 6, 750),
  CT('ام‌القیوین', 55.62, 25.5, 2, 25, 2, 110), CT('راس‌الخیمه', 56.0, 25.74, 4, 60, 3.5, 300), CT('ابوظبی', 54.45, 24.36, 7, 200, 11, 1000),
  CT('دوحه', 51.44, 25.3, 5, 140, 11, 700), CT('الخور', 51.42, 25.68, 2, 20, 2, 90), CT('منامه', 50.58, 26.2, 2.5, 50, 6, 300),
  CT('دمام', 50.02, 26.4, 5, 120, 5, 600), CT('جبیل', 49.55, 26.95, 3, 50, 3, 240), CT('کویت', 47.98, 29.33, 6, 150, 8, 800),
  CT('خصب', 56.25, 26.18, 2, 20, 1.8, 80), CT('دبا', 56.26, 25.6, 2, 20, 2, 90), CT('فجیره', 56.34, 25.12, 3.5, 45, 3.5, 220),
  CT('صحار', 56.68, 24.3, 3.5, 45, 3, 220), CT('مسقط', 58.5, 23.5, 6, 140, 5, 700),
  (() => { const p = islandEdge(islandById('hormuz'), 270, -3.2); return { fa: 'هرمز', x: p.x, z: p.z, r: 1.3, n: 12, maxH: 1.4, lights: 50 }; })(),
];
export const DECOR_RIGS: [number, number][] = [
  [52.1, 26.5], [52.3, 26.62], [52.45, 26.4], [52.0, 26.72], [52.6, 26.56], [52.22, 26.3], [51.8, 26.3], [51.6, 26.52], [51.75, 26.72],
  [53.0, 26.5], [53.15, 26.62], [53.38, 26.6], [53.7, 24.95], [53.9, 25.05], [53.55, 24.85], [53.2, 25.2], [49.7, 29.1], [49.55, 29.25],
  [49.95, 28.55], [50.6, 26.75], [54.75, 25.3], [52.8, 25.5], [51.1, 27.3],
].map(([a, b]) => P(a, b) as [number, number]);
export interface FlareSite { x: number; z: number; n: number; tanks: number; fa: string; }
export const FLARE_SITES: FlareSite[] = ([
  [52.6, 27.44, 7, 8, 'عسلویه'], [51.56, 25.92, 4, 6, 'راس‌لفان'], [55.05, 25.0, 3, 6, 'جبل‌علی'], [52.73, 24.14, 3, 5, 'الرویس'],
  [50.32, 29.23, 2, 8, 'خارگ'], [53.28, 26.8, 1, 5, 'لاوان'], [52.1, 27.78, 2, 3, 'کنگان'], [56.05, 27.16, 0, 0, ''],
] as [number, number, number, number, string][]).filter((f) => f[2] > 0).map(([lon, lat, n, tanks, fa]) => { const [x, z] = P(lon, lat); return { x, z, n, tanks, fa }; });
export const LANDMARKS = {
  burj: P(55.274, 25.197), fort: islandEdge(islandById('hormuz'), 240, -2.2), bushehrNpp: P(50.89, 28.83),
  dohaTowers: P(51.53, 25.32), abuDhabiMosque: P(54.47, 24.41), kishShip: islandEdge(islandById('kish'), 160, 0.5),
};
export const MANGROVE_BOX = { x0: P(55.45, 26.9)[0], x1: P(56.02, 26.9)[0], z0: P(55.7, 27.04)[1], z1: P(55.7, 26.78)[1] };

export interface LabelDef { fa: string; en?: string; x: number; z: number; level: 0 | 1 | 2; kind: 'island' | 'water' | 'country' | 'city' | 'foreign'; }
const L = (fa: string, lon: number, lat: number, level: 0 | 1 | 2, kind: LabelDef['kind'], en?: string): LabelDef => { const [x, z] = P(lon, lat); return { fa, en, x, z, level, kind }; };
export const LABELS: LabelDef[] = [
  L('ایران', 54.3, 28.6, 0, 'country', 'IRAN'), L('عربستان سعودی', 49.2, 25.3, 0, 'country', 'SAUDI ARABIA'), L('امارات', 54.6, 23.75, 0, 'country', 'U.A.E'),
  L('عمان', 57.6, 23.05, 0, 'country', 'OMAN'), L('قطر', 51.2, 25.25, 0, 'country', 'QATAR'), L('کویت', 47.7, 29.3, 0, 'country', 'KUWAIT'),
  L('خلیج فارس', 53.1, 25.9, 0, 'water', 'PERSIAN GULF'), L('دریای عمان', 57.9, 25.2, 0, 'water', 'GULF OF OMAN'), L('تنگه هرمز', 56.62, 26.62, 1, 'water', 'STRAIT OF HORMUZ'),
  L('خور خوران', 55.78, 26.97, 2, 'water'), L('خلیج میناب', 56.75, 26.95, 2, 'water'),
  ...ISLANDS.filter((i) => i.label).map((i) => ({ fa: i.fa, x: i.x, z: i.z, level: (i.rx > 5 ? 1 : 2) as 0 | 1 | 2, kind: 'island' as const })),
  L('بندرعباس', 56.27, 27.25, 1, 'city'), L('بوشهر', 50.86, 29.0, 1, 'city'), L('عسلویه', 52.62, 27.54, 2, 'city'), L('بندر لنگه', 54.88, 26.64, 2, 'city'),
  L('میناب', 57.08, 27.18, 2, 'city'), L('جاسک', 57.77, 25.72, 2, 'city'), L('بندر خمیر', 55.58, 27.06, 2, 'city'),
  L('دبی', 55.3, 25.17, 1, 'foreign'), L('ابوظبی', 54.42, 24.45, 1, 'foreign'), L('دوحه', 51.52, 25.27, 1, 'foreign'), L('منامه', 50.58, 26.25, 2, 'foreign'),
  L('مسقط', 58.5, 23.58, 1, 'foreign'), L('خصب', 56.25, 26.14, 2, 'foreign'), L('فجیره', 56.34, 25.08, 2, 'foreign'), L('راس‌الخیمه', 55.95, 25.78, 2, 'foreign'),
  L('کویت', 47.98, 29.3, 2, 'foreign'), L('دمام', 50.08, 26.38, 2, 'foreign'), L('شارجه', 55.42, 25.33, 2, 'foreign'),
];

// ============================================================
// برجک‌ها و ساختمان‌ها
// ============================================================
export interface TowerDef { id: string; fa: string; short: string; cost: number; steel: number; sea: boolean; air: boolean; sub: boolean; range: number; color: string; desc: string; specialA: string; specialB: string; }
export const TOWERS: TowerDef[] = [
  { id: 'autocannon', fa: 'توپخانه سریع', short: 'توپ سریع', cost: 150, steel: 10, sea: true, air: true, sub: false, range: 16, color: '#38bdf8', desc: 'رگبار ضد قایق و پهپاد', specialA: 'فالانکس CIWS', specialB: 'توپ ریلی' },
  { id: 'howitzer', fa: 'توپخانه سنگین', short: 'هویتزر', cost: 250, steel: 20, sea: true, air: false, sub: false, range: 19, color: '#fb923c', desc: 'آسیب محیطی در تنگناها', specialA: 'آتش‌بار فجر', specialB: 'توپ گرمافشار' },
  { id: 'missile', fa: 'سیلوی موشک کروز', short: 'کروز', cost: 400, steel: 35, sea: true, air: false, sub: false, range: 30, color: '#f43f5e', desc: 'برد بلند ضد ناوشکن', specialA: 'هایپرسونیک فتاح', specialB: 'لانچر چندگانه' },
  { id: 'airdef', fa: 'پدافند و لیزر', short: 'پدافند', cost: 350, steel: 30, sea: true, air: true, sub: false, range: 23, color: '#a78bfa', desc: 'تخصص ضد هوایی', specialA: 'باور-۳۷۳', specialB: 'لیزر حرارتی' },
  { id: 'ew', fa: 'جنگ الکترونیک', short: 'جنگ الکترونیک', cost: 300, steel: 25, sea: true, air: true, sub: true, range: 15, color: '#34d399', desc: 'کندکننده + سونار', specialA: 'دکل EMP', specialB: 'سایبر-سونار' },
  { id: 'garrison', fa: 'آشیانه قایق رهگیر', short: 'قایق رهگیر', cost: 275, steel: 22, sea: true, air: false, sub: true, range: 14, color: '#facc15', desc: 'سد مسیر با قایق تندرو', specialA: 'اسکادران عاشورا', specialB: 'زیردریایی غدیر' },
];
export const towerById = (id: string) => TOWERS.find((t) => t.id === id);
export interface CityBuildDef { id: string; fa: string; cost: number; desc: string; }
export const CITY_BUILDS: CityBuildDef[] = [
  { id: 'power', fa: 'نیروگاه', cost: 500, desc: '+۵۰ مگاوات' }, { id: 'desal', fa: 'آب‌شیرین‌کن', cost: 350, desc: '+آب شیرین' },
  { id: 'town', fa: 'شهرک', cost: 400, desc: '+نیروی کار' }, { id: 'depot', fa: 'انبار', cost: 250, desc: '+ظرفیت' },
];
export const RIG_INFO = { fa: 'سکوی نفتی', cost: 100, desc: '+۱۰ بشکه/ثانیه' };
