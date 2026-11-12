import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { BuildingKind } from "../data/buildings";
import { useBattle } from "./battle";
import {
  RBox, Lattice, Beacon, Dish, PhasedRadar, Searchlight, Cable, Crate, Drum, Island, useRefs, useKit, useKenney, Strut, type Kit,
} from "./kit";
import cityA from "../assets/models/city/building-small-a.glb?url";
import cityB from "../assets/models/city/building-small-b.glb?url";
import cityC from "../assets/models/city/building-small-c.glb?url";
import cityGarage from "../assets/models/city/building-garage.glb?url";
import cityTrees from "../assets/models/city/grass-trees.glb?url";
import cityFountain from "../assets/models/city/pavement-fountain.glb?url";
import cityMap from "../assets/models/city/colormap-city.png";
import tugUrl from "../assets/models/boat-tug-a.glb?url";
import cargoUrl from "../assets/models/ship-cargo-a.glb?url";
import boatUrl from "../assets/models/boat-speed-a.glb?url";

const PI = Math.PI;
const BY = 0.55; // تراز زمین ساختمان‌های ساحلی
type V3 = [number, number, number];
interface C { base: string; accent: string; glow: string }
interface P { tier: number; k: Kit; c: C }

/* =============== قطعات صنعتی مشترک =============== */
function Apron({ r = 2.7, k, hazard = false }: { r?: number; k: Kit; hazard?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.47, 0]} material={k.concrete}><cylinderGeometry args={[r, r + 0.2, 0.26, 24]} /></mesh>
      <mesh position={[0, BY + 0.01, 0]} material={k.deck}><cylinderGeometry args={[r - 0.15, r - 0.05, 0.05, 24]} /></mesh>
      {hazard && <mesh position={[0, 0.52, 0]} rotation={[-PI / 2, 0, 0]} material={k.hazard}><ringGeometry args={[r - 0.28, r - 0.12, 40]} /></mesh>}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * PI * 2 + 0.39;
        return <mesh key={i} position={[Math.cos(a) * (r - 0.3), BY + 0.03, Math.sin(a) * (r - 0.3)]} material={k.glow}><sphereGeometry args={[0.035, 8, 6]} /></mesh>;
      })}
    </group>
  );
}

function Tank({ pos, r = 0.55, h = 0.9, k, dome = false, gauge = true }: { pos: V3; r?: number; h?: number; k: Kit; dome?: boolean; gauge?: boolean }) {
  return (
    <group position={pos}>
      <mesh position={[0, h / 2, 0]} material={k.white}><cylinderGeometry args={[r, r, h, 24]} /></mesh>
      {dome
        ? <mesh position={[0, h, 0]} material={k.steel}><sphereGeometry args={[r, 24, 10, 0, PI * 2, 0, PI / 2]} /></mesh>
        : <mesh position={[0, h + 0.02, 0]} material={k.steel}><cylinderGeometry args={[r * 0.99, r * 1.01, 0.05, 24]} /></mesh>}
      {[0.25, 0.55, 0.85].map((f) => <mesh key={f} position={[0, h * f, 0]} material={k.gun}><torusGeometry args={[r + 0.005, 0.012, 6, 32]} /></mesh>)}
      {gauge && <mesh position={[0, h * 0.5, r + 0.01]} material={k.glow}><boxGeometry args={[0.05, h * 0.7, 0.01]} /></mesh>}
      <mesh position={[r * 0.7, h * 0.5, r * 0.7]} rotation={[0.6, 0, -0.6]} material={k.steel}><cylinderGeometry args={[0.02, 0.02, h * 0.9, 6]} /></mesh>
    </group>
  );
}

function SphereTank({ pos, r = 0.5, k }: { pos: V3; r: number; k: Kit }) {
  return (
    <group position={pos}>
      <mesh position={[0, r + 0.25, 0]} material={k.white}><sphereGeometry args={[r, 24, 16]} /></mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * PI * 2 + PI / 4;
        return <mesh key={i} position={[Math.cos(a) * r * 0.6, 0.15, Math.sin(a) * r * 0.6]} material={k.steel}><cylinderGeometry args={[0.035, 0.035, 0.35, 8]} /></mesh>;
      })}
      <mesh position={[0, r + 0.25, 0]} rotation={[PI / 2, 0, 0]} material={k.glow}><torusGeometry args={[r + 0.01, 0.015, 6, 32]} /></mesh>
    </group>
  );
}

function Flare({ pos, h = 2.6, k, big = false }: { pos: V3; h?: number; k: Kit; big?: boolean }) {
  const B = useBattle();
  const flame = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff7a1a").multiplyScalar(5), toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const f = 0.85 + Math.sin(t * 11) * 0.15 + Math.sin(t * 23 + 1) * 0.1;
    if (flame.current) flame.current.scale.set(f, f * (1.1 + Math.sin(t * 7) * 0.2), f);
    if (light.current) light.current.intensity = (big ? 14 : 8) * f;
  });
  const s = big ? 1.5 : 1;
  return (
    <group position={pos}>
      <mesh position={[0, h / 2, 0]} material={k.steel}><cylinderGeometry args={[0.05, 0.09, h, 10]} /></mesh>
      {[0.3, 0.55, 0.8].map((f) => <mesh key={f} position={[0, h * f, 0]} material={k.gun}><torusGeometry args={[0.09 - f * 0.03, 0.012, 6, 16]} /></mesh>)}
      <group ref={flame} position={[0, h + 0.35 * s, 0]}>
        <mesh material={mat}><coneGeometry args={[0.14 * s, 0.7 * s, 12, 1, true]} /></mesh>
        <mesh material={new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd9a0").multiplyScalar(7), toneMapped: false })}><sphereGeometry args={[0.08 * s, 10, 8]} /></mesh>
      </group>
      <pointLight ref={light} position={[0, h + 0.4, 0]} color="#ff8a3a" intensity={9} distance={7} decay={1.6} />
      {B && null}
    </group>
  );
}

function SmokeStack({ pos, h = 2.2, r = 0.16, k, rate = 0.5, dark = true }: { pos: V3; h?: number; r?: number; k: Kit; rate?: number; dark?: boolean }) {
  const B = useBattle();
  const t = useRef(Math.random());
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const grp = useRef<THREE.Group>(null);
  useFrame((_, d) => {
    t.current -= d * B.speed;
    if (t.current <= 0 && grp.current) {
      t.current = rate + Math.random() * 0.3;
      grp.current.getWorldPosition(tmp);
      B.fx.smoke(tmp.setY(tmp.y + h + 0.1), 0.35 + Math.random() * 0.25, dark);
    }
  });
  return (
    <group ref={grp} position={pos}>
      <mesh position={[0, h / 2, 0]} material={k.armor}><cylinderGeometry args={[r * 0.8, r, h, 16]} /></mesh>
      <mesh position={[0, h - 0.12, 0]} material={k.accent}><cylinderGeometry args={[r * 0.85, r * 0.85, 0.22, 16]} /></mesh>
      <Beacon pos={[0, h + 0.05, 0]} color="#ff3030" size={0.04} />
    </group>
  );
}

function Column({ pos, h = 3, r = 0.3, k }: { pos: V3; h?: number; r?: number; k: Kit }) {
  const n = Math.floor(h / 0.55);
  return (
    <group position={pos}>
      <mesh position={[0, h / 2, 0]} material={k.white}><cylinderGeometry args={[r, r * 1.05, h, 20]} /></mesh>
      <mesh position={[0, h + 0.15, 0]} material={k.steel}><sphereGeometry args={[r, 20, 8, 0, PI * 2, 0, PI / 2]} /></mesh>
      {Array.from({ length: n }).map((_, i) => (
        <group key={i} position={[0, 0.4 + i * 0.55, 0]}>
          <mesh material={k.steel}><torusGeometry args={[r + 0.09, 0.02, 6, 24]} /></mesh>
          <mesh position={[r + 0.09, 0.05, 0]} material={k.glow}><sphereGeometry args={[0.025, 6, 6]} /></mesh>
        </group>
      ))}
      <mesh position={[r + 0.12, h / 2, 0]} material={k.steel}><boxGeometry args={[0.05, h * 0.9, 0.12]} /></mesh>
    </group>
  );
}

function Pipe({ pts, r = 0.07, k, glow = false }: { pts: V3[]; r?: number; k: Kit; glow?: boolean }) {
  return <Cable pts={pts} r={r} m={glow ? k.glow : k.steel} />;
}

