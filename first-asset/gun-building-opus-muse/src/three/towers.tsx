import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ModelKind } from "../data/towers";
import { useBattle } from "./battle";
import {
  PT, RBox, Lattice, Beacon, Dish, PhasedRadar, Searchlight, Cable, Crate, Drum, Sandbags, Island, Pad,
  Barrel, Flash, useWeapon, useRefs, useKit, useKenney, Strut, type FlashH, type Kit,
} from "./kit";
import boatUrl from "../assets/models/boat-speed-a.glb?url";

const PI = Math.PI;
type V3 = [number, number, number];
interface C { base: string; accent: string; glow: string }
interface P { tier: number; k: Kit; c: C }

/* ======================================================
   خانواده ۱ — توپخانه سریع
====================================================== */
function Autocannon({ tier, k, c }: P) {
  const B = useBattle();
  const yaw = useRef<THREE.Group>(null), pitch = useRef<THREE.Group>(null);
  const mz = useRefs<THREE.Group>(4), rc = useRefs<THREE.Group>(4), fl = useRefs<FlashH>(4);
  const n = tier >= 3 ? 4 : tier >= 2 ? 2 : 1;
  const L = [1.45, 1.75, 2.05][tier - 1];
  const lay: [number, number][] = n === 1 ? [[0, 0]] : n === 2 ? [[-0.19, 0], [0.19, 0]] : [[-0.2, 0.11], [0.2, 0.11], [-0.2, -0.11], [0.2, -0.11]];
  useWeapon({
    yaw, pitch, muzzles: mz.slice(0, n), recoil: rc.slice(0, n), flashes: fl.slice(0, n),
    rate: [6, 9, 15][tier - 1], canAir: true, recoilAmt: 0.16,
    fire: (a, b, _i, air) => B.fx.shoot({ from: a, to: b, kind: "tracer", color: c.glow, dur: a.distanceTo(b) / 48, dmg: 1, air }),
  });
  return (
    <group>
      {tier === 1 && <Sandbags r={1.5} n={16} k={k} />}
      <Crate pos={[-1.3, PT, 0.6]} rot={0.4} k={k} />
      <Crate pos={[-1.25, PT + 0.3, 0.55]} rot={0.1} k={k} s={0.8} />
      <Drum pos={[1.3, PT, 0.7]} k={k} />
      {tier >= 2 && <Drum pos={[1.15, PT, 1.0]} k={k} color="#1f4f8c" />}
      <mesh position={[0, PT + 0.16, 0]} material={k.armorDark}><cylinderGeometry args={[0.85, 1.0, 0.32, 24]} /></mesh>
      <mesh position={[0, PT + 0.33, 0]} material={k.steel}><torusGeometry args={[0.82, 0.03, 8, 40]} /></mesh>
      <group ref={yaw} position={[0, PT + 0.34, 0]}>
        <RBox args={[tier >= 3 ? 1.45 : 1.25, tier >= 3 ? 0.7 : 0.58, 1.5]} r={0.12} pos={[0, 0.32, -0.15]} m={k.armor} />
        {tier >= 3 && <RBox args={[1.3, 0.35, 0.6]} r={0.08} pos={[0, 0.45, 0.5]} rot={[-0.5, 0, 0]} m={k.armor} />}
        {tier >= 2 && [-1, 1].map((s) => (
          <group key={s}>
            <RBox args={[0.1, 0.5, 1.3]} r={0.03} pos={[s * (tier >= 3 ? 0.8 : 0.7), 0.32, -0.15]} m={k.accent} />
            <mesh position={[s * (tier >= 3 ? 0.86 : 0.76), 0.32, -0.15]} material={k.hazard}><boxGeometry args={[0.01, 0.08, 1.1]} /></mesh>
          </group>
        ))}
        {/* جعبه مهمات + نوار فشنگ */}
        <RBox args={[0.38, 0.42, 0.6]} r={0.05} pos={[tier >= 3 ? -0.98 : -0.85, 0.3, -0.25]} m={k.olive} />
        {tier >= 2 && <Cable pts={[[-0.85, 0.5, -0.1], [-0.6, 0.75, 0.2], [-0.3, 0.6, 0.5]]} r={0.04} m={k.brass} />}
        {tier >= 2 && <Dish pos={[0.45, 0.62, -0.7]} r={0.26} k={k} />}
        {tier >= 3 && (
          <>
            <mesh position={[-0.3, 0.75, -0.45]} material={k.armorDark}><cylinderGeometry args={[0.22, 0.25, 0.2, 16]} /></mesh>
            <mesh position={[-0.3, 0.88, -0.45]} material={k.cockpit}><sphereGeometry args={[0.2, 16, 10, 0, PI * 2, 0, PI / 2]} /></mesh>
            <Searchlight pos={[0.6, 0.67, 0.1]} k={k} />
            <Lattice pos={[0.55, 0.66, -0.75]} h={1.5} w={0.22} k={k} />
            {[-0.25, 0, 0.25].map((z) => [-1, 1].map((s) => (
              <mesh key={`${z}${s}`} position={[s * 0.74, 0.62, z - 0.3]} material={k.glow}><boxGeometry args={[0.02, 0.06, 0.18]} /></mesh>
            )))}
          </>
        )}
        <group ref={pitch} position={[0, 0.42, 0.55]}>
          <RBox args={[n > 1 ? 0.78 : 0.48, n > 2 ? 0.55 : 0.4, 0.42]} r={0.08} m={k.armorDark} />
          {lay.map(([x, y], i) => (
            <group key={i} ref={rc[i]} position={[x, y, 0.1]}>
              <Barrel len={L} r={0.062} k={k} muzzleRef={mz[i]} flashRef={fl[i]} color={c.glow} light={i === 0} jackets={tier} />
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

function Ciws({ k, c }: P) {
  const B = useBattle();
  const yaw = useRef<THREE.Group>(null), pitch = useRef<THREE.Group>(null), spin = useRef<THREE.Group>(null);
  const mz = useRefs<THREE.Group>(1), fl = useRefs<FlashH>(1);
  const st = useWeapon({
    yaw, pitch, muzzles: mz, flashes: fl, rate: 28, canAir: true, preferAir: true, turn: 8,
    fire: (a, b, _i, air) => B.fx.shoot({ from: a, to: b, kind: "tracer", color: c.glow, dur: a.distanceTo(b) / 70, dmg: 0.6, air, jitter: 0.5 }),
  });
  useFrame((_, d) => { if (spin.current) spin.current.rotation.z += d * (st.current.has ? 40 : 3) * B.speed; });
  return (
    <group>
      <mesh position={[0, PT + 0.3, 0]} material={k.white}><cylinderGeometry args={[0.75, 0.95, 0.6, 32]} /></mesh>
      <mesh position={[0, PT + 0.62, 0]} material={k.gun}><cylinderGeometry args={[0.7, 0.72, 0.06, 32]} /></mesh>
      {[0, 1, 2, 3].map((i) => <Crate key={i} pos={[Math.cos(i * 1.6 + 0.4) * 1.45, PT, Math.sin(i * 1.6 + 0.4) * 1.45]} rot={i} k={k} s={0.85} />)}
      <group ref={yaw} position={[0, PT + 0.65, 0]}>
        <RBox args={[1.1, 0.6, 0.9]} r={0.15} pos={[0, 0.35, -0.1]} m={k.white} />
        {[-1, 1].map((s) => <RBox key={s} args={[0.22, 1.0, 0.7]} r={0.08} pos={[s * 0.62, 0.65, 0]} m={k.white} />)}
        <group ref={pitch} position={[0, 0.95, 0]}>
          {/* رادوم مشهور R2-D2 */}
          <mesh position={[0, 0.55, -0.15]} scale={[1, 1.35, 1]} material={k.white}><sphereGeometry args={[0.48, 32, 20]} /></mesh>
          <mesh position={[0, 0.28, -0.15]} rotation={[PI / 2, 0, 0]} material={k.glow}><torusGeometry args={[0.47, 0.035, 8, 40]} /></mesh>
          <mesh position={[0, 0.12, -0.2]} material={k.armorDark}><boxGeometry args={[0.55, 0.3, 0.9]} /></mesh>
          <mesh position={[-0.4, 0.05, -0.1]} rotation={[0, 0, PI / 2]} material={k.gun}><cylinderGeometry args={[0.24, 0.24, 0.32, 20]} /></mesh>
          <group position={[0, -0.05, 0.25]}>
            <group ref={spin}>
              {Array.from({ length: 6 }).map((_, i) => {
                const a = (i / 6) * PI * 2;
                return <mesh key={i} position={[Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.75]} rotation={[PI / 2, 0, 0]} material={k.steel}><cylinderGeometry args={[0.025, 0.025, 1.5, 8]} /></mesh>;
              })}
              {[0.2, 0.9, 1.45].map((z) => <mesh key={z} position={[0, 0, z]} material={k.gun}><cylinderGeometry args={[0.13, 0.13, 0.05, 16]} /></mesh>)}
            </group>
            <mesh position={[0, 0, 0.75]} rotation={[PI / 2, 0, 0]} material={k.armorDark}><cylinderGeometry args={[0.16, 0.16, 0.3, 16]} /></mesh>
            <group ref={mz[0]} position={[0, 0, 1.6]}><Flash ref={fl[0]} color={c.glow} size={1.3} light /></group>
          </group>
        </group>
      </group>
      <Lattice pos={[-1.2, PT, -1.0]} h={2.2} k={k} />
    </group>
  );
}

function Railgun({ k, c }: P) {
  const B = useBattle();
  const yaw = useRef<THREE.Group>(null), pitch = useRef<THREE.Group>(null);
  const mz = useRefs<THREE.Group>(1), fl = useRefs<FlashH>(1), rc = useRefs<THREE.Group>(1);
  const coilMat = useMemo(() => new THREE.MeshBasicMaterial({ color: c.glow, toneMapped: false }), [c.glow]);
  const st = useWeapon({
    yaw, pitch, muzzles: mz, flashes: fl, recoil: rc, rate: 0.7, turn: 2.5, recoilAmt: 0.45,
    fire: (a, b) => { B.fx.rail(a, b, c.glow); B.fx.explode(b, c.glow, 1.5); B.hitSea(14); B.shake += 0.15; },
  });
  useFrame((s) => {
    const ch = 1 - st.current.cool;
    coilMat.color.set(c.glow).multiplyScalar(1 + ch * ch * 9 + Math.sin(s.clock.elapsedTime * 40) * ch);
  });
  return (
    <group>
      <mesh position={[0, PT + 0.2, 0]} material={k.armorDark}><cylinderGeometry args={[1.05, 1.3, 0.4, 32]} /></mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = i * PI / 2 + PI / 4;
        return <RBox key={i} args={[0.5, 0.6, 0.5]} r={0.06} pos={[Math.cos(a) * 1.45, PT + 0.3, Math.sin(a) * 1.45]} m={k.armor} />;
      })}
      <group ref={yaw} position={[0, PT + 0.4, 0]}>
        <RBox args={[1.5, 0.75, 1.7]} r={0.15} pos={[0, 0.4, -0.4]} m={k.armor} />
        {[-0.5, 0.5].map((x) => (
          <group key={x} position={[x, 0.6, -1.35]}>
            <mesh material={k.armorDark}><cylinderGeometry args={[0.26, 0.26, 1.1, 20]} /></mesh>
            {[-0.3, 0, 0.3].map((y) => <mesh key={y} position={[0, y, 0]} material={coilMat}><torusGeometry args={[0.27, 0.025, 6, 24]} /></mesh>)}
          </group>
        ))}
        <Cable pts={[[-0.5, 1.1, -1.3], [-0.3, 1.25, -0.6], [-0.15, 1.0, 0.1]]} r={0.04} m={k.rubber} />
        <Cable pts={[[0.5, 1.1, -1.3], [0.3, 1.25, -0.6], [0.15, 1.0, 0.1]]} r={0.04} m={k.rubber} />
        {[-0.62, 0.62].map((x) => <Strut key={x} a={[x, 0.1, 0.4]} b={[x * 0.6, 0.85, 1.0]} r={0.07} m={k.steel} />)}
        <group ref={pitch} position={[0, 0.95, 0.2]}>
          <group ref={rc[0]}>
            <RBox args={[0.8, 0.55, 1.2]} r={0.1} m={k.armorDark} />
            {[-0.2, 0.2].map((x) => <RBox key={x} args={[0.13, 0.2, 4.4]} r={0.03} pos={[x, 0, 2.6]} m={k.steel} />)}
            <RBox args={[0.6, 0.08, 4.0]} r={0.02} pos={[0, 0.17, 2.5]} m={k.armor} />
            <RBox args={[0.6, 0.08, 4.0]} r={0.02} pos={[0, -0.17, 2.5]} m={k.armor} />
            {[0.9, 1.6, 2.3, 3.0, 3.7, 4.4].map((z) => <mesh key={z} position={[0, 0, z]} material={coilMat}><torusGeometry args={[0.36, 0.06, 10, 28]} /></mesh>)}
            <mesh position={[0, 0, 2.6]} rotation={[PI / 2, 0, 0]} material={coilMat}><cylinderGeometry args={[0.03, 0.03, 4.0, 6]} /></mesh>
            <group ref={mz[0]} position={[0, 0, 4.85]}><Flash ref={fl[0]} color={c.glow} size={2.2} light /></group>
          </group>
        </group>
      </group>
      <Lattice pos={[-1.5, PT, -1.2]} h={2.6} k={k} />
    </group>
  );
}

/* ======================================================
   خانواده ۲ — توپخانه سنگین
====================================================== */
function Howitzer({ tier, k, c }: P) {
  const B = useBattle();
  const yaw = useRef<THREE.Group>(null), pitch = useRef<THREE.Group>(null);
  const n = tier >= 3 ? 2 : 1;
  const mz = useRefs<THREE.Group>(2), rc = useRefs<THREE.Group>(2), fl = useRefs<FlashH>(2);
  useWeapon({
    yaw, pitch, muzzles: mz.slice(0, n), recoil: rc.slice(0, n), flashes: fl.slice(0, n),
    rate: [0.8, 1.0, 1.6][tier - 1], loft: 0.45, turn: 2, recoilAmt: 0.5,
    fire: (a, b) => { B.fx.shoot({ from: a, to: b, kind: "shell", color: "#ffb347", dur: 1.3, arc: 3.2, dmg: 5, size: 0.8 + tier * 0.2 }); B.fx.smoke(a, 0.5, false); B.shake += 0.06; },
  });
  const L = [1.9, 2.4, 2.6][tier - 1];
  return (
    <group>
      <Sandbags r={1.55} n={tier >= 2 ? 10 : 16} k={k} start={PI * 0.6} arc={tier >= 2 ? PI * 0.8 : PI * 2} />
      {tier >= 2 && <RBox args={[0.8, 0.5, 0.6]} r={0.05} pos={[1.2, PT + 0.25, -0.9]} m={k.olive} />}
      {[0, 1, 2].map((i) => <mesh key={i} position={[-1.2 + i * 0.16, PT + 0.08, 1.0]} rotation={[0, 0, PI / 2]} material={k.brass}><cylinderGeometry args={[0.07, 0.07, 0.42, 12]} /></mesh>)}
      <mesh position={[0, PT + 0.18, 0]} material={k.concrete}><cylinderGeometry args={[0.95, 1.1, 0.36, 20]} /></mesh>
      <group ref={yaw} position={[0, PT + 0.36, 0]}>
        {tier === 1 ? (
          <>
            <RBox args={[0.9, 0.4, 1.0]} r={0.06} pos={[0, 0.2, -0.2]} m={k.armor} />
            <RBox args={[1.2, 0.75, 0.08]} r={0.03} pos={[0, 0.6, 0.35]} rot={[-0.15, 0, 0]} m={k.armor} />
          </>
        ) : (
          <>
            <RBox args={[1.5, 0.75, 1.7]} r={0.15} pos={[0, 0.38, -0.25]} m={k.armor} />
            <RBox args={[1.4, 0.4, 0.7]} r={0.1} pos={[0, 0.7, -0.6]} rot={[0.35, 0, 0]} m={k.armor} />
            <mesh position={[0.4, 0.85, -0.65]} material={k.armorDark}><cylinderGeometry args={[0.2, 0.22, 0.18, 16]} /></mesh>
            <Beacon pos={[-0.55, 0.85, -0.9]} color="#ffae00" />
          </>
        )}
        {tier >= 3 && (
          <>
            <Lattice pos={[-0.55, 0.75, -0.95]} h={1.4} w={0.2} k={k} />
            <PhasedRadar pos={[0.5, 0.75, -0.95]} w={0.5} h={0.35} k={k} />
          </>
        )}
        <group ref={pitch} position={[0, 0.55, 0.45]}>
          <RBox args={[n > 1 ? 1.05 : 0.6, 0.5, 0.5]} r={0.1} m={k.armorDark} />
          {Array.from({ length: n }).map((_, i) => (
            <group key={i} ref={rc[i]} position={[n > 1 ? (i ? 0.26 : -0.26) : 0, 0, 0.15]}>
              <Barrel len={L} r={0.12 + tier * 0.012} k={k} muzzleRef={mz[i]} flashRef={fl[i]} color="#ffa040" light={i === 0} flashSize={2} jackets={tier + 1} />
              {tier >= 3 && [0.5, 1.0, 1.5].map((z) => <mesh key={z} position={[0, 0, z]} rotation={[PI / 2, 0, 0]} material={k.glow}><torusGeometry args={[0.165, 0.018, 6, 20]} /></mesh>)}
              {tier >= 2 && <mesh position={[0, 0, L * 0.55]} rotation={[PI / 2, 0, 0]} material={k.gun}><cylinderGeometry args={[0.2, 0.2, 0.3, 18]} /></mesh>}
            </group>
          ))}
        </group>
      </group>
      {c && null}
    </group>
  );
}

function Wheel({ pos, k }: { pos: V3; k: Kit }) {
  return (
    <group position={pos} rotation={[0, 0, PI / 2]}>
      <mesh material={k.rubber}><cylinderGeometry args={[0.3, 0.3, 0.24, 20]} /></mesh>
      <mesh material={k.rubber}><torusGeometry args={[0.26, 0.06, 8, 20]} /></mesh>
      <mesh position={[0, 0.125, 0]} material={k.olive}><cylinderGeometry args={[0.16, 0.16, 0.02, 12]} /></mesh>
    </group>
  );
}

function Mlrs({ k, c }: P) {
  const B = useBattle();
  const yaw = useRef<THREE.Group>(null), pitch = useRef<THREE.Group>(null);
  const mz = useRefs<THREE.Group>(12), fl = useRefs<FlashH>(12);
  useWeapon({
    yaw, pitch, muzzles: mz, flashes: fl, rate: 9, loft: 0.55, turn: 2, burst: { count: 12, pause: 3.2 },
    fire: (a, b) => { B.fx.shoot({ from: a, to: b, kind: "rocket", color: c.glow, dur: 1.3, arc: 2.6, dmg: 2, jitter: 2.4 }); B.fx.smoke(a, 0.35, false); },
  });
  return (
    <group>
      <group position={[0, PT, 0]}>
        <RBox args={[1.5, 0.35, 3.3]} r={0.06} pos={[0, 0.55, 0]} m={k.armor} />
        <RBox args={[1.45, 0.85, 0.95]} r={0.15} pos={[0, 0.95, -1.75]} m={k.armor} />
        <mesh position={[0, 1.05, -2.23]} material={k.cockpit}><boxGeometry args={[1.25, 0.38, 0.02]} /></mesh>
        {[-0.73, 0.73].map((x) => <mesh key={x} position={[x, 1.05, -1.75]} material={k.cockpit}><boxGeometry args={[0.02, 0.35, 0.6]} /></mesh>)}
        <Beacon pos={[0.5, 1.42, -1.75]} color="#ffae00" />
        <Beacon pos={[-0.5, 1.42, -1.75]} color="#ffae00" rate={1.7} />
        {[-0.8, 0.8].map((x) => [-1.6, -0.5, 0.5, 1.3].map((z) => <Wheel key={`${x}${z}`} pos={[x, 0.3, z]} k={k} />))}
        {[[-0.95, 1.5], [0.95, 1.5], [-0.95, -0.9], [0.95, -0.9]].map(([x, z], i) => (
          <group key={i}><mesh position={[x * 1.05, 0.25, z]} material={k.steel}><cylinderGeometry args={[0.05, 0.05, 0.5, 8]} /></mesh>
            <mesh position={[x * 1.05, 0.02, z]} material={k.gun}><cylinderGeometry args={[0.14, 0.14, 0.04, 12]} /></mesh></group>
        ))}
      </group>
      <group ref={yaw} position={[0, PT + 0.75, 0.4]}>
        <mesh material={k.gun}><cylinderGeometry args={[0.45, 0.5, 0.15, 20]} /></mesh>
        <group ref={pitch} position={[0, 0.35, -0.3]}>
          <RBox args={[1.5, 1.08, 2.3]} r={0.08} pos={[0, 0.35, 0.6]} m={k.armor} />
          <mesh position={[0, 0.35, 1.76]} material={k.rubber}><boxGeometry args={[1.38, 0.96, 0.02]} /></mesh>
          {Array.from({ length: 12 }).map((_, i) => {
            const x = -0.5 + (i % 4) * 0.333, y = 0.02 + Math.floor(i / 4) * 0.33;
            return (
              <group key={i} position={[x, y, 1.78]}>
                <mesh rotation={[PI / 2, 0, 0]} material={k.gun}><cylinderGeometry args={[0.14, 0.14, 0.04, 6]} /></mesh>
                <mesh rotation={[PI / 2, 0, 0]} position={[0, 0, -0.03]} material={k.glow}><cylinderGeometry args={[0.07, 0.07, 0.02, 10]} /></mesh>
                <group ref={mz[i]} position={[0, 0, 0.05]}><Flash ref={fl[i]} color={c.glow} size={1.2} light={i === 5} /></group>
              </group>
            );
          })}
          <mesh position={[0.82, 0.35, 0.6]} material={k.hazard}><boxGeometry args={[0.01, 0.12, 2]} /></mesh>
        </group>
      </group>
      <Dish pos={[-0.5, PT + 1.4, -1.6]} r={0.22} k={k} />
    </group>
  );
}

function Thermobaric({ k, c }: P) {
  const B = useBattle();
  const yaw = useRef<THREE.Group>(null), pitch = useRef<THREE.Group>(null);
  const mz = useRefs<THREE.Group>(1), fl = useRefs<FlashH>(1), rc = useRefs<THREE.Group>(1);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: c.glow, toneMapped: false }), [c.glow]);
  const st = useWeapon({
    yaw, pitch, muzzles: mz, flashes: fl, recoil: rc, rate: 0.5, loft: 0.3, turn: 2, recoilAmt: 0.5,
    fire: (a, b) => { B.fx.shoot({ from: a, to: b, kind: "plasma", color: c.glow, dur: 1.2, arc: 2, dmg: 10, size: 1.2 }); B.stun = 2; B.shake += 0.12; },
  });
  useFrame((s) => { ringMat.color.set(c.glow).multiplyScalar(2 + (1 - st.current.cool) * 6 + Math.sin(s.clock.elapsedTime * 8)); });
  return (
    <group>
      <mesh position={[0, PT + 0.2, 0]} material={k.armorDark}><cylinderGeometry args={[1.05, 1.25, 0.4, 32]} /></mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 1.35, PT, -0.6]}>
          <mesh position={[0, 0.65, 0]} material={k.steel}><cylinderGeometry args={[0.28, 0.28, 1.2, 20]} /></mesh>
          <mesh position={[0, 1.25, 0]} material={k.steel}><sphereGeometry args={[0.28, 20, 10, 0, PI * 2, 0, PI / 2]} /></mesh>
          <mesh position={[0, 0.65, 0.285]} material={k.hazard}><boxGeometry args={[0.3, 0.1, 0.01]} /></mesh>
          <mesh position={[0, 1.45, 0]} material={k.brass}><cylinderGeometry args={[0.05, 0.05, 0.2, 8]} /></mesh>
          <Cable pts={[[0, 1.2, 0], [-s * 0.5, 1.6, 0.3], [-s * 1.1, 1.1, 0.5]]} r={0.03} m={k.brass} />
        </group>
      ))}
      <group ref={yaw} position={[0, PT + 0.4, 0]}>
        <group ref={pitch} position={[0, 0.85, -0.2]}>
          <group ref={rc[0]}>
            <mesh material={k.armor}><sphereGeometry args={[0.82, 32, 20]} /></mesh>
            <mesh rotation={[PI / 2, 0, 0]} material={ringMat}><torusGeometry args={[0.83, 0.04, 8, 48]} /></mesh>
            <mesh rotation={[0, 0, PI / 2]} material={k.gun}><torusGeometry args={[0.83, 0.05, 8, 48]} /></mesh>
            <mesh position={[0, 0, 1.25]} rotation={[PI / 2, 0, 0]} material={k.gun}><cylinderGeometry args={[0.34, 0.42, 1.7, 24]} /></mesh>
            {[0.65, 1.15, 1.65].map((z) => <mesh key={z} position={[0, 0, z]} material={ringMat}><torusGeometry args={[0.42, 0.06, 10, 28]} /></mesh>)}
            <mesh position={[0, 0, 2.15]} rotation={[PI / 2, 0, 0]} material={k.armorDark}><cylinderGeometry args={[0.45, 0.38, 0.25, 24]} /></mesh>
            <group ref={mz[0]} position={[0, 0, 2.35]}><Flash ref={fl[0]} color={c.glow} size={2.5} light /></group>
          </group>
        </group>
      </group>
    </group>
  );
}

