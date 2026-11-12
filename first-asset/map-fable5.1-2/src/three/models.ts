// ============================================================
// models.ts — کارخانه مدل‌های سه‌بعدی (برجک، سکو، شهر، کشتی، هواگرد)
// ============================================================
import * as THREE from 'three';
import { mulberry, towerById } from './world';

export type AnimFn = (t: number, dt: number) => void;
export interface ModelTextures { flame: THREE.Texture; smoke: THREE.Texture; glow: THREE.Texture; helipad: THREE.Texture; wake: THREE.Texture; }

export class Models {
  private mats = new Map<string, THREE.Material>();
  private boxGeo = new THREE.BoxGeometry(1, 1, 1);
  private cylGeos = new Map<string, THREE.CylinderGeometry>();
  private hullGeos = new Map<string, THREE.ExtrudeGeometry>();
  private anims: AnimFn[];
  private tex: ModelTextures;
  windowMat: THREE.MeshStandardMaterial;
  lampMats: THREE.MeshBasicMaterial[] = [];

  constructor(anims: AnimFn[], tex: ModelTextures, windowMat: THREE.MeshStandardMaterial) {
    this.anims = anims; this.tex = tex; this.windowMat = windowMat;
  }

  // ---------- متریال‌ها ----------
  mat(color: string, rough = 0.8, metal = 0.1, emissive?: string, ei = 0): THREE.MeshStandardMaterial {
    const k = `s${color}${rough}${metal}${emissive}${ei}`;
    let m = this.mats.get(k) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
      this.mats.set(k, m);
    }
    return m;
  }
  light(color: string, power = 3): THREE.MeshBasicMaterial {
    const k = `l${color}${power}`;
    let m = this.mats.get(k) as THREE.MeshBasicMaterial | undefined;
    if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), toneMapped: true }); this.mats.set(k, m); }
    return m;
  }
  private get M() {
    return {
      conc: this.mat('#a7adb3', 0.92), concD: this.mat('#7d858d', 0.9), steel: this.mat('#4a535d', 0.45, 0.6),
      dark: this.mat('#2c333b', 0.5, 0.55), camo: this.mat('#b3a27a', 0.85), olive: this.mat('#6a7350', 0.8),
      white: this.mat('#eceae4', 0.7), yellow: this.mat('#e0a635', 0.55, 0.3), rust: this.mat('#9a5a36', 0.85),
      silver: this.mat('#c9d1d8', 0.35, 0.75), blue: this.mat('#3f6f9e', 0.6, 0.3), red: this.mat('#b8372b', 0.6),
      glass: this.mat('#1e3a52', 0.15, 0.8), black: this.mat('#15181c', 0.6),
    };
  }
  private cylGeo(rt: number, rb: number, seg: number): THREE.CylinderGeometry {
    const k = `${rt}_${rb}_${seg}`;
    let g = this.cylGeos.get(k);
    if (!g) { g = new THREE.CylinderGeometry(rt, rb, 1, seg); this.cylGeos.set(k, g); }
    return g;
  }
  box(p: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0): THREE.Mesh {
    const o = new THREE.Mesh(this.boxGeo, m);
    o.scale.set(w, h, d); o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
    o.castShadow = true; o.receiveShadow = true; p.add(o); return o;
  }
  cyl(p: THREE.Object3D, rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12, rx = 0, rz = 0): THREE.Mesh {
    const o = new THREE.Mesh(this.cylGeo(rt, rb, seg), m);
    o.scale.y = h; o.position.set(x, y, z); o.rotation.x = rx; o.rotation.z = rz;
    o.castShadow = true; o.receiveShadow = true; p.add(o); return o;
  }
  sphere(p: THREE.Object3D, r: number, m: THREE.Material, x = 0, y = 0, z = 0, hemi = false): THREE.Mesh {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, hemi ? Math.PI / 2 : Math.PI), m);
    o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); return o;
  }
  blink(p: THREE.Object3D, x: number, y: number, z: number, color = '#ff3030', size = 0.13, speed = 3.2): THREE.Mesh {
    const o = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), this.light(color, 6));
    o.position.set(x, y, z); o.userData.anim = true; p.add(o);
    const ph = Math.random() * 6;
    this.anims.push((t) => { o.visible = Math.sin(t * speed + ph) > 0.25; });
    return o;
  }
  lamp(p: THREE.Object3D, x: number, y: number, z: number, color = '#ffd9a0', size = 0.09) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 4), this.light(color, 5));
    o.position.set(x, y, z); p.add(o);
  }
  flame(p: THREE.Object3D, x: number, y: number, z: number, size = 1.3) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.flame, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2.2, 1.6, 1.1) }));
    sp.position.set(x, y + size * 0.5, z); p.add(sp);
    const ph = Math.random() * 10;
    this.anims.push((t) => {
      const f = 1 + 0.2 * Math.sin(t * 14 + ph) + 0.1 * Math.sin(t * 33 + ph);
      sp.scale.set(size * f * 0.8, size * (2.1 - f * 0.6), 1);
    });
    this.smoke(p, x, y + size, z, 0.9, 0.28);
  }
  smoke(p: THREE.Object3D, x: number, y: number, z: number, size = 1, op = 0.3, color = '#cfcfcf') {
    for (let i = 0; i < 3; i++) {
      const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.smoke, transparent: true, depthWrite: false, color }));
      p.add(sm);
      const off = i / 3;
      this.anims.push((t) => {
        const k = (t * 0.2 + off) % 1;
        sm.position.set(x + k * 2.2 * size, y + k * 4.5 * size, z + k * 0.8 * size);
        sm.scale.setScalar((0.8 + k * 3.2) * size);
        (sm.material as THREE.SpriteMaterial).opacity = op * Math.sin(k * Math.PI);
      });
    }
  }

  // ---------- برجک‌ها ----------
  tower(type: string, level: number, branch: 'A' | 'B' | null): THREE.Group {
    const g = new THREE.Group();
    const M = this.M;
    const def = towerById(type);
    const accentCol = def?.color ?? '#ffffff';
    const accent = this.mat(accentCol, 0.4, 0.2, accentCol, 2.2);
    // پایه شش‌ضلعی + نوار نورانی
    this.cyl(g, 1.55, 1.8, 0.5, M.concD, 0, 0.25, 0, 6);
    this.cyl(g, 1.42, 1.55, 0.12, M.conc, 0, 0.56, 0, 6);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.05, 6, 6), accent);
    rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI / 6; rim.position.y = 0.46; g.add(rim);
    for (let i = 0; i < Math.min(level, 3); i++) this.box(g, 0.2, 0.16, 0.08, this.light('#ffcf4a', 3), -0.3 + i * 0.3, 0.3, 1.62);
    for (let i = 0; i < 6; i++) { // کیسه شن
      const a = (i / 6) * Math.PI * 2 + 0.5;
      this.box(g, 0.55, 0.22, 0.3, M.camo, Math.cos(a) * 1.25, 0.72, Math.sin(a) * 1.25, -a);
    }
    const head = new THREE.Group(); head.position.y = 0.62; head.userData.anim = true; g.add(head);
    const fire = (x: number, y: number, z: number, every: number, size = 1) => {
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.flame, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(3, 2.2, 1.2) }));
      fl.position.set(x, y, z); fl.visible = false; head.add(fl);
      const ph = Math.random() * every;
      this.anims.push((t) => {
        const k = ((t + ph) % every) / every;
        fl.visible = k < 0.035;
        if (fl.visible) fl.scale.setScalar(size * (1 + Math.random() * 0.5));
      });
    };
    if (type === 'autocannon') {
      this.cyl(head, 0.8, 0.9, 0.3, M.steel, 0, 0.15, 0, 16);
      this.box(head, 1.15, 0.65, 1.25, M.camo, 0, 0.62, -0.05);
      this.box(head, 0.95, 0.2, 0.9, M.camo, 0, 1.02, -0.15);
      this.box(head, 0.6, 0.45, 0.35, M.dark, 0, 0.62, 0.62);
      for (const s of [-0.18, 0.18]) this.cyl(head, 0.06, 0.07, 1.7, M.dark, s, 0.66, 1.45, 8, Math.PI / 2);
      const dish = this.cyl(head, 0.32, 0.32, 0.05, M.white, 0, 1.4, -0.4, 16, Math.PI / 2.4);
      this.anims.push((t) => { head.rotation.y = Math.sin(t * 0.6) * 1.1; dish.rotation.z = t * 3; });
      fire(0, 0.66, 2.4, 1.6, 0.9);
    } else if (type === 'howitzer') {
      this.sphere(head, 1.0, M.camo, 0, 0.1, 0, true);
      this.box(head, 0.7, 0.55, 0.5, M.dark, 0, 0.55, 0.75);
      const barrel = new THREE.Group(); barrel.position.set(0, 0.6, 0.8); barrel.rotation.x = -0.42; head.add(barrel);
      this.cyl(barrel, 0.13, 0.17, 2.6, M.dark, 0, 0, 1.3, 10, Math.PI / 2);
      this.box(barrel, 0.36, 0.3, 0.36, M.steel, 0, 0, 2.6);
      for (let i = 0; i < 3; i++) this.box(g, 0.45, 0.3, 0.35, M.olive, -1.1 + i * 0.05, 0.85 + i * 0.3, -0.9);
      this.anims.push((t) => { head.rotation.y = Math.sin(t * 0.3) * 0.8; const k = (t % 4.5) / 4.5; barrel.position.z = 0.8 - (k < 0.06 ? (0.06 - k) * 5 : 0); });
      fire(0, 1.75, 3.2, 4.5, 2.0);
    } else if (type === 'missile') {
      this.box(g, 2.6, 0.18, 2.3, M.concD, 0, 0.62, 0);
      // لانچر TEL
      this.box(head, 1.0, 0.45, 2.6, M.olive, 0, 0.3, 0);
      this.box(head, 0.95, 0.55, 0.65, M.olive, 0, 0.62, 1.15);
      this.box(head, 0.8, 0.22, 0.05, M.glass, 0, 0.72, 1.48);
      for (const z of [-0.85, -0.25, 0.4]) for (const s of [-0.52, 0.52]) this.cyl(head, 0.2, 0.2, 0.16, M.black, s, 0.12, z, 10, 0, Math.PI / 2);
      const launcher = new THREE.Group(); launcher.position.set(0, 0.6, -1.1); head.add(launcher);
      for (const s of [-0.26, 0.26]) {
        this.cyl(launcher, 0.22, 0.22, 2.4, M.camo, s, 0, 1.2, 12, Math.PI / 2);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 12), M.white); tip.rotation.x = Math.PI / 2; tip.position.set(s, 0, 2.55); launcher.add(tip);
      }
      this.blink(head, 0, 0.95, 1.2, '#ff3040');
      this.anims.push((t) => { const k = (Math.sin(t * 0.35) + 1) / 2; launcher.rotation.x = -k * 0.95; head.rotation.y = 0.4 + Math.sin(t * 0.15) * 0.3; });
    } else if (type === 'airdef') {
      this.box(head, 1.0, 0.3, 1.8, M.olive, -0.55, 0.15, 0);
      const radar = new THREE.Group(); radar.position.set(-0.55, 0.3, 0); head.add(radar);
      this.cyl(radar, 0.12, 0.15, 0.7, M.steel, 0, 0.35, 0, 8);
      const panel = this.box(radar, 1.25, 0.95, 0.1, M.dark, 0, 1.05, 0, 0, -0.35);
      const grid = this.box(radar, 1.1, 0.8, 0.02, this.mat('#3a5f78', 0.3, 0.6, accentCol, 0.6), 0, 1.06, 0.06, 0, -0.35);
      void panel; void grid;
      const lau = new THREE.Group(); lau.position.set(0.65, 0.2, 0); head.add(lau);
      for (let i = 0; i < 4; i++) {
        const c = this.box(lau, 0.3, 0.3, 1.9, M.camo, (i % 2) * 0.34 - 0.17, 0.75 + Math.floor(i / 2) * 0.34, 0, 0, -0.95);
        void c;
      }
      this.anims.push((t) => { radar.rotation.y = t * 1.4; lau.rotation.y = Math.sin(t * 0.4) * 0.6; });
    } else if (type === 'ew') {
      const H = 3.6;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = this.box(g, 0.08, H, 0.08, M.steel, sx * 0.42, 0.6 + H / 2, sz * 0.42);
        leg.rotation.set(sz * -0.09, 0, sx * 0.09);
      }
      for (let i = 0; i < 4; i++) {
        const y = 1.1 + i * 0.8, w = 0.95 - i * 0.14;
        this.box(g, w, 0.06, 0.06, M.steel, 0, y, w / 2); this.box(g, w, 0.06, 0.06, M.steel, 0, y, -w / 2);
        this.box(g, 0.06, 0.06, w, M.steel, w / 2, y, 0); this.box(g, 0.06, 0.06, w, M.steel, -w / 2, y, 0);
      }
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 8, 32), accent); r1.position.y = 2.6;
      const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 32), accent); r2.position.y = 3.4;
      r1.userData.anim = true; r2.userData.anim = true; g.add(r1, r2);
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), this.light(accentCol, 3)); orb.position.y = 4.45; orb.userData.anim = true; g.add(orb);
      const dish = this.sphere(g, 0.5, M.white, 0.6, 2.2, 0, true); dish.rotation.z = -Math.PI / 2.3;
      const wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(accentCol).multiplyScalar(2), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      wave.rotation.x = -Math.PI / 2; wave.position.y = 0.7; wave.userData.anim = true; g.add(wave);
      this.anims.push((t) => {
        r1.rotation.x = Math.PI / 2 + Math.sin(t) * 0.4; r1.rotation.y = t * 1.5;
        r2.rotation.x = Math.PI / 2; r2.rotation.z = -t * 2;
        orb.scale.setScalar(1 + 0.2 * Math.sin(t * 5));
        const k = (t * 0.45) % 1; wave.scale.setScalar(1 + k * 6); (wave.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
      });
    } else { // garrison
      this.box(g, 2.2, 1.0, 1.7, M.camo, 0, 1.05, -0.3);
      const roof = this.cyl(g, 0.9, 0.9, 2.3, M.olive, 0, 1.55, -0.3, 12, 0, Math.PI / 2); roof.scale.set(1, 2.3, 0.55);
      this.box(g, 1.2, 0.14, 2.6, M.concD, 0, 0.4, 1.8, 0, 0.18);
      this.cyl(g, 0.04, 0.04, 2.2, M.steel, 0.9, 1.6, -1.0, 6);
      const flag = this.box(g, 0.75, 0.45, 0.03, this.mat('#16a34a', 0.8), 1.3, 2.45, -1.0); flag.userData.anim = true;
      for (const s of [-1, 0, 1]) {
        const boat = this.speedboat('#d6dade', false);
        boat.scale.setScalar(0.75);
        boat.position.set(s * 0.95, 0, 3.0 + Math.abs(s) * 0.4);
        boat.userData.isBoat = true; boat.userData.baseY = -0.6; boat.userData.anim = true;
        g.add(boat);
        const ph = s * 1.7;
        this.anims.push((t) => { boat.position.y = (boat.userData.baseY as number) + Math.sin(t * 2 + ph) * 0.06; boat.rotation.z = Math.sin(t * 1.6 + ph) * 0.06; });
      }
      this.anims.push((t) => { flag.rotation.y = Math.sin(t * 3) * 0.25; });
    }
    if (level >= 4) {
      const gold = this.mat('#ffcf4a', 0.3, 0.8, '#ff9d00', 0.8);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.09, 8, 6), gold); trim.rotation.x = Math.PI / 2; trim.rotation.z = Math.PI / 6; trim.position.y = 0.52; g.add(trim);
      if (branch === 'A') {
        const dome = this.sphere(g, 0.55, this.mat('#f2f4f6', 0.3, 0.2), -1.0, 1.5, -0.9);
        this.cyl(g, 0.12, 0.15, 0.9, M.steel, -1.0, 0.95, -0.9, 8);
        void dome;
      } else {
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), this.light(accentCol, 4));
        core.position.set(-1.05, 2.0, -0.9); core.userData.anim = true; g.add(core);
        for (let i = 0; i < 3; i++) { const coil = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 6, 20), gold); coil.rotation.x = Math.PI / 2; coil.position.set(-1.05, 0.9 + i * 0.32, -0.9); g.add(coil); }
        this.cyl(g, 0.1, 0.12, 1.4, M.steel, -1.05, 1.1, -0.9, 8);
        this.anims.push((t) => { core.rotation.y = t * 2.5; core.position.y = 2.0 + Math.sin(t * 2) * 0.12; });
      }
    }
    g.scale.setScalar(1 + (Math.min(level, 4) - 1) * 0.11);
    return g;
  }

  // ---------- سکوی نفتی ----------
  rig(): THREE.Group {
    const g = new THREE.Group();
    const M = this.M;
    const legs: [number, number][] = [[-2, -1.5], [2, -1.5], [-2, 1.5], [2, 1.5]];
    for (const [x, z] of legs) this.cyl(g, 0.24, 0.3, 8, M.yellow, x, -1.5, z, 10);
    for (const y of [-0.6, 1.2]) {
      this.box(g, 4, 0.12, 0.12, M.steel, 0, y, -1.5); this.box(g, 4, 0.12, 0.12, M.steel, 0, y, 1.5);
      this.box(g, 0.12, 0.12, 3, M.steel, -2, y, 0); this.box(g, 0.12, 0.12, 3, M.steel, 2, y, 0);
      this.box(g, 0.1, 0.1, 4.6, M.steel, -2, y + 0.9, 0, 0, 0.66); this.box(g, 0.1, 0.1, 4.6, M.steel, 2, y + 0.9, 0, 0, -0.66);
    }
    this.box(g, 5.6, 0.45, 4.4, M.steel, 0, 2.6, 0);
    this.box(g, 5.2, 0.4, 4.0, M.yellow, 0, 3.6, 0);
    for (const [x, z] of legs) this.box(g, 0.18, 0.95, 0.18, M.steel, x * 1.1, 3.1, z * 1.1);
    // محل اقامت + هلی‌پد
    this.box(g, 1.9, 1.5, 1.7, this.windowMat, -1.55, 4.55, 1.05);
    this.box(g, 2.6, 0.12, 2.4, M.steel, -1.85, 5.35, 1.3);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshStandardMaterial({ map: this.tex.helipad, roughness: 0.8 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(-1.85, 5.42, 1.3); g.add(pad);
    for (const [x, z] of [[-3.1, 0.1], [-0.6, 0.1], [-3.1, 2.5], [-0.6, 2.5]]) this.lamp(g, x, 5.5, z, '#9cff9c', 0.07);
    // دکل حفاری
    const H = 5.2, by = 3.8;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = this.box(g, 0.1, H, 0.1, M.white, 0.9 + sx * 0.45, by + H / 2, -1.0 + sz * 0.45);
      leg.rotation.set(sz * -0.075, 0, sx * 0.075);
    }
    for (let i = 0; i < 5; i++) {
      const y = by + 0.5 + i * 1.0, w = 0.9 - i * 0.13;
      this.box(g, w, 0.06, 0.06, M.white, 0.9, y, -1.0 + w / 2); this.box(g, w, 0.06, 0.06, M.white, 0.9, y, -1.0 - w / 2);
      this.box(g, 0.06, 0.06, w, M.white, 0.9 + w / 2, y, -1.0); this.box(g, 0.06, 0.06, w, M.white, 0.9 - w / 2, y, -1.0);
    }
    this.box(g, 0.5, 0.35, 0.5, M.yellow, 0.9, by + H + 0.1, -1.0);
    this.blink(g, 0.9, by + H + 0.4, -1.0);
    // جرثقیل
    this.cyl(g, 0.22, 0.26, 1.2, M.yellow, 2.2, 4.4, 1.5, 10);
    const boom = new THREE.Group(); boom.position.set(2.2, 5.0, 1.5); boom.userData.anim = true; g.add(boom);
    this.box(boom, 0.18, 0.18, 3.6, M.yellow, 0, 1.0, 1.6, 0, -0.55);
    this.anims.push((t) => { boom.rotation.y = Math.sin(t * 0.25) * 1.2; });
    // مخازن و لوله
    for (const x of [1.4, 2.2]) this.cyl(g, 0.4, 0.4, 1.0, M.white, x, 4.3, -0.2 + (x - 1.4) * 0, 14);
    this.cyl(g, 0.12, 0.12, 4.6, M.silver, 0, 3.95, -1.85, 8, 0, Math.PI / 2);
    // بوم مشعل
    const flareBoom = new THREE.Group(); flareBoom.position.set(-2.6, 3.8, -1.8); flareBoom.rotation.y = 0.6; g.add(flareBoom);
    this.box(flareBoom, 0.16, 0.16, 4.2, M.steel, 0, 1.2, -1.75, 0, 0.62);
    this.flame(flareBoom, 0, 2.55, -3.5, 1.5);
    for (const [x, z] of [[2.6, -2], [2.6, 2], [-2.6, -2], [0, 2.1]]) this.lamp(g, x, 3.95, z);
    this.blink(g, -1.55, 5.45, 0.2, '#ffffff', 0.08, 1.6);
    return g;
  }

  // ---------- تاسیسات شهری/صنعتی ----------
  city(kind: string): THREE.Group {
    const g = new THREE.Group();
    const M = this.M;
    if (kind === 'refinery') {
      this.box(g, 9, 0.12, 6.5, M.concD, 0, 0.06, 0);
      this.cyl(g, 0.65, 0.75, 6, M.silver, -2.6, 3, -1.2, 16);
      this.cyl(g, 0.5, 0.6, 4.8, M.silver, -1.2, 2.4, -1.6, 14);
      this.cyl(g, 0.45, 0.5, 5.4, M.silver, -2.0, 2.7, 0.4, 14);
      for (let i = 0; i < 3; i++) this.box(g, 1.8, 0.05, 0.05, M.steel, -1.9, 1.5 + i * 1.4, -1.4);
      for (const [x, z] of [[1.6, -1.6], [3.1, -1.6], [1.6, 0], [3.1, 0]]) { this.sphere(g, 0.75, M.white, x, 1.0, z); this.cyl(g, 0.4, 0.5, 0.4, M.steel, x, 0.2, z, 8); }
      for (const [x, z] of [[-3, 2.2], [-1.2, 2.4], [0.6, 2.4], [2.4, 2.2]]) { this.cyl(g, 0.85, 0.85, 1.2, M.white, x, 0.6, z, 18); this.cyl(g, 0.87, 0.87, 0.1, M.rust, x, 1.22, z, 18); }
      for (let i = 0; i < 6; i++) this.box(g, 0.1, 0.1, 6, M.rust, 0.2 + i * 0.12, 0.6, 0, 0, 0, 0);
      this.cyl(g, 0.16, 0.2, 7.5, M.rust, -4, 3.75, -2.5, 8);
      this.flame(g, -4, 7.5, -2.5, 1.6);
      for (const [x, z] of [[-2.6, -1.2], [-1.2, -1.6], [-2.0, 0.4]]) this.blink(g, x, x === -2.6 ? 6.1 : 5, z);
      for (let i = 0; i < 8; i++) this.lamp(g, -4 + i * 1.1, 0.4, 3.1);
    } else if (kind === 'pier') {
      this.box(g, 3.4, 0.4, 9, M.concD, 0, 0.35, 3.5);
      for (let z = 0; z < 8; z += 1.6) for (const x of [-1.5, 1.5]) this.cyl(g, 0.15, 0.15, 2.6, M.rust, x, -0.9, z, 8);
      // جرثقیل‌های STS
      for (const z of [1.8, 5.2]) {
        const cr = new THREE.Group(); cr.position.set(0, 0.55, z); g.add(cr);
        for (const [x, zz] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) this.box(cr, 0.16, 3.4, 0.16, M.blue, x, 1.7, zz);
        this.box(cr, 2.6, 0.25, 0.25, M.blue, 0, 3.3, -0.6); this.box(cr, 2.6, 0.25, 0.25, M.blue, 0, 3.3, 0.6);
        this.box(cr, 6.5, 0.3, 0.35, M.blue, 2.4, 3.65, 0);
        this.box(cr, 0.7, 0.5, 0.7, M.white, -0.9, 3.95, 0);
        this.blink(cr, 5.6, 3.9, 0, '#ff4040', 0.1);
        const trolley = this.box(cr, 0.5, 0.3, 0.5, M.yellow, 2, 3.35, 0); trolley.userData.anim = true;
        this.anims.push((t) => { trolley.position.x = 2.5 + Math.sin(t * 0.6 + z) * 2.5; });
      }
      const cc = ['#c94f36', '#3f8f5f', '#3f6f9e', '#d9a441', '#e8e4da', '#7d3c98'];
      for (let i = 0; i < 12; i++) this.box(g, 0.75, 0.55, 1.5, this.mat(cc[i % 6], 0.7), -1.0 + (i % 3) * 0.95 - 0.0, 0.85 + Math.floor(i / 6) * 0.55, 6.6 + (Math.floor(i / 3) % 2) * 1.6);
      const ship = this.merchant(2);
      ship.position.set(3.6, 0, 3.6 - 0); ship.rotation.y = 0;
      ship.userData.isBoat = true; ship.userData.baseY = -0.55; ship.userData.anim = true;
      g.add(ship);
      this.anims.push((t) => { ship.position.y = (ship.userData.baseY as number) + Math.sin(t * 1.2) * 0.04; });
      for (let z = 0; z < 8; z += 2) this.lamp(g, -1.6, 0.8, z);
    } else if (kind === 'steel') {
      this.box(g, 5.8, 2.0, 3.8, M.blue, 0, 1.0, 0);
      this.box(g, 6.0, 0.3, 4.0, M.steel, 0, 2.1, 0);
      const roof = this.cyl(g, 1.9, 1.9, 5.8, M.steel, 0, 2.2, 0, 12, 0, Math.PI / 2); roof.scale.set(1, 5.8, 0.25);
      this.cyl(g, 0.4, 0.5, 5.2, M.rust, -2.0, 2.6, -1.4, 10);
      this.cyl(g, 0.35, 0.45, 4.6, M.rust, -1.0, 2.3, -1.6, 10);
      this.flame(g, -2.0, 5.2, -1.4, 0.8);
      this.smoke(g, -1.0, 4.6, -1.6, 1.2, 0.35, '#8c8c8c');
      this.box(g, 2.4, 0.9, 1.4, M.steel, 3.2, 0.45, 1.6);
    } else if (kind === 'arms') {
      this.box(g, 3.8, 1.3, 2.6, M.olive, 0, 0.65, 0);
      const r = this.cyl(g, 1.3, 1.3, 3.8, this.mat('#58613f', 0.8), 0, 1.3, 0, 12, 0, Math.PI / 2); r.scale.set(1, 3.8, 0.45);
      this.box(g, 2.2, 1.0, 1.7, this.mat('#5a684a', 0.8), -2.8, 0.5, 0.9);
      this.cyl(g, 0.07, 0.1, 3.4, M.steel, 2.4, 1.7, -1.2, 6);
      this.blink(g, 2.4, 3.45, -1.2);
      for (let i = 0; i < 4; i++) this.box(g, 1.1, 0.5, 0.6, M.camo, 2.3, 0.25, 0.2 + i * 0.7);
    } else if (kind === 'power') {
      for (const x of [-1.6, 1.6]) {
        const tw = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.45, 3.2, 20, 1, true), M.white);
        tw.position.set(x, 1.6, -0.4); tw.castShadow = true; (tw.material as THREE.Material).side = THREE.DoubleSide; g.add(tw);
        this.smoke(g, x, 3.4, -0.4, 1.4, 0.45, '#ffffff');
      }
      this.box(g, 5, 1.4, 2.2, M.steel, 0, 0.7, 2.0);
      this.cyl(g, 0.3, 0.38, 5, M.silver, -3.0, 2.5, 1.6, 10);
      this.blink(g, -3.0, 5.1, 1.6, '#ff4040');
      for (let i = 0; i < 5; i++) this.box(g, 0.08, 2.6, 0.08, M.steel, 3.2, 1.3, -1.6 + i * 0.9);
    } else if (kind === 'desal') {
      for (const [x, z] of [[-1.6, -1], [0, -1], [1.6, -1], [-1.6, 1], [0, 1], [1.6, 1]]) this.cyl(g, 0.75, 0.75, 1.2, M.white, x, 0.6, z, 16);
      this.box(g, 5, 0.9, 3.6, M.blue, 0, 1.65, 0);
      this.box(g, 0.4, 0.4, 5, M.silver, 0, 0.3, 3.8);
    } else if (kind === 'town') {
      const rng = mulberry(21);
      for (let i = 0; i < 14; i++) {
        const a = rng() * Math.PI * 2, r = 1.2 + rng() * 3.2, w = 0.8 + rng() * 0.8, hh = 0.6 + rng() * 1.1;
        this.box(g, w, hh, w * (0.8 + rng() * 0.4), rng() > 0.4 ? M.white : this.mat('#dcc79c', 0.9), Math.cos(a) * r, hh / 2, Math.sin(a) * r, rng() * 3);
      }
      this.box(g, 1.8, 1.0, 1.8, M.white, 0, 0.5, 0);
      this.sphere(g, 0.85, this.mat('#2f9fb8', 0.4, 0.3), 0, 1.0, 0, true);
      this.cyl(g, 0.15, 0.2, 3.6, M.white, 1.5, 1.8, 1.2, 8);
      this.lamp(g, 1.5, 3.7, 1.2, '#7fe8ff', 0.12);
    } else if (kind === 'kish') {
      for (const [px, pz, hh] of [[-1.7, -1, 4.6], [0.3, 0.6, 6.2], [2.0, -0.9, 3.8], [-0.6, -2.2, 3.2]] as const) {
        this.box(g, 1.4, hh, 1.4, this.windowMat, px, hh / 2, pz);
        this.box(g, 1.55, 0.2, 1.55, M.glass, px, hh + 0.1, pz);
        this.blink(g, px, hh + 0.35, pz, '#ff4040', 0.08, 1.4);
      }
      this.box(g, 3.6, 0.06, 1.6, this.mat('#38d6e0', 0.15, 0.1, '#0891b2', 0.6), 0.2, 0.1, 2.6);
    } else if (kind === 'command') {
      this.box(g, 3.4, 1.4, 2.6, M.white, 0, 0.7, 0);
      this.sphere(g, 1.1, this.mat('#f3f5f7', 0.3, 0.2), 0, 2.0, 0);
      this.cyl(g, 0.07, 0.09, 4.6, M.steel, 2.3, 2.3, 1.2, 6);
      this.blink(g, 2.3, 4.65, 1.2);
      this.cyl(g, 0.05, 0.07, 2.8, M.steel, -2.2, 1.4, 1.0, 6);
      const flag = this.box(g, 1.0, 0.6, 0.03, this.mat('#16a34a', 0.8), -1.68, 2.45, 1.0); flag.userData.anim = true;
      this.anims.push((t) => { flag.rotation.y = Math.sin(t * 3) * 0.2; });
      const pad = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshStandardMaterial({ map: this.tex.helipad, roughness: 0.8 }));
      pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.05, 2.9); g.add(pad);
    } else if (kind === 'mine') {
      for (const [px, pz, s] of [[-1.6, 0, 1.4], [0.4, 1.3, 1.9], [1.9, -1, 1.1]] as const) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(s, s * 1.15, 12), this.mat('#a1401f', 1));
        cone.position.set(px, s * 0.57, pz); cone.castShadow = true; g.add(cone);
      }
      this.box(g, 0.7, 0.3, 5.5, M.rust, -0.4, 1.0, -1, 0, 0.28);
      this.box(g, 1.6, 1.1, 1.3, M.steel, 2.5, 0.55, 1.6);
    } else if (kind === 'radar') {
      this.cyl(g, 1.1, 1.3, 1.0, M.conc, 0, 0.5, 0, 16);
      this.cyl(g, 0.3, 0.38, 2.0, M.steel, 0, 2.0, 0, 10);
      const head = new THREE.Group(); head.position.y = 3.1; head.userData.anim = true; g.add(head);
      const dish = this.sphere(head, 1.4, M.white, 0, 0, 0, true); dish.rotation.x = Math.PI * 0.62; dish.scale.y = 0.45;
      this.box(head, 0.1, 0.1, 1.4, M.steel, 0, 0.3, 0.6);
      this.blink(g, 0, 4.4, 0);
      this.box(g, 1.5, 0.9, 1.1, M.steel, 2.1, 0.45, 0.8);
      this.anims.push((t) => { head.rotation.y = t * 1.1; });
    } else if (kind === 'base') {
      this.box(g, 4.4, 0.08, 4.4, M.concD, 0, 0.04, 0);
      this.box(g, 2.6, 1.1, 1.8, M.olive, -0.6, 0.55, -1.2);
      for (const [px, pz] of [[1.4, -1.4], [1.4, -0.4]]) this.box(g, 0.9, 0.5, 0.9, M.camo, px, 0.25, pz);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), new THREE.MeshStandardMaterial({ map: this.tex.helipad, roughness: 0.8 }));
      pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.1, 1.2); g.add(pad);
      const heli = this.heli(); heli.scale.setScalar(0.7); heli.position.set(0, 0.45, 1.2); heli.userData.anim = true; g.add(heli);
      this.cyl(g, 0.06, 0.08, 3.4, M.steel, -2.0, 1.7, 1.8, 6);
      this.blink(g, -2.0, 3.45, 1.8, '#ffd040');
    } else if (kind === 'outpost') {
      for (const [px, pz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) this.cyl(g, 0.1, 0.12, 2.6, M.rust, px, 1.3, pz, 6);
      this.box(g, 2.0, 1.0, 2.0, M.steel, 0, 3.1, 0);
      this.box(g, 2.2, 0.12, 2.2, M.olive, 0, 3.66, 0);
      this.box(g, 1.6, 0.8, 1.2, M.olive, 2.2, 0.4, 0.6);
      this.lamp(g, 0, 3.8, 1.1, '#fff2c0', 0.12);
    } else if (kind === 'terminal' || kind === 'depot') {
      const n = kind === 'terminal' ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const px = (i % 3) * 2.3 - 2.3, pz = Math.floor(i / 3) * 2.5 - 1.2;
        this.cyl(g, 1.05, 1.05, 1.5, M.white, px, 0.75, pz, 20);
        this.cyl(g, 1.07, 1.07, 0.12, M.rust, px, 1.52, pz, 20);
      }
      if (kind === 'terminal') { this.cyl(g, 0.14, 0.18, 6, M.rust, 3.6, 3, -1.5, 8); this.flame(g, 3.6, 6, -1.5, 1.1); }
      else this.box(g, 1.8, 1.0, 1.4, M.blue, 2.8, 0.5, 1.4);
    }
    return g;
  }

  // ---------- بدنه کشتی ----------
  private hullGeo(len: number, wid: number, h: number): THREE.ExtrudeGeometry {
    const k = `${len}_${wid}_${h}`;
    let geo = this.hullGeos.get(k);
    if (geo) return geo;
    const s = new THREE.Shape();
    const hw = wid / 2, hl = len / 2;
    s.moveTo(-hw * 0.92, hl); s.lineTo(hw * 0.92, hl);
    s.lineTo(hw, -hl * 0.25);
    s.quadraticCurveTo(hw * 0.95, -hl * 0.8, 0, -hl);
    s.quadraticCurveTo(-hw * 0.95, -hl * 0.8, -hw, -hl * 0.25);
    s.closePath();
    geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
    geo.rotateX(-Math.PI / 2);
    this.hullGeos.set(k, geo);
    return geo;
  }
  private hull(p: THREE.Object3D, len: number, wid: number, h: number, color: string, deckColor = '#3b4249') {
    const lower = new THREE.Mesh(this.hullGeo(len, wid, 0.3), this.mat('#8e2a22', 0.8));
    lower.position.y = -0.25; p.add(lower);
    const upper = new THREE.Mesh(this.hullGeo(len, wid, h), this.mat(color, 0.6, 0.2));
    upper.position.y = 0.05; upper.castShadow = true; p.add(upper);
    const deck = new THREE.Mesh(this.hullGeo(len * 0.96, wid * 0.9, 0.06), this.mat(deckColor, 0.8));
    deck.position.y = 0.05 + h; p.add(deck);
  }
  private wake(p: THREE.Object3D, len: number, wid: number) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(wid * 2.6, len * 2.2), new THREE.MeshBasicMaterial({ map: this.tex.wake, transparent: true, opacity: 0.55, depthWrite: false }));
    w.rotation.x = -Math.PI / 2; w.rotation.z = Math.PI; w.position.set(0, 0.06, -len * 1.55); p.add(w);
  }
  merchant(kind: number): THREE.Group {
    const g = new THREE.Group();
    const M = this.M;
    const cols = ['#1f4e79', '#a23b2c', '#1e6b4a', '#4b3a7a', '#2a2f36'];
    const tanker = kind % 3 === 1;
    const len = tanker ? 6.2 : 5.6, wid = tanker ? 1.5 : 1.35;
    this.hull(g, len, wid, 0.55, cols[kind % cols.length], tanker ? '#7a4f3a' : '#3b4249');
    const top = 0.66;
    if (tanker) {
      this.box(g, 0.25, 0.18, len * 0.62, M.silver, 0, top + 0.1, 0.4);
      for (let i = 0; i < 4; i++) this.box(g, wid * 0.7, 0.06, 0.06, M.silver, 0, top + 0.08, -0.6 + i * 0.8);
      this.box(g, 0.4, 0.4, 0.4, M.white, 0, top + 0.2, 1.9);
    } else {
      const cc = ['#c94f36', '#3f8f5f', '#3f6f9e', '#d9a441', '#e8e4da', '#7d3c98', '#f97316'];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
        const hh = 0.28 + ((r + c + kind) % 3) * 0.24;
        this.box(g, 0.36, hh, 0.85, this.mat(cc[(r * 3 + c + kind) % cc.length], 0.75), -0.4 + c * 0.4, top + hh / 2, -0.6 + r * 0.95);
      }
    }
    // پل فرماندهی در عقب
    this.box(g, wid * 0.85, 0.95, 0.75, M.white, 0, top + 0.47, -len / 2 + 0.75);
    this.box(g, wid * 0.98, 0.18, 0.5, M.white, 0, top + 0.95, -len / 2 + 0.8);
    this.box(g, wid * 0.8, 0.12, 0.05, M.glass, 0, top + 0.82, -len / 2 + 1.13);
    this.cyl(g, 0.16, 0.18, 0.6, this.mat(kind % 2 ? '#c0392b' : '#f1c40f', 0.6), 0, top + 1.25, -len / 2 + 0.55, 10);
    this.lamp(g, 0, top + 1.1, -len / 2 + 0.75, '#ffffff', 0.06);
    this.lamp(g, wid / 2, top + 0.2, 0.5, '#30ff60', 0.05);
    this.lamp(g, -wid / 2, top + 0.2, 0.5, '#ff3030', 0.05);
    this.wake(g, len, wid);
    return g;
  }
  warship(): THREE.Group {
    const g = new THREE.Group();
    const M = this.M;
    this.hull(g, 5, 1.15, 0.55, '#5b6570', '#4a535c');
    const grey = this.mat('#6d7782', 0.6, 0.3);
    const sup = this.cyl(g, 0.55, 0.75, 0.75, grey, 0, 1.0, -0.4, 4); sup.rotation.y = Math.PI / 4; sup.scale.set(1, 0.75, 1.5);
    this.box(g, 0.5, 0.6, 0.6, grey, 0, 1.6, -0.6);
    this.cyl(g, 0.04, 0.05, 1.2, M.steel, 0, 2.3, -0.65, 6);
    const rad = this.box(g, 0.6, 0.12, 0.12, M.steel, 0, 2.6, -0.65); rad.userData.anim = true;
    this.cyl(g, 0.24, 0.28, 0.22, grey, 0, 0.75, 1.5, 10);
    this.cyl(g, 0.04, 0.05, 0.75, M.dark, 0, 0.83, 1.95, 6, Math.PI / 2);
    this.box(g, 0.6, 0.06, 0.6, M.dark, 0, 0.66, 0.85);
    this.box(g, 1.17, 0.07, 3.4, this.light('#ff2a3d', 3), 0, 0.42, 0);
    this.blink(g, 0, 2.95, -0.65, '#ff2a3d', 0.08, 5);
    this.anims.push((t) => { rad.rotation.y = t * 3; });
    this.wake(g, 5, 1.15);
    return g;
  }
  speedboat(color = '#2d333a', wake = true): THREE.Group {
    const g = new THREE.Group();
    this.hull(g, 1.6, 0.55, 0.25, color, '#20252b');
    this.box(g, 0.4, 0.22, 0.4, this.M.glass, 0, 0.42, -0.1);
    if (wake) this.wake(g, 1.6, 0.55);
    return g;
  }
  heli(): THREE.Group {
    const g = new THREE.Group();
    const body = this.mat('#5d6b4d', 0.6, 0.2);
    const b = this.sphere(g, 0.5, body, 0, 0.5, 0); b.scale.set(0.85, 0.85, 1.5);
    this.box(g, 0.12, 0.16, 1.6, body, 0, 0.62, -1.3);
    this.box(g, 0.05, 0.5, 0.3, body, 0, 0.82, -2.05);
    this.box(g, 0.6, 0.04, 0.06, this.M.dark, 0, 0.0, 0.3); this.box(g, 0.6, 0.04, 0.06, this.M.dark, 0, 0.0, -0.3);
    this.box(g, 0.05, 0.04, 0.9, this.M.dark, 0.32, 0.0, 0); this.box(g, 0.05, 0.04, 0.9, this.M.dark, -0.32, 0.0, 0);
    const rotor = new THREE.Group(); rotor.position.y = 1.02; rotor.userData.anim = true; g.add(rotor);
    this.box(rotor, 3.0, 0.03, 0.14, this.M.black, 0, 0, 0); this.box(rotor, 0.14, 0.03, 3.0, this.M.black, 0, 0, 0);
    const tr = new THREE.Group(); tr.position.set(0.08, 0.82, -2.05); tr.userData.anim = true; g.add(tr);
    this.box(tr, 0.02, 0.7, 0.08, this.M.black, 0, 0, 0);
    this.blink(g, 0, 0.15, 0, '#ff3030', 0.06, 4);
    this.anims.push((_t, dt) => { rotor.rotation.y += dt * 28; tr.rotation.x += dt * 40; });
    return g;
  }
  jet(): THREE.Group {
    const g = new THREE.Group();
    const m = this.mat('#7c8794', 0.5, 0.4);
    this.cyl(g, 0.08, 0.2, 2.2, m, 0, 0, 0, 8, Math.PI / 2);
    const wing = new THREE.Shape(); wing.moveTo(0, 0.5); wing.lineTo(1.0, -0.6); wing.lineTo(-1.0, -0.6); wing.closePath();
    const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.04, bevelEnabled: false }); wg.rotateX(Math.PI / 2);
    const w = new THREE.Mesh(wg, m); w.position.y = 0.02; g.add(w);
    this.box(g, 0.04, 0.45, 0.4, m, 0, 0.22, -0.85);
    this.lamp(g, 0, 0, -1.15, '#ffb060', 0.09);
    return g;
  }
}
