// ============================================================
// decor.ts — پوشش گیاهی، صخره، حرا، سکوهای دکوری، فلرها، لندمارک‌ها، جاده‌ها
// همه به‌صورت Instanced برای حداقل draw call روی موبایل
// ============================================================
import * as THREE from 'three';
import { mulberry, CITIES, DECOR_RIGS, FLARE_SITES, LANDMARKS, MANGROVE_BOX, IRAN_COAST_P, ARABIA_COAST_P, DEFENSE_SLOTS, CITY_SLOTS, CORE, ISLANDS, islandById, clamp } from './world';
import type { Models, AnimFn } from './models';

export interface DecorCtx { scene: THREE.Scene; models: Models; hAt: (x: number, z: number) => number; anims: AnimFn[]; mobile: boolean; }

function nearSlot(x: number, z: number, r2: number): boolean {
  for (const s of DEFENSE_SLOTS) { const dx = x - s.x, dz = z - s.z; if (dx * dx + dz * dz < r2) return true; }
  for (const s of CITY_SLOTS) { const dx = x - s.x, dz = z - s.z; if (dx * dx + dz * dz < r2 * 2.5) return true; }
  return false;
}
function inCore(x: number, z: number) { return x > CORE.x0 && x < CORE.x1 && z > CORE.z0 && z < CORE.z1; }

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
function inst(geo: THREE.BufferGeometry, mat: THREE.Material, items: { x: number; y: number; z: number; s: number; sy?: number; r: number; c?: THREE.Color }[], shadow = true): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(items.length, 1));
  items.forEach((it, i) => {
    e.set(0, it.r, 0); q.setFromEuler(e); v.set(it.x, it.y, it.z); sc.set(it.s, it.sy ?? it.s, it.s);
    m4.compose(v, q, sc); mesh.setMatrixAt(i, m4);
    if (it.c) mesh.setColorAt(i, it.c);
  });
  mesh.count = items.length;
  mesh.castShadow = shadow; mesh.receiveShadow = shadow;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// ---------- پوشش گیاهی + صخره + حرا ----------