/* ======================================================
   خانواده ۳ — سیلو موشک
====================================================== */
function SiloCell({ idx, st, n, k, c, mzRef, white }: { idx: number; st: React.RefObject<{ cool: number; i: number }>; n: number; k: Kit; c: C; mzRef: React.RefObject<THREE.Group | null>; white: boolean }) {
  const l = useRef<THREE.Group>(null), r = useRef<THREE.Group>(null), m = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = st.current;
    const next = s.i % n === idx, prev = (s.i - 1 + n) % n === idx;
    const open = (next && s.cool < 0.22) || (prev && s.cool > 0.8);
    const tgt = open ? 1.9 : 0;
    if (l.current && r.current) { l.current.rotation.z += (tgt - l.current.rotation.z) * 0.15; r.current.rotation.z = -l.current.rotation.z; }
    if (m.current) m.current.visible = !(prev && s.cool > 0.35);
  });
  return (
    <group>
      <mesh position={[0, 0.12, 0]} material={k.armorDark}><cylinderGeometry args={[0.55, 0.62, 0.24, 24]} /></mesh>
      <mesh position={[0, 0.245, 0]} rotation={[-PI / 2, 0, 0]} material={k.rubber}><circleGeometry args={[0.45, 24]} /></mesh>
      <mesh position={[0, 0.25, 0]} rotation={[-PI / 2, 0, 0]} material={k.glow}><ringGeometry args={[0.46, 0.5, 32]} /></mesh>
      <group ref={m} position={[0, -0.6, 0]}>
        <mesh position={[0, 0.9, 0]} material={white ? k.white : k.armor}><cylinderGeometry args={[0.2, 0.2, 1.3, 16]} /></mesh>
        <mesh position={[0, 1.75, 0]} material={k.accent}><coneGeometry args={[0.2, 0.45, 16]} /></mesh>
        <group ref={mzRef} position={[0, 1.6, 0]} />
      </group>
      <group ref={l} position={[-0.47, 0.26, 0]}><RBox args={[0.47, 0.06, 0.9]} r={0.02} pos={[0.235, 0, 0]} m={k.armor} /></group>
      <group ref={r} position={[0.47, 0.26, 0]}><RBox args={[0.47, 0.06, 0.9]} r={0.02} pos={[-0.235, 0, 0]} m={k.armor} /></group>
      {c && null}
    </group>
  );
}

