import { createRef, useImperativeHandle, useMemo, useRef, type ReactNode, type Ref, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useBattle } from "./battle";
import { concreteMap, deckMap, hazardMap, panelBump, panelMap, windowsMap } from "./textures";
import colormapUrl from "../assets/models/colormap.png";

export const PT = 0.78; // ارتفاع عرشه سکو
const PI = Math.PI;
type V3 = [number, number, number];

/* =================== متریال‌ها =================== */
export function makeKit(base: string, accent: string, glow: string, gi: number) {
  const pm = panelMap(base);
  const pb = panelBump();
  const glowCol = new THREE.Color(glow);
  return {
    armor: new THREE.MeshPhysicalMaterial({ map: pm, bumpMap: pb, bumpScale: 2.2, metalness: 0.55, roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.45 }),
    armorDark: new THREE.MeshPhysicalMaterial({ map: panelMap("#2c333d"), bumpMap: pb, bumpScale: 2, metalness: 0.7, roughness: 0.42, clearcoat: 0.2 }),
    white: new THREE.MeshPhysicalMaterial({ map: panelMap("#e6ebf2"), bumpMap: pb, bumpScale: 1.4, metalness: 0.15, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    gun: new THREE.MeshPhysicalMaterial({ color: "#2a3039", metalness: 0.92, roughness: 0.3, clearcoat: 0.25 }),
    steel: new THREE.MeshStandardMaterial({ color: "#c3ccd8", metalness: 1, roughness: 0.2 }),
    brass: new THREE.MeshStandardMaterial({ color: "#c99a3b", metalness: 1, roughness: 0.28 }),
    rubber: new THREE.MeshStandardMaterial({ color: "#121417", metalness: 0, roughness: 0.92 }),
    concrete: new THREE.MeshStandardMaterial({ map: concreteMap(), roughness: 0.95, metalness: 0.05 }),
    deck: new THREE.MeshStandardMaterial({ map: deckMap(), metalness: 0.75, roughness: 0.45 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardMap(), roughness: 0.6, metalness: 0.2 }),
    accent: new THREE.MeshPhysicalMaterial({ color: accent, metalness: 0.45, roughness: 0.32, clearcoat: 0.7 }),
    olive: new THREE.MeshStandardMaterial({ color: "#4d5a37", roughness: 0.8, metalness: 0.1 }),
    sand: new THREE.MeshStandardMaterial({ color: "#a68f63", roughness: 1 }),
    glow: new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 2.5 + gi * 2, toneMapped: false }),
    hot: new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(5 + gi * 3), toneMapped: false }),
    glass: new THREE.MeshPhysicalMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.6 + gi * 0.6, metalness: 0.1, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.62 }),
    cockpit: new THREE.MeshPhysicalMaterial({ color: "#0b1b2c", metalness: 0.4, roughness: 0.05, clearcoat: 1, emissive: "#163a5a", emissiveIntensity: 0.4 }),
    windows: new THREE.MeshStandardMaterial({ color: "#222a35", emissiveMap: windowsMap(), emissive: "#ffffff", emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.5 }),
    glowColor: glow,
  };
}
export type Kit = ReturnType<typeof makeKit>;
export function useKit(base: string, accent: string, glow: string, gi: number) {
  return useMemo(() => makeKit(base, accent, glow, gi), [base, accent, glow, gi]);
}

export function useRefs<T>(n: number) {
  return useMemo(() => Array.from({ length: n }, () => createRef<T>()), [n]) as RefObject<T | null>[];
}

/* =================== قطعات پایه =================== */
export function RBox({ args, r = 0.06, pos, rot, m }: { args: V3; r?: number; pos?: V3; rot?: V3; m: THREE.Material }) {
  return <RoundedBox args={args} radius={Math.min(r, Math.min(...args) / 2.05)} smoothness={3} position={pos} rotation={rot} material={m} />;
}

export function Strut({ a, b, r, m }: { a: V3; b: V3; r: number; m: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { pos: va.add(vb).multiplyScalar(0.5), quat, len };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} material={m}>
      <cylinderGeometry args={[r, r, len, 6]} />
    </mesh>
  );
}