export interface VegLOD { far: THREE.Object3D[]; mid: THREE.Object3D[]; near: THREE.Object3D[]; }
export function buildVegetation(ctx: DecorCtx): VegLOD {
  const { scene, models, hAt, mobile } = ctx;
  const rng = mulberry(1234);
  type It = { x: number; y: number; z: number; s: number; sy?: number; r: number; c?: THREE.Color };
  const palms: It[] = [], crowns: It[] = [], rocks: It[] = [], mang: It[] = [], shrubs: It[] = [];
  const slope = (x: number, z: number) => Math.hypot(hAt(x + 1, z) - hAt(x - 1, z), hAt(x, z + 1) - hAt(x, z - 1)) / 2;
  const palmCols = [new THREE.Color('#3f7a3c'), new THREE.Color('#4f8a40'), new THREE.Color('#2f6a36')];
  // نخل‌ها: ساحل ایران، میناب، کیش، قشم، دبی
  const palmSpots: { x: number; z: number; r: number; n: number }[] = [
    ...CITIES.filter((c) => inCore(c.x, c.z)).map((c) => ({ x: c.x, z: c.z, r: c.r * 1.5, n: Math.round(c.n * 0.35) })),
    { x: islandById('kish').x, z: islandById('kish').z, r: 9, n: 90 },
    { x: islandById('qeshm2').x, z: islandById('qeshm2').z, r: 16, n: 90 }, { x: islandById('qeshm3').x, z: islandById('qeshm3').z, r: 14, n: 70 },
    { x: islandById('abumusa').x, z: islandById('abumusa').z, r: 5, n: 25 }, { x: islandById('hormuz').x, z: islandById('hormuz').z, r: 8, n: 20 },
  ];
  const minab = CITIES.find((c) => c.fa === 'میناب')!;
  palmSpots.push({ x: minab.x - 4, z: minab.z + 6, r: 10, n: 160 });
  for (const sp of palmSpots) {
    let k = 0, guard = 0;
    const n = mobile ? Math.round(sp.n * 0.6) : sp.n;
    while (k < n && guard++ < n * 5) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * sp.r;
      const x = sp.x + Math.cos(a) * rr, z = sp.z + Math.sin(a) * rr;
      const h = hAt(x, z);
      if (h < 0.62 || h > 3.2 || slope(x, z) > 0.45 || nearSlot(x, z, 6)) continue;
      const s = 0.5 + rng() * 0.38;
      palms.push({ x, y: h + 0.85 * s, z, s, r: rng() * 6.28 });
      crowns.push({ x, y: h + 1.85 * s, z, s, sy: s, r: rng() * 6.28, c: palmCols[Math.floor(rng() * 3)] });
      k++;
    }
  }
  // صخره‌ها روی شیب‌ها
  const rockCol = new THREE.Color('#948677'), rockRed = new THREE.Color('#8f4a30'), rockHajar = new THREE.Color('#7a6f66');
  let guard = 0;
  const rockN = mobile ? 900 : 1600;
  while (rocks.length < rockN && guard++ < 40000) {
    const x = CORE.x0 + rng() * (CORE.x1 - CORE.x0), z = CORE.z0 + rng() * (CORE.z1 - CORE.z0);
    const h = hAt(x, z);
    if (h < 0.9) continue;
    const sl = slope(x, z);
    if (sl < 0.38 && !(h > 9 && rng() < 0.15)) continue;
    if (nearSlot(x, z, 5)) continue;
    const isl = ISLANDS.find((i) => Math.abs(x - i.x) < i.rx + 2 && Math.abs(z - i.z) < i.rz + 2);
    const c = isl?.kind === 'red' ? rockRed : z > 20 && x > 10 ? rockHajar : rockCol;
    rocks.push({ x, y: h - 0.15, z, s: 0.45 + rng() * (h > 6 ? 1.2 : 0.7), sy: 0.5 + rng() * 0.45, r: rng() * 6.28, c });
  }
  // حرا (جنگل مانگرو خوران)
  guard = 0;
  const mb = MANGROVE_BOX;
  while (mang.length < (mobile ? 400 : 700) && guard++ < 12000) {
    const x = mb.x0 + rng() * (mb.x1 - mb.x0), z = mb.z0 + rng() * (mb.z1 - mb.z0);
    const h = hAt(x, z);
    if (h < -0.55 || h > 0.4) continue;
    mang.push({ x, y: Math.max(h, 0) + 0.12, z, s: 0.7 + rng() * 0.9, sy: 0.35 + rng() * 0.3, r: rng() * 6.28 });
  }
  // بوته‌های کم‌ارتفاع دشت
  guard = 0;
  while (shrubs.length < (mobile ? 500 : 1100) && guard++ < 30000) {
    const x = CORE.x0 + rng() * (CORE.x1 - CORE.x0), z = CORE.z0 + rng() * (CORE.z1 - CORE.z0);
    const h = hAt(x, z);
    if (h < 0.7 || h > 4 || slope(x, z) > 0.3 || nearSlot(x, z, 4)) continue;
    shrubs.push({ x, y: h + 0.1, z, s: 0.45 + rng() * 0.5, sy: 0.3 + rng() * 0.25, r: rng() * 6.28 });
  }
  const trunk = inst(new THREE.CylinderGeometry(0.07, 0.13, 1.8, 5), models.mat('#7a5a3c', 1), palms);
  const crownGeo = new THREE.ConeGeometry(1.0, 0.6, 7); crownGeo.rotateX(Math.PI);
  const crown = inst(crownGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), crowns);
  const rockMesh = inst(new THREE.DodecahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }), rocks);
  const mangMesh = inst(new THREE.IcosahedronGeometry(0.75, 0), models.mat('#2f5a36', 1), mang, false);
  const shrubMesh = inst(new THREE.IcosahedronGeometry(0.6, 0), models.mat('#8a9a5a', 1), shrubs, false);
  scene.add(trunk, crown, rockMesh, mangMesh, shrubMesh);
  return { far: [trunk, crown, mangMesh], mid: [rockMesh], near: [shrubMesh] };
}