function PumpJack({ pos, k }: { pos: V3; k: Kit }) {
  const arm = useRef<THREE.Group>(null);
  useFrame((s) => { if (arm.current) arm.current.rotation.z = Math.sin(s.clock.elapsedTime * 1.6) * 0.28; });
  return (
    <group position={pos}>
      <RBox args={[0.7, 0.25, 0.4]} r={0.03} pos={[0, 0.12, 0]} m={k.accent} />
      <Strut a={[-0.2, 0.25, 0]} b={[0, 0.85, 0]} r={0.045} m={k.gun} />
      <Strut a={[0.2, 0.25, 0]} b={[0, 0.85, 0]} r={0.045} m={k.gun} />
      <group ref={arm} position={[0, 0.85, 0]}>
        <RBox args={[1.3, 0.14, 0.16]} r={0.04} pos={[0.1, 0.05, 0]} m={k.accent} />
        <RBox args={[0.3, 0.3, 0.2]} r={0.05} pos={[0.72, 0, 0]} m={k.gun} />
        <mesh position={[-0.5, -0.25, 0]} material={k.gun}><cylinderGeometry args={[0.06, 0.06, 0.5, 10]} /></mesh>
      </group>
      <mesh position={[0.55, 0.3, 0]} rotation={[0, 0, PI / 2]} material={k.gun}><cylinderGeometry args={[0.22, 0.22, 0.15, 16]} /></mesh>
    </group>
  );
}

function WindTurbine({ pos, h = 2.2, k }: { pos: V3; h?: number; k: Kit }) {
  const rotor = useRef<THREE.Group>(null);
  useFrame((_, d) => { if (rotor.current) rotor.current.rotation.z += d * 2.2; });
  return (
    <group position={pos}>
      <mesh position={[0, h / 2, 0]} material={k.white}><cylinderGeometry args={[0.05, 0.09, h, 10]} /></mesh>
      <group position={[0, h, 0.12]}>
        <mesh rotation={[PI / 2, 0, 0]} material={k.white}><capsuleGeometry args={[0.07, 0.25, 6, 10]} /></mesh>
        <group ref={rotor} position={[0, 0, 0.22]}>
          {[0, 1, 2].map((i) => (
            <group key={i} rotation={[0, 0, (i / 3) * PI * 2]}>
              <mesh position={[0, 0.42, 0]} material={k.white}><boxGeometry args={[0.05, 0.85, 0.02]} /></mesh>
            </group>
          ))}
          <mesh material={k.accent}><sphereGeometry args={[0.07, 10, 8]} /></mesh>
        </group>
      </group>
    </group>
  );
}

function SolarArray({ pos, rows = 2, cols = 4, k }: { pos: V3; rows?: number; cols?: number; k: Kit }) {
  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#14306b", metalness: 0.9, roughness: 0.12, clearcoat: 1 }), []);
  return (
    <group position={pos}>
      {Array.from({ length: rows }).map((_, r) => Array.from({ length: cols }).map((_, c) => (
        <group key={`${r}${c}`} position={[(c - (cols - 1) / 2) * 0.55, 0.18, (r - (rows - 1) / 2) * 0.7]} rotation={[-0.5, 0, 0]}>
          <mesh material={mat}><boxGeometry args={[0.5, 0.03, 0.6]} /></mesh>
          <mesh position={[0, -0.12, -0.15]} material={k.steel}><cylinderGeometry args={[0.02, 0.02, 0.25, 6]} /></mesh>
        </group>
      )))}
    </group>
  );
}

function CoolingTower({ pos, s = 1, k, steam = true }: { pos: V3; s?: number; k: Kit; steam?: boolean }) {
  const geo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector2(0.85 - 0.3 * Math.sin(t * PI * 0.75) + t * 0.08, t * 2.0));
    }
    return new THREE.LatheGeometry(pts, 24);
  }, []);
  return (
    <group position={pos} scale={s}>
      <mesh geometry={geo} material={k.concrete} />
      <mesh position={[0, 2.0, 0]} rotation={[-PI / 2, 0, 0]} material={k.rubber}><ringGeometry args={[0.55, 0.63, 24]} /></mesh>
      {steam && <SmokeStack pos={[0, 1.2, 0]} h={1.0} r={0.01} k={k} rate={0.7} dark={false} />}
    </group>
  );
}

function Crane({ pos, k, h = 2.6, span = 3.4, animated = true }: { pos: V3; k: Kit; h?: number; span?: number; animated?: boolean }) {
  const trolley = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (trolley.current && animated) {
      const t = s.clock.elapsedTime;
      trolley.current.position.x = Math.sin(t * 0.35) * span * 0.32;
      const hook = trolley.current.children[1] as THREE.Group;
      if (hook) hook.position.y = -0.9 - Math.sin(t * 0.5) * 0.5;
    }
  });
  return (
    <group position={pos}>
      {[-span / 2, span / 2].map((x) => (
        <group key={x}>
          <Strut a={[x - 0.25, 0, -0.4]} b={[x, h, 0]} r={0.05} m={k.accent} />
          <Strut a={[x + 0.25, 0, -0.4]} b={[x, h, 0]} r={0.05} m={k.accent} />
          <Strut a={[x - 0.25, 0, 0.4]} b={[x, h, 0]} r={0.05} m={k.accent} />
          <Strut a={[x + 0.25, 0, 0.4]} b={[x, h, 0]} r={0.05} m={k.accent} />
        </group>
      ))}
      <RBox args={[span + 0.8, 0.22, 0.3]} r={0.04} pos={[0, h, 0]} m={k.accent} />
      <RBox args={[span * 0.5, 0.12, 0.2]} r={0.03} pos={[-span * 0.45, h - 0.25, 0]} rot={[0, 0, 0.35]} m={k.accent} />
      <group ref={trolley} position={[0, h - 0.15, 0]}>
        <RBox args={[0.35, 0.25, 0.4]} r={0.04} m={k.gun} />
        <group position={[0, -0.9, 0]}>
          <mesh position={[0, 0.45, 0]} material={k.steel}><cylinderGeometry args={[0.008, 0.008, 0.9, 4]} /></mesh>
          <RBox args={[0.55, 0.12, 0.25]} r={0.02} m={k.accent} />
          <RBox args={[0.5, 0.45, 0.22]} r={0.02} pos={[0, -0.32, 0]} m={new THREE.MeshStandardMaterial({ color: ["#c0392b", "#2471a3", "#229954", "#b7950b"][Math.floor(pos[0] + 4) % 4], roughness: 0.6, metalness: 0.3 })} />
        </group>
      </group>
      <Beacon pos={[span / 2, h + 0.15, 0]} color="#ff3030" />
      <Beacon pos={[-span / 2, h + 0.15, 0]} color="#ff3030" rate={1.8} />
    </group>
  );
}

function OfficeBlock({ pos, w = 0.9, d = 0.9, floors = 3, k, roof = true }: { pos: V3; w?: number; d?: number; floors?: number; k: Kit; roof?: boolean }) {
  const h = floors * 0.32;
  return (
    <group position={pos}>
      <RBox args={[w, h, d]} r={0.03} pos={[0, h / 2, 0]} m={k.armor} />
      <mesh position={[0, h * 0.55, d / 2 + 0.005]} material={k.windows}><boxGeometry args={[w * 0.85, h * 0.8, 0.01]} /></mesh>
      <mesh position={[0, h * 0.55, -d / 2 - 0.005]} material={k.windows}><boxGeometry args={[w * 0.85, h * 0.8, 0.01]} /></mesh>
      {roof && (
        <>
          <RBox args={[w * 0.5, 0.12, d * 0.5]} r={0.02} pos={[0, h + 0.06, 0]} m={k.armorDark} />
          <mesh position={[w * 0.25, h + 0.2, 0]} material={k.steel}><cylinderGeometry args={[0.02, 0.02, 0.3, 6]} /></mesh>
          <Beacon pos={[w * 0.25, h + 0.38, 0]} color="#ff3030" size={0.03} />
        </>
      )}
    </group>
  );
}

function Palm({ pos, h = 0.9, k }: { pos: V3; h?: number; k: Kit }) {
  return (
    <group position={pos}>
      <mesh position={[0, h / 2, 0]} rotation={[0, 0, 0.08]} material={new THREE.MeshStandardMaterial({ color: "#7a5c38", roughness: 1 })}><cylinderGeometry args={[0.03, 0.05, h, 8]} /></mesh>
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 6) * PI * 2;
        return (
          <group key={i} position={[0.05, h, 0]} rotation={[0, a, 0]}>
            <mesh position={[0.28, 0.06, 0]} rotation={[0, 0, -0.5]} material={new THREE.MeshStandardMaterial({ color: "#2e7d46", roughness: 0.9 })}><coneGeometry args={[0.06, 0.6, 6]} /></mesh>
          </group>
        );
      })}
      {k && null}
    </group>
  );
}