/** دکل مشبک فلزی (Lattice) */
export function Lattice({ pos, h = 2.6, w = 0.36, k, top = true }: { pos: V3; h?: number; w?: number; k: Kit; top?: boolean }) {
  const segs = Math.max(3, Math.round(h / 0.45));
  const corners = (y: number): V3[] => {
    const s = (w * (1 - (y / h) * 0.45)) / 2;
    return [[-s, y, -s], [s, y, -s], [s, y, s], [-s, y, s]];
  };
  const struts: [V3, V3][] = [];
  for (let i = 0; i < segs; i++) {
    const y0 = (i / segs) * h, y1 = ((i + 1) / segs) * h;
    const c0 = corners(y0), c1 = corners(y1);
    for (let j = 0; j < 4; j++) {
      struts.push([c0[j], c1[j]]);
      struts.push([c0[j], c1[(j + 1) % 4]]);
    }
  }
  return (
    <group position={pos}>
      {struts.map(([a, b], i) => <Strut key={i} a={a} b={b} r={i % 2 ? 0.012 : 0.022} m={k.steel} />)}
      {top && (
        <>
          <mesh position={[0, h, 0]} material={k.deck}><cylinderGeometry args={[w * 0.55, w * 0.55, 0.05, 8]} /></mesh>
          <Beacon pos={[0, h + 0.12, 0]} color="#ff2a2a" />
        </>
      )}
    </group>
  );
}

export function Beacon({ pos, color = "#ff3344", rate = 1.4, size = 0.06 }: { pos: V3; color?: string; rate?: number; size?: number }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(6), toneMapped: false }), [color]);
  const off = useMemo(() => Math.random() * 6, []);
  useFrame((s) => {
    const on = Math.sin(s.clock.elapsedTime * rate * PI * 2 + off) > 0.3;
    mat.color.set(color).multiplyScalar(on ? 7 : 0.25);
  });
  return <mesh position={pos} material={mat}><sphereGeometry args={[size, 10, 8]} /></mesh>;
}

export function Dish({ pos, r = 0.35, k, spin = 1.2, tilt = 0.9 }: { pos: V3; r?: number; k: Kit; spin?: number; tilt?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * spin; });
  return (
    <group position={pos}>
      <mesh position={[0, r * 0.6, 0]} material={k.gun}><cylinderGeometry args={[r * 0.12, r * 0.2, r * 1.2, 10]} /></mesh>
      <group ref={ref} position={[0, r * 1.25, 0]}>
        <group rotation={[tilt, 0, 0]}>
          <mesh material={k.white}><sphereGeometry args={[r, 24, 10, 0, PI * 2, 0, PI / 2.8]} /></mesh>
          <mesh position={[0, r * 0.55, 0]} material={k.gun}><cylinderGeometry args={[0.015, 0.015, r * 1.1, 6]} /></mesh>
          <mesh position={[0, r * 1.1, 0]} material={k.glow}><sphereGeometry args={[r * 0.1, 8, 8]} /></mesh>
        </group>
      </group>
    </group>
  );
}