// ---------- سکوهای دکوری (ساده‌شده و Instanced) ----------
export function buildDecorRigs(ctx: DecorCtx) {
  const { scene, models, anims } = ctx;
  const legs: { x: number; y: number; z: number; s: number; sy?: number; r: number }[] = [], decks: typeof legs = [], derricks: typeof legs = [], houses: typeof legs = [];
  DECOR_RIGS.forEach(([x, z], i) => {
    const r = i * 1.3;
    const ca = Math.cos(r), sa = Math.sin(r);
    for (const [lx, lz] of [[-1.7, -1.3], [1.7, -1.3], [-1.7, 1.3], [1.7, 1.3]]) legs.push({ x: x + lx * ca - lz * sa, y: 1.2, z: z + lx * sa + lz * ca, s: 1, sy: 6, r });
    decks.push({ x, y: 3.2, z, s: 1, r });
    derricks.push({ x: x + 1.0 * ca, y: 5.9, z: z + 1.0 * sa, s: 1, r });
    houses.push({ x: x - 1.4 * ca, y: 4.2, z: z - 1.4 * sa, s: 1, r });
    models.flame(scene as unknown as THREE.Object3D, x - 2.6 * ca + 1.6 * sa, 5.4, z - 2.6 * sa - 1.6 * ca, 1.3);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), models.light('#ff4040', 6));
    lamp.position.set(x + 1.0 * ca, 8.6, z + 1.0 * sa); scene.add(lamp);
    anims.push((t) => { lamp.visible = Math.sin(t * 3 + i) > 0.2; });
  });
  const steel = models.mat('#5a636d', 0.5, 0.6), yellow = models.mat('#d9a441', 0.55, 0.3), white = models.mat('#e8e4da', 0.7);
  scene.add(inst(new THREE.CylinderGeometry(0.22, 0.28, 1, 8), yellow, legs));
  scene.add(inst(new THREE.BoxGeometry(5.2, 0.9, 4.2), steel, decks));
  const der = new THREE.ConeGeometry(0.75, 5.2, 4); der.rotateY(Math.PI / 4);
  scene.add(inst(der, white, derricks));
  scene.add(inst(new THREE.BoxGeometry(2.0, 1.5, 1.8), white, houses));
}

// ---------- سایت‌های صنعتی (فلر + مخازن) ----------
export function buildFlareSites(ctx: DecorCtx) {
  const { scene, models, hAt } = ctx;
  const tanks: { x: number; y: number; z: number; s: number; sy?: number; r: number }[] = [];
  const stacks: typeof tanks = [];
  const rng = mulberry(77);
  for (const f of FLARE_SITES) {
    const base = Math.max(hAt(f.x, f.z), 0.5);
    for (let i = 0; i < f.tanks; i++) {
      const a = rng() * 6.28, r = 1.5 + rng() * (2.5 + f.tanks * 0.35);
      const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
      tanks.push({ x, y: Math.max(hAt(x, z), 0.5) + 0.7, z, s: 0.8 + rng() * 0.5, sy: 1.0 + rng() * 0.6, r: 0 });
    }
    for (let i = 0; i < f.n; i++) {
      const a = rng() * 6.28, r = 3 + rng() * (3 + f.n * 0.6);
      const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
      const h = Math.max(hAt(x, z), 0.5);
      stacks.push({ x, y: h + 3.2, z, s: 1, sy: 6.4, r: 0 });
      models.flame(scene as unknown as THREE.Object3D, x, h + 6.4, z, 1.4 + rng() * 0.6);
    }
    void base;
  }
  scene.add(inst(new THREE.CylinderGeometry(1, 1, 1.4, 16), models.mat('#e8e4da', 0.7), tanks));
  scene.add(inst(new THREE.CylinderGeometry(0.14, 0.2, 1, 8), models.mat('#9a5a36', 0.85), stacks));
}