function Bobbing({ children, pos, amp = 0.05, speed = 1.4 }: { children: React.ReactNode; pos: V3; amp?: number; speed?: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame((s) => { if (g.current) { g.current.position.y = pos[1] + Math.sin(s.clock.elapsedTime * speed + pos[0]) * amp; g.current.rotation.z = Math.sin(s.clock.elapsedTime * speed * 0.7) * 0.02; } });
  return <group ref={g} position={pos}>{children}</group>;
}

function Cars({ k, tier }: { k: Kit; tier: number }) {
  const refs = useRefs<THREE.Group>(3);
  useFrame((s) => {
    refs.forEach((r, i) => {
      if (!r.current) return;
      const t = (s.clock.elapsedTime * (0.25 + i * 0.07) + i * 0.37) % 1;
      const x = -2.2 + t * 4.4;
      r.current.position.set(i % 2 ? -x : x, BY + 0.09, 1.15 + (i % 2) * 0.35);
      r.current.rotation.y = i % 2 ? -PI / 2 : PI / 2;
    });
  });
  const colors = ["#c0392b", "#e8ecf3", "#2471a3"];
  return (
    <group>
      <mesh position={[0, BY + 0.02, 1.3]} material={k.rubber}><boxGeometry args={[4.6, 0.02, 0.8]} /></mesh>
      {Array.from({ length: 8 }).map((_, i) => <mesh key={i} position={[-2 + i * 0.55, BY + 0.035, 1.3]} material={k.white}><boxGeometry args={[0.25, 0.005, 0.04]} /></mesh>)}
      {refs.slice(0, tier >= 4 ? 3 : 2).map((r, i) => (
        <group key={i} ref={r}>
          <RBox args={[0.16, 0.09, 0.36]} r={0.03} pos={[0, 0.05, 0]} m={new THREE.MeshStandardMaterial({ color: colors[i], metalness: 0.6, roughness: 0.3 })} />
          <RBox args={[0.14, 0.07, 0.2]} r={0.02} pos={[0, 0.12, -0.02]} m={k.cockpit} />
        </group>
      ))}
    </group>
  );
}

/* =============== ساختمان‌ها =============== */
function Platform({ tier, k }: P) {
  const legY = 0.95;
  return (
    <group>
      {/* پایه‌ها و عرشه روی آب */}
      {[[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1], [0, -1.3], [0, 1.3]].map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x, 0, z]} material={k.gun}><cylinderGeometry args={[0.14, 0.17, 2.2, 12]} /></mesh>
          <Strut a={[x, -0.6, z]} b={[x * 0.4, 0.5, z * 0.4]} r={0.05} m={k.gun} />
        </group>
      ))}
      <mesh position={[0, legY, 0]} material={k.deck}><boxGeometry args={[3.4, 0.18, 3.0]} /></mesh>
      <mesh position={[0, legY + 0.1, 0]} material={k.hazard}><boxGeometry args={[3.4, 0.03, 3.0]} /></mesh>
      {/* دکل حفاری */}
      <group position={[-0.9, legY + 0.1, -0.7]}>
        <Lattice pos={[0, 0, 0]} h={tier >= 3 ? 3.0 : 2.2} w={0.55} k={k} />
        <mesh position={[0, (tier >= 3 ? 3.0 : 2.2) + 0.15, 0]} material={k.gun}><cylinderGeometry args={[0.1, 0.1, 0.3, 10]} /></mesh>
        <Cable pts={[[0, 2.0, 0], [0.3, 1.0, 0.3], [0.35, 0.1, 0.35]]} r={0.015} m={k.rubber} />
        {tier >= 4 && <Lattice pos={[1.1, 0, 0.3]} h={2.6} w={0.45} k={k} />}
      </group>
      <group position={[0.7, legY + 0.1, -0.8]}><PumpJack pos={[0, 0, 0]} k={k} /></group>
      {tier >= 2 && <PumpJack pos={[1.15, legY + 0.1, -0.75]} k={k} />}
      <Flare pos={[1.45, legY, 1.15]} h={tier >= 3 ? 3.0 : 2.0} k={k} big={tier >= 3} />
      <Tank pos={[-1.2, legY + 0.1, 0.75]} r={0.5} h={0.85} k={k} />
      {tier >= 2 && <Tank pos={[-0.45, legY + 0.1, 0.85]} r={0.42} h={0.7} k={k} />}
      <Crane pos={[0.6, legY + 0.1, 0.9]} k={k} h={1.9} span={1.8} />
      <RBox args={[0.8, 0.55, 0.6]} r={0.05} pos={[1.2, legY + 0.38, -0.1]} m={k.armor} />
      <mesh position={[1.2, legY + 0.45, 0.21]} material={k.windows}><boxGeometry args={[0.6, 0.25, 0.01]} /></mesh>
      {tier >= 3 && (
        <>
          <OfficeBlock pos={[1.25, legY + 0.1, 0.45]} w={0.7} d={0.7} floors={3} k={k} />
          <mesh position={[-1.35, legY + 0.35, -1.25]} material={k.gun}><cylinderGeometry args={[0.45, 0.45, 0.06, 24]} /></mesh>
          <mesh position={[-1.35, legY + 0.4, -1.25]} material={k.accent}><boxGeometry args={[0.5, 0.04, 0.08]} /></mesh>
          <Dish pos={[-0.2, legY + 0.65, -1.2]} r={0.3} k={k} />
        </>
      )}
      {tier >= 4 && (
        <>
          <SolarArray pos={[0.2, legY + 0.12, 1.25]} rows={1} cols={4} k={k} />
          <Searchlight pos={[-1.5, legY + 0.1, 1.3]} k={k} />
        </>
      )}
      {tier >= 5 && (
        <>
          <mesh position={[0, legY + 2.6, 0]} material={k.glass}><sphereGeometry args={[0.65, 24, 12, 0, PI * 2, 0, PI / 2]} /></mesh>
          <PhasedRadar pos={[0, legY + 2.2, 0]} w={0.6} h={0.4} k={k} />
        </>
      )}
      <Crate pos={[-0.2, legY + 0.1, 0.2]} k={k} />
      <Drum pos={[0.1, legY + 0.1, 0.45]} k={k} />
    </group>
  );
}

function TankFarm({ tier, k }: P) {
  const n = [1, 3, 6, 9, 9][tier - 1];
  const positions: V3[] = [[-1.2, BY, -0.9], [0, BY, -1.0], [1.2, BY, -0.9], [-1.5, BY, 0.3], [-0.5, BY, 0.2], [0.6, BY, 0.25], [1.6, BY, 0.35], [-1.0, BY, 1.15], [0.9, BY, 1.2]];
  return (
    <group>
      <Apron r={2.7} k={k} hazard={tier >= 3} />
      {/* دیوار حائل */}
      <mesh position={[0, BY + 0.12, -0.1]} material={k.concrete}><boxGeometry args={[3.9, 0.24, 3.1]} /></mesh>
      <mesh position={[0, BY + 0.25, -0.1]} material={k.deck}><boxGeometry args={[3.7, 0.02, 2.9]} /></mesh>
      {positions.slice(0, n).map((p, i) => (
        tier >= 5 && i >= 6
          ? <SphereTank key={i} pos={[p[0], BY + 0.25, p[2]]} r={0.48} k={k} />
          : <Tank key={i} pos={[p[0], BY + 0.25, p[2]]} r={tier >= 4 ? 0.52 : 0.46} h={tier >= 4 ? 1.0 : 0.85} k={k} dome={tier >= 4} />
      ))}
      <Pipe pts={[[-1.8, BY + 0.5, -1.4], [0, BY + 0.55, -1.5], [1.8, BY + 0.5, -1.4]]} r={0.06} k={k} />
      <Pipe pts={[[0, BY + 0.55, -1.5], [0, BY + 0.4, 0.5], [0, BY + 0.3, 1.9]]} r={0.06} k={k} />
      {tier >= 2 && (
        <>
          <RBox args={[0.7, 0.5, 0.6]} r={0.05} pos={[1.9, BY + 0.25, 1.5]} m={k.armor} />
          <mesh position={[1.9, BY + 0.65, 1.5]} material={k.gun}><cylinderGeometry args={[0.15, 0.15, 0.3, 12]} /></mesh>
        </>
      )}
      {tier >= 3 && (
        <>
          <Lattice pos={[-2.0, BY, 1.6]} h={1.8} w={0.25} k={k} />
          <mesh position={[-2.0, BY + 1.95, 1.6]} rotation={[0.4, 0, 0]} material={k.accent}><cylinderGeometry args={[0.06, 0.09, 0.7, 10]} /></mesh>
        </>
      )}
      {tier >= 4 && <OfficeBlock pos={[2.0, BY, -1.3]} w={0.65} d={0.65} floors={2} k={k} />}
      {tier >= 5 && <Dish pos={[2.0, BY + 0.7, -1.3]} r={0.28} k={k} />}
    </group>
  );
}