/** رادار آرایه فازی چرخان */
export function PhasedRadar({ pos, w = 0.9, h = 0.6, k, spin = 0.8 }: { pos: V3; w?: number; h?: number; k: Kit; spin?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * spin; });
  return (
    <group position={pos}>
      <mesh position={[0, 0.25, 0]} material={k.gun}><cylinderGeometry args={[0.06, 0.1, 0.5, 10]} /></mesh>
      <group ref={ref} position={[0, 0.55 + h / 2, 0]}>
        <group rotation={[-0.25, 0, 0]}>
          <RBox args={[w, h, 0.1]} r={0.03} m={k.armorDark} />
          <mesh position={[0, 0, 0.055]} material={k.glow}><planeGeometry args={[w * 0.86, h * 0.82]} /></mesh>
          {Array.from({ length: 4 }).map((_, i) => (
            <mesh key={i} position={[-w * 0.33 + i * w * 0.22, 0, 0.06]} material={k.gun}><boxGeometry args={[0.012, h * 0.85, 0.01]} /></mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

/** پروژکتور جستجو با مخروط نور حجمی */
export function Searchlight({ pos, k, sweep = 0.6 }: { pos: V3; k: Kit; sweep?: number }) {
  const ref = useRef<THREE.Group>(null);
  const cone = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fff2c4", transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), []);
  useFrame((s) => { if (ref.current) ref.current.rotation.y = Math.sin(s.clock.elapsedTime * sweep) * 1.2; });
  return (
    <group position={pos}>
      <mesh material={k.gun}><cylinderGeometry args={[0.05, 0.08, 0.15, 8]} /></mesh>
      <group ref={ref} position={[0, 0.16, 0]}>
        <group rotation={[0.25, 0, 0]}>
          <mesh rotation={[PI / 2, 0, 0]} material={k.gun}><cylinderGeometry args={[0.12, 0.09, 0.22, 14]} /></mesh>
          <mesh position={[0, 0, 0.115]} material={new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff3d0").multiplyScalar(6), toneMapped: false })}>
            <circleGeometry args={[0.1, 16]} />
          </mesh>
          <mesh position={[0, 0, 2.1]} rotation={[-PI / 2, 0, 0]} material={cone}><coneGeometry args={[0.7, 4, 20, 1, true]} /></mesh>
        </group>
      </group>
    </group>
  );
}

export function Cable({ pts, r = 0.025, m }: { pts: V3[]; r?: number; m: THREE.Material }) {
  const geo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, r, 6), [pts, r]);
  return <mesh geometry={geo} material={m} />;
}

/* ---------- پروپ‌ها ---------- */
export function Crate({ pos, rot = 0, k, s = 1 }: { pos: V3; rot?: number; k: Kit; s?: number }) {
  return (
    <group position={pos} rotation={[0, rot, 0]} scale={s}>
      <RBox args={[0.42, 0.3, 0.32]} r={0.03} pos={[0, 0.15, 0]} m={k.olive} />
      <mesh position={[0, 0.15, 0.162]} material={k.hazard}><boxGeometry args={[0.36, 0.04, 0.005]} /></mesh>
    </group>
  );
}
export function Drum({ pos, k, color = "#8c2a1f" }: { pos: V3; k: Kit; color?: string }) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.45 }), [color]);
  return (
    <group position={pos}>
      <mesh position={[0, 0.2, 0]} material={m}><cylinderGeometry args={[0.13, 0.13, 0.4, 16]} /></mesh>
      {[0.08, 0.32].map((y) => <mesh key={y} position={[0, y, 0]} material={k.gun}><torusGeometry args={[0.132, 0.008, 6, 20]} /></mesh>)}
    </group>
  );
}
export function Sandbags({ r, n, k, y = PT, start = 0, arc = PI * 2 }: { r: number; n: number; k: Kit; y?: number; start?: number; arc?: number }) {
  return (
    <group>
      {Array.from({ length: n }).map((_, i) => {
        const a = start + (i / n) * arc;
        return [0, 1].map((row) => (
          <mesh key={`${i}-${row}`} position={[Math.cos(a + row * 0.12) * r, y + 0.07 + row * 0.12, Math.sin(a + row * 0.12) * r]} rotation={[0, -a, PI / 2]} material={k.sand}>
            <capsuleGeometry args={[0.065, 0.16, 4, 8]} />
          </mesh>
        ));
      })}
    </group>
  );
}

/* =================== جزیره صخره‌ای هرمز =================== */
const nz = (x: number, y: number, z: number) =>
  Math.sin(x * 1.7 + y * 0.3) * Math.cos(z * 1.9 - x * 0.5) * 0.5 + Math.sin(x * 3.1 + z * 2.7 + y) * 0.25 + Math.sin(z * 5.3 - y * 4.1 + x) * 0.12;