function Silo({ tier, k, c }: P) {
  const B = useBattle();
  const n = tier >= 3 ? 3 : 1;
  const mz = useRefs<THREE.Group>(3);
  const st = useWeapon({
    muzzles: mz.slice(0, n), rate: [0.35, 0.45, 0.9][tier - 1],
    fire: (a, b) => { B.fx.shoot({ from: a.clone().setY(a.y + 0.6), to: b, kind: "missile", color: c.glow, dur: 2.0, arc: 7, dmg: 12 }); for (let i = 0; i < 6; i++) B.fx.smoke(a, 0.45, false); B.shake += 0.08; },
  });
  const xs = n === 3 ? [-1.05, 0, 1.05] : [0];
  return (
    <group>
      <mesh position={[0, PT + 0.05, 0.2]} material={k.concrete}><boxGeometry args={[n === 3 ? 3.4 : 1.6, 0.1, 1.6]} /></mesh>
      {xs.map((x, i) => (
        <group key={i} position={[x, PT, 0.3]}>
          <SiloCell idx={i} st={st} n={n} k={k} c={c} mzRef={mz[i]} white={tier >= 2} />
        </group>
      ))}
      {/* دیوار انفجار */}
      <RBox args={[n === 3 ? 3.6 : 1.9, 0.5, 0.18]} r={0.04} pos={[0, PT + 0.25, 1.25]} m={k.concrete} />
      <Beacon pos={[n === 3 ? 1.75 : 0.9, PT + 0.55, 1.25]} color="#ff2a2a" />
      <Beacon pos={[n === 3 ? -1.75 : -0.9, PT + 0.55, 1.25]} color="#ff2a2a" rate={1.9} />
      {tier >= 2 && (
        <>
          <RBox args={[0.9, 0.7, 0.8]} r={0.08} pos={[-1.15, PT + 0.35, -1.15]} m={k.armor} />
          <mesh position={[-1.15, PT + 0.45, -0.74]} material={k.windows}><boxGeometry args={[0.7, 0.3, 0.01]} /></mesh>
          <Dish pos={[1.2, PT, -1.1]} r={0.35} k={k} />
        </>
      )}
      {tier >= 3 && (
        <>
          <mesh position={[0, PT + 1.2, -1.3]} material={k.gun}><cylinderGeometry args={[0.1, 0.16, 2.4, 10]} /></mesh>
          <mesh position={[0, PT + 2.6, -1.3]} material={k.white}><sphereGeometry args={[0.5, 24, 16]} /></mesh>
          <Lattice pos={[1.6, PT, 1.2]} h={2.2} w={0.26} k={k} />
          <Searchlight pos={[-1.6, PT + 0.55, 1.25]} k={k} />
        </>
      )}
    </group>
  );
}

