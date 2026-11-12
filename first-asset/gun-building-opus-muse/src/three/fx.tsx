import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useBattle, type ShootKind, type ShootOpts } from "./battle";

const PI = Math.PI;

class Particles {
  mesh: THREE.InstancedMesh;
  p: Float32Array; v: Float32Array; life: Float32Array; max: Float32Array; size: Float32Array;
  n: number; cur = 0; grav: number; drag: number; mode: "smoke" | "spark";
  dummy = new THREE.Object3D();
  constructor(n: number, geo: THREE.BufferGeometry, mat: THREE.Material, grav: number, drag: number, mode: "smoke" | "spark") {
    this.n = n;
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n).fill(1); this.size = new Float32Array(n);
    this.grav = grav; this.drag = drag; this.mode = mode;
    const c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) {
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, c);
    }
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
      const s = this.mode === "smoke" ? this.size[i] * (0.35 + (1 - k) * 1.7) * Math.min(1, k * 2.5) : this.size[i] * k;
      this.dummy.position.set(this.p[j], Math.max(this.p[j + 1], this.mode === "spark" ? -0.2 : 0), this.p[j + 2]);
      this.dummy.scale.setScalar(this.life[i] <= 0 ? 0 : s);
      if (this.mode === "spark") {
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
  t: number; dur: number; arc: number; dmg: number; air: boolean; size: number; trail: number; color: string;
  g: THREE.Group; glow: THREE.Mesh; body: THREE.Group; flame: THREE.Mesh;
}
interface Boom {
  on: boolean; t: number; size: number; water: boolean;
  g: THREE.Group; fire: THREE.Mesh; core: THREE.Mesh; ring: THREE.Mesh; col: THREE.Mesh;
  fm: THREE.MeshBasicMaterial; cm: THREE.MeshBasicMaterial; rm: THREE.MeshBasicMaterial; wm: THREE.MeshStandardMaterial; color: THREE.Color;
}
interface Beam { on: boolean; t: number; m: THREE.Mesh; mat: THREE.MeshBasicMaterial; core: THREE.Mesh }

const addMat = (c: THREE.Color | string, op = 1) =>
  new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });

export default function FX() {
  const B = useBattle();

  const sys = useMemo(() => {
    const root = new THREE.Group();
    const smoke = new Particles(380, new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }), 0.6, 0.97, "smoke");
    const sparks = new Particles(300, new THREE.BoxGeometry(0.05, 0.05, 0.05),
      new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), -9, 0.985, "spark");
    root.add(smoke.mesh, sparks.mesh);

    const glowGeo = new THREE.CapsuleGeometry(0.5, 1, 2, 8).rotateX(PI / 2);
    const bodyGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.7, 10).rotateX(PI / 2);
    const noseGeo = new THREE.ConeGeometry(0.055, 0.22, 10).rotateX(PI / 2).translate(0, 0, 0.46);
    const finGeo = new THREE.BoxGeometry(0.28, 0.02, 0.14).translate(0, 0, -0.3);
    const flameGeo = new THREE.ConeGeometry(0.07, 0.6, 10, 1, true).rotateX(-PI / 2).translate(0, 0, -0.62);
    const bodyMat = new THREE.MeshStandardMaterial({ color: "#e9edf2", metalness: 0.5, roughness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: "#1b1f27", metalness: 0.8, roughness: 0.3 });

    const projs: Proj[] = Array.from({ length: 110 }, () => {
      const g = new THREE.Group();
      const glow = new THREE.Mesh(glowGeo, addMat("#fff"));
      const body = new THREE.Group();
      const b = new THREE.Mesh(bodyGeo, bodyMat);
      const nose = new THREE.Mesh(noseGeo, bodyMat);
      const fin1 = new THREE.Mesh(finGeo, darkMat);
      const fin2 = new THREE.Mesh(finGeo, darkMat); fin2.rotation.z = PI / 2;
      body.add(b, nose, fin1, fin2);
      const flame = new THREE.Mesh(flameGeo, addMat("#fff"));
      g.add(glow, body, flame);
      g.visible = false;
      root.add(g);
      return { on: false, kind: "tracer" as ShootKind, from: new THREE.Vector3(), to: new THREE.Vector3(), off: new THREE.Vector3(), t: 0, dur: 1, arc: 0, dmg: 1, air: false, size: 1, trail: 0, color: "#fff", g, glow, body, flame };
    });

    const fireGeo = new THREE.IcosahedronGeometry(1, 2);
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-PI / 2);
    const colGeo = new THREE.CylinderGeometry(0.25, 0.55, 1, 18, 1, true).translate(0, 0.5, 0);
    const booms: Boom[] = Array.from({ length: 18 }, () => {
      const g = new THREE.Group();
      const fm = addMat("#fff"), cm = addMat("#fff"), rm = addMat("#fff");
      rm.side = THREE.DoubleSide;
      const wm = new THREE.MeshStandardMaterial({ color: "#e8f4ff", transparent: true, opacity: 0.8, roughness: 0.6, depthWrite: false, side: THREE.DoubleSide });
      const fire = new THREE.Mesh(fireGeo, fm), core = new THREE.Mesh(fireGeo, cm), ring = new THREE.Mesh(ringGeo, rm), col = new THREE.Mesh(colGeo, wm);
      g.add(fire, core, ring, col);
      g.visible = false;
      root.add(g);
      return { on: false, t: 0, size: 1, water: true, g, fire, core, ring, col, fm, cm, rm, wm, color: new THREE.Color() };
    });

    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(PI / 2).translate(0, 0, 0.5);
    const beams: Beam[] = Array.from({ length: 8 }, () => {
      const mat = addMat("#fff");
      const m = new THREE.Mesh(beamGeo, mat);
      const core = new THREE.Mesh(beamGeo, addMat(new THREE.Color("#ffffff").multiplyScalar(4)));
      m.add(core);
      m.visible = false;
      root.add(m);
      return { on: false, t: 0, m, mat, core };
    });

    const light = new THREE.PointLight("#ffaa55", 0, 14, 1.4);
    root.add(light);
    return { root, smoke, sparks, projs, booms, beams, light, tmp: new THREE.Vector3(), tmp2: new THREE.Vector3() };
  }, []);

  useEffect(() => {
    const S = sys;
    const col = new THREE.Color();
    const smoke = (p: THREE.Vector3, size: number, dark = true) => {
      col.set(dark ? "#2a2522" : "#d9dde3");
      S.smoke.spawn(p, (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4, 1.4 + Math.random() * 1.2, size, col);
    };
    const spark = (p: THREE.Vector3, color: string, count: number) => {
      col.set(color).lerp(new THREE.Color("#ffe2a0"), 0.5).multiplyScalar(6);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * PI * 2, e = Math.random() * 0.9 + 0.2, sp = 2 + Math.random() * 5;
        S.sparks.spawn(p, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 1.5, Math.sin(a) * Math.cos(e) * sp, 0.4 + Math.random() * 0.6, 0.6 + Math.random() * 0.8, col);
      }
    };
    B.fx = {
      smoke,
      spark,
      shoot(o: ShootOpts) {
        const pr = S.projs.find((p) => !p.on);
        if (!pr) return;
        pr.on = true; pr.kind = o.kind; pr.from.copy(o.from); pr.to.copy(o.to);
        const j = o.jitter ?? 0.25;
        pr.off.set((Math.random() - 0.5) * j, (Math.random() - 0.5) * j * 0.5, (Math.random() - 0.5) * j);
        pr.dur = o.dur ?? 0.6; pr.arc = o.arc ?? 0; pr.dmg = o.dmg ?? 1; pr.air = !!o.air; pr.size = o.size ?? 1; pr.t = 0; pr.trail = 0; pr.color = o.color;
        const c = new THREE.Color(o.color);
        const gm = pr.glow.material as THREE.MeshBasicMaterial;
        const fm = pr.flame.material as THREE.MeshBasicMaterial;
        gm.color.copy(c).lerp(new THREE.Color("#fff6d8"), 0.35).multiplyScalar(o.kind === "tracer" ? 7 : 5);
        fm.color.copy(c).lerp(new THREE.Color("#ffd27a"), 0.6).multiplyScalar(7);
        const missile = o.kind === "missile" || o.kind === "rocket" || o.kind === "hyper" || o.kind === "torpedo";
        pr.body.visible = missile;
        pr.flame.visible = missile && o.kind !== "torpedo";
        pr.glow.visible = true;
        const s = pr.size;
        if (o.kind === "tracer") pr.glow.scale.set(0.06 * s, 0.06 * s, 0.8 * s);
        else if (o.kind === "shell") pr.glow.scale.set(0.16 * s, 0.16 * s, 0.3 * s);
        else if (o.kind === "plasma") pr.glow.scale.set(0.45 * s, 0.45 * s, 0.5 * s);
        else pr.glow.scale.set(0.09 * s, 0.09 * s, 0.12 * s);
        pr.body.scale.setScalar(o.kind === "rocket" ? 0.65 * s : s);
        if (o.kind === "hyper") { (pr.body.children[0] as THREE.Mesh).material = darkMatFor(); }
        else (pr.body.children[0] as THREE.Mesh).material = (pr.body.children[1] as THREE.Mesh).material;
        pr.g.visible = true;
      },
      explode(p: THREE.Vector3, color: string, size: number, water = true) {
        const b = S.booms.find((x) => !x.on) ?? S.booms[0];
        b.on = true; b.t = 0; b.size = size; b.water = water && p.y < 1.4;
        b.color.set(color);
        b.g.position.copy(p);
        if (b.water) b.g.position.y = Math.max(0.02, Math.min(p.y, 0.3));
        b.g.visible = true;
        S.light.position.copy(p).y += 0.6;
        S.light.color.set(color).lerp(new THREE.Color("#ffb060"), 0.6);
        S.light.intensity = 30 * size;
        spark(p, color, Math.round(8 + size * 10));
        for (let i = 0; i < Math.round(3 + size * 4); i++) {
          S.tmp.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * size, Math.random() * size * 0.4, (Math.random() - 0.5) * size));
          smoke(S.tmp, 0.3 + size * 0.25, true);
        }
        if (size > 0.9) B.shake = Math.min(0.45, B.shake + size * 0.07);
      },
      rail(a: THREE.Vector3, b2: THREE.Vector3, color: string) {
        const bm = S.beams.find((x) => !x.on) ?? S.beams[0];
        bm.on = true; bm.t = 0;
        bm.m.position.copy(a);
        bm.m.lookAt(b2);
        bm.m.userData.len = a.distanceTo(b2);
        bm.mat.color.set(color).multiplyScalar(5);
        bm.m.visible = true;
      },
    };
    function darkMatFor() { return new THREE.MeshStandardMaterial({ color: "#14161c", metalness: 0.9, roughness: 0.25, emissive: "#ff2d78", emissiveIntensity: 0.6 }); }
  }, [B, sys]);

  useFrame((_, dr) => {
    const d = Math.min(dr, 0.05) * B.speed;
    const S = sys;
    const tmp = S.tmp, tmp2 = S.tmp2;
    for (const pr of S.projs) {
      if (!pr.on) continue;
      // هدایت به سمت هدف متحرک
      const live = pr.air ? (B.airValid ? B.air : null) : (B.seaValid ? B.sea : null);
      if (live) pr.to.lerp(tmp.copy(live).add(pr.off), Math.min(1, d * 6));
      pr.t += d / pr.dur;
      const posAt = (t: number, out: THREE.Vector3) => {
        out.copy(pr.from).lerp(pr.to, t);
        out.y += pr.arc * 4 * t * (1 - t);
        if (pr.kind === "torpedo") out.y = Math.min(out.y, 0.05 + (1 - Math.min(1, t * 5)) * (pr.from.y - 0.05));
        return out;
      };
      const t = Math.min(1, pr.t);
      posAt(t, tmp);
      posAt(Math.min(1.02, t + 0.02), tmp2);
      pr.g.position.copy(tmp);
      if (tmp2.distanceToSquared(tmp) > 1e-6) pr.g.lookAt(tmp2);
      pr.flame.scale.set(1, 1, 0.7 + Math.random() * 0.6);
      pr.trail -= d;
      if (pr.trail <= 0 && pr.kind !== "tracer" && pr.kind !== "shell") {
        pr.trail = pr.kind === "torpedo" ? 0.03 : 0.016;
        if (pr.kind === "torpedo") S.smoke.spawn(tmp, (Math.random() - 0.5) * 0.2, 0.1, (Math.random() - 0.5) * 0.2, 0.9, 0.12, new THREE.Color("#eaf6ff"));
        else if (pr.kind === "plasma") S.sparks.spawn(tmp, (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5), 0.3, 1.2, new THREE.Color(pr.color).multiplyScalar(5));
        else S.smoke.spawn(tmp, (Math.random() - 0.5) * 0.15, 0.15, (Math.random() - 0.5) * 0.15, pr.kind === "hyper" ? 1.0 : 1.8, pr.kind === "rocket" ? 0.14 : 0.2, new THREE.Color(pr.kind === "hyper" ? "#ffb0d0" : "#e3e6ea"));
      }
      if (pr.t >= 1) {
        pr.on = false;
        pr.g.visible = false;
        const size = { tracer: 0.28, shell: 1.2, missile: 1.8, rocket: 0.9, hyper: 2.8, plasma: 2.2, torpedo: 1.6 }[pr.kind] * (pr.kind === "tracer" ? 1 : pr.size);
        if (pr.kind === "tracer") { B.fx.spark(pr.to, pr.color, 3); if (Math.random() < 0.25) B.fx.explode(pr.to, pr.color, 0.3, false); }
        else B.fx.explode(pr.to, pr.kind === "plasma" || pr.kind === "hyper" ? pr.color : "#ff8a2a", size, !pr.air);
        if (pr.air) B.hitAir(pr.dmg); else B.hitSea(pr.dmg);
      }
    }
    for (const b of S.booms) {
      if (!b.on) continue;
      b.t += d / (0.9 + b.size * 0.25);
      const t = b.t;
      if (t >= 1) { b.on = false; b.g.visible = false; continue; }
      const e = 1 - Math.pow(1 - t, 3);
      const s = b.size;
      b.fire.scale.setScalar(s * (0.25 + e * 0.9));
      b.fm.color.copy(b.color).lerp(new THREE.Color("#ff4a10"), t).multiplyScalar(6 * (1 - t) * (1 - t) + 0.05);
      b.fm.opacity = 1 - t;
      b.core.scale.setScalar(s * 0.45 * Math.max(0, 1 - t * 3));
      b.cm.color.set("#fff8e0").multiplyScalar(10);
      b.ring.scale.setScalar(s * (0.3 + e * 2.4));
      b.rm.color.copy(b.color).multiplyScalar(4 * (1 - t));
      b.rm.opacity = 1 - t;
      b.col.visible = b.water;
      const ch = Math.sin(Math.min(1, t * 1.3) * PI);
      b.col.scale.set(s * (0.6 + t * 0.6), s * 2.4 * ch + 0.001, s * (0.6 + t * 0.6));
      b.wm.opacity = 0.85 * (1 - t);
    }
    for (const bm of S.beams) {
      if (!bm.on) continue;
      bm.t += d / 0.35;
      if (bm.t >= 1) { bm.on = false; bm.m.visible = false; continue; }
      const w = 0.16 * (1 - bm.t);
      bm.m.scale.set(w, w, bm.m.userData.len as number);
      bm.core.scale.set(0.35, 0.35, 1);
      bm.mat.opacity = 1 - bm.t;
    }
    S.light.intensity *= Math.pow(0.02, d);
    S.smoke.update(d);
    S.sparks.update(d);
  });

  return <primitive object={sys.root} />;
}