export function Island({ r = 2.7, top = 0.42, pos = [0, 0, 0] as V3, seed = 0 }: { r?: number; top?: number; pos?: V3; seed?: number }) {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(r, 4);
    const p = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(p.count * 3);
    const cTop = new THREE.Color("#9c4a2c"), cRock = new THREE.Color("#6e4634"), cOchre = new THREE.Color("#b5733c"), cSand = new THREE.Color("#d2b07a"), cWet = new THREE.Color("#3a2c24");
    const v = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = nz(v.x + seed, v.y, v.z - seed);
      const rad = 1 + n * 0.16;
      let y = v.y * 0.5 * rad - 0.15;
      v.x *= rad;
      v.z *= rad;
      if (y > top) y = top + Math.abs(n) * 0.015;
      if (y < -1.4) y = -1.4;
      p.setXYZ(i, v.x, y, v.z);
      if (y >= top - 0.01) c.copy(cTop).lerp(cOchre, Math.abs(n));
      else if (y > 0.12) c.copy(cRock).lerp(cOchre, (n + 1) * 0.35).lerp(cTop, 0.2);
      else if (y > -0.12) c.copy(cSand);
      else c.copy(cWet);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
    return { geo: g, mat };
  }, [r, top, seed]);
  return <mesh geometry={geo} material={mat} position={pos} receiveShadow castShadow />;
}

/** سکوی بتنی/فلزی هشت‌ضلعی با نوار هشدار و چراغ‌ها */
export function Pad({ r = 1.9, k, glow = true }: { r?: number; k: Kit; glow?: boolean }) {
  const hz = useMemo(() => {
    const m = k.hazard.clone();
    m.map = k.hazard.map!.clone();
    m.map.repeat.set(10, 1);
    m.map.needsUpdate = true;
    return m;
  }, [k]);
  const top = 0.42;
  return (
    <group>
      <mesh position={[0, top + 0.12, 0]} material={k.concrete}><cylinderGeometry args={[r + 0.12, r + 0.3, 0.24, 8]} /></mesh>
      <mesh position={[0, top + 0.27, 0]} material={hz}><cylinderGeometry args={[r + 0.1, r + 0.12, 0.08, 8, 1, true]} /></mesh>
      <mesh position={[0, top + 0.3, 0]} material={k.deck}><cylinderGeometry args={[r, r + 0.08, 0.12, 8]} /></mesh>
      <mesh position={[0, PT + 0.003, 0]} rotation={[-PI / 2, 0, PI / 8]} material={k.accent}><ringGeometry args={[r * 0.72, r * 0.76, 8]} /></mesh>
      {glow && Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * PI * 2 + PI / 8;
        return (
          <group key={i} position={[Math.cos(a) * (r - 0.05), PT, Math.sin(a) * (r - 0.05)]}>
            <mesh position={[0, 0.06, 0]} material={k.gun}><cylinderGeometry args={[0.05, 0.06, 0.12, 8]} /></mesh>
            <mesh position={[0, 0.13, 0]} material={k.glow}><sphereGeometry args={[0.035, 8, 6]} /></mesh>
          </group>
        );
      })}
      {/* پله‌ها */}
      <group position={[0, top + 0.05, r + 0.25]}>
        {[0, 1, 2].map((i) => <mesh key={i} position={[0, i * 0.08, -i * 0.12]} material={k.concrete}><boxGeometry args={[0.7, 0.08, 0.2]} /></mesh>)}
      </group>
    </group>
  );
}