function Hypersonic({ k, c }: P) {
  const B = useBattle();
  const mz = useRefs<THREE.Group>(1);
  const erector = useRef<THREE.Group>(null), missile = useRef<THREE.Group>(null);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: c.glow, toneMapped: false }), [c.glow]);
  const st = useWeapon({
    muzzles: mz, rate: 0.28,
    fire: (a, b) => { B.fx.shoot({ from: a, to: b, kind: "hyper", color: c.glow, dur: 0.9, arc: 9, dmg: 40, size: 1.4 }); for (let i = 0; i < 12; i++) B.fx.smoke(a.clone().setY(PT + 0.3), 0.7, false); B.shake += 0.25; },
  });
  useFrame((s) => {
    const cl = st.current.cool;
    let ang = 0;
    if (cl > 0.72) ang = ((1 - cl) / 0.28) * 1.45;
    else if (cl > 0.32) ang = 1.45;
    else ang = Math.max(0, (cl - 0.05) / 0.27) * 1.45;
    if (erector.current) erector.current.rotation.x += (ang - erector.current.rotation.x) * 0.2;
    if (missile.current) missile.current.visible = cl < 0.72;
    ringMat.color.set(c.glow).multiplyScalar(2 + (cl < 0.32 ? (0.32 - cl) * 25 : 0) + Math.sin(s.clock.elapsedTime * 5) * 0.8);
  });
  return (
    <group>
      <mesh position={[0, PT + 0.15, -0.2]} material={k.armorDark}><cylinderGeometry args={[1.0, 1.1, 0.3, 32]} /></mesh>
      <mesh position={[0, PT + 0.305, -0.2]} rotation={[-PI / 2, 0, 0]} material={k.rubber}><circleGeometry args={[0.75, 32]} /></mesh>
      {[0.8, 0.95].map((r, i) => <mesh key={r} position={[0, PT + 0.32 + i * 0.01, -0.2]} rotation={[-PI / 2, 0, 0]} material={ringMat}><ringGeometry args={[r, r + 0.05, 48]} /></mesh>)}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * PI * 2;
        return <RBox key={i} args={[0.25, 0.5, 0.25]} r={0.04} pos={[Math.cos(a) * 1.2, PT + 0.25, Math.sin(a) * 1.2 - 0.2]} m={k.armor} />;
      })}
      {/* بازوی برافراشتن */}
      <group ref={erector} position={[0, PT + 0.3, -0.2]}>
        <RBox args={[0.12, 4.0, 0.12]} r={0.03} pos={[-0.32, 2.0, -0.28]} m={k.steel} />
        <RBox args={[0.12, 4.0, 0.12]} r={0.03} pos={[0.32, 2.0, -0.28]} m={k.steel} />
        {[0.8, 2.0, 3.2].map((y) => <RBox key={y} args={[0.7, 0.08, 0.08]} r={0.02} pos={[0, y, -0.28]} m={k.steel} />)}
        <group ref={missile}>
          <mesh position={[0, 2.0, 0]} material={k.armorDark}><cylinderGeometry args={[0.22, 0.26, 3.3, 24]} /></mesh>
          <mesh position={[0, 4.05, 0]} material={k.gun}><coneGeometry args={[0.22, 0.85, 24]} /></mesh>
          <mesh position={[0, 3.2, 0]} material={ringMat}><torusGeometry args={[0.235, 0.02, 6, 24]} /></mesh>
          <mesh position={[0, 1.3, 0]} material={ringMat}><torusGeometry args={[0.26, 0.02, 6, 24]} /></mesh>
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * PI * 2;
            return <mesh key={i} position={[Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3]} rotation={[0, -a, 0]} material={k.gun}><boxGeometry args={[0.2, 0.6, 0.03]} /></mesh>;
          })}
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * PI * 2 + PI / 4;
            return <mesh key={i} position={[Math.cos(a) * 0.24, 2.8, Math.sin(a) * 0.24]} rotation={[0, -a, 0]} material={ringMat}><boxGeometry args={[0.1, 0.3, 0.02]} /></mesh>;
          })}
          <group ref={mz[0]} position={[0, 2.0, 0]} />
        </group>
      </group>
      <RBox args={[0.9, 1.6, 0.9]} r={0.1} pos={[-1.7, PT + 0.8, -1.2]} m={k.armorDark} />
      <mesh position={[-1.7, PT + 1.15, -0.74]} material={k.glass}><boxGeometry args={[0.7, 0.55, 0.02]} /></mesh>
      <Lattice pos={[1.7, PT, -1.2]} h={2.8} k={k} />
      <Searchlight pos={[1.6, PT, 1.1]} k={k} />
    </group>
  );
}

function Swarm({ k, c }: P) {
  const B = useBattle();
  const yaw = useRef<THREE.Group>(null), pitch = useRef<THREE.Group>(null);
  const mz = useRefs<THREE.Group>(8), fl = useRefs<FlashH>(8);
  useWeapon({
    yaw, pitch, muzzles: mz, flashes: fl, rate: 6, canAir: true, loft: 0.6, turn: 3, burst: { count: 8, pause: 2.6 },
    fire: (a, b, i, air) => { B.fx.shoot({ from: a, to: b, kind: "missile", color: c.glow, dur: 1.5 + (i % 3) * 0.2, arc: 3 + (i % 4), dmg: 4, air: air && i % 2 === 0, jitter: 1.2, size: 0.8 }); B.fx.smoke(a, 0.3, false); },
  });
  return (
    <group>
      <mesh position={[0, PT + 0.2, 0]} material={k.armorDark}><cylinderGeometry args={[1.0, 1.2, 0.4, 32]} /></mesh>
      <group ref={yaw} position={[0, PT + 0.4, 0]}>
        <RBox args={[1.3, 0.4, 1.3]} r={0.1} pos={[0, 0.2, 0]} m={k.armor} />
        {[-1, 1].map((s) => <RBox key={s} args={[0.18, 0.9, 0.8]} r={0.05} pos={[s * 0.75, 0.75, 0]} m={k.armor} />)}
        <group ref={pitch} position={[0, 0.85, 0]}>
          <RBox args={[1.2, 0.85, 1.9]} r={0.1} pos={[0, 0, 0.2]} m={k.armorDark} />
          {Array.from({ length: 8 }).map((_, i) => {
            const x = -0.42 + (i % 4) * 0.28, y = i < 4 ? 0.18 : -0.18;
            return (
              <group key={i} position={[x, y, 1.16]}>
                <mesh rotation={[PI / 2, 0, 0]} material={k.rubber}><cylinderGeometry args={[0.11, 0.11, 0.02, 12]} /></mesh>
                <mesh rotation={[PI / 2, 0, 0]} position={[0, 0, -0.02]} material={k.glow}><cylinderGeometry args={[0.05, 0.05, 0.01, 10]} /></mesh>
                <group ref={mz[i]} position={[0, 0, 0.05]}><Flash ref={fl[i]} color={c.glow} light={i === 0} /></group>
              </group>
            );
          })}
          {[-1, 1].map((s) => <mesh key={s} position={[s * 0.61, 0, 0.2]} material={k.hazard}><boxGeometry args={[0.01, 0.12, 1.6]} /></mesh>)}
        </group>
      </group>
      <Lattice pos={[0, PT, -1.5]} h={3.2} w={0.3} k={k} />
      <PhasedRadar pos={[0, PT + 3.25, -1.5]} w={0.6} h={0.4} k={k} spin={1.6} />
    </group>
  );
}

