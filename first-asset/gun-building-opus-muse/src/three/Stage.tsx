import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, ToneMapping, SMAA } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { BattleCtx, createBattle, useBattle, type Battle } from "./battle";
import FX from "./fx";
import Tower from "./towers";
import { panelMap, wakeMap, windowsMap } from "./textures";
import { useKenney } from "./kit";
import BuildingModel from "./buildings";
import type { ModelKind } from "../data/towers";
import type { BuildingKind } from "../data/buildings";
import cargoUrl from "../assets/models/ship-cargo-a.glb?url";
import boatUrl from "../assets/models/boat-speed-a.glb?url";

export type Mood = "dusk" | "night" | "day";
const PI = Math.PI;

const MOODS: Record<Mood, {
  top: string; horizon: string; sun: string; sunDir: [number, number, number]; deep: string; shallow: string; fog: string;
  sunI: number; amb: number; hemiSky: string; hemiGround: string; stars: number; env: string[];
}> = {
  dusk: { top: "#0d1b3d", horizon: "#ff8d52", sun: "#ffb27a", sunDir: [-0.6, 0.18, -0.78], deep: "#03192b", shallow: "#0f6d78", fog: "#3a2c3e", sunI: 2.6, amb: 0.35, hemiSky: "#ffc9a0", hemiGround: "#14223a", stars: 0.25, env: ["#ff9a60", "#4a6cff", "#ffd2a8"] },
  night: { top: "#01030b", horizon: "#13284d", sun: "#9fc2ff", sunDir: [0.5, 0.35, -0.8], deep: "#010a15", shallow: "#073c4a", fog: "#060d1e", sunI: 0.9, amb: 0.18, hemiSky: "#5c7cff", hemiGround: "#05070f", stars: 1, env: ["#3a5cff", "#1a2a55", "#8fb0ff"] },
  day: { top: "#2d6fd1", horizon: "#cfe8ff", sun: "#fff4e0", sunDir: [0.45, 0.75, -0.5], deep: "#06395a", shallow: "#17a3a8", fog: "#a9cbe8", sunI: 3.2, amb: 0.55, hemiSky: "#cfe6ff", hemiGround: "#5a4a3a", stars: 0, env: ["#ffffff", "#9fc8ff", "#ffeccc"] },
};