function Dock({ tier, k }: P) {
  const tug = useKenney(tugUrl, 2.0);
  const cargo = useKenney(cargoUrl, tier >= 4 ? 8.5 : 6.5);
  return (
    <group>
      {/* اسکله روی آب */}
      {[[-2.2, 0.8], [-0.8, 0.8], [0.8, 0.8], [2.2, 0.8]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0, z]} material={k.gun}><cylinderGeometry args={[0.12, 0.14, 2.0, 10]} /></mesh>
      ))}
      <mesh position={[0, 0.85, 0.8]} material={k.concrete}><boxGeometry args={[5.6, 0.22, 1.7]} /></mesh>
      <mesh position={[0, 0.97, 0.8]} material={k.deck}><boxGeometry args={[5.6, 0.03, 1.7]} /></mesh>
      <mesh position={[0, 0.9, 1.68]} material={k.hazard}><boxGeometry args={[5.6, 0.12, 0.02]} /></mesh>
      {/* بازوهای بارگیری */}
      {Array.from({ length: tier >= 3 ? 4 : tier >= 2 ? 2 : 1 }).map((_, i) => {
        const x = -1.8 + i * 1.2;
        return (
          <group key={i} position={[x, 0.98, 1.3]}>
            <mesh position={[0, 0.5, 0]} material={k.accent}><cylinderGeometry args={[0.09, 0.12, 1.0, 10]} /></mesh>
            <Strut a={[0, 1.0, 0]} b={[0, 1.35, 0.85]} r={0.06} m={k.accent} />
            <mesh position={[0, 1.1, 0.85]} material={k.gun}><cylinderGeometry args={[0.05, 0.05, 0.5, 8]} /></mesh>
            <Beacon pos={[0, 1.05, 0]} color="#33ff66" size={0.035} />
          </group>
        );
      })}
      <Pipe pts={[[-2.4, 1.15, 0.3], [0, 1.2, 0.25], [2.4, 1.15, 0.3]]} r={0.07} k={k} />
      {/* نفتکش پهلوگرفته */}
      <Bobbing pos={[1.2, 0, 3.6]} amp={0.04}>
        <primitive object={cargo} />
      </Bobbing>
      <Bobbing pos={[-2.6, 0, 3.0]} amp={0.06} speed={1.8}>
        <primitive object={tug} />
      </Bobbing>
      <Crane pos={[-1.6, 0.98, 0.2]} k={k} h={2.2} span={2.2} />
      <Tank pos={[2.3, 0.98, 0.1]} r={0.45} h={0.8} k={k} />
      {tier >= 2 && <Tank pos={[1.65, 0.98, 0.05]} r={0.38} h={0.65} k={k} />}
      {tier >= 3 && (
        <>
          <OfficeBlock pos={[-2.4, 0.98, -0.1]} w={0.6} d={0.6} floors={3} k={k} />
          <Dish pos={[-2.4, 0.98 + 1.0, -0.1]} r={0.24} k={k} />
        </>
      )}
      {tier >= 4 && (
        <>
          <mesh position={[-3.4, 0, 2.2]} material={k.gun}><cylinderGeometry args={[0.1, 0.12, 1.8, 8]} /></mesh>
          <Beacon pos={[-3.4, 0.95, 2.2]} color="#33ff66" />
          <mesh position={[4.4, 0, 2.6]} material={k.gun}><cylinderGeometry args={[0.1, 0.12, 1.8, 8]} /></mesh>
          <Beacon pos={[4.4, 0.95, 2.6]} color="#ff3030" />
        </>
      )}
      {[0, 1, 2].map((i) => <Crate key={i} pos={[-0.4 + i * 0.5, 0.98, 0.1]} rot={i * 0.4} k={k} s={0.9} />)}
    </group>
  );
}

function Refinery({ tier, k }: P) {
  return (
    <group>
      <Apron r={2.9} k={k} hazard />
      <Column pos={[-1.3, BY, -0.9]} h={tier >= 4 ? 3.6 : 2.8} r={0.32} k={k} />
      <Column pos={[-0.5, BY, -1.1]} h={tier >= 3 ? 3.0 : 2.2} r={0.26} k={k} />
      {tier >= 2 && <Column pos={[0.25, BY, -0.95]} h={2.4} r={0.22} k={k} />}
      {tier >= 4 && <Column pos={[1.0, BY, -1.05]} h={3.2} r={0.26} k={k} />}
      <Flare pos={[1.7, BY, -1.2]} h={3.2} k={k} big={tier >= 3} />
      <SmokeStack pos={[0.9, BY, -1.3]} h={2.6} r={0.18} k={k} rate={0.45} />
      {tier >= 3 && <SmokeStack pos={[1.35, BY, -0.6]} h={2.0} r={0.14} k={k} rate={0.6} />}
      {/* راکتورهای کروی و مبدل‌ها */}
      <SphereTank pos={[-1.5, BY, 0.35]} r={0.42} k={k} />
      {tier >= 2 && <SphereTank pos={[-0.75, BY, 0.5]} r={0.36} k={k} />}
      {Array.from({ length: tier >= 3 ? 4 : 2 }).map((_, i) => (
        <mesh key={i} position={[0.1 + i * 0.42, BY + 0.3, 0.35]} rotation={[0, 0, PI / 2]} material={k.steel}><cylinderGeometry args={[0.16, 0.16, 0.4, 14]} /></mesh>
      ))}
      <Tank pos={[1.3, BY, 0.5]} r={0.5} h={0.9} k={k} />
      {tier >= 2 && <Tank pos={[1.95, BY, 0.45]} r={0.42} h={0.75} k={k} />}
      {/* شبکه لوله‌ها */}
      <Pipe pts={[[-1.3, BY + 1.2, -0.9], [-0.5, BY + 1.4, -0.7], [0.4, BY + 1.1, 0.2], [1.3, BY + 0.9, 0.5]]} r={0.06} k={k} />
      <Pipe pts={[[-0.5, BY + 0.8, -1.1], [-0.2, BY + 0.7, 0], [-0.4, BY + 0.75, 0.9]]} r={0.05} k={k} />
      <Pipe pts={[[-2.2, BY + 0.35, 1.3], [0, BY + 0.4, 1.5], [2.2, BY + 0.35, 1.3]]} r={0.08} k={k} />
      {tier >= 3 && <OfficeBlock pos={[1.6, BY, 1.35]} w={0.8} d={0.7} floors={2} k={k} />}
      {tier >= 4 && (
        <>
          <CoolingTower pos={[-2.1, BY, -0.4]} s={0.75} k={k} />
          <PhasedRadar pos={[2.2, BY, -1.4]} w={0.5} h={0.35} k={k} />
        </>
      )}
      {tier >= 5 && (
        <>
          <mesh position={[0, BY + 2.2, 0.9]} material={k.glass}><sphereGeometry args={[0.55, 24, 12, 0, PI * 2, 0, PI / 2]} /></mesh>
          <SolarArray pos={[-1.2, BY, 1.5]} rows={1} cols={3} k={k} />
        </>
      )}
      <Crate pos={[0.6, BY, 1.2]} k={k} />
      <Drum pos={[0.9, BY, 1.35]} k={k} />
      <Drum pos={[1.05, BY, 1.1]} k={k} color="#1f4f8c" />
    </group>
  );
}

function Steel({ tier, k }: P) {
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff5a1a").multiplyScalar(4), toneMapped: false }), []);
  const door = useRef<THREE.Mesh>(null);
  useFrame((s) => { if (door.current) (door.current.material as THREE.MeshBasicMaterial).color.set("#ff5a1a").multiplyScalar(3 + Math.sin(s.clock.elapsedTime * 2) * 1.2); });
  return (
    <group>
      <Apron r={2.9} k={k} hazard />
      {/* کوره بلند */}
      <group position={[-1.2, BY, -0.9]}>
        <mesh position={[0, 1.1, 0]} material={k.armor}><cylinderGeometry args={[0.55, 0.8, 2.2, 20]} /></mesh>
        <mesh position={[0, 2.35, 0]} material={k.armorDark}><cylinderGeometry args={[0.3, 0.5, 0.4, 16]} /></mesh>
        <SmokeStack pos={[0, 2.4, 0]} h={0.9} r={0.16} k={k} rate={0.4} />
        <mesh ref={door} position={[0, 0.35, 0.72]} material={glowMat}><boxGeometry args={[0.4, 0.45, 0.02]} /></mesh>
        <mesh position={[0, 0.1, 0.9]} rotation={[0.5, 0, 0]} material={k.gun}><boxGeometry args={[0.35, 0.06, 0.7]} /></mesh>
      </group>
      {tier >= 3 && (
        <group position={[-0.1, BY, -1.15]}>
          <mesh position={[0, 0.9, 0]} material={k.armor}><cylinderGeometry args={[0.45, 0.65, 1.8, 18]} /></mesh>
          <SmokeStack pos={[0, 1.8, 0]} h={0.8} r={0.13} k={k} rate={0.5} />
        </group>
      )}
      <CoolingTower pos={[1.5, BY, -1.1]} s={0.8} k={k} />
      {/* سوله نورد */}
      <group position={[0.7, BY, 0.55]}>
        <RBox args={[2.2, 0.8, 1.2]} r={0.05} pos={[0, 0.4, 0]} m={k.armor} />
        <mesh position={[0, 0.85, 0]} rotation={[PI / 2, 0, 0]} scale={[1.1, 1.2, 0.45]} material={k.armorDark}><cylinderGeometry args={[1, 1, 1, 20, 1, false, -PI / 2, PI]} /></mesh>
        <mesh position={[0, 0.35, 0.61]} material={k.windows}><boxGeometry args={[1.8, 0.3, 0.01]} /></mesh>
      </group>
      {/* انبار شمش */}
      {Array.from({ length: tier >= 3 ? 8 : 4 }).map((_, i) => (
        <mesh key={i} position={[-1.9 + (i % 4) * 0.35, BY + 0.06 + Math.floor(i / 4) * 0.13, 0.9]} material={k.steel}><boxGeometry args={[0.3, 0.11, 0.9]} /></mesh>
      ))}
      <Crane pos={[-1.2, BY, 1.5]} k={k} h={1.8} span={2.4} />
      {/* نوار نقاله */}
      <group position={[1.9, BY, 0.9]} rotation={[0, -0.5, 0]}>
        <RBox args={[0.4, 0.15, 1.8]} r={0.03} pos={[0, 0.55, 0]} rot={[0.35, 0, 0]} m={k.gun} />
        {[-0.7, 0.7].map((z) => <Strut key={z} a={[0, 0, z]} b={[0, 0.5, z * 0.8]} r={0.04} m={k.steel} />)}
      </group>
      {tier >= 4 && <OfficeBlock pos={[2.1, BY, -0.3]} w={0.7} d={0.7} floors={3} k={k} />}
      {tier >= 5 && <PhasedRadar pos={[2.1, BY + 1.0, -0.3]} w={0.5} h={0.35} k={k} />}
      <Crate pos={[-0.3, BY, 1.5]} rot={0.5} k={k} />
    </group>
  );
}