/* ======================================================
   خانواده ۴ — پدافند و لیزر
====================================================== */
function AADefense({ tier, k, c }: P) {
  const B = useBattle();
  const yaw = useRef<THREE.Group>(null), pitch = useRef<THREE.Group>(null);
  const n = tier >= 3 ? 4 : tier >= 2 ? 2 : 1;
  const mz = useRefs<THREE.Group>(4), rc = useRefs<THREE.Group>(4), fl = useRefs<FlashH>(4);
  const lay: [number, number][] = n === 1 ? [[0.25, 0]] : n === 2 ? [[-0.42, 0], [0.42, 0]] : [[-0.42, 0.1], [0.42, 0.1], [-0.42, -0.12], [0.42, -0.12]];
  useWeapon({
    yaw, pitch, muzzles: mz.slice(0, n), recoil: rc.slice(0, n), flashes: fl.slice(0, n),
    rate: [5, 8, 13][tier - 1], canAir: true, preferAir: true, turn: 6, maxUp: 1.4, recoilAmt: 0.14,
    fire: (a, b, _i, air) => B.fx.shoot({ from: a, to: b, kind: "tracer", color: c.glow, dur: a.distanceTo(b) / 50, dmg: 1.2, air }),
  });
  return (
    <group>
      <mesh position={[0, PT + 0.2, 0]} material={k.armorDark}><cylinderGeometry args={[0.85, 1.0, 0.4, 32]} /></mesh>
      {tier >= 2 && <Dish pos={[-1.2, PT, -0.9]} r={0.4} k={k} />}
      {tier >= 3 && <Lattice pos={[1.3, PT, -1.0]} h={2.4} w={0.3} k={k} />}
      {tier >= 3 && <PhasedRadar pos={[1.3, PT + 2.45, -1.0]} w={0.55} h={0.38} k={k} />}
      <Crate pos={[1.3, PT, 0.8]} rot={0.6} k={k} />
      <group ref={yaw} position={[0, PT + 0.4, 0]}>
        <RBox args={[1.0, 0.5, 1.0]} r={0.12} pos={[0, 0.25, 0]} m={k.armor} />
        {n > 1 && [-1, 1].map((s) => <RBox key={s} args={[0.16, 0.8, 0.6]} r={0.05} pos={[s * 0.58, 0.6, 0]} m={k.armor} />)}
        <group ref={pitch} position={[0, 0.75, 0]}>
          <mesh rotation={[0, 0, PI / 2]} material={k.gun}><cylinderGeometry args={[0.2, 0.2, n > 1 ? 1.0 : 0.5, 16]} /></mesh>
          {/* عدسی لیزر */}
          <group position={[n > 1 ? 0 : -0.35, 0.28, 0.1]}>
            <mesh rotation={[PI / 2, 0, 0]} material={k.armorDark}><cylinderGeometry args={[0.13, 0.15, 0.4, 16]} /></mesh>
            <mesh position={[0, 0, 0.21]} material={k.glass}>{tier >= 3 ? <octahedronGeometry args={[0.13]} /> : <sphereGeometry args={[0.1, 16, 12]} />}</mesh>
          </group>
          {lay.map(([x, y], i) => (
            <group key={i} ref={rc[i]} position={[x, y, 0.05]}>
              <Barrel len={1.5} r={0.045} k={k} muzzleRef={mz[i]} flashRef={fl[i]} color={c.glow} light={i === 0} brake={false} jackets={3} />
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

function Bavar({ k, c }: P) {
  const B = useBattle();
  const mz = useRefs<THREE.Group>(4), fl = useRefs<FlashH>(4);
  useWeapon({
    muzzles: mz, flashes: fl, rate: 1.0, canAir: true, canSea: false,
    fire: (a, b) => { B.fx.shoot({ from: a, to: b, kind: "missile", color: c.glow, dur: 1.5, arc: 6, dmg: 8, air: true }); for (let i = 0; i < 5; i++) B.fx.smoke(a, 0.4, false); },
  });
  return (
    <group>
      <group position={[0, PT, 0.3]}>
        <RBox args={[2.2, 0.3, 1.4]} r={0.05} pos={[0, 0.15, 0]} m={k.armor} />
        {[-0.75, -0.25, 0.25, 0.75].map((x, i) => (
          <group key={i} position={[x, 0.3, 0]}>
            <RBox args={[0.42, 2.4, 0.42]} r={0.08} pos={[0, 1.2, 0]} m={k.armor} />
            <mesh position={[0, 2.41, 0]} material={k.armorDark}><boxGeometry args={[0.38, 0.03, 0.38]} /></mesh>
            <mesh position={[0, 1.2, 0.215]} material={k.glow}><boxGeometry args={[0.05, 2.0, 0.01]} /></mesh>
            <mesh position={[0, 0.4, 0.215]} material={k.hazard}><boxGeometry args={[0.36, 0.08, 0.01]} /></mesh>
            <group ref={mz[i]} position={[0, 2.5, 0]}><Flash ref={fl[i]} color={c.glow} size={1.4} light={i === 0} /></group>
          </group>
        ))}
        {[-1, 1].map((s) => <Strut key={s} a={[s * 1.0, 0.3, -0.5]} b={[s * 0.9, 1.8, 0]} r={0.06} m={k.steel} />)}
      </group>
      <PhasedRadar pos={[0, PT, -1.4]} w={1.8} h={1.2} k={k} spin={0.5} />
      <RBox args={[0.8, 0.7, 1.4]} r={0.12} pos={[-1.8, PT + 0.35, -0.4]} m={k.armor} />
      <mesh position={[-1.8, PT + 0.45, 0.31]} material={k.windows}><boxGeometry args={[0.6, 0.25, 0.01]} /></mesh>
      <mesh position={[1.85, PT + 0.5, -0.5]} rotation={[0, 0, -0.5]} material={new THREE.MeshPhysicalMaterial({ color: "#14306b", metalness: 0.9, roughness: 0.15, clearcoat: 1 })}><boxGeometry args={[0.8, 0.04, 1.1]} /></mesh>
      <Lattice pos={[1.7, PT, 1.2]} h={2.0} w={0.24} k={k} />
    </group>
  );
}

function Laser({ k, c }: P) {
  const B = useBattle();
  const crystal = useRef<THREE.Group>(null), beam = useRef<THREE.Mesh>(null), outer = useRef<THREE.Mesh>(null), root = useRef<THREE.Group>(null);
  const lock = useRef(0), sparkT = useRef(0);
  const mats = useMemo(() => ({
    beam: new THREE.MeshBasicMaterial({ color: new THREE.Color(c.glow).multiplyScalar(8), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    outer: new THREE.MeshBasicMaterial({ color: new THREE.Color(c.glow).multiplyScalar(2), toneMapped: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    core: new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff").multiplyScalar(6), toneMapped: false }),
  }), [c.glow]);
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).rotateX(PI / 2).translate(0, 0, 0.5), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((s, dr) => {
    const d = Math.min(dr, 0.05) * B.speed;
    if (crystal.current) { crystal.current.rotation.y += d * 1.5; crystal.current.position.y = PT + 2.5 + Math.sin(s.clock.elapsedTime * 2) * 0.1; }
    const has = B.firing && (B.seaValid || B.airValid);
    const tgt = B.seaValid ? B.sea : B.air;
    const air = !B.seaValid;
    if (!beam.current || !outer.current || !crystal.current) return;
    beam.current.visible = outer.current.visible = has;
    if (!has) { lock.current = 0; return; }
    lock.current = Math.min(4, lock.current + d);
    const mult = 1 + lock.current;
    crystal.current.getWorldPosition(tmp);
    beam.current.position.copy(tmp);
    outer.current.position.copy(tmp);
    beam.current.lookAt(tgt);
    outer.current.lookAt(tgt);
    const len = tmp.distanceTo(tgt);
    const w = 0.035 * mult * (0.9 + Math.random() * 0.2);
    beam.current.scale.set(w, w, len);
    outer.current.scale.set(w * 3, w * 3, len);
    sparkT.current -= d;
    if (sparkT.current <= 0) {
      sparkT.current = 0.07;
      B.fx.spark(tgt, c.glow, 3);
      if (Math.random() < 0.3) B.fx.smoke(tgt, 0.3, true);
      if (air) B.hitAir(0.25 * mult); else B.hitSea(0.25 * mult);
    }
  });
  return (
    <group ref={root}>
      <mesh position={[0, PT + 0.2, 0]} material={k.armorDark}><cylinderGeometry args={[1.15, 1.35, 0.4, 32]} /></mesh>
      <mesh position={[0, PT + 0.42, 0]} rotation={[-PI / 2, 0, 0]} material={k.glow}><ringGeometry args={[0.95, 1.02, 48]} /></mesh>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * PI * 2;
        return (
          <group key={i} rotation={[0, -a, 0]}>
            <group position={[0.95, PT + 0.4, 0]} rotation={[0, 0, 0.45]}>
              <RBox args={[0.3, 1.9, 0.34]} r={0.08} pos={[0, 0.95, 0]} m={k.armor} />
              <mesh position={[0, 0.95, 0.175]} material={k.glow}><boxGeometry args={[0.06, 1.5, 0.01]} /></mesh>
              <mesh position={[0, 1.95, 0]} material={mats.core}><sphereGeometry args={[0.1, 12, 10]} /></mesh>
            </group>
          </group>
        );
      })}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * PI * 2 + 0.4;
        return (
          <group key={i} position={[Math.cos(a) * 1.5, PT, Math.sin(a) * 1.5]}>
            <mesh position={[0, 0.4, 0]} material={k.steel}><cylinderGeometry args={[0.14, 0.14, 0.8, 16]} /></mesh>
            <mesh position={[0, 0.82, 0]} material={k.glow}><cylinderGeometry args={[0.1, 0.1, 0.04, 12]} /></mesh>
          </group>
        );
      })}
      <mesh position={[0, PT + 1.4, 0]} material={mats.outer}><cylinderGeometry args={[0.1, 0.3, 2, 16, 1, true]} /></mesh>
      <group ref={crystal} position={[0, PT + 2.5, 0]}>
        <mesh scale={[1, 1.5, 1]} material={k.glass}><octahedronGeometry args={[0.55]} /></mesh>
        <mesh scale={[1, 1.5, 1]} material={mats.core}><octahedronGeometry args={[0.2]} /></mesh>
        <mesh rotation={[PI / 2, 0, 0]} material={k.glow}><torusGeometry args={[0.8, 0.02, 6, 40]} /></mesh>
      </group>
      <mesh ref={beam} geometry={geo} material={mats.beam} visible={false} />
      <mesh ref={outer} geometry={geo} material={mats.outer} visible={false} />
    </group>
  );
}

/* ======================================================
   خانواده ۵ — جنگ الکترونیک
====================================================== */
function PingRing({ color, period = 2.2, max = 6, y = 0.05 }: { color: string; period?: number; max?: number; y?: number }) {
  const B = useBattle();
  const ref = useRef<THREE.Mesh>(null), t = useRef(0);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), toneMapped: false, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }), [color]);
  useFrame((_, d) => {
    t.current = (t.current + d * B.speed / period) % 1;
    if (ref.current) { ref.current.scale.setScalar(0.5 + t.current * max); mat.opacity = 1 - t.current; }
  });
  return <mesh ref={ref} position={[0, y, 0]} rotation={[-PI / 2, 0, 0]} material={mat}><ringGeometry args={[0.92, 1, 64]} /></mesh>;
}