// ---------- لندمارک‌ها ----------
export function buildLandmarks(ctx: DecorCtx) {
  const { scene, models, hAt, anims } = ctx;
  const M = models;
  // برج خلیفه
  {
    const [x, z] = LANDMARKS.burj; const g = new THREE.Group(); g.position.set(x, Math.max(hAt(x, z), 0.5), z);
    const glass = M.mat('#9fc2dc', 0.2, 0.8, '#6fb7ff', 0.25);
    for (let i = 0; i < 6; i++) { const w = 1.8 - i * 0.26, h = 3 + i * 1.6; M.box(g, w, h, w, glass, 0, h / 2, 0, i * 0.4); }
    M.cyl(g, 0.05, 0.12, 4, M.mat('#dfe6ec', 0.4, 0.6), 0, 13.5, 0, 6);
    M.blink(g, 0, 15.6, 0, '#ff3040', 0.14, 2);
    for (let i = 0; i < 8; i++) { const a = i * 0.8, r = 4 + (i % 3) * 2, hh = 2 + (i % 4) * 1.5; M.box(g, 1.3, hh, 1.3, M.windowMat, Math.cos(a) * r, hh / 2, Math.sin(a) * r, a); }
    scene.add(g);
  }
  // قلعه پرتغالی‌های هرمز
  {
    const { x, z } = LANDMARKS.fort; const g = new THREE.Group(); g.position.set(x, Math.max(hAt(x, z), 0.6), z);
    const stone = M.mat('#a3522f', 0.95), stoneD = M.mat('#7d3a21', 0.95);
    M.box(g, 4.2, 1.1, 3.4, stone, 0, 0.55, 0);
    for (const [cx, cz] of [[-2.1, -1.7], [2.1, -1.7], [-2.1, 1.7], [2.1, 1.7]]) M.cyl(g, 0.65, 0.75, 1.9, stoneD, cx, 0.95, cz, 10);
    M.box(g, 1.6, 0.8, 1.4, stoneD, 0, 1.5, 0);
    M.cyl(g, 0.04, 0.05, 2, M.mat('#444', 0.6), 0.6, 2.9, 0.4, 5);
    const flag = M.box(g, 0.7, 0.42, 0.03, M.mat('#16a34a', 0.8), 0.95, 3.6, 0.4); flag.userData.anim = true;
    anims.push((t) => { flag.rotation.y = Math.sin(t * 3) * 0.25; });
    scene.add(g);
  }
  // نیروگاه اتمی بوشهر
  {
    const [x, z] = LANDMARKS.bushehrNpp; const g = new THREE.Group(); g.position.set(x, Math.max(hAt(x, z), 0.5), z);
    M.sphere(g, 2.2, M.mat('#e9e4da', 0.6), 0, 1.0, 0);
    M.cyl(g, 2.2, 2.2, 1.2, M.mat('#e9e4da', 0.6), 0, 0.6, 0, 20);
    M.box(g, 5, 1.6, 3, M.mat('#c9ccd0', 0.8), 4.5, 0.8, 0);
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 4, 18, 1, true), M.mat('#dfe3e6', 0.8)); tw.position.set(-4, 2, 1); (tw.material as THREE.Material).side = THREE.DoubleSide; g.add(tw);
    M.smoke(g, -4, 4.2, 1, 1.6, 0.4, '#ffffff');
    scene.add(g);
  }
  // مسجد شیخ زاید
  {
    const [x, z] = LANDMARKS.abuDhabiMosque; const g = new THREE.Group(); g.position.set(x, Math.max(hAt(x, z), 0.5), z);
    const white = M.mat('#f6f3ec', 0.5, 0.1);
    M.box(g, 7, 1.2, 5, white, 0, 0.6, 0);
    M.sphere(g, 1.6, white, 0, 1.2, 0, true);
    for (const [cx, cz] of [[-2.5, -1.6], [2.5, -1.6], [-2.5, 1.6], [2.5, 1.6]]) M.sphere(g, 0.8, white, cx, 1.2, cz, true);
    for (const [cx, cz] of [[-3.8, -2.8], [3.8, -2.8], [-3.8, 2.8], [3.8, 2.8]]) M.cyl(g, 0.22, 0.3, 5.5, white, cx, 2.75, cz, 8);
    scene.add(g);
  }
  // برج‌های دوحه
  {
    const [x, z] = LANDMARKS.dohaTowers; const g = new THREE.Group(); g.position.set(x, Math.max(hAt(x, z), 0.5), z);
    const rng = mulberry(5);
    for (let i = 0; i < 7; i++) { const a = rng() * 6.28, r = rng() * 4, hh = 4 + rng() * 6; M.box(g, 1.3 + rng(), hh, 1.3 + rng(), M.windowMat, Math.cos(a) * r, hh / 2, Math.sin(a) * r, a); }
    M.cyl(g, 1.0, 1.3, 9, M.mat('#8fb8d8', 0.2, 0.7, '#6fb7ff', 0.2), 0, 4.5, 0, 12);
    scene.add(g);
  }
  // کشتی یونانی کیش
  {
    const { x, z } = LANDMARKS.kishShip; const g = M.merchant(4); g.scale.setScalar(0.7); g.position.set(x, 0.05, z); g.rotation.set(0, 0.6, 0.18);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = M.mat('#5a4a3e', 0.95); if ((o as THREE.Sprite).isSprite) o.visible = false; });
    scene.add(g);
  }
}