/* =================== شعله دهانه =================== */
export type FlashH = { fire: () => void };
export function Flash({ color, size = 1, light = false, ref }: { color: string; size?: number; light?: boolean; ref?: Ref<FlashH> }) {
  const g = useRef<THREE.Group>(null);
  const l = useRef<THREE.PointLight>(null);
  const life = useRef(0);
  const mats = useMemo(() => {
    const c = new THREE.Color(color).lerp(new THREE.Color("#fff3c0"), 0.5).multiplyScalar(6);
    return new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  }, [color]);
  useImperativeHandle(ref, () => ({
    fire() {
      life.current = 1;
      if (g.current) g.current.rotation.z = Math.random() * 6;
    },
  }));
  useFrame((_, d) => {
    life.current = Math.max(0, life.current - d * 16);
    const kk = life.current;
    if (g.current) {
      g.current.visible = kk > 0.01;
      g.current.scale.set(size * (0.5 + kk), size * (0.5 + kk), size * (0.4 + kk * 1.4));
      mats.opacity = kk;
    }
    if (l.current) l.current.intensity = kk * 14 * size;
  });
  return (
    <group>
      <group ref={g} visible={false}>
        <mesh material={mats}><sphereGeometry args={[0.12, 8, 6]} /></mesh>
        <mesh position={[0, 0, 0.25]} rotation={[PI / 2, 0, 0]} material={mats}><coneGeometry args={[0.13, 0.5, 8, 1, true]} /></mesh>
        <mesh material={mats}><planeGeometry args={[0.6, 0.08]} /></mesh>
        <mesh rotation={[0, 0, PI / 2]} material={mats}><planeGeometry args={[0.6, 0.08]} /></mesh>
      </group>
      {light && <pointLight ref={l} color={color} distance={5} intensity={0} decay={1.6} />}
    </group>
  );
}

/** لوله توپ با غلاف خنک‌کننده، ترمز دهانه و نقطه شلیک */
export function Barrel({ len, r, k, muzzleRef, flashRef, color, light = false, brake = true, jackets = 2, flashSize = 1, mat }: {
  len: number; r: number; k: Kit; muzzleRef?: Ref<THREE.Group>; flashRef?: Ref<FlashH>; color: string;
  light?: boolean; brake?: boolean; jackets?: number; flashSize?: number; mat?: THREE.Material;
}) {
  return (
    <group>
      <mesh position={[0, 0, len / 2]} rotation={[PI / 2, 0, 0]} material={mat ?? k.gun}><cylinderGeometry args={[r * 0.82, r, len, 18]} /></mesh>
      <mesh position={[0, 0, len * 0.06]} rotation={[PI / 2, 0, 0]} material={k.armorDark}><cylinderGeometry args={[r * 1.6, r * 1.6, len * 0.14, 18]} /></mesh>
      {Array.from({ length: jackets }).map((_, i) => (
        <mesh key={i} position={[0, 0, len * (0.32 + i * 0.22)]} rotation={[PI / 2, 0, 0]} material={k.steel}><cylinderGeometry args={[r * 1.22, r * 1.22, len * 0.05, 18]} /></mesh>
      ))}
      {brake && (
        <group position={[0, 0, len]}>
          <RBox args={[r * 2.5, r * 1.7, r * 3.2]} r={r * 0.3} m={k.gun} />
          {[-1, 1].map((s) => <mesh key={s} position={[s * r * 1.26, 0, 0]} material={k.rubber}><boxGeometry args={[0.01, r * 1.1, r * 2.2]} /></mesh>)}
        </group>
      )}
      <mesh position={[0, 0, len + (brake ? r * 1.62 : 0.001)]} material={k.rubber}><circleGeometry args={[r * 0.6, 12]} /></mesh>
      <group ref={muzzleRef} position={[0, 0, len + r * 2]}>
        <Flash ref={flashRef} color={color} size={flashSize} light={light} />
      </group>
    </group>
  );
}

/* =================== سیستم نشانه‌روی و شلیک =================== */
export interface WeaponOpts {
  yaw?: RefObject<THREE.Group | null>;
  pitch?: RefObject<THREE.Group | null>;
  muzzles: RefObject<THREE.Group | null>[];
  recoil?: RefObject<THREE.Group | null>[];
  flashes?: RefObject<FlashH | null>[];
  rate: number;
  canAir?: boolean;
  canSea?: boolean;
  preferAir?: boolean;
  turn?: number;
  maxUp?: number;
  loft?: number;
  recoilAmt?: number;
  burst?: { count: number; pause: number };
  fire: (from: THREE.Vector3, to: THREE.Vector3, i: number, air: boolean) => void;
}