function EW({ tier, k, c }: P) {
  return (
    <group>
      <PingRing color={c.glow} max={4 + tier * 1.5} />
      <Lattice pos={[0, PT, 0]} h={2.6 + tier * 0.4} w={0.42} k={k} />
      <Dish pos={[0.35, PT + 1.4, 0.2]} r={0.4} k={k} spin={0.8} />
      <Dish pos={[-0.3, PT + 2.0, -0.2]} r={0.32} k={k} spin={-1.1} />
      {tier >= 2 && <Dish pos={[0.1, PT + 2.6, 0.25]} r={0.28} k={k} spin={1.6} />}
      <mesh position={[-1.3, PT, 0.9]} material={k.white}><sphereGeometry args={[0.5, 24, 12, 0, PI * 2, 0, PI / 2]} /></mesh>
      <Beacon pos={[-1.3, PT + 0.55, 0.9]} color={c.glow} />
      {tier >= 2 && (
        <>
          <RBox args={[0.9, 0.7, 0.8]} r={0.08} pos={[1.3, PT + 0.35, 0.8]} m={k.armor} />
          <mesh position={[1.3, PT + 0.45, 1.21]} material={k.windows}><boxGeometry args={[0.7, 0.25, 0.01]} /></mesh>
          <Cable pts={[[1.0, PT + 0.6, 0.6], [0.5, PT + 0.9, 0.3], [0.15, PT + 1.3, 0.1]]} r={0.025} m={k.rubber} />
        </>
      )}
      {tier >= 3 && (
        <>
          <Lattice pos={[-1.0, PT, -1.0]} h={2.6} w={0.3} k={k} />
          <mesh position={[-1.0, PT + 2.9, -1.0]} material={k.white}><sphereGeometry args={[0.38, 20, 14]} /></mesh>
          <mesh position={[0, PT + 3.9, 0]} rotation={[PI / 2, 0, 0]} material={k.glow}><torusGeometry args={[0.6, 0.03, 8, 32]} /></mesh>
          {[0, 1, 2, 3, 4, 5].map((i) => <mesh key={i} position={[Math.cos(i) * 0.25, PT + 3.4 + i * 0.08, Math.sin(i) * 0.25]} material={k.steel}><boxGeometry args={[0.5, 0.015, 0.015]} /></mesh>)}
        </>
      )}
    </group>
  );
}

function Emp({ k, c }: P) {
  const B = useBattle();
  const orb = useRef<THREE.Group>(null), shell = useRef<THREE.Mesh>(null);
  const t = useRef(0), arcT = useRef(0);
  const { lines, shellMat } = useMemo(() => {
    const lm = new THREE.LineBasicMaterial({ color: new THREE.Color(c.glow).lerp(new THREE.Color("#ffffff"), 0.4).multiplyScalar(8), toneMapped: false });
    const lines = Array.from({ length: 6 }, () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
      return new THREE.Line(g, lm);
    });
    const shellMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c.glow).multiplyScalar(2), toneMapped: false, transparent: true, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false });
    return { lines, shellMat };
  }, [c.glow]);
  const rods: V3[] = useMemo(() => [0, 1, 2, 3].map((i) => { const a = (i / 4) * PI * 2 + PI / 4; return [Math.cos(a) * 1.9, PT + 1.05, Math.sin(a) * 1.9] as V3; }), []);
  useFrame((s, dr) => {
    const d = Math.min(dr, 0.05) * B.speed;
    if (orb.current) orb.current.position.y = PT + 4.3 + Math.sin(s.clock.elapsedTime * 2) * 0.08;
    arcT.current -= d;
    if (arcT.current <= 0) {
      arcT.current = 0.05;
      const top = new THREE.Vector3(0, PT + 4.3, 0);
      lines.forEach((ln, li) => {
        const end = li < 4 ? new THREE.Vector3(...rods[li]) : new THREE.Vector3((Math.random() - 0.5) * 2.4, PT + 3.7, (Math.random() - 0.5) * 2.4);
        const pos = ln.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < 14; i++) {
          const f = i / 13;
          const p = top.clone().lerp(end, f);
          const j = Math.sin(f * PI) * 0.35;
          p.x += (Math.random() - 0.5) * j; p.y += (Math.random() - 0.5) * j; p.z += (Math.random() - 0.5) * j;
          pos.setXYZ(i, p.x, p.y, p.z);
        }
        pos.needsUpdate = true;
        ln.visible = Math.random() > 0.3;
      });
    }
    t.current += d / 3;
    if (t.current >= 1) { t.current = 0; B.slow = 2.5; B.fx.spark(new THREE.Vector3(0, PT + 4.3, 0), c.glow, 20); if (B.seaValid) B.hitSea(4); if (B.airValid) B.hitAir(3); }
    if (shell.current) { shell.current.scale.setScalar(0.3 + t.current * 9); shellMat.opacity = Math.max(0, 1 - t.current * 1.4); }
  });
  return (
    <group>
      {lines.map((l, i) => <primitive key={i} object={l} />)}
      <mesh ref={shell} position={[0, PT + 1.5, 0]} material={shellMat}><icosahedronGeometry args={[1, 2]} /></mesh>
      <PingRing color={c.glow} period={3} max={9} />
      {[[-1.5, 0.8], [1.5, 0.8], [-1.5, -0.9], [1.5, -0.9]].map(([x, z], i) => (
        <group key={i} position={[x, PT, z]}>
          <RBox args={[0.6, 0.7, 0.6]} r={0.06} pos={[0, 0.35, 0]} m={k.armorDark} />
          {[0.2, 0.4, 0.6].map((y) => <mesh key={y} position={[0, y, 0]} material={k.glow}><boxGeometry args={[0.62, 0.03, 0.62]} /></mesh>)}
        </group>
      ))}
      {rods.map((p, i) => (
        <group key={i}>
          <mesh position={[p[0], PT + 0.5, p[2]]} material={k.steel}><cylinderGeometry args={[0.04, 0.06, 1.0, 8]} /></mesh>
          <mesh position={p} material={k.hot}><sphereGeometry args={[0.07, 10, 8]} /></mesh>
        </group>
      ))}
      <mesh position={[0, PT + 0.3, 0]} material={k.armorDark}><cylinderGeometry args={[0.75, 0.95, 0.6, 24]} /></mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <group key={i}>
          <mesh position={[0, PT + 0.85 + i * 0.45, 0]} material={i % 2 ? k.white : k.armor}><cylinderGeometry args={[0.4 - i * 0.025, 0.43 - i * 0.025, 0.4, 24]} /></mesh>
          <mesh position={[0, PT + 1.06 + i * 0.45, 0]} material={k.brass}><torusGeometry args={[0.41 - i * 0.025, 0.03, 8, 28]} /></mesh>
        </group>
      ))}
      <mesh position={[0, PT + 3.65, 0]} rotation={[PI / 2, 0, 0]} material={k.steel}><torusGeometry args={[0.6, 0.18, 16, 40]} /></mesh>
      <group ref={orb} position={[0, PT + 4.3, 0]}>
        <mesh material={k.glass}><sphereGeometry args={[0.4, 24, 16]} /></mesh>
        <mesh material={k.hot}><sphereGeometry args={[0.18, 16, 12]} /></mesh>
        <pointLight color={c.glow} intensity={10} distance={6} />
      </group>
    </group>
  );
}