// ---------- جاده‌ها و نقاط نور ساحلی ----------
export interface CoastSample { x: number; z: number; }
export function coastSamples(hAt: (x: number, z: number) => number, poly: number[][], step: number, offset: number): CoastSample[][] {
  const runs: CoastSample[][] = []; let cur: CoastSample[] = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[i + 1];
    const len = Math.hypot(bx - ax, bz - az); const n = Math.max(1, Math.floor(len / step));
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let k = 0; k < n; k++) {
      const t = k / n; const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const h1 = hAt(x + nx * offset, z + nz * offset), h2 = hAt(x - nx * offset, z - nz * offset);
      const side = h1 > h2 ? 1 : -1;
      const px = x + nx * offset * side, pz = z + nz * offset * side, h = Math.max(h1, h2);
      if (h > 0.5 && h < 7) cur.push({ x: px, z: pz }); else if (cur.length) { runs.push(cur); cur = []; }
    }
  }
  if (cur.length) runs.push(cur);
  return runs;
}
export function buildRoads(ctx: DecorCtx): CoastSample[] {
  const { scene, hAt } = ctx;
  const mat = new THREE.MeshStandardMaterial({ color: '#5a554f', roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const lights: CoastSample[] = [];
  const P: number[] = [], I: number[] = [];
  const addStrip = (pts: CoastSample[]) => {
    if (pts.length < 3) return;
    const base = P.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * 0.28, nz = (dx / l) * 0.28, y = hAt(pts[i].x, pts[i].z) + 0.06;
      P.push(pts[i].x + nx, y, pts[i].z + nz, pts[i].x - nx, y, pts[i].z - nz);
      if (i < pts.length - 1) { const k = base + i * 2; I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      if (i % 2 === 0) lights.push(pts[i]);
    }
  };
  for (const run of coastSamples(hAt, IRAN_COAST_P, 1.1, 3.2)) addStrip(run.filter((p) => inCore(p.x, p.z) || true));
  for (const run of coastSamples(hAt, ARABIA_COAST_P.slice(30, 72), 1.1, 3.2)) addStrip(run);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m);
  return lights;
}

export function buildBirds(ctx: DecorCtx) {
  const { scene, anims } = ctx;
  const flocks = [{ x: islandById('hormuz').x, z: islandById('hormuz').z, y: 9 }, { x: islandById('qeshm4').x, z: islandById('qeshm4').z - 8, y: 6 }, { x: islandById('kish').x, z: islandById('kish').z, y: 5 }];
  const shape = new THREE.Shape(); shape.moveTo(-0.6, 0.15); shape.lineTo(0, -0.05); shape.lineTo(0.6, 0.15); shape.lineTo(0.5, 0.25); shape.lineTo(0, 0.08); shape.lineTo(-0.5, 0.25); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
  const n = flocks.length * 7;
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#f4f4f4', side: THREE.DoubleSide }), n);
  mesh.frustumCulled = false;
  scene.add(mesh);
  anims.push((t) => {
    let k = 0;
    flocks.forEach((f, fi) => {
      for (let i = 0; i < 7; i++) {
        const ph = i * 0.9 + fi, a = t * 0.3 + ph * 0.6;
        const flap = 0.5 + 0.5 * Math.abs(Math.sin(t * 9 + ph));
        e.set(0, -a, 0); q.setFromEuler(e);
        v.set(f.x + Math.cos(a) * (4 + i * 0.5), f.y + Math.sin(t * 1.3 + ph) * 0.6, f.z + Math.sin(a) * (3 + i * 0.4));
        sc.set(1, 1, 0.6 + flap * 0.6);
        m4.compose(v, q, sc); mesh.setMatrixAt(k++, m4);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}

export const decorClamp = clamp;