function AmmoFactory({ tier, k }: P) {
  const n = tier >= 4 ? 3 : tier >= 2 ? 2 : 1;
  return (
    <group>
      <Apron r={2.9} k={k} hazard />
      {Array.from({ length: n }).map((_, i) => (
        <group key={i} position={[-1.4 + i * 1.4, BY, -1.0]}>
          <RBox args={[1.2, 0.75, 1.0]} r={0.05} pos={[0, 0.37, 0]} m={k.armor} />
          <mesh position={[0, 0.78, 0]} rotation={[PI / 2, 0, 0]} scale={[0.62, 1.0, 0.4]} material={k.armorDark}><cylinderGeometry args={[1, 1, 1, 18, 1, false, -PI / 2, PI]} /></mesh>
          <mesh position={[0, 0.4, 0.51]} material={k.hazard}><boxGeometry args={[0.8, 0.1, 0.01]} /></mesh>
          {/* موشک روی خط */}
          <group position={[0, 0.55, 0.75]} rotation={[0, 0, 0]}>
            <mesh rotation={[PI / 2, 0, 0]} material={k.white}><cylinderGeometry args={[0.09, 0.09, 0.85, 12]} /></mesh>
            <mesh position={[0, 0, 0.55]} rotation={[PI / 2, 0, 0]} material={k.accent}><coneGeometry args={[0.09, 0.25, 12]} /></mesh>
          </group>
        </group>
      ))}
      {/* زرادخانه */}
      <group position={[-1.5, BY, 0.9]}>
        <RBox args={[1.4, 0.6, 1.0]} r={0.04} pos={[0, 0.3, 0]} m={k.concrete} />
        <mesh position={[0, 0.62, 0]} material={k.sand}><boxGeometry args={[1.5, 0.18, 1.1]} /></mesh>
        <mesh position={[0, 0.32, 0.52]} material={k.gun}><boxGeometry args={[0.5, 0.45, 0.03]} /></mesh>
        <mesh position={[0, 0.55, 0.53]} material={k.hazard}><boxGeometry args={[0.5, 0.07, 0.01]} /></mesh>
      </group>
      {/* برج تست موتور */}
      <group position={[1.6, BY, 0.7]}>
        <Lattice pos={[0, 0, 0]} h={1.9} w={0.4} k={k} />
        <mesh position={[0, 1.55, 0]} rotation={[PI, 0, 0]} material={k.white}><cylinderGeometry args={[0.11, 0.13, 0.9, 12]} /></mesh>
        {tier >= 3 && <Flare pos={[0, 0.1, 0]} h={0.35} k={k} />}
      </group>
      {tier >= 3 && (
        <>
          <Dish pos={[2.1, BY, -1.5]} r={0.3} k={k} />
          <OfficeBlock pos={[0.9, BY, 1.35]} w={0.7} d={0.6} floors={2} k={k} />
        </>
      )}
      {tier >= 4 && <Searchlight pos={[-2.2, BY, 1.6]} k={k} />}
      {tier >= 5 && (
        <group position={[1.9, BY, -0.6]}>
          {[0, 1, 2].map((i) => (
            <group key={i} position={[i * 0.35 - 0.35, 0, 0]}>
              <mesh position={[0, 0.5, 0]} material={k.armorDark}><cylinderGeometry args={[0.14, 0.14, 1.0, 12]} /></mesh>
              <mesh position={[0, 1.15, 0]} material={k.glow}><coneGeometry args={[0.1, 0.3, 10]} /></mesh>
            </group>
          ))}
        </group>
      )}
      {[0, 1, 2].map((i) => <Crate key={i} pos={[-0.2 + i * 0.45, BY, 0.6]} rot={i} k={k} s={0.85} />)}
    </group>
  );
}

function PowerPlant({ tier, k }: P) {
  return (
    <group>
      <Apron r={2.9} k={k} hazard={tier >= 3} />
      {tier < 5 ? (
        <>
          <group position={[-1.1, BY, -0.8]}>
            <RBox args={[1.6, 0.9, 1.1]} r={0.06} pos={[0, 0.45, 0]} m={k.armor} />
            <mesh position={[-0.5, 0.95, 0]} material={k.armorDark}><cylinderGeometry args={[0.35, 0.35, 0.25, 18]} /></mesh>
            <mesh position={[0.4, 0.5, 0.56]} material={k.windows}><boxGeometry args={[0.9, 0.35, 0.01]} /></mesh>
            <SmokeStack pos={[0.55, 0.9, -0.3]} h={1.6} r={0.14} k={k} rate={0.5} />
          </group>
          {tier >= 2 && <CoolingTower pos={[0.9, BY, -1.15]} s={0.85} k={k} />}
          {tier >= 3 && (
            <group position={[1.9, BY, -0.5]}>
              <RBox args={[0.8, 1.3, 0.8]} r={0.05} pos={[0, 0.65, 0]} m={k.armor} />
              <SmokeStack pos={[0, 1.3, 0]} h={1.2} r={0.12} k={k} rate={0.6} />
            </group>
          )}
          {/* ترانس و پست برق */}
          {Array.from({ length: tier >= 3 ? 3 : 2 }).map((_, i) => (
            <group key={i} position={[-1.6 + i * 0.7, BY, 0.7]}>
              <RBox args={[0.5, 0.55, 0.45]} r={0.04} pos={[0, 0.27, 0]} m={k.armorDark} />
              {[0, 1, 2].map((j) => <mesh key={j} position={[-0.15 + j * 0.15, 0.65, 0]} material={k.steel}><cylinderGeometry args={[0.03, 0.045, 0.25, 8]} /></mesh>)}
            </group>
          ))}
          <Lattice pos={[1.6, BY, 0.9]} h={2.6} w={0.3} k={k} />
          <Cable pts={[[1.6, BY + 2.2, 0.9], [0.5, BY + 1.6, 0.75], [-0.9, BY + 1.05, 0.7]]} r={0.015} m={k.rubber} />
          {tier >= 3 && <SolarArray pos={[-0.6, BY, 1.55]} rows={2} cols={4} k={k} />}
          {tier >= 4 && (
            <>
              <WindTurbine pos={[-2.2, BY, -1.5]} h={2.4} k={k} />
              <WindTurbine pos={[-1.6, BY, -1.9]} h={2.0} k={k} />
              <WindTurbine pos={[2.35, BY, 0.6]} h={2.2} k={k} />
            </>
          )}
        </>
      ) : (
        <>
          {/* راکتور اتمی */}
          <mesh position={[-0.6, BY, -0.6]} material={k.white}><cylinderGeometry args={[1.05, 1.15, 0.9, 28]} /></mesh>
          <mesh position={[-0.6, BY + 0.9, -0.6]} material={k.white}><sphereGeometry args={[1.05, 28, 14, 0, PI * 2, 0, PI / 2]} /></mesh>
          <mesh position={[-0.6, BY + 0.45, -0.6]} material={k.glow}><torusGeometry args={[1.08, 0.03, 8, 40]} /></mesh>
          <CoolingTower pos={[1.2, BY, -1.2]} s={1.05} k={k} />
          <CoolingTower pos={[2.05, BY, -0.5]} s={0.85} k={k} />
          <OfficeBlock pos={[0.6, BY, 0.9]} w={0.9} d={0.8} floors={3} k={k} />
          <WindTurbine pos={[-2.2, BY, 0.8]} h={2.3} k={k} />
          <SolarArray pos={[-0.4, BY, 1.6]} rows={2} cols={5} k={k} />
          <Lattice pos={[2.2, BY, 1.2]} h={2.8} w={0.3} k={k} />
        </>
      )}
      <Tank pos={[-2.1, BY, 0.2]} r={0.4} h={0.7} k={k} />
    </group>
  );
}