function Sonar({ k, c }: P) {
  const B = useBattle();
  const yaw = useRef<THREE.Group>(null), rings = useRef<THREE.Group>(null);
  const mz = useRefs<THREE.Group>(1);
  useWeapon({
    yaw, muzzles: mz, rate: 0.6, canAir: true, preferAir: true, turn: 2,
    fire: (a, b, _i, air) => B.fx.shoot({ from: a, to: b, kind: "rocket", color: c.glow, dur: 1.3, arc: 1.5, dmg: 5, air, size: 1.2 }),
  });
  useFrame((_, d) => { if (rings.current) { rings.current.rotation.y += d; rings.current.rotation.x += d * 0.4; } });
  return (
    <group>
      <PingRing color={c.glow} period={2} max={9} />
      <PingRing color={c.glow} period={3.1} max={6} />
      <mesh position={[0, PT, 0]} material={k.glass}><sphereGeometry args={[0.95, 32, 16, 0, PI * 2, 0, PI / 2]} /></mesh>
      <mesh position={[0, PT, 0]} material={new THREE.MeshBasicMaterial({ color: new THREE.Color(c.glow).multiplyScalar(2), wireframe: true, toneMapped: false, transparent: true, opacity: 0.4 })}><sphereGeometry args={[0.97, 16, 8, 0, PI * 2, 0, PI / 2]} /></mesh>
      <mesh position={[0, PT + 0.3, 0]} material={k.armorDark}><cylinderGeometry args={[0.35, 0.45, 0.6, 16]} /></mesh>
      <group ref={rings} position={[0, PT + 1.8, 0]}>
        <mesh material={k.glow}><torusGeometry args={[1.1, 0.03, 8, 48]} /></mesh>
        <mesh rotation={[1, 0.5, 0]} material={k.hot}><torusGeometry args={[0.8, 0.02, 8, 40]} /></mesh>
        <mesh material={k.hot}><icosahedronGeometry args={[0.15, 0]} /></mesh>
      </group>
      <group position={[-1.5, PT, -0.9]}>
        <mesh position={[0, 0.5, 0]} material={k.gun}><cylinderGeometry args={[0.1, 0.16, 1.0, 12]} /></mesh>
        <group ref={yaw} position={[0, 1.0, 0]}>
          <group rotation={[-0.5, 0, 0]}>
            <group rotation={[PI / 2, 0, 0]}>
              <mesh material={k.white}><sphereGeometry args={[0.75, 28, 12, 0, PI * 2, 0, PI / 2.6]} /></mesh>
            </group>
            <mesh position={[0, 0, 0.7]} material={k.glow}><sphereGeometry args={[0.07, 8, 8]} /></mesh>
            <group ref={mz[0]} position={[0, 0, 0.75]} />
          </group>
        </group>
      </group>
      {[0.9, 1.5].map((x) => (
        <group key={x} position={[x, PT, -1.0]}>
          <RBox args={[0.5, 1.0, 0.5]} r={0.05} pos={[0, 0.5, 0]} m={k.armorDark} />
          {[0.25, 0.45, 0.65, 0.85].map((y, j) => <mesh key={y} position={[0, y, 0.255]} material={j % 2 ? k.hot : k.glow}><boxGeometry args={[0.36, 0.04, 0.01]} /></mesh>)}
        </group>
      ))}
    </group>
  );
}

/* ======================================================
   خانواده ۶ — قایق‌ها (مدل Kenney CC0 + تسلیحات اختصاصی)
====================================================== */
function GunBoat({ phase, radius, center, speed, k, c, rate, kind, tint, launcher }: {
  phase: number; radius: number; center: V3; speed: number; k: Kit; c: C; rate: number; kind: "tracer" | "torpedo" | "rocket"; tint?: string; launcher?: boolean;
}) {
  const B = useBattle();
  const model = useKenney(boatUrl, 1.6, tint);
  const g = useRef<THREE.Group>(null), mz = useRef<THREE.Group>(null), fl = useRef<FlashH>(null);
  const a = useRef(phase), t = useRef(Math.random() * 2), wake = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((s, dr) => {
    const d = Math.min(dr, 0.05) * B.speed;
    a.current += d * speed;
    const x = center[0] + Math.cos(a.current) * radius, z = center[2] + Math.sin(a.current) * radius * 0.7;
    if (!g.current) return;
    g.current.position.set(x, 0.02 + Math.sin(s.clock.elapsedTime * 3 + phase) * 0.03, z);
    const vx = -Math.sin(a.current), vz = Math.cos(a.current) * 0.7;
    g.current.rotation.set(Math.sin(s.clock.elapsedTime * 2 + phase) * 0.04, Math.atan2(vx * Math.sign(speed), vz * Math.sign(speed)), -0.12 * Math.sign(speed));
    wake.current -= d;
    if (wake.current <= 0) { wake.current = 0.06; g.current.getWorldPosition(tmp); B.fx.smoke(tmp.setY(0.05), 0.12, false); }
    t.current -= d;
    if (t.current <= 0 && B.seaValid && B.firing && mz.current) {
      t.current = 1 / rate;
      mz.current.getWorldPosition(tmp);
      B.fx.shoot({ from: tmp.clone(), to: B.sea.clone(), kind, color: c.glow, dur: kind === "torpedo" ? 2.2 : kind === "rocket" ? 1.0 : 0.35, arc: kind === "rocket" ? 1 : 0, dmg: kind === "torpedo" ? 8 : kind === "rocket" ? 3 : 0.8 });
      fl.current?.fire();
    }
  });
  return (
    <group ref={g}>
      <primitive object={model} />
      <mesh position={[0, 0.42, 0.25]} material={k.gun}><cylinderGeometry args={[0.07, 0.09, 0.12, 10]} /></mesh>
      <group position={[0, 0.5, 0.25]}>
        {launcher ? (
          <>{[-0.12, 0.12].map((x) => <mesh key={x} position={[x, 0, 0.1]} rotation={[PI / 2, 0, 0]} material={k.armorDark}><cylinderGeometry args={[0.07, 0.07, 0.7, 12]} /></mesh>)}</>
        ) : (
          <mesh position={[0, 0, 0.25]} rotation={[PI / 2, 0, 0]} material={k.gun}><cylinderGeometry args={[0.025, 0.03, 0.5, 8]} /></mesh>
        )}
        <group ref={mz} position={[0, 0, 0.5]}><Flash ref={fl} color={c.glow} size={0.6} /></group>
      </group>
      <Beacon pos={[0, 0.75, -0.15]} color={c.glow} size={0.035} />
    </group>
  );
}

function Pier({ k, len = 2.2, w = 1.2, wood = false, pos = [0, 0, 0] as V3 }: { k: Kit; len?: number; w?: number; wood?: boolean; pos?: V3 }) {
  const woodM = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6b4a2b", roughness: 0.9 }), []);
  return (
    <group position={pos}>
      <mesh position={[0, 0.4, len / 2]} material={wood ? woodM : k.concrete}><boxGeometry args={[w, 0.12, len]} /></mesh>
      {Array.from({ length: Math.round(len / 0.55) + 1 }).map((_, i) => [-1, 1].map((s) => (
        <mesh key={`${i}${s}`} position={[s * (w / 2 - 0.06), 0.1, i * 0.55]} material={wood ? woodM : k.armorDark}><cylinderGeometry args={[0.06, 0.06, 0.65, 8]} /></mesh>
      )))}
      {[0.4, len - 0.2].map((z) => [-1, 1].map((s) => <mesh key={`${z}${s}`} position={[s * (w / 2 - 0.1), 0.52, z]} material={k.accent}><cylinderGeometry args={[0.05, 0.06, 0.12, 8]} /></mesh>))}
    </group>
  );
}

function Hangar({ pos, k, w = 1.3, l = 1.2 }: { pos: V3; k: Kit; w?: number; l?: number }) {
  return (
    <group position={pos}>
      <RBox args={[w, 0.35, l]} r={0.03} pos={[0, 0.175, 0]} m={k.armor} />
      <mesh position={[0, 0.35, 0]} rotation={[PI / 2, 0, 0]} scale={[w / 2, l, 0.55]} material={k.armorDark}><cylinderGeometry args={[1, 1, 1, 24, 1, false, -PI / 2, PI]} /></mesh>
      <mesh position={[0, 0.35, l / 2 + 0.01]} material={k.rubber}><circleGeometry args={[w * 0.38, 20, 0, PI]} /></mesh>
      <mesh position={[0, 0.6, l / 2 + 0.02]} material={k.glow}><boxGeometry args={[w * 0.6, 0.03, 0.01]} /></mesh>
    </group>
  );
}

function Garrison({ tier, k, c }: P) {
  const n = tier >= 2 ? 3 : 2;
  return (
    <group>
      <Pier k={k} pos={[0, 0, 1.6]} len={1.8} wood={tier === 1} />
      <Hangar pos={[-0.7, PT, -0.4]} k={k} />
      {tier >= 2 && (
        <>
          <Drum pos={[0.9, PT, 0.6]} k={k} />
          <Drum pos={[1.15, PT, 0.45]} k={k} color="#1f4f8c" />
          <mesh position={[1.2, PT + 0.35, -0.6]} material={k.steel}><cylinderGeometry args={[0.3, 0.3, 0.7, 18]} /></mesh>
        </>
      )}
      {tier >= 3 && (
        <>
          <RBox args={[0.5, 1.6, 0.5]} r={0.05} pos={[1.1, PT + 0.8, 0.9]} m={k.armor} />
          <RBox args={[0.85, 0.42, 0.85]} r={0.06} pos={[1.1, PT + 1.8, 0.9]} m={k.armorDark} />
          <mesh position={[1.1, PT + 1.82, 1.33]} material={k.cockpit}><boxGeometry args={[0.7, 0.25, 0.01]} /></mesh>
          <Searchlight pos={[1.1, PT + 2.02, 0.9]} k={k} />
          <Dish pos={[0.6, PT, -1.3]} r={0.28} k={k} />
        </>
      )}
      <Beacon pos={[0.55, 0.62, 3.35]} color="#33ff66" />
      <Beacon pos={[-0.55, 0.62, 3.35]} color="#ff3344" />
      {Array.from({ length: n }).map((_, i) => (
        <GunBoat key={i} phase={(i / n) * PI * 2} radius={1.9} center={[0, 0, 4.4]} speed={0.55} k={k} c={c} rate={tier >= 3 ? 4 : 2.5} kind={tier >= 3 && i === 0 ? "rocket" : "tracer"} />
      ))}
    </group>
  );
}