export function useWeapon(o: WeaponOpts) {
  const B = useBattle();
  const st = useRef({ t: 0.4 + Math.random() * 0.6, i: 0, cool: 0, burstLeft: o.burst?.count ?? 0, air: false, has: false });
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() }), []);
  useFrame((_, dr) => {
    const d = Math.min(dr, 0.05) * B.speed;
    const s = st.current;
    const canSea = o.canSea !== false;
    let tgt: THREE.Vector3 | null = null;
    let air = false;
    if (o.canAir && o.preferAir && B.airValid) { tgt = B.air; air = true; }
    else if (canSea && B.seaValid) tgt = B.sea;
    else if (o.canAir && B.airValid) { tgt = B.air; air = true; }
    s.air = air;
    s.has = !!tgt;

    let aligned = true;
    const yaw = o.yaw?.current;
    if (tgt && yaw && yaw.parent) {
      tmp.a.copy(tgt);
      yaw.parent.worldToLocal(tmp.a);
      const want = Math.atan2(tmp.a.x - yaw.position.x, tmp.a.z - yaw.position.z);
      let diff = want - yaw.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      yaw.rotation.y += diff * Math.min(1, d * (o.turn ?? 5));
      aligned = Math.abs(diff) < 0.3;
      const p = o.pitch?.current;
      if (p && p.parent) {
        tmp.b.copy(tgt);
        p.parent.worldToLocal(tmp.b);
        const dist = Math.hypot(tmp.b.x - p.position.x, tmp.b.z - p.position.z);
        let w = -Math.atan2(tmp.b.y - p.position.y, dist) - (o.loft ?? 0);
        w = Math.max(-(o.maxUp ?? 1.3), Math.min(0.12, w));
        p.rotation.x += (w - p.rotation.x) * Math.min(1, d * (o.turn ?? 5));
      }
    }

    const period = 1 / o.rate;
    s.t -= d;
    s.cool = Math.max(0, Math.min(1, s.t / (o.burst ? o.burst.pause : period)));
    if (s.t <= 0) {
      if (!tgt || !B.firing || !aligned) s.t = 0.12;
      else {
        const n = o.muzzles.length;
        const i = s.i % n;
        s.i++;
        const m = o.muzzles[i]?.current;
        if (m) {
          m.getWorldPosition(tmp.c);
          o.fire(tmp.c.clone(), tgt.clone(), i, air);
        }
        const r = o.recoil?.[i]?.current;
        if (r) r.position.z = -(o.recoilAmt ?? 0.2);
        o.flashes?.[i]?.current?.fire();
        if (o.burst) {
          s.burstLeft--;
          if (s.burstLeft <= 0) { s.burstLeft = o.burst.count; s.t = o.burst.pause; }
          else s.t = period;
        } else s.t = period;
      }
    }
    o.recoil?.forEach((r) => { if (r.current) r.current.position.z += -r.current.position.z * Math.min(1, d * 9); });
  });
  return st;
}

/* =================== مدل‌های Kenney (CC0) =================== */
export function useKenney(url: string, length: number, tint?: string, cmap?: string) {
  const { scene } = useGLTF(url, false, false, (loader) => {
    const m = new THREE.LoadingManager();
    m.setURLModifier((u) => (u.includes("colormap") ? (cmap ?? colormapUrl) : u));
    loader.manager = m;
  });
  return useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const s = length / Math.max(size.x, size.z);
    c.scale.setScalar(s);
    c.position.set(-ctr.x * s, -box.min.y * s - 0.18 * s, -ctr.z * s);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (tint) {
          const mm = (mesh.material as THREE.MeshStandardMaterial).clone();
          mm.color = new THREE.Color(tint);
          mesh.material = mm;
        }
      }
    });
    const g = new THREE.Group();
    g.add(c);
    return g;
  }, [scene, length, tint]);
}

export function Group({ children, pos, rot }: { children: ReactNode; pos?: V3; rot?: V3 }) {
  return <group position={pos} rotation={rot}>{children}</group>;
}