function Desal({ tier, k }: P) {
  return (
    <group>
      <Apron r={2.6} k={k} />
      <group position={[-0.7, BY, -0.7]}>
        <RBox args={[1.7, 0.8, 1.1]} r={0.06} pos={[0, 0.4, 0]} m={k.armor} />
        <mesh position={[0, 0.45, 0.56]} material={k.windows}><boxGeometry args={[1.4, 0.35, 0.01]} /></mesh>
        {Array.from({ length: tier >= 3 ? 5 : 3 }).map((_, i) => (
          <mesh key={i} position={[-0.6 + i * 0.3, 0.85, 0]} rotation={[0, 0, PI / 2]} material={k.steel}><cylinderGeometry args={[0.09, 0.09, 0.22, 12]} /></mesh>
        ))}
      </group>
      <Tank pos={[1.1, BY, -0.9]} r={0.55} h={1.0} k={k} dome={tier >= 3} />
      {tier >= 2 && <Tank pos={[1.85, BY, -0.75]} r={0.45} h={0.8} k={k} />}
      {tier >= 4 && <SphereTank pos={[1.5, BY, 0.3]} r={0.45} k={k} />}
      {/* برج آب */}
      <group position={[-1.8, BY, 0.6]}>
        <Lattice pos={[0, 0, 0]} h={1.7} w={0.35} k={k} top={false} />
        <mesh position={[0, 1.95, 0]} material={k.accent}><cylinderGeometry args={[0.42, 0.35, 0.55, 16]} /></mesh>
      </group>
      {/* لوله‌های مکش به دریا */}
      <Pipe pts={[[-0.7, BY + 0.3, 0.1], [-0.3, 0.35, 1.6], [-0.2, 0.1, 3.0]]} r={0.09} k={k} />
      <Pipe pts={[[0.1, BY + 0.3, 0.1], [0.4, 0.35, 1.6], [0.5, 0.1, 3.0]]} r={0.09} k={k} />
      <mesh position={[-0.2, 0.12, 3.1]} material={k.accent}><cylinderGeometry args={[0.16, 0.16, 0.25, 12]} /></mesh>
      <Beacon pos={[-0.2, 0.3, 3.1]} color="#38bdf8" />
      {/* خروجی آب شیرین نمایشی */}
      <mesh position={[1.6, 0.25, 2.2]} rotation={[0.4, 0, 0]} material={k.glow}><cylinderGeometry args={[0.07, 0.1, 0.8, 10]} /></mesh>
      {tier >= 3 && <OfficeBlock pos={[0.2, BY, -1.6]} w={0.7} d={0.6} floors={2} k={k} />}
      {tier >= 4 && <SolarArray pos={[-1.3, BY, -1.7]} rows={2} cols={4} k={k} />}
      {tier >= 5 && <mesh position={[0.4, BY + 1.6, -0.5]} material={k.glass}><sphereGeometry args={[0.7, 24, 12, 0, PI * 2, 0, PI / 2]} /></mesh>}
    </group>
  );
}

function Town({ tier, k }: P) {
  const a = useKenney(cityA, 1.25, undefined, cityMap);
  const b = useKenney(cityB, 1.25, undefined, cityMap);
  const c2 = useKenney(cityC, 1.35, undefined, cityMap);
  const garage = useKenney(cityGarage, 1.2, undefined, cityMap);
  const trees = useKenney(cityTrees, 1.5, undefined, cityMap);
  const fountain = useKenney(cityFountain, 1.5, undefined, cityMap);
  const kenney: THREE.Group[] = [a, b, c2, garage];
  return (
    <group>
      <Apron r={2.9} k={k} />
      {tier === 1 ? (
        <>
          {kenney.slice(0, 2).map((m, i) => <primitive key={i} object={m} position={[-0.9 + i * 1.6, BY, -0.8]} rotation={[0, i * 0.7, 0]} />)}
          <primitive object={trees} position={[1.2, BY, 0.6]} />
          <Palm pos={[-1.8, BY, 0.8]} k={k} />
          <Palm pos={[0.2, BY, 1.2]} k={k} />
          <Drum pos={[1.8, BY, -0.6]} k={k} />
        </>
      ) : (
        <>
          {kenney.map((m, i) => (
            <primitive key={i} object={m} position={[-1.7 + (i % 2) * 1.7, BY, -1.3 + Math.floor(i / 2) * 1.5]} rotation={[0, (i % 2) * PI + 0.2, 0]} />
          ))}
          {tier >= 3 && <primitive object={fountain} position={[0.1, BY, 0.15]} />}
          {tier >= 3 && <primitive object={trees} position={[1.9, BY, 0.9]} />}
        </>
      )}
      {tier >= 3 && <OfficeBlock pos={[-1.8, BY, -1.6]} w={0.85} d={0.85} floors={5} k={k} />}
      {tier >= 3 && <Cars k={k} tier={tier} />}
      {tier >= 4 && (
        <>
          <OfficeBlock pos={[1.8, BY, -1.7]} w={0.95} d={0.95} floors={8} k={k} />
          <OfficeBlock pos={[0.6, BY, -1.9]} w={0.8} d={0.8} floors={6} k={k} />
          <Palm pos={[-2.2, BY, 1.4]} k={k} h={1.1} />
          <Palm pos={[2.3, BY, 1.3]} k={k} h={1.1} />
          {/* مونوریل */}
          <mesh position={[0, BY + 1.9, 1.75]} material={k.concrete}><boxGeometry args={[4.8, 0.12, 0.3]} /></mesh>
          {[-2, 0, 2].map((x) => <mesh key={x} position={[x, BY + 0.95, 1.75]} material={k.concrete}><boxGeometry args={[0.18, 1.9, 0.24]} /></mesh>)}
          <RBox args={[1.3, 0.3, 0.34]} r={0.08} pos={[0.6, BY + 2.15, 1.75]} m={k.accent} />
        </>
      )}
      {tier >= 5 && (
        <>
          <group position={[-0.9, BY, -0.6]}>
            <RBox args={[0.7, 2.6, 0.7]} r={0.1} pos={[0, 1.3, 0]} m={k.glass} />
            <mesh position={[0, 2.75, 0]} material={k.glow}><sphereGeometry args={[0.2, 12, 10]} /></mesh>
            {[0.6, 1.4, 2.2].map((y) => <mesh key={y} position={[0, y, 0]} rotation={[PI / 2, 0, 0]} material={k.glow}><torusGeometry args={[0.42, 0.015, 6, 24]} /></mesh>)}
          </group>
          <mesh position={[1.2, BY + 3.1, -1.2]} material={k.hot}><sphereGeometry args={[0.14, 10, 8]} /></mesh>
        </>
      )}
      {tier < 3 && <Palm pos={[1.9, BY, -1.2]} k={k} />}
    </group>
  );
}

function Welfare({ tier, k }: P) {
  const cross = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff2a4a").multiplyScalar(3), toneMapped: false }), []);
  return (
    <group>
      <Apron r={2.9} k={k} />
      {/* بیمارستان */}
      <group position={[-1.0, BY, -0.8]}>
        <OfficeBlock pos={[0, 0, 0]} w={1.5} d={1.0} floors={tier >= 3 ? 8 : tier >= 2 ? 5 : 2} k={k} roof={false} />
        <mesh position={[0, (tier >= 3 ? 8 : tier >= 2 ? 5 : 2) * 0.32 + 0.25, 0]} material={cross}><boxGeometry args={[0.34, 0.1, 0.1]} /></mesh>
        <mesh position={[0, (tier >= 3 ? 8 : tier >= 2 ? 5 : 2) * 0.32 + 0.25, 0]} material={cross}><boxGeometry args={[0.1, 0.34, 0.1]} /></mesh>
      </group>
      {tier >= 3 && (
        <group position={[-1.0, BY + 8 * 0.32, -0.8]}>
          <mesh material={k.concrete}><cylinderGeometry args={[0.55, 0.55, 0.08, 24]} /></mesh>
          <mesh position={[0, 0.05, 0]} material={k.accent}><boxGeometry args={[0.5, 0.02, 0.12]} /></mesh>
          <mesh position={[0, 0.05, 0]} material={k.accent}><boxGeometry args={[0.12, 0.02, 0.5]} /></mesh>
        </group>
      )}
      {/* دانشگاه */}
      <group position={[1.2, BY, -0.9]}>
        <RBox args={[1.5, 0.75, 0.9]} r={0.04} pos={[0, 0.37, 0]} m={k.armor} />
        <mesh position={[0, 0.78, 0]} rotation={[0, PI / 4, 0]} material={k.accent}><coneGeometry args={[1.05, 0.45, 4]} /></mesh>
        <mesh position={[0, 0.45, 0.46]} material={k.windows}><boxGeometry args={[1.2, 0.35, 0.01]} /></mesh>
        {tier >= 3 && (
          <>
            <mesh position={[0.9, 0.9, 0]} material={k.white}><sphereGeometry args={[0.32, 18, 10, 0, PI * 2, 0, PI / 2]} /></mesh>
            <Strut a={[0.9, 1.15, 0]} b={[1.15, 1.35, 0.2]} r={0.025} m={k.steel} />
          </>
        )}
      </group>
      <primitive object={useKenney(cityTrees, 1.6, undefined, cityMap)} position={[0.2, BY, 0.7]} />
      <Palm pos={[-2.1, BY, 0.9]} k={k} />
      <Palm pos={[2.2, BY, 0.6]} k={k} />
      {tier >= 2 && <Cars k={k} tier={tier} />}
      {tier >= 4 && <OfficeBlock pos={[2.0, BY, -1.8]} w={0.8} d={0.8} floors={6} k={k} />}
      {tier >= 5 && <mesh position={[0, BY + 2.4, 0.4]} material={k.glass}><sphereGeometry args={[0.6, 24, 12, 0, PI * 2, 0, PI / 2]} /></mesh>}
    </group>
  );
}