function TorpedoBase({ k, c }: P) {
  const flag = useRef<THREE.Mesh>(null);
  useFrame((s) => { if (flag.current) flag.current.rotation.y = Math.sin(s.clock.elapsedTime * 3) * 0.3; });
  return (
    <group>
      <Pier k={k} pos={[-0.7, 0, 1.6]} len={2.0} w={0.8} />
      <Pier k={k} pos={[0.7, 0, 1.6]} len={2.0} w={0.8} />
      <mesh position={[0, 0.5, 1.9]} rotation={[-0.3, 0, 0]} material={k.hazard}><boxGeometry args={[0.6, 0.06, 1.0]} /></mesh>
      <RBox args={[0.7, 1.6, 0.7]} r={0.06} pos={[-1.4, PT + 0.8, -0.8]} m={k.armor} />
      <RBox args={[1.0, 0.45, 1.0]} r={0.08} pos={[-1.4, PT + 1.8, -0.8]} m={k.armorDark} />
      <mesh position={[-1.4, PT + 1.82, -0.29]} material={k.cockpit}><boxGeometry args={[0.8, 0.26, 0.01]} /></mesh>
      <Dish pos={[-1.4, PT + 2.03, -0.8]} r={0.25} k={k} />
      <mesh position={[1.5, PT + 1.0, -0.8]} material={k.steel}><cylinderGeometry args={[0.03, 0.04, 2, 8]} /></mesh>
      <mesh ref={flag} position={[1.5, PT + 1.8, -0.8]} material={k.glow}><boxGeometry args={[0.02, 0.3, 0.5]} /></mesh>
      {[0.3, 0.6, 0.9].map((x) => <Drum key={x} pos={[x, PT, -1.3]} k={k} />)}
      <Hangar pos={[0.4, PT, -0.4]} k={k} w={1.0} l={0.9} />
      {Array.from({ length: 5 }).map((_, i) => (
        <GunBoat key={i} phase={(i / 5) * PI * 2} radius={2.4} center={[0, 0, 4.8]} speed={0.7} k={k} c={c} rate={0.55} kind="torpedo" tint="#6d7a5c" launcher />
      ))}
    </group>
  );
}

function MineBase({ k, c }: P) {
  const B = useBattle();
  const sub = useRef<THREE.Group>(null), mz = useRef<THREE.Group>(null), crane = useRef<THREE.Group>(null);
  const t = useRef(1), mines = useRef<THREE.Group>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((s, dr) => {
    const d = Math.min(dr, 0.05) * B.speed;
    const tt = s.clock.elapsedTime;
    if (sub.current) {
      sub.current.position.y = -0.1 + Math.sin(tt * 0.4) * 0.22;
      sub.current.position.z = 3.2 + Math.sin(tt * 0.25) * 0.6;
    }
    if (crane.current) crane.current.rotation.y = Math.sin(tt * 0.3) * 0.8;
    mines.current?.children.forEach((m, i) => { m.position.y = 0.12 + Math.sin(tt * 1.5 + i) * 0.06; m.rotation.y += d * 0.3; });
    t.current -= d;
    if (t.current <= 0 && B.seaValid && B.firing && mz.current) {
      t.current = 2.4;
      mz.current.getWorldPosition(tmp);
      B.fx.shoot({ from: tmp.clone(), to: B.sea.clone(), kind: "torpedo", color: c.glow, dur: 2.4, dmg: 14, size: 1.3 });
    }
  });
  const minePos: V3[] = [[-2.6, 0, 3.4], [2.6, 0, 3.2], [-1.6, 0, 5.0], [1.7, 0, 5.1], [0, 0, 6.0], [-3.2, 0, 1.6], [3.3, 0, 1.4]];
  return (
    <group>
      <mesh position={[-1.25, 0.45, 2.2]} material={k.concrete}><boxGeometry args={[0.5, 0.5, 2.6]} /></mesh>
      <mesh position={[1.25, 0.45, 2.2]} material={k.concrete}><boxGeometry args={[0.5, 0.5, 2.6]} /></mesh>
      <mesh position={[0, 1.05, 1.6]} material={k.armorDark}><boxGeometry args={[3.0, 0.12, 1.4]} /></mesh>
      {[-1.25, 1.25].map((x) => <mesh key={x} position={[x, 0.71, 2.2]} material={k.hazard}><boxGeometry args={[0.52, 0.03, 2.6]} /></mesh>)}
      <group ref={sub} position={[0, -0.1, 3.2]}>
        <mesh rotation={[PI / 2, 0, 0]} material={k.armorDark}><capsuleGeometry args={[0.34, 2.2, 8, 20]} /></mesh>
        <RBox args={[0.28, 0.55, 0.75]} r={0.1} pos={[0, 0.5, 0.15]} m={k.armorDark} />
        <mesh position={[0, 0.9, 0.25]} material={k.steel}><cylinderGeometry args={[0.025, 0.025, 0.4, 6]} /></mesh>
        <mesh position={[0, 0.55, 0.15]} material={k.glow}><boxGeometry args={[0.3, 0.02, 0.4]} /></mesh>
        {[0, PI / 2].map((r) => <mesh key={r} position={[0, 0, -1.45]} rotation={[0, 0, r]} material={k.gun}><boxGeometry args={[0.7, 0.04, 0.3]} /></mesh>)}
        <mesh position={[0, 0, -1.65]} rotation={[PI / 2, 0, 0]} material={k.brass}><cylinderGeometry args={[0.12, 0.05, 0.15, 6]} /></mesh>
        <group ref={mz} position={[0, -0.1, 1.5]} />
      </group>
      <group ref={mines}>
        {minePos.map((p, i) => (
          <group key={i} position={p}>
            <mesh material={k.armorDark}><sphereGeometry args={[0.26, 20, 14]} /></mesh>
            {Array.from({ length: 8 }).map((_, s) => {
              const a = (s / 8) * PI * 2, e = s % 2 ? 0.5 : -0.3;
              return <mesh key={s} position={[Math.cos(a) * 0.27 * Math.cos(e), Math.sin(e) * 0.27, Math.sin(a) * 0.27 * Math.cos(e)]} lookAt={undefined} material={k.brass}><sphereGeometry args={[0.04, 6, 6]} /></mesh>;
            })}
            <Beacon pos={[0, 0.3, 0]} color="#ff2a2a" rate={2} size={0.045} />
          </group>
        ))}
      </group>
      <group position={[1.4, PT, -0.9]}>
        <mesh position={[0, 0.8, 0]} material={k.accent}><cylinderGeometry args={[0.1, 0.14, 1.6, 10]} /></mesh>
        <group ref={crane} position={[0, 1.6, 0]}>
          <RBox args={[0.18, 0.18, 2.0]} r={0.03} pos={[0, 0, 0.7]} rot={[-0.3, 0, 0]} m={k.accent} />
          <mesh position={[0, -0.25, 1.55]} material={k.steel}><cylinderGeometry args={[0.008, 0.008, 1.0, 4]} /></mesh>
        </group>
      </group>
      <Hangar pos={[-0.9, PT, -0.8]} k={k} w={1.1} l={1.0} />
    </group>
  );
}

/* ======================================================
   ریشه
====================================================== */
export default function Tower({ modelKind, tier, colors, gi, scale = 1 }: { modelKind: ModelKind; tier: number; colors: C; gi: number; scale?: number }) {
  const k = useKit(colors.base, colors.accent, colors.glow, gi);
  const root = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    root.current?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = m.material as THREE.Material;
        const emissiveOnly = mat instanceof THREE.MeshBasicMaterial || mat.transparent;
        m.castShadow = !emissiveOnly;
        m.receiveShadow = !emissiveOnly;
      }
    });
  }, [modelKind, tier]);
  const water = ["garrison", "torpedo", "mine"].includes(modelKind);
  const p: P = { tier, k, c: colors };
  const wide = ["railgun", "mlrs", "thermobaric", "silo", "hypersonic", "bavar", "laser", "emp", "sonar", "ew", "swarm"].includes(modelKind);
  return (
    <group ref={root} scale={scale}>
      <Island r={water ? 2.5 : wide ? 3.0 : 2.7} pos={water ? [0, 0, -0.7] : [0, 0, 0]} seed={modelKind.length} />
      {water ? <group position={[0, 0, -0.7]}><Pad r={1.75} k={k} /></group> : <Pad r={wide ? 2.2 : 1.9} k={k} />}
      <group position={water ? [0, 0, -0.7] : [0, 0, 0]}>
        {modelKind === "autocannon" && <Autocannon {...p} />}
        {modelKind === "ciws" && <Ciws {...p} />}
        {modelKind === "railgun" && <Railgun {...p} />}
        {modelKind === "howitzer" && <Howitzer {...p} />}
        {modelKind === "mlrs" && <Mlrs {...p} />}
        {modelKind === "thermobaric" && <Thermobaric {...p} />}
        {modelKind === "silo" && <Silo {...p} />}
        {modelKind === "hypersonic" && <Hypersonic {...p} />}
        {modelKind === "swarm" && <Swarm {...p} />}
        {modelKind === "aadefense" && <AADefense {...p} />}
        {modelKind === "bavar" && <Bavar {...p} />}
        {modelKind === "laser" && <Laser {...p} />}
        {modelKind === "ew" && <EW {...p} />}
        {modelKind === "emp" && <Emp {...p} />}
        {modelKind === "sonar" && <Sonar {...p} />}
      </group>
      {modelKind === "garrison" && <Garrison {...p} />}
      {modelKind === "torpedo" && <TorpedoBase {...p} />}
      {modelKind === "mine" && <MineBase {...p} />}
    </group>
  );
}