/* ================= آسمان ================= */
function Sky({ mood }: { mood: Mood }) {
  const M = MOODS[mood];
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uDir: { value: new THREE.Vector3() }, uStars: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`,
    fragmentShader: `uniform vec3 uTop,uHor,uSun,uDir; uniform float uStars,uTime; varying vec3 vD;
      float h3(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      void main(){ float h=vD.y; vec3 c=mix(uHor,uTop,pow(clamp(h,0.,1.),.42)); if(h<0.) c=uHor*.55;
        float s=max(dot(vD,normalize(uDir)),0.); c+=uSun*(pow(s,900.)*14.+pow(s,10.)*.45+pow(s,2.)*.08);
        vec3 q=floor(vD*260.); float st=step(.9975,h3(q))*smoothstep(0.05,.4,h); c+=vec3(st*uStars*(.6+.4*sin(uTime*2.+q.x)));
        gl_FragColor=vec4(c,1.); }`,
  }), []);
  useEffect(() => {
    mat.uniforms.uTop.value.set(M.top); mat.uniforms.uHor.value.set(M.horizon); mat.uniforms.uSun.value.set(M.sun);
    mat.uniforms.uDir.value.set(...M.sunDir); mat.uniforms.uStars.value = M.stars;
  }, [M, mat]);
  useFrame((s) => { mat.uniforms.uTime.value = s.clock.elapsedTime; });
  return <mesh material={mat} frustumCulled={false}><sphereGeometry args={[150, 32, 16]} /></mesh>;
}

/* ================= اقیانوس ================= */
function Ocean({ mood }: { mood: Mood }) {
  const M = MOODS[mood];
  const B = useBattle();
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uSky: { value: new THREE.Color() },
      uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uDir: { value: new THREE.Vector3() }, uFog: { value: new THREE.Color() }, uIsland: { value: 2.8 },
    },
    vertexShader: `uniform float uTime; varying vec3 vW; varying float vH;
      float w(vec2 p, vec2 d, float f, float a, float s){ return sin(dot(p,normalize(d))*f+uTime*s)*a; }
      void main(){ vec4 p=modelMatrix*vec4(position,1.);
        float h=w(p.xz,vec2(1.,.3),.35,.17,1.1)+w(p.xz,vec2(-.4,1.),.62,.08,1.7)+w(p.xz,vec2(.7,-.8),1.3,.04,2.6)+w(p.xz,vec2(-.9,-.2),2.5,.018,3.6);
        h*=smoothstep(2.4,6.,length(p.xz))*.85+.15; p.y+=h; vH=h; vW=p.xyz; gl_Position=projectionMatrix*viewMatrix*p; }`,
    fragmentShader: `uniform vec3 uDeep,uShallow,uSky,uHor,uSun,uDir,uFog; uniform float uTime,uIsland; varying vec3 vW; varying float vH;
      float hs(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float ns(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y); }
      void main(){
        vec3 n=normalize(cross(dFdx(vW),dFdy(vW))); if(n.y<0.) n=-n;
        float r1=ns(vW.xz*2.6+uTime*.5)-.5, r2=ns(vW.xz*6.3-uTime*.8)-.5, r3=ns(vW.xz*13.-uTime*1.3)-.5;
        n=normalize(n+vec3(r1+r3*.5,0.,r2-r3*.5)*.32);
        vec3 V=normalize(cameraPosition-vW);
        float fr=pow(1.-max(dot(n,V),0.),4.5);
        float dI=length(vW.xz);
        vec3 water=mix(uDeep,uShallow,clamp(vH*2.2+.35,0.,1.));
        water=mix(uShallow*1.5,water,smoothstep(uIsland-.3,uIsland+2.2,dI));
        vec3 R=reflect(-V,n); vec3 refl=mix(uHor,uSky,clamp(R.y*1.8,0.,1.));
        vec3 c=mix(water,refl,fr*.9+.04);
        vec3 L=normalize(uDir); float sp=pow(max(dot(reflect(-L,n),V),0.),260.); c+=uSun*sp*7.;
        c+=uSun*pow(max(dot(reflect(-L,n),V),0.),18.)*.12;
        float foam=smoothstep(.15,.24,vH)*ns(vW.xz*4.+uTime);
        float sh=(1.-smoothstep(uIsland-.15,uIsland+.7,dI))*smoothstep(uIsland-1.,uIsland-.3,dI);
        sh*=.55+.45*sin(dI*15.-uTime*2.6); foam+=sh*ns(vW.xz*7.+uTime*.6)*1.8;
        c=mix(c,vec3(.92,.96,1.),clamp(foam,0.,.85));
        float fd=smoothstep(14.,70.,length(vW-cameraPosition)); c=mix(c,uFog,fd);
        gl_FragColor=vec4(c,1.); }`,
  }), []);
  useEffect(() => {
    const u = mat.uniforms;
    u.uDeep.value.set(M.deep); u.uShallow.value.set(M.shallow); u.uSky.value.set(M.top); u.uHor.value.set(M.horizon);
    u.uSun.value.set(M.sun); u.uDir.value.set(...M.sunDir); u.uFog.value.set(M.horizon).lerp(new THREE.Color(M.fog), 0.5);
  }, [M, mat]);
  useFrame((_, d) => { mat.uniforms.uTime.value += d * B.speed; });
  return (
    <>
      <mesh material={mat} rotation={[-PI / 2, 0, 0]} frustumCulled={false}>
        <planeGeometry args={[220, 220, 220, 220]} />
      </mesh>
      <mesh rotation={[-PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <shadowMaterial opacity={0.35} transparent />
      </mesh>
    </>
  );
}

/* ================= ناوچه دشمن (رویه‌ای) ================= */
function useHull() {
  return useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.55, -2.1); s.lineTo(0.55, -2.1); s.lineTo(0.62, -0.4); s.quadraticCurveTo(0.6, 1.2, 0, 2.5); s.quadraticCurveTo(-0.6, 1.2, -0.62, -0.4); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 });
    g.rotateX(-PI / 2); g.rotateY(PI); g.translate(0, -0.3, 0);
    return g;
  }, []);
}

function EnemyCorvette() {
  const B = useBattle();
  const hull = useHull();
  const g = useRef<THREE.Group>(null), turret = useRef<THREE.Group>(null), wake = useRef<THREE.Mesh>(null);
  const st = useRef({ a: 0.4, hp: 60, flash: 0, sink: 0, smokeT: 0 });
  const mats = useMemo(() => ({
    hull: new THREE.MeshPhysicalMaterial({ map: panelMap("#4b525c"), metalness: 0.6, roughness: 0.5, clearcoat: 0.2, emissive: "#ff2200", emissiveIntensity: 0 }),
    deck: new THREE.MeshStandardMaterial({ color: "#2b3036", roughness: 0.8, metalness: 0.4 }),
    sup: new THREE.MeshPhysicalMaterial({ map: panelMap("#6a727c"), metalness: 0.5, roughness: 0.45, clearcoat: 0.3 }),
    red: new THREE.MeshStandardMaterial({ color: "#6b1a16", roughness: 0.7 }),
    win: new THREE.MeshStandardMaterial({ color: "#111", emissiveMap: windowsMap(), emissive: "#ffffff", emissiveIntensity: 1.2 }),
    gun: new THREE.MeshStandardMaterial({ color: "#2a2f36", metalness: 0.9, roughness: 0.3 }),
    lite: new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff3030").multiplyScalar(6), toneMapped: false }),
    wake: new THREE.MeshBasicMaterial({ map: wakeMap(), transparent: true, depthWrite: false, opacity: 0.75 }),
  }), []);
  useEffect(() => {
    B.hitSea = (d: number) => {
      const s = st.current;
      if (s.sink > 0) return;
      s.hp -= d; s.flash = 1;
      if (s.hp <= 0) { s.sink = 0.0001; B.seaValid = false; B.kills++; B.fx.explode(B.sea.clone(), "#ff7a1a", 3); }
    };
  }, [B]);
  useFrame((stt, dr) => {
    const d = Math.min(dr, 0.05) * B.speed;
    const s = st.current;
    if (!g.current) return;
    const tt = stt.clock.elapsedTime;
    B.slow = Math.max(0, B.slow - d); B.stun = Math.max(0, B.stun - d);
    if (s.sink > 0) {
      s.sink += d;
      g.current.position.y = -s.sink * 0.45;
      g.current.rotation.z = Math.min(0.5, s.sink * 0.25);
      g.current.rotation.x = Math.min(0.3, s.sink * 0.12);
      s.smokeT -= d;
      if (s.smokeT <= 0) { s.smokeT = 0.08; B.fx.smoke(g.current.position.clone().setY(0.3), 0.6, true); if (Math.random() < 0.2) B.fx.explode(g.current.position.clone().add(new THREE.Vector3((Math.random() - .5) * 2, 0.3, (Math.random() - .5) * 2)), "#ff7a1a", 0.8); }
      if (s.sink > 4) { s.sink = 0; s.hp = 60; s.a += 2.3; g.current.rotation.set(0, 0, 0); B.seaValid = true; }
      return;
    }
    const sp = B.stun > 0 ? 0 : B.slow > 0 ? 0.04 : 0.1;
    s.a += d * sp;
    const x = Math.cos(s.a) * 11, z = Math.sin(s.a) * 8 + 1;
    g.current.position.set(x, Math.sin(tt * 1.3) * 0.06, z);
    const vx = -Math.sin(s.a) * 11, vz = Math.cos(s.a) * 8;
    g.current.rotation.set(Math.sin(tt * 1.1) * 0.025, Math.atan2(vx, vz), Math.sin(tt * 0.9) * 0.03);
    B.sea.set(x, 0.75, z);
    s.flash = Math.max(0, s.flash - d * 6);
    mats.hull.emissiveIntensity = s.flash * 2;
    if (turret.current) turret.current.rotation.y = Math.sin(tt * 0.5) * 0.8;
    if (wake.current) mats.wake.opacity = sp > 0 ? 0.75 : 0.2;
  });
  return (
    <group ref={g}>
      <mesh geometry={hull} material={mats.hull} castShadow />
      <mesh position={[0, -0.27, 0]} rotation={[-PI / 2, 0, 0]} material={mats.red}><planeGeometry args={[1.0, 4.2]} /></mesh>
      <mesh position={[0, 0.26, -0.1]} material={mats.deck}><boxGeometry args={[1.05, 0.02, 3.6]} /></mesh>
      <mesh position={[0, 0.6, -0.4]} material={mats.sup} castShadow><boxGeometry args={[0.85, 0.65, 1.4]} /></mesh>
      <mesh position={[0, 1.05, -0.2]} rotation={[0.25, 0, 0]} material={mats.sup} castShadow><boxGeometry args={[0.7, 0.35, 0.7]} /></mesh>
      <mesh position={[0, 1.1, 0.12]} rotation={[0.25, 0, 0]} material={mats.win}><boxGeometry args={[0.6, 0.12, 0.02]} /></mesh>
      <mesh position={[0, 1.6, -0.5]} material={mats.gun}><cylinderGeometry args={[0.04, 0.08, 1.2, 8]} /></mesh>
      <mesh position={[0, 1.95, -0.5]} material={mats.gun}><boxGeometry args={[0.6, 0.05, 0.05]} /></mesh>
      <mesh position={[0, 2.25, -0.5]} material={mats.lite}><sphereGeometry args={[0.05, 8, 6]} /></mesh>
      <mesh position={[0, 0.7, -1.3]} material={mats.gun}><cylinderGeometry args={[0.16, 0.2, 0.4, 12]} /></mesh>
      <group ref={turret} position={[0, 0.4, 1.0]}>
        <mesh material={mats.sup} castShadow><sphereGeometry args={[0.28, 16, 10, 0, PI * 2, 0, PI / 2]} /></mesh>
        <mesh position={[0, 0.1, 0.4]} rotation={[PI / 2, 0, 0]} material={mats.gun}><cylinderGeometry args={[0.035, 0.045, 0.8, 8]} /></mesh>
      </group>
      {[-0.25, 0, 0.25].map((x) => [0.35, 0.6].map((z) => <mesh key={`${x}${z}`} position={[x, 0.28, z]} material={mats.gun}><boxGeometry args={[0.2, 0.03, 0.2]} /></mesh>))}
      <mesh ref={wake} position={[0, 0.06, -4.6]} rotation={[-PI / 2, 0, PI]} material={mats.wake}><planeGeometry args={[2.4, 5.2]} /></mesh>
    </group>
  );
}

function EnemyBoats() {
  const B = useBattle();
  const model = useKenney(boatUrl, 1.4, "#3b3f46");
  const clones = useMemo(() => [model.clone(), model.clone()], [model]);
  const refs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  useFrame((s) => {
    const base = Math.atan2(B.sea.z - 1, B.sea.x) ;
    refs.forEach((r, i) => {
      if (!r.current) return;
      const a = base - 0.22 - i * 0.18;
      const rr = 1 + (i ? 0.1 : -0.1);
      const x = Math.cos(a) * 11 * rr, z = Math.sin(a) * 8 * rr + 1;
      r.current.position.set(x, Math.sin(s.clock.elapsedTime * 3 + i) * 0.04, z);
      r.current.rotation.y = Math.atan2(-Math.sin(a) * 11, Math.cos(a) * 8);
      r.current.visible = B.seaValid;
    });
  });
  return <>{clones.map((c, i) => <group key={i} ref={refs[i]}><primitive object={c} /></group>)}</>;
}

/* ================= پهپاد دشمن ================= */
function EnemyDrone() {
  const B = useBattle();
  const g = useRef<THREE.Group>(null);
  const st = useRef({ a: 2.5, hp: 16, dead: 0, vy: 0, flash: 0 });
  const mats = useMemo(() => ({
    body: new THREE.MeshPhysicalMaterial({ color: "#3a4049", metalness: 0.7, roughness: 0.35, clearcoat: 0.6, emissive: "#ff2200", emissiveIntensity: 0 }),
    eng: new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff6a2a").multiplyScalar(6), toneMapped: false }),
  }), []);
  const wing = useMemo(() => {
    const s = new THREE.Shape(); s.moveTo(0, 0.7); s.lineTo(1.1, -0.45); s.lineTo(0.2, -0.35); s.lineTo(0, -0.5); s.lineTo(-0.2, -0.35); s.lineTo(-1.1, -0.45); s.closePath();
    const g2 = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }); g2.rotateX(-PI / 2); return g2;
  }, []);
  useEffect(() => {
    B.hitAir = (d: number) => {
      const s = st.current;
      if (s.dead > 0) return;
      s.hp -= d; s.flash = 1;
      if (s.hp <= 0) { s.dead = 0.0001; s.vy = 0; B.airValid = false; B.kills++; B.fx.explode(B.air.clone(), "#ffa040", 1.6, false); }
    };
  }, [B]);
  useFrame((stt, dr) => {
    const d = Math.min(dr, 0.05) * B.speed;
    const s = st.current;
    if (!g.current) return;
    if (s.dead > 0) {
      s.dead += d; s.vy -= 9 * d;
      g.current.position.y = Math.max(-1, g.current.position.y + s.vy * d);
      g.current.rotation.z += d * 8;
      if (Math.random() < 0.6) B.fx.smoke(g.current.position.clone(), 0.25, true);
      if (g.current.position.y <= 0.05 && s.vy < 0 && s.dead < 10) { B.fx.explode(g.current.position.clone().setY(0.1), "#ff8a2a", 1.2, true); s.dead = 10; g.current.visible = false; }
      if (s.dead > 12.5) { s.dead = 0; s.hp = 16; s.a += 1.8; g.current.visible = true; g.current.rotation.set(0, 0, 0); B.airValid = true; }
      return;
    }
    s.a += d * 0.32;
    const x = Math.cos(s.a) * 7.5, z = Math.sin(s.a) * 6.5;
    const y = 4.8 + Math.sin(stt.clock.elapsedTime * 0.8) * 0.5;
    g.current.position.set(x, y, z);
    g.current.rotation.set(0, Math.atan2(-Math.sin(s.a), Math.cos(s.a)) , -0.35);
    B.air.set(x, y, z);
    s.flash = Math.max(0, s.flash - d * 6);
    mats.body.emissiveIntensity = s.flash * 3;
  });
  return (
    <group ref={g}>
      <group rotation={[0, 0, 0]} scale={0.8}>
        <mesh geometry={wing} material={mats.body} castShadow />
        <mesh rotation={[PI / 2, 0, 0]} material={mats.body} castShadow><capsuleGeometry args={[0.12, 0.9, 6, 12]} /></mesh>
        <mesh position={[0, 0, -0.6]} material={mats.eng}><sphereGeometry args={[0.08, 10, 8]} /></mesh>
        {[-1, 1].map((s) => <mesh key={s} position={[s * 0.15, 0.15, -0.35]} rotation={[0, 0, s * 0.5]} material={mats.body}><boxGeometry args={[0.02, 0.3, 0.25]} /></mesh>)}
      </group>
    </group>
  );
}

/* کشتی تجاری روی لاین ترانزیت */
function CargoShip() {
  const B = useBattle();
  const model = useKenney(cargoUrl, 6);
  const g = useRef<THREE.Group>(null);
  const x = useRef(-40);
  useFrame((s, d) => {
    x.current += d * 1.2 * B.speed;
    if (x.current > 45) x.current = -45;
    if (g.current) { g.current.position.set(x.current, Math.sin(s.clock.elapsedTime) * 0.05, -22); g.current.rotation.set(0, PI / 2, Math.sin(s.clock.elapsedTime * 0.7) * 0.02); }
  });
  return <group ref={g}><primitive object={model} /></group>;
}

/* لرزش و چرخه بازی */
function World({ children }: { children: React.ReactNode }) {
  const B = useBattle();
  const g = useRef<THREE.Group>(null);
  useFrame((_, d) => {
    B.shake = Math.max(0, B.shake - d * 1.6);
    if (g.current) g.current.position.set((Math.random() - 0.5) * B.shake * 0.5, (Math.random() - 0.5) * B.shake * 0.5, (Math.random() - 0.5) * B.shake * 0.3);
  });
  return <group ref={g}>{children}</group>;
}

export interface StageProps {
  modelKind: ModelKind; tier: number; colors: { base: string; accent: string; glow: string }; gi: number; scale: number;
  mood: Mood; battle: Battle; active: boolean; autoRotate: boolean; quality: "high" | "low";
  scene?: "tower" | "building"; buildingKind?: BuildingKind;
}

export default function StageCanvas({ modelKind, tier, colors, gi, scale, mood, battle, active, autoRotate, quality, scene = "tower", buildingKind }: StageProps) {
  const M = MOODS[mood];
  const isBuilding = scene === "building";
  const tall = ["hypersonic", "emp", "bavar", "railgun", "laser", "swarm", "ew"].includes(modelKind);
  const water = ["garrison", "torpedo", "mine"].includes(modelKind);
  const cam: [number, number, number] = isBuilding ? [11, 7.5, 12] : tall ? [8.5, 6.2, 9.5] : water ? [8, 5.5, 10] : [7.2, 4.8, 8.2];
  const sunPos = new THREE.Vector3(...M.sunDir).normalize().multiplyScalar(14);
  if (sunPos.y < 6) sunPos.y = 6;
  return (
    <Canvas
      shadows
      flat
      dpr={quality === "high" ? [1, 1.75] : [1, 1.1]}
      frameloop={active ? "always" : "never"}
      camera={{ position: cam, fov: 40, near: 0.1, far: 400 }}
      gl={{ antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
    >
      <BattleCtx.Provider value={battle}>
        <Sky mood={mood} />
        <ambientLight intensity={M.amb} />
        <hemisphereLight args={[M.hemiSky, M.hemiGround, 0.6]} />
        <directionalLight
          position={sunPos.toArray()} intensity={M.sunI} color={M.sun} castShadow
          shadow-mapSize={quality === "high" ? [2048, 2048] : [1024, 1024]} shadow-bias={-0.0004} shadow-normalBias={0.03}
          shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-camera-far={40}
        />
        <directionalLight position={[-8, 5, 8]} intensity={0.6} color={M.env[1]} />
        <pointLight position={[0, 3.5, 0]} intensity={mood === "night" ? 18 : 6} distance={8} color={colors.glow} />
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={3} color={M.env[0]} position={[0, 5, -10]} scale={[20, 4, 1]} />
          <Lightformer form="rect" intensity={1.5} color={M.env[1]} position={[-10, 2, 4]} rotation={[0, PI / 2, 0]} scale={[14, 3, 1]} />
          <Lightformer form="rect" intensity={1.2} color={M.env[2]} position={[10, 3, 3]} rotation={[0, -PI / 2, 0]} scale={[14, 3, 1]} />
          <Lightformer form="circle" intensity={2} color="#ffffff" position={[0, 10, 0]} rotation={[PI / 2, 0, 0]} scale={6} />
          <Lightformer form="rect" intensity={0.6} color={M.deep} position={[0, -5, 0]} rotation={[-PI / 2, 0, 0]} scale={[30, 30, 1]} />
        </Environment>
        <World>
          <Ocean mood={mood} />
          <Suspense fallback={null}>
            {isBuilding && buildingKind
              ? <BuildingModel kind={buildingKind} tier={tier} colors={colors} gi={gi} scale={scale} />
              : (
                <>
                  <Tower modelKind={modelKind} tier={tier} colors={colors} gi={gi} scale={scale} />
                  <EnemyBoats />
                  <CargoShip />
                </>
              )}
          </Suspense>
          {!isBuilding && <EnemyCorvette />}
          {!isBuilding && <EnemyDrone />}
          <FX />
        </World>
        <OrbitControls
          target={[0, 1.4, 0]} autoRotate={autoRotate} autoRotateSpeed={0.6} enablePan={false}
          minDistance={5} maxDistance={24} maxPolarAngle={PI / 2 - 0.08} enableDamping makeDefault
        />
        <EffectComposer multisampling={quality === "high" ? 4 : 0} enableNormalPass={false}>
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={quality === "high" ? 1.15 : 0.9} radius={0.72} />
          <Vignette offset={0.28} darkness={0.72} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <SMAA />
        </EffectComposer>
      </BattleCtx.Provider>
    </Canvas>
  );
}

export { createBattle };