function Research({ tier, k }: P) {
  const ring = useRef<THREE.Group>(null);
  useFrame((_, d) => { if (ring.current) ring.current.rotation.y += d * 0.8; });
  return (
    <group>
      <Apron r={2.9} k={k} hazard={tier >= 4} />
      <OfficeBlock pos={[-1.1, BY, -1.0]} w={1.3} d={1.0} floors={tier >= 4 ? 10 : tier >= 3 ? 6 : tier >= 2 ? 4 : 2} k={k} />
      <Dish pos={[-1.1, BY + (tier >= 4 ? 10 : tier >= 3 ? 6 : tier >= 2 ? 4 : 2) * 0.32, -1.0]} r={0.35} k={k} />
      {/* شتاب‌دهنده حلقوی */}
      <group position={[1.0, BY + 0.15, -0.6]}>
        <mesh material={k.armorDark}><torusGeometry args={[0.85, 0.14, 12, 36]} /></mesh>
        <group ref={ring}>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * PI * 2;
            return <mesh key={i} position={[Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85]} material={k.glow}><sphereGeometry args={[0.07, 8, 8]} /></mesh>;
          })}
        </group>
        <mesh position={[0, 0.3, 0]} material={k.glass}><sphereGeometry args={[0.3, 18, 12]} /></mesh>
      </group>
      {/* محوطه تست */}
      <group position={[0.9, BY, 0.9]}>
        <mesh material={k.concrete}><cylinderGeometry args={[0.7, 0.75, 0.1, 20]} /></mesh>
        <mesh position={[0, 0.5, 0]} material={k.white}><cylinderGeometry args={[0.1, 0.12, 0.9, 12]} /></mesh>
        <mesh position={[0, 1.05, 0]} material={k.accent}><coneGeometry args={[0.1, 0.25, 12]} /></mesh>
        {tier >= 3 && <Flare pos={[0, 0, 0.3]} h={0.3} k={k} />}
      </group>
      {tier >= 3 && (
        <>
          <RBox args={[1.1, 0.6, 0.8]} r={0.05} pos={[-1.4, BY + 0.3, 0.8]} m={k.armor} />
          <mesh position={[-1.4, BY + 0.4, 1.21]} material={k.glass}><boxGeometry args={[0.8, 0.3, 0.01]} /></mesh>
        </>
      )}
      {tier >= 4 && <PhasedRadar pos={[2.1, BY, -1.6]} w={0.55} h={0.4} k={k} />}
      {tier >= 5 && (
        <group position={[0, BY + 2.8, 0.3]}>
          <mesh material={k.glass}><icosahedronGeometry args={[0.5, 1]} /></mesh>
          <mesh material={k.hot}><icosahedronGeometry args={[0.22, 0]} /></mesh>
        </group>
      )}
      <Crate pos={[-0.3, BY, 1.4]} k={k} />
    </group>
  );
}

function Port({ tier, k }: P) {
  const cargo = useKenney(cargoUrl, tier >= 4 ? 9 : 7);
  const tug = useKenney(tugUrl, 2.0);
  const contColors = ["#c0392b", "#2471a3", "#229954", "#b7950b", "#7d3c98", "#ca6f1e"];
  const contMats = useMemo(() => contColors.map((col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.35 })), []);
  const rows = tier >= 4 ? 5 : tier >= 3 ? 4 : tier >= 2 ? 3 : 1;
  return (
    <group>
      {/* اسکله */}
      {[[-3, 0.6], [-1, 0.6], [1, 0.6], [3, 0.6]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0, z]} material={k.gun}><cylinderGeometry args={[0.13, 0.15, 2.0, 10]} /></mesh>
      ))}
      <mesh position={[0, 0.85, 0.6]} material={k.concrete}><boxGeometry args={[7.6, 0.22, 2.2]} /></mesh>
      <mesh position={[0, 0.97, 0.6]} material={k.deck}><boxGeometry args={[7.6, 0.03, 2.2]} /></mesh>
      <Crane pos={[-1.4, 0.98, 0.1]} k={k} h={3.0} span={2.6} />
      {tier >= 3 && <Crane pos={[1.6, 0.98, 0.1]} k={k} h={3.2} span={2.8} />}
      {tier >= 4 && <Crane pos={[-3.2, 0.98, 0.1]} k={k} h={2.8} span={2.2} />}
      {/* محوطه کانتینر */}
      {Array.from({ length: rows }).map((_, r) => Array.from({ length: 4 }).map((_, c) => (
        <group key={`${r}${c}`} position={[-2.8 + c * 0.62, 0.98, -0.55 + (r % 2) * 0.3]} rotation={[0, (r + c) % 2 ? 0 : PI / 2, 0]}>
          <RBox args={[0.55, 0.24, 0.24]} r={0.01} pos={[0, 0.12 + (c % 2) * 0.25, 0]} m={contMats[(r * 4 + c) % 6]} />
        </group>
      )))}
      <Bobbing pos={[0.8, 0, 4.2]} amp={0.04}>
        <primitive object={cargo} />
      </Bobbing>
      <Bobbing pos={[-3.2, 0, 3.4]} amp={0.06} speed={1.7}>
        <primitive object={tug} />
      </Bobbing>
      {tier >= 3 && <OfficeBlock pos={[3.3, 0.98, -0.2]} w={0.65} d={0.65} floors={4} k={k} />}
      {tier >= 4 && <Searchlight pos={[3.3, 0.98 + 1.35, -0.2]} k={k} />}
      {[0, 1].map((i) => <Crate key={i} pos={[2.6 + i * 0.45, 0.98, 1.2]} k={k} s={0.9} />)}
    </group>
  );
}

function Customs({ tier, k }: P) {
  const scan = useRef<THREE.Mesh>(null);
  const B = useBattle();
  const scanMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff9a3c").multiplyScalar(2.5), toneMapped: false, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), []);
  useFrame((s) => {
    if (scan.current) {
      const x = Math.sin(s.clock.elapsedTime * 0.5) * 2.4;
      scan.current.position.set(x, 1.1, 3.4);
      scan.current.visible = tier >= 3 && B.firing !== false;
    }
  });
  const boat = useKenney(boatUrl, 1.5, "#e8ecf3");
  return (
    <group>
      <Apron r={2.4} k={k} />
      <OfficeBlock pos={[-1.2, BY, -0.7]} w={0.85} d={0.8} floors={tier >= 3 ? 4 : 2} k={k} />
      <Lattice pos={[0.6, BY, -0.9]} h={tier >= 4 ? 3.2 : 2.4} w={0.3} k={k} />
      {tier >= 2 && <Searchlight pos={[0.6, BY + (tier >= 4 ? 3.2 : 2.4), -0.9]} k={k} />}
      {tier >= 3 && <PhasedRadar pos={[0.6, BY + (tier >= 4 ? 3.5 : 2.7), -0.9]} w={0.5} h={0.35} k={k} spin={2} />}
      {/* طاق اسکن روی کانال */}
      {tier >= 3 && (
        <group position={[0, 0, 3.4]}>
          {[-2.6, 2.6].map((x) => <mesh key={x} position={[x, 1.1, 0]} material={k.accent}><boxGeometry args={[0.3, 2.2, 0.4]} /></mesh>)}
          <RBox args={[5.5, 0.35, 0.5]} r={0.05} pos={[0, 2.3, 0]} m={k.accent} />
          {[0, 1, 2, 3, 4].map((i) => <mesh key={i} position={[-2 + i, 2.05, 0]} material={k.glow}><sphereGeometry args={[0.05, 8, 6]} /></mesh>)}
          <mesh ref={scan} material={scanMat}><planeGeometry args={[0.7, 2.1]} /></mesh>
        </group>
      )}
      <Bobbing pos={[1.8, 0, 2.6]} amp={0.05} speed={1.6}>
        <primitive object={boat} />
      </Bobbing>
      <Beacon pos={[-2.2, 0.5, 2.8]} color="#33ff66" />
      {tier >= 4 && <Dish pos={[-1.9, BY, 1.2]} r={0.3} k={k} />}
      {tier >= 5 && (
        <group position={[0, BY + 2.6, -0.5]}>
          <mesh material={k.glass}><sphereGeometry args={[0.45, 20, 14]} /></mesh>
          <mesh rotation={[PI / 2, 0, 0]} material={k.glow}><torusGeometry args={[0.6, 0.02, 6, 32]} /></mesh>
        </group>
      )}
    </group>
  );
}

