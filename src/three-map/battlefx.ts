import * as THREE from 'three';

/* Battle FX engine — ported from the owner's model pack (src/three/fx.tsx, MIT-style
   pack code) to plain three.js and re-scaled for the game world. Same systems:
   instanced smoke/spark particles, pooled projectiles (7 kinds), pooled explosion
   booms, pooled rail/laser beams, pooled muzzle flashes. Projectiles can home onto
   a live target via a track() callback (the pack homed onto its demo targets). */

export type ShootKind = 'tracer' | 'shell' | 'missile' | 'rocket' | 'hyper' | 'plasma' | 'torpedo';
export interface ShootOpts {
  from: THREE.Vector3; to: THREE.Vector3; kind: ShootKind; color: string;
  dur?: number; arc?: number; size?: number; jitter?: number; air?: boolean;
  track?: () => THREE.Vector3 | null;
}

const PI = Math.PI;
/* PERF: shared lerp-target colors for the hot path. shoot()/spark()/flashAt()/
   explode() and the per-projectile trail spawner used to allocate several
   `new THREE.Color(...)` per call (trails: one per projectile every ~16ms).
   These constants are only ever READ (as lerp targets / setColorAt sources),
   never mutated, so sharing them is safe. */
const C_WARM = new THREE.Color('#fff6d8');
const C_FLAME = new THREE.Color('#ffd27a');
const C_SPARK_MIX = new THREE.Color('#ffe2a0');
const C_FLASH_MIX = new THREE.Color('#fff3c0');
const C_LIGHT_MIX = new THREE.Color('#ffb060');
const C_BOOM_MIX = new THREE.Color('#ff4a10');
const C_TORPEDO_TRAIL = new THREE.Color('#eaf6ff');
const C_HYPER_TRAIL = new THREE.Color('#ffb0d0');
const C_ROCKET_TRAIL = new THREE.Color('#e3e6ea');
const addMat = (c: THREE.Color | string, op = 1) =>
  new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });

class Particles {
  mesh: THREE.InstancedMesh;
  p: Float32Array; v: Float32Array; life: Float32Array; max: Float32Array; size: Float32Array;
  n: number; cur = 0; grav: number; drag: number; mode: 'smoke' | 'spark';
  dummy = new THREE.Object3D();
  constructor(n: number, geo: THREE.BufferGeometry, mat: THREE.Material, grav: number, drag: number, mode: 'smoke' | 'spark') {
    this.n = n;
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n).fill(1); this.size = new Float32Array(n);
    this.grav = grav; this.drag = drag; this.mode = mode;
    const c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) { this.dummy.scale.setScalar(0); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix); this.mesh.setColorAt(i, c); }
  }
  spawn(pos: THREE.Vector3, vx: number, vy: number, vz: number, life: number, size: number, color: THREE.Color) {
    const i = this.cur; this.cur = (this.cur + 1) % this.n;
    this.p.set([pos.x, pos.y, pos.z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    this.life[i] = life; this.max[i] = life; this.size[i] = size;
    this.mesh.setColorAt(i, color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  update(d: number) {
    const dg = Math.pow(this.drag, d * 60);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= d;
      const j = i * 3;
      this.v[j + 1] += this.grav * d;
      this.v[j] *= dg; this.v[j + 1] *= dg; this.v[j + 2] *= dg;
      this.p[j] += this.v[j] * d; this.p[j + 1] += this.v[j + 1] * d; this.p[j + 2] += this.v[j + 2] * d;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const s = this.mode === 'smoke' ? this.size[i] * (0.35 + (1 - k) * 1.7) * Math.min(1, k * 2.5) : this.size[i] * k;
      this.dummy.position.set(this.p[j], Math.max(this.p[j + 1], this.mode === 'spark' ? -0.2 : 0.05), this.p[j + 2]);
      this.dummy.scale.setScalar(this.life[i] <= 0 ? 0 : s);
      if (this.mode === 'spark') {
        this.dummy.lookAt(this.p[j] + this.v[j], this.p[j + 1] + this.v[j + 1], this.p[j + 2] + this.v[j + 2]);
        this.dummy.scale.set(s, s, s * 4);
      }
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface Proj {
  on: boolean; kind: ShootKind; from: THREE.Vector3; to: THREE.Vector3; off: THREE.Vector3;
  t: number; dur: number; arc: number; size: number; trail: number; color: string; air: boolean;
  track?: () => THREE.Vector3 | null;
  g: THREE.Group; glow: THREE.Mesh; body: THREE.Group; flame: THREE.Mesh;
}
interface Boom {
  on: boolean; t: number; size: number; water: boolean;
  g: THREE.Group; fire: THREE.Mesh; core: THREE.Mesh; ring: THREE.Mesh; col: THREE.Mesh;
  fm: THREE.MeshBasicMaterial; cm: THREE.MeshBasicMaterial; rm: THREE.MeshBasicMaterial; wm: THREE.MeshStandardMaterial; color: THREE.Color;
}
interface Beam { on: boolean; t: number; dur: number; m: THREE.Mesh; mat: THREE.MeshBasicMaterial; core: THREE.Mesh }
interface Flash { on: boolean; t: number; g: THREE.Group; mat: THREE.MeshBasicMaterial; light?: THREE.PointLight }

const BOOM_SCALE = 2.0; // pack FX tuned for a ~14-unit camera; game camera is far — booms read bigger

export class BattleFX {
  readonly group = new THREE.Group();
  private smokeP: Particles; private sparkP: Particles;
  private projs: Proj[] = []; private booms: Boom[] = []; private beams: Beam[] = []; private flashes: Flash[] = [];
  private light: THREE.PointLight;
  private queue: { at: number; fn: () => void }[] = [];
  private clock = 0;
  private tmp = new THREE.Vector3(); private tmp2 = new THREE.Vector3(); private col = new THREE.Color();
  private col2 = new THREE.Color(); private col3 = new THREE.Color();
  private bodyMat: THREE.MeshStandardMaterial; private darkMat: THREE.MeshStandardMaterial;

  constructor() {
    this.group.name = 'battlefx';
    this.smokeP = new Particles(420, new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.5, depthWrite: false }), 1.4, 0.97, 'smoke');
    this.sparkP = new Particles(340, new THREE.BoxGeometry(0.09, 0.09, 0.09),
      new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), -22, 0.985, 'spark');
    this.group.add(this.smokeP.mesh, this.sparkP.mesh);

    const glowGeo = new THREE.CapsuleGeometry(0.5, 1, 2, 8).rotateX(PI / 2);
    const bodyGeo = new THREE.CylinderGeometry(0.09, 0.115, 1.15, 10).rotateX(PI / 2);
    const noseGeo = new THREE.ConeGeometry(0.09, 0.36, 10).rotateX(PI / 2).translate(0, 0, 0.75);
    const finGeo = new THREE.BoxGeometry(0.46, 0.03, 0.23).translate(0, 0, -0.48);
    const flameGeo = new THREE.ConeGeometry(0.11, 0.95, 10, 1, true).rotateX(-PI / 2).translate(0, 0, -0.98);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: '#e9edf2', metalness: 0.5, roughness: 0.3 });
    this.darkMat = new THREE.MeshStandardMaterial({ color: '#14161c', metalness: 0.9, roughness: 0.25, emissive: '#ff2d78', emissiveIntensity: 0.6 });
    const darkMat = new THREE.MeshStandardMaterial({ color: '#1b1f27', metalness: 0.8, roughness: 0.3 });
    for (let i = 0; i < 110; i++) {
      const g = new THREE.Group();
      const glow = new THREE.Mesh(glowGeo, addMat('#fff'));
      const body = new THREE.Group();
      const b = new THREE.Mesh(bodyGeo, this.bodyMat);
      const nose = new THREE.Mesh(noseGeo, this.bodyMat);
      const fin1 = new THREE.Mesh(finGeo, darkMat);
      const fin2 = new THREE.Mesh(finGeo, darkMat); fin2.rotation.z = PI / 2;
      body.add(b, nose, fin1, fin2);
      const flame = new THREE.Mesh(flameGeo, addMat('#fff'));
      g.add(glow, body, flame);
      g.visible = false;
      this.group.add(g);
      this.projs.push({ on: false, kind: 'tracer', from: new THREE.Vector3(), to: new THREE.Vector3(), off: new THREE.Vector3(), t: 0, dur: 1, arc: 0, size: 1, trail: 0, color: '#fff', air: false, g, glow, body, flame });
    }
    const fireGeo = new THREE.IcosahedronGeometry(1, 2);
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-PI / 2);
    const colGeo = new THREE.CylinderGeometry(0.25, 0.55, 1, 18, 1, true).translate(0, 0.5, 0);
    for (let i = 0; i < 20; i++) {
      const g = new THREE.Group();
      const fm = addMat('#fff'), cm = addMat('#fff'), rm = addMat('#fff');
      rm.side = THREE.DoubleSide;
      const wm = new THREE.MeshStandardMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.8, roughness: 0.6, depthWrite: false, side: THREE.DoubleSide });
      const fire = new THREE.Mesh(fireGeo, fm), core = new THREE.Mesh(fireGeo, cm), ring = new THREE.Mesh(ringGeo, rm), col = new THREE.Mesh(colGeo, wm);
      g.add(fire, core, ring, col);
      g.visible = false;
      this.group.add(g);
      this.booms.push({ on: false, t: 0, size: 1, water: true, g, fire, core, ring, col, fm, cm, rm, wm, color: new THREE.Color() });
    }
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(PI / 2).translate(0, 0, 0.5);
    for (let i = 0; i < 8; i++) {
      const mat = addMat('#fff');
      const m = new THREE.Mesh(beamGeo, mat);
      const core = new THREE.Mesh(beamGeo, addMat(new THREE.Color('#ffffff').multiplyScalar(4)));
      m.add(core);
      m.visible = false;
      this.group.add(m);
      this.beams.push({ on: false, t: 0, dur: 0.35, m, mat, core });
    }
    // pack-style muzzle flashes (star + cone + core sphere), pooled
    const flashSphere = new THREE.SphereGeometry(0.12, 8, 6);
    const flashCone = new THREE.ConeGeometry(0.13, 0.5, 8, 1, true).rotateX(PI / 2).translate(0, 0, 0.25);
    const flashPlane = new THREE.PlaneGeometry(0.6, 0.08);
    for (let i = 0; i < 14; i++) {
      const mat = addMat('#fff');
      const g = new THREE.Group();
      const s1 = new THREE.Mesh(flashSphere, mat);
      const s2 = new THREE.Mesh(flashCone, mat);
      const s3 = new THREE.Mesh(flashPlane, mat);
      const s4 = new THREE.Mesh(flashPlane, mat); s4.rotation.z = PI / 2;
      g.add(s1, s2, s3, s4);
      g.visible = false;
      this.group.add(g);
      this.flashes.push({ on: false, t: 0, g, mat });
    }
    this.light = new THREE.PointLight('#ffaa55', 0, 30, 1.4);
    this.group.add(this.light);
  }

  schedule(delay: number, fn: () => void) { this.queue.push({ at: this.clock + delay, fn }); }

  smoke(p: THREE.Vector3, size: number, dark = true) {
    this.col.set(dark ? '#2a2522' : '#d9dde3');
    this.smokeP.spawn(p, (Math.random() - 0.5) * 0.9, 0.9 + Math.random() * 1.1, (Math.random() - 0.5) * 0.9, 1.4 + Math.random() * 1.2, size, this.col);
  }
  spark(p: THREE.Vector3, color: string, count: number) {
    this.col.set(color).lerp(C_SPARK_MIX, 0.5).multiplyScalar(6);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * PI * 2, e = Math.random() * 0.9 + 0.2, sp = 5 + Math.random() * 12;
      this.sparkP.spawn(p, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 3.5, Math.sin(a) * Math.cos(e) * sp, 0.4 + Math.random() * 0.6, 1.1 + Math.random() * 1.4, this.col);
    }
  }
  flashAt(p: THREE.Vector3, dir: THREE.Vector3, color: string, size = 1) {
    const f = this.flashes.find(x => !x.on) ?? this.flashes[0];
    f.on = true; f.t = 1;
    f.g.position.copy(p);
    this.tmp.copy(p).add(dir);
    f.g.lookAt(this.tmp);
    f.g.rotation.z = Math.random() * 6;
    f.g.userData.size = size;
    f.g.scale.setScalar(size);
    f.mat.color.set(color).lerp(C_FLASH_MIX, 0.5).multiplyScalar(6);
    f.g.visible = true;
  }
  shoot(o: ShootOpts) {
    const pr = this.projs.find(p => !p.on);
    if (!pr) return;
    pr.on = true; pr.kind = o.kind; pr.from.copy(o.from); pr.to.copy(o.to);
    const j = o.jitter ?? 0.25;
    pr.off.set((Math.random() - 0.5) * j, (Math.random() - 0.5) * j * 0.5, (Math.random() - 0.5) * j);
    pr.dur = o.dur ?? 0.6; pr.arc = o.arc ?? 0; pr.size = o.size ?? 1; pr.t = 0; pr.trail = 0; pr.color = o.color; pr.air = !!o.air; pr.track = o.track;
    const c = this.col2.set(o.color);
    (pr.glow.material as THREE.MeshBasicMaterial).color.copy(c).lerp(C_WARM, 0.35).multiplyScalar(o.kind === 'tracer' ? 7 : 5);
    (pr.flame.material as THREE.MeshBasicMaterial).color.copy(c).lerp(C_FLAME, 0.6).multiplyScalar(7);
    const missile = o.kind === 'missile' || o.kind === 'rocket' || o.kind === 'hyper' || o.kind === 'torpedo';
    pr.body.visible = missile;
    pr.flame.visible = missile && o.kind !== 'torpedo';
    pr.glow.visible = true;
    const s = pr.size;
    if (o.kind === 'tracer') pr.glow.scale.set(0.07 * s, 0.07 * s, 2.4 * s);
    else if (o.kind === 'shell') pr.glow.scale.set(0.2 * s, 0.2 * s, 0.4 * s);
    else if (o.kind === 'plasma') pr.glow.scale.set(0.55 * s, 0.55 * s, 0.6 * s);
    else pr.glow.scale.set(0.11 * s, 0.11 * s, 0.15 * s);
    pr.body.scale.setScalar(o.kind === 'rocket' ? 0.8 * s : 1.25 * s);
    (pr.body.children[0] as THREE.Mesh).material = o.kind === 'hyper' ? this.darkMat : this.bodyMat;
    pr.g.visible = true;
  }
  explode(p: THREE.Vector3, color: string, size: number, water = true) {
    size *= BOOM_SCALE;
    const b = this.booms.find(x => !x.on) ?? this.booms[0];
    b.on = true; b.t = 0; b.size = size; b.water = water && p.y < 2.5;
    b.color.set(color);
    b.g.position.copy(p);
    if (b.water) b.g.position.y = Math.max(0.05, Math.min(p.y, 0.4));
    b.g.visible = true;
    this.light.position.copy(p); this.light.position.y += 1.2;
    this.light.color.set(color).lerp(C_LIGHT_MIX, 0.6);
    this.light.intensity = 60 * size;
    this.spark(p, color, Math.round(8 + size * 6));
    for (let i = 0; i < Math.round(3 + size * 2.5); i++) {
      this.tmp.copy(p); this.tmp.x += (Math.random() - 0.5) * size; this.tmp.y += Math.random() * size * 0.4; this.tmp.z += (Math.random() - 0.5) * size;
      this.smoke(this.tmp, 0.5 + size * 0.35, true);
    }
  }
  rail(a: THREE.Vector3, b2: THREE.Vector3, color: string, dur = 0.35) {
    const bm = this.beams.find(x => !x.on) ?? this.beams[0];
    bm.on = true; bm.t = 0; bm.dur = dur;
    bm.m.position.copy(a);
    bm.m.lookAt(b2);
    bm.m.userData.len = a.distanceTo(b2);
    bm.mat.color.set(color).multiplyScalar(5);
    bm.m.visible = true;
  }

  update(d0: number) {
    const d = Math.min(d0, 0.05);
    this.clock += d;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.clock >= this.queue[i].at) { const q = this.queue[i]; this.queue.splice(i, 1); q.fn(); }
    }
    const tmp = this.tmp, tmp2 = this.tmp2;
    for (const pr of this.projs) {
      if (!pr.on) continue;
      if (pr.track) { const live = pr.track(); if (live) pr.to.lerp(tmp.copy(live).add(pr.off), Math.min(1, d * 6)); }
      pr.t += d / pr.dur;
      const posAt = (tt: number, out: THREE.Vector3) => {
        out.copy(pr.from).lerp(pr.to, tt);
        out.y += pr.arc * 4 * tt * (1 - tt);
        if (pr.kind === 'torpedo') out.y = Math.min(out.y, 0.08 + (1 - Math.min(1, tt * 5)) * (pr.from.y - 0.08));
        return out;
      };
      const t = Math.min(1, pr.t);
      posAt(t, tmp);
      posAt(Math.min(1.02, t + 0.02), tmp2);
      pr.g.position.copy(tmp);
      if (tmp2.distanceToSquared(tmp) > 1e-6) pr.g.lookAt(tmp2);
      pr.flame.scale.set(1, 1, 0.7 + Math.random() * 0.6);
      pr.trail -= d;
      if (pr.trail <= 0 && pr.kind !== 'tracer' && pr.kind !== 'shell') {
        pr.trail = pr.kind === 'torpedo' ? 0.03 : 0.016;
        if (pr.kind === 'torpedo') this.smokeP.spawn(tmp, (Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4, 0.9, 0.3, C_TORPEDO_TRAIL);
        else if (pr.kind === 'plasma') this.sparkP.spawn(tmp, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.3, 1.6, this.col3.set(pr.color).multiplyScalar(5));
        else this.smokeP.spawn(tmp, (Math.random() - 0.5) * 0.3, 0.3, (Math.random() - 0.5) * 0.3, pr.kind === 'hyper' ? 1.0 : 1.8, pr.kind === 'rocket' ? 0.3 : 0.45, pr.kind === 'hyper' ? C_HYPER_TRAIL : C_ROCKET_TRAIL);
      }
      if (pr.t >= 1) {
        pr.on = false;
        pr.g.visible = false;
        const size = { tracer: 0.3, shell: 1.1, missile: 1.7, rocket: 0.9, hyper: 2.6, plasma: 2.1, torpedo: 1.6 }[pr.kind] * (pr.kind === 'tracer' ? 1 : pr.size);
        if (pr.kind === 'tracer') { this.spark(pr.to, pr.color, 3); if (Math.random() < 0.25) this.explode(pr.to, pr.color, 0.3, false); }
        else this.explode(pr.to, pr.kind === 'plasma' || pr.kind === 'hyper' ? pr.color : '#ff8a2a', size, !pr.air);
      }
    }
    for (const b of this.booms) {
      if (!b.on) continue;
      b.t += d / (0.9 + b.size * 0.25);
      const t = b.t;
      if (t >= 1) { b.on = false; b.g.visible = false; continue; }
      const e = 1 - Math.pow(1 - t, 3);
      const s = b.size;
      b.fire.scale.setScalar(s * (0.25 + e * 0.9));
      b.fm.color.copy(b.color).lerp(C_BOOM_MIX, t).multiplyScalar(6 * (1 - t) * (1 - t) + 0.05);
      b.fm.opacity = 1 - t;
      b.core.scale.setScalar(s * 0.45 * Math.max(0, 1 - t * 3));
      b.cm.color.set('#fff8e0').multiplyScalar(10);
      b.ring.scale.setScalar(s * (0.3 + e * 2.4));
      b.rm.color.copy(b.color).multiplyScalar(4 * (1 - t));
      b.rm.opacity = 1 - t;
      b.col.visible = b.water;
      const ch = Math.sin(Math.min(1, t * 1.3) * PI);
      b.col.scale.set(s * (0.6 + t * 0.6), s * 2.4 * ch + 0.001, s * (0.6 + t * 0.6));
      b.wm.opacity = 0.85 * (1 - t);
    }
    for (const bm of this.beams) {
      if (!bm.on) continue;
      bm.t += d / bm.dur;
      if (bm.t >= 1) { bm.on = false; bm.m.visible = false; continue; }
      const w = 0.2 * (1 - bm.t);
      bm.m.scale.set(w, w, bm.m.userData.len as number);
      bm.core.scale.set(0.35, 0.35, 1);
      bm.mat.opacity = 1 - bm.t;
    }
    for (const f of this.flashes) {
      if (!f.on) continue;
      f.t -= d * 14;
      if (f.t <= 0.01) { f.on = false; f.g.visible = false; continue; }
      const kk = f.t;
      f.g.scale.setScalar((0.6 + kk) * (f.g.userData.size ?? 1));
      f.mat.opacity = kk;
    }
    this.light.intensity *= Math.pow(0.02, d);
    this.smokeP.update(d);
    this.sparkP.update(d);
  }
}