function CoastGuard({ tier, k }: P) {
  const boat1 = useKenney(boatUrl, 1.7, "#dbe7f5");
  const boat2 = useKenney(boatUrl, 1.7, "#dbe7f5");
  const tug = useKenney(tugUrl, 2.2, "#9fb6cc");
  const n = tier >= 3 ? 3 : tier >= 2 ? 2 : 1;
  const boats = [boat1, boat2, tug].slice(0, n);
  return (
    <group>
      <Apron r={2.6} k={k} />
      <OfficeBlock pos={[-1.1, BY, -0.8]} w={1.1} d={0.8} floors={tier >= 4 ? 4 : 2} k={k} />
      <group position={[0.9, BY, -0.9]}>
        <RBox args={[1.2, 0.6, 0.9]} r={0.04} pos={[0, 0.3, 0]} m={k.armorDark} />
        <mesh position={[0, 0.35, 0.46]} material={k.windows}><boxGeometry args={[0.9, 0.25, 0.01]} /></mesh>
      </group>
      <Lattice pos={[1.9, BY, 0.9]} h={2.2} w={0.26} k={k} />
      {tier >= 3 && (
        <>
          <mesh position={[-1.9, BY, 0.9]} material={k.concrete}><cylinderGeometry args={[0.6, 0.6, 0.07, 20]} /></mesh>
          <mesh position={[-1.9, BY + 0.07, 0.9]} material={k.accent}><boxGeometry args={[0.5, 0.02, 0.12]} /></mesh>
          <Dish pos={[1.9, BY + 2.2, 0.9]} r={0.26} k={k} />
        </>
      )}
      {/* اسکله و قایق‌ها */}
      <mesh position={[0, 0.4, 2.2]} material={k.concrete}><boxGeometry args={[3.4, 0.14, 1.1]} /></mesh>
      {boats.map((b, i) => (
        <Bobbing key={i} pos={[-1.2 + i * 1.3, 0, 3.3]} amp={0.05} speed={1.5 + i * 0.3}>
          <primitive object={b} />
        </Bobbing>
      ))}
      <Beacon pos={[1.65, 0.55, 2.7]} color="#33ff66" />
      <Beacon pos={[-1.65, 0.55, 2.7]} color="#ff3030" />
      {tier >= 4 && <Searchlight pos={[-1.1, BY + (4) * 0.32, -0.8]} k={k} />}
      {tier >= 5 && <PhasedRadar pos={[0, BY, -1.8]} w={0.6} h={0.4} k={k} />}
      <Drum pos={[1.7, BY, 0.4]} k={k} />
      <Crate pos={[1.45, BY, 0.5]} k={k} s={0.85} />
    </group>
  );
}

function HQ({ tier, k }: P) {
  const holo = useRef<THREE.Group>(null);
  useFrame((s, d) => {
    if (holo.current) {
      holo.current.rotation.y += d * 0.5;
      holo.current.position.y = BY + (tier >= 3 ? 3.6 : 1.8) + Math.sin(s.clock.elapsedTime * 1.2) * 0.08;
    }
  });
  const floors = tier >= 5 ? 14 : tier >= 4 ? 12 : tier >= 3 ? 10 : tier >= 2 ? 4 : 1;
  return (
    <group>
      <Apron r={3.0} k={k} />
      {tier === 1 ? (
        <>
          <RBox args={[1.6, 0.7, 1.1]} r={0.05} pos={[0, BY + 0.35, -0.5]} m={k.olive} />
          <Lattice pos={[1.2, BY, -1.0]} h={2.6} w={0.3} k={k} />
          <Crate pos={[-1.4, BY, 0.4]} k={k} />
          <Crate pos={[-1.0, BY, 0.5]} rot={0.4} k={k} s={0.8} />
        </>
      ) : (
        <>
          <group position={[-0.5, BY, -0.7]}>
            <RBox args={[1.15, floors * 0.3, 1.15]} r={0.08} pos={[0, floors * 0.15, 0]} m={k.armor} />
            <mesh position={[0, floors * 0.15, 0.58]} material={k.windows}><boxGeometry args={[0.95, floors * 0.28, 0.01]} /></mesh>
            <mesh position={[0.58, floors * 0.15, 0]} material={k.windows}><boxGeometry args={[0.01, floors * 0.28, 0.95]} /></mesh>
            <mesh position={[0, floors * 0.3 + 0.04, 0]} material={k.accent}><cylinderGeometry args={[0.62, 0.68, 0.08, 24]} /></mesh>
            {tier >= 4 && <mesh position={[0, floors * 0.3 + 0.1, 0]} material={k.glow}><torusGeometry args={[0.66, 0.02, 6, 32]} /></mesh>}
          </group>
          {/* هولوگرام نقشه */}
          <group ref={holo} position={[-0.5, BY + 3.6, -0.7]}>
            <mesh material={k.glass}><cylinderGeometry args={[0.55, 0.55, 0.02, 24]} /></mesh>
            <mesh rotation={[PI / 2, 0, 0]} material={k.glow}><torusGeometry args={[0.55, 0.015, 6, 32]} /></mesh>
            {[[0.2, 0.1], [-0.25, -0.15], [0.05, -0.3]].map(([x, z], i) => (
              <mesh key={i} position={[x, 0.15, z]} material={k.hot}><coneGeometry args={[0.05, 0.18, 8]} /></mesh>
            ))}
          </group>
          <Dish pos={[0.7, BY, -1.3]} r={0.4} k={k} />
          {tier >= 3 && <OfficeBlock pos={[1.6, BY, -0.5]} w={0.85} d={0.85} floors={7} k={k} />}
          {tier >= 3 && (
            <group position={[1.5, BY, 1.1]}>
              <mesh material={k.concrete}><cylinderGeometry args={[0.6, 0.6, 0.07, 20]} /></mesh>
              <mesh position={[0, 0.05, 0]} material={k.accent}><boxGeometry args={[0.5, 0.02, 0.12]} /></mesh>
            </group>
          )}
          {tier >= 4 && <PhasedRadar pos={[-1.9, BY, -1.5]} w={0.6} h={0.42} k={k} />}
          {tier >= 5 && (
            <group position={[-0.5, BY + floors * 0.3 + 0.7, -0.7]}>
              <mesh material={k.glass}><icosahedronGeometry args={[0.4, 1]} /></mesh>
              <mesh material={k.hot}><icosahedronGeometry args={[0.18, 0]} /></mesh>
            </group>
          )}
        </>
      )}
      <Palm pos={[2.2, BY, 1.2]} k={k} h={1.2} />
      <Palm pos={[-2.3, BY, 1.0]} k={k} h={1.2} />
      {tier >= 2 && <Cars k={k} tier={tier} />}
    </group>
  );
}

/* =============== ریشه =============== */
const LAND: BuildingKind[] = ["tankfarm", "refinery", "steel", "ammo", "power", "town", "welfare", "research", "hq"];
const SHORE: BuildingKind[] = ["desal", "customs", "coastguard"];

export default function BuildingModel({ kind, tier, colors, gi, scale = 1, terrainBase = true }: { kind: BuildingKind; tier: number; colors: C; gi: number; scale?: number; terrainBase?: boolean }) {
  const k = useKit(colors.base, colors.accent, colors.glow, gi);
  const root = useRef<THREE.Group>(null);
  const p: P = { tier, k, c: colors };
  const isLand = LAND.includes(kind);
  const isShore = SHORE.includes(kind);
  return (
    <group ref={root} scale={scale}>
      {terrainBase && isLand && <Island r={3.3} pos={[0, 0, 0]} seed={kind.length * 2} />}
      {terrainBase && isShore && <Island r={3.0} pos={[0, 0, -0.9]} seed={kind.length * 3} />}
      <group position={isShore ? [0, 0, -0.9] : [0, 0, 0]}>
        {kind === "platform" && <Platform {...p} />}
        {kind === "tankfarm" && <TankFarm {...p} />}
        {kind === "dock" && <Dock {...p} />}
        {kind === "refinery" && <Refinery {...p} />}
        {kind === "steel" && <Steel {...p} />}
        {kind === "ammo" && <AmmoFactory {...p} />}
        {kind === "power" && <PowerPlant {...p} />}
        {kind === "desal" && <Desal {...p} />}
        {kind === "town" && <Town {...p} />}
        {kind === "welfare" && <Welfare {...p} />}
        {kind === "research" && <Research {...p} />}
        {kind === "port" && <Port {...p} />}
        {kind === "customs" && <Customs {...p} />}
        {kind === "coastguard" && <CoastGuard {...p} />}
        {kind === "hq" && <HQ {...p} />}
      </group>
    </group>
  );
}
