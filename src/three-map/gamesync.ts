import * as THREE from 'three';
import lanesData from './lanes-3d.json';
import slotsData from './slots-3d.json';
import buildingsData from './buildings-3d.json';
import { loadModel, TOWER_MODEL, BRANCH_MODEL, groundY } from './models3d';
import { hull } from './ships3d';
import { pctTo3d, point3dToPct } from './coords';
import { getRange, getStats, getSlots, enemyMissilePosition, enemyPosition, distance, type GameState, type Shot } from '@/lib/game';
import type { BattleSound } from '@/lib/battle-audio';
import { BattleFX } from './battlefx';
import { canonicalAnimName } from './anim-names';

type LaneName = 'enemy' | 'trade' | 'pirate' | 'port';
const LANES = lanesData as Record<LaneName, [number, number][]>;
const SLOTS = (slotsData as { slots: { id: number; island: string; x: number; z: number }[] }).slots;
const PLATFORMS = (slotsData as { platforms: { id: number; x: number; z: number }[] }).platforms;
const BUILDINGS = buildingsData as Record<string, { glb: string; x: number; z: number; water: boolean }>;

export interface SyncCallbacks {
  onSound?(kind: BattleSound): void;
  onSlot(id: number): void;
  onBuilding(id: string): void;
  onPlatform(id: number): void;
  onHero(): void;
  onHero2(): void;
  onInspect(id: number): void;
  onGroundPoint(xPct: number, yPct: number): void;
  onGroundHover(xPct: number, yPct: number): void;
}

interface MapLike {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer?: { domElement: HTMLCanvasElement };
  field?: { height(x: number, z: number): number; sample(x: number, z: number): number };
  setLayer(name: string, on: boolean): void;
  setTime?(h: number): void;
  dprCap?: number;
  setBattleDensity?(n: number): void;
  /** Night-light registry (hormuz-map): collects descendants flagged
   *  userData.night/flicker/... and drives their night visibility. */
  register?(o: THREE.Object3D): void;
  unregister?(o: THREE.Object3D): void;
}

/** Dynamic-resolution steps (§16.3). The effective ceiling is the map's DPR cap
 *  (1.5 on touch/Android, 2 on desktop) — steps above the cap are clamped. */
const DPR_STEPS = [2, 1.6, 1.3, 1.1, 1];
/** Lane polyline cache resolution: points/tangents are sampled once at this
 *  resolution and every per-frame lookup reads the cache (PERF §16). */
const LANE_SAMPLES = 256;

const KIND_COLOR: Record<string, number> = { cannon: 0xffd27a, heavy: 0xff9a5c, missile: 0xff6a5c, air: 0x7ac8ff, ew: 0xc07aff, boat: 0x7affc8 };
const CENTER3D = new THREE.Vector3(329, 0, 231); // theater center (world ≈658×462)

/* ===== Pack animation system (Phase 0) — the pack's own motions, revived =====
   Models carry named nodes (anim:*) from the pack source; GLB export preserved them
   inside the files, but GLTFLoader sanitizes the names on load (':' stripped,
   duplicates suffixed) — collectAnims canonicalizes them back via anim-names.ts.
   Behaviors below replicate the pack's useWeapon/useFrame math (kit.tsx, towers.tsx, buildings.tsx). */
/* All 18 pack glow colors, transcribed from the pack's own data table
   (owner-models/src/data/towers.ts glowColor) — ew/garrison/torpedo/mine
   previously fell back to base-family colors and never got a charge glow
   (audit مهم-۳۹). */
const PACK_GLOW: Record<string, string> = {
  autocannon: '#ffb020', ciws: '#ff6b78', railgun: '#38e1c6', howitzer: '#ff9a3c', mlrs: '#ff8a00',
  thermobaric: '#ff5c39', silo: '#ff4d5e', hypersonic: '#ff2d78', swarm: '#7dd3fc', aadefense: '#38bdf8',
  bavar: '#4ade80', laser: '#c026d3', ew: '#38e1c6', emp: '#8b5cf6', sonar: '#22ff88',
  garrison: '#fbbf24', torpedo: '#ff5c39', mine: '#22d3ee',
};
/** Kinds whose models collect glow materials for the charge-cycle pulse. */
const CHARGE_GLOW_KINDS = new Set(['railgun', 'thermobaric', 'hypersonic', 'ew', 'garrison', 'torpedo', 'mine']);
/** Heavy missiles whose rolled damage gets a floating number on impact
 *  (PRD §۸٫۳ — floating numbers are for crits, heavy missiles and bounty). */
const HEAVY_POPUP_KINDS = new Set(['silo', 'hypersonic', 'swarm', 'bavar']);
// turn = yaw/pitch tracking speed, loft = pitch bias, recoil in model units — from pack useWeapon opts
const WEAPON_SPEC: Record<string, { turn: number; loft?: number; maxUp?: number; recoil: number }> = {
  autocannon: { turn: 5, recoil: 0.16 }, ciws: { turn: 8, recoil: 0.2 }, railgun: { turn: 2.5, recoil: 0.45 },
  howitzer: { turn: 2, loft: 0.45, recoil: 0.5 }, mlrs: { turn: 2, loft: 0.55, recoil: 0.2 },
  thermobaric: { turn: 2, loft: 0.3, recoil: 0.5 }, silo: { turn: 5, recoil: 0.2 },
  hypersonic: { turn: 5, recoil: 0.2 }, swarm: { turn: 3, loft: 0.6, recoil: 0.2 },
  aadefense: { turn: 6, maxUp: 1.4, recoil: 0.14 }, bavar: { turn: 5, recoil: 0.2 },
  laser: { turn: 5, recoil: 0.2 }, sonar: { turn: 2, recoil: 0.2 },
};

interface AnimNode {
  obj: THREE.Object3D; name: string; phase: number;
  bx: number; by: number; bz: number; bry: number; brz: number;
  mat?: THREE.Material; baseColor?: THREE.Color;
  hook?: THREE.Object3D | null; hookBaseY?: number;
  childBaseY?: number[]; boatCx?: number; boatCz?: number; boatR?: number; boatA0?: number;
}
interface GlowMat { mat: THREE.Material; base: THREE.Color; basic: boolean; baseIntensity: number }
interface TowerAnim {
  kind: string; spec: { turn: number; loft?: number; maxUp?: number; recoil: number };
  yaw: THREE.Object3D[]; pitch: THREE.Object3D[]; mz: THREE.Object3D[]; rc: { obj: THREE.Object3D; bz: number }[];
  spin: THREE.Object3D | null; erector: THREE.Object3D | null; missile: THREE.Object3D | null; crystal: THREE.Object3D | null;
  doorsL: THREE.Object3D[]; doorsR: THREE.Object3D[]; cells: THREE.Object3D[];
  generic: AnimNode[]; glowMats: GlowMat[];
  targetPos: THREE.Vector3 | null; lastShotAt: number; period: number; shotIdx: number;
}
const MAT_CLONE_NAMES = new Set(['anim:ping', 'anim:door', 'anim:shell']);

function collectAnims(root: THREE.Object3D, seedKey: string): { byName: Map<string, THREE.Object3D[]>; generic: AnimNode[] } {
  // GLTFLoader delivers the pack's `anim:<key>` nodes under sanitized names
  // (`animrc`, `animrc_1`, ...) — canonicalize back to the colon names the
  // runtime keys on, with duplicates ordered by their loader ordinal so
  // indexed lists (mlrs mz×12, silo cell/doorL/doorR, swarm mz×8, boats)
  // keep authored order (D-019; see anim-names.ts).
  const found = new Map<string, { obj: THREE.Object3D; ord: number }[]>();
  root.traverse(o => {
    if (!o.name) return;
    const c = canonicalAnimName(o.name);
    if (!c) return;
    const arr = found.get(c.name) ?? []; arr.push({ obj: o, ord: c.ord }); found.set(c.name, arr);
  });
  const byName = new Map<string, THREE.Object3D[]>();
  for (const [name, entries] of found) {
    entries.sort((a, b) => a.ord - b.ord); // stable sort: ord ties keep traverse order
    byName.set(name, entries.map(e => e.obj));
  }
  const generic: AnimNode[] = [];
  let gi = 0;
  for (const [name, nodes] of byName) {
    if (['anim:yaw', 'anim:pitch', 'anim:mz', 'anim:rc', 'anim:spin', 'anim:erector', 'anim:missile', 'anim:doorL', 'anim:doorR', 'anim:cell'].includes(name)) continue;
    for (const obj of nodes) {
      const n: AnimNode = {
        obj, name, phase: ((seedKey.length * 7 + gi * 2.39) % 6.28),
        bx: obj.position.x, by: obj.position.y, bz: obj.position.z, bry: obj.rotation.y, brz: obj.rotation.z,
      };
      gi++;
      if (MAT_CLONE_NAMES.has(name) && (obj as THREE.Mesh).material) {
        const mesh = obj as THREE.Mesh;
        mesh.material = (mesh.material as THREE.Material).clone();
        n.mat = mesh.material;
        const c = (mesh.material as THREE.MeshBasicMaterial).color;
        if (c) n.baseColor = c.clone();
        if (name === 'anim:ping') { (mesh.material as THREE.MeshBasicMaterial).transparent = true; }
      }
      if (name === 'anim:trolley') { n.hook = obj.children[1] ?? null; n.hookBaseY = n.hook ? n.hook.position.y : 0; }
      if (name === 'anim:flameLight') { const li = obj as unknown as THREE.PointLight; if (li.isPointLight) obj.userData.baseI = li.intensity; }
      if (name === 'anim:mines') { n.childBaseY = obj.children.map(ch => ch.position.y); }
      generic.push(n);
    }
  }
  // boats orbit their shared centroid (pack GunBoat: ellipse 1 x 0.7 around a center)
  const boats = generic.filter(n => n.name === 'anim:boat');
  if (boats.length) {
    let cx = 0, cz = 0; for (const b of boats) { cx += b.bx; cz += b.bz; } cx /= boats.length; cz /= boats.length;
    for (const b of boats) { b.boatCx = cx; b.boatCz = cz; b.boatR = Math.max(0.5, Math.hypot(b.bx - cx, (b.bz - cz) / 0.7)); b.boatA0 = Math.atan2((b.bz - cz) / 0.7, b.bx - cx); }
  }
  return { byName, generic };
}

function collectGlowMats(root: THREE.Object3D, kind: string): GlowMat[] {
  const glowHex = PACK_GLOW[kind]; if (!glowHex) return [];
  const glow = new THREE.Color(glowHex);
  const out: GlowMat[] = []; const cloned = new Map<THREE.Material, THREE.Material>();
  root.traverse(o => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const replaced = mats.map(m => {
      if (!m) return m;
      const basic = (m as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      const std = m as THREE.MeshStandardMaterial;
      const col = basic ? (m as THREE.MeshBasicMaterial).color : std.emissive;
      if (!col || col.getHex() === 0) return m;
      const dist = Math.abs(col.r - glow.r) + Math.abs(col.g - glow.g) + Math.abs(col.b - glow.b);
      if (dist > 0.45) return m;
      if (!cloned.has(m)) { const c = m.clone(); cloned.set(m, c); out.push({ mat: c, base: col.clone(), basic, baseIntensity: basic ? 1 : (std.emissiveIntensity ?? 1) }); }
      return cloned.get(m)!;
    });
    mesh.material = Array.isArray(mesh.material) ? replaced : replaced[0];
  });
  return out;
}

function barSprites(scale: number): { group: THREE.Group; fg: THREE.Sprite; bg: THREE.Sprite } {
  const group = new THREE.Group();
  const mk = (color: number, opacity: number) => {
    const m = new THREE.SpriteMaterial({ color, transparent: true, opacity, depthTest: false });
    const s = new THREE.Sprite(m);
    s.center.set(0, 0.5);
    s.scale.set(scale, scale * 0.14, 1);
    s.renderOrder = 30;
    return s;
  };
  const bg = mk(0x1a0505, 0.85); const fg = mk(0x53d769, 0.95);
  bg.position.x = -scale / 2; fg.position.x = -scale / 2;
  group.add(bg); group.add(fg);
  return { group, fg, bg };
}
function setBar(bar: { fg: THREE.Sprite }, frac: number) {
  const f = Math.max(0, Math.min(1, frac));
  bar.fg.scale.x = bar.fg.scale.y / 0.14 * f;
  (bar.fg.material as THREE.SpriteMaterial).color.setHex(f > 0.5 ? 0x53d769 : f > 0.25 ? 0xffb340 : 0xff5040);
}

function glyphSprite(text: string, color: string, size = 3.4): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(6,24,38,0.78)'; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = color; ctx.font = 'bold 64px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(size, size, 1); s.renderOrder = 25;
  return s;
}

function enemyModel(kind: string, boss: number): THREE.Group {
  if (kind === 'air') {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x59636e, roughness: 0.5, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.8, 1.6), mat); g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.5), mat); tail.position.x = -2.4; g.add(tail);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 4.6), mat); g.add(wing);
    return g;
  }
  if (kind === 'boss') {
    const len = boss === 4 ? 30 : 24;
    const g = hull(boss === 2 ? 0x2c3844 : 0x4a3428, len, len * 0.24, 'patrol');
    if (boss === 4) { const deck = new THREE.Mesh(new THREE.BoxGeometry(len * 0.8, 0.5, len * 0.26), new THREE.MeshStandardMaterial({ color: 0x39424c, roughness: 0.8 })); deck.position.y = len * 0.16; g.add(deck); }
    return g;
  }
  if (kind === 'sub') { return hull(0x232a31, 11, 2.4, 'patrol'); }
  if (kind === 'speed') return hull(0x39424c, 6.5, 2, 'patrol');
  if (kind === 'corvette') return hull(0x46505c, 10, 2.8, 'patrol');
  return hull(0x525e6b, 13.5, 3.2, 'patrol'); // destroyer
}

interface Ent { obj: THREE.Group; bar?: ReturnType<typeof barSprites>; init?: boolean; phase: number; bobAmp: number; wake?: THREE.Mesh; mats?: THREE.Material[]; speed?: number; lastTx?: number; lastTz?: number; ind?: { stun: THREE.Sprite; slow: THREE.Sprite; eye: THREE.Sprite; shield: THREE.Mesh | null } }
interface PopupSprite { sp: THREE.Sprite; mat: THREE.SpriteMaterial; tex: THREE.CanvasTexture; cv: HTMLCanvasElement; age: number; dur: number; wx: number; wz: number; baseY: number; w: number }
interface BldRec { obj: THREE.Object3D; band: number; baseScale: number; groundBase: number; minY: number; local: THREE.Box3; ring: THREE.Mesh; ringBase: number; platform: boolean }

let _wakeTex: THREE.Texture | null = null;
function wakeTexture(): THREE.Texture {
  if (_wakeTex) return _wakeTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(210,240,255,0.45)'); g.addColorStop(1, 'rgba(210,240,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 64);
  const gv = ctx.createLinearGradient(0, 0, 0, 64);
  gv.addColorStop(0, 'rgba(0,0,0,1)'); gv.addColorStop(0.25, 'rgba(0,0,0,0)'); gv.addColorStop(0.75, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = gv; ctx.fillRect(0, 0, 128, 64);
  _wakeTex = new THREE.CanvasTexture(c);
  return _wakeTex;
}
function makeWake(len: number, wid: number, fwd: 'X' | 'Z'): THREE.Mesh {
  const grp = new THREE.Group();
  if (fwd === 'Z') grp.rotation.y = -Math.PI / 2;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len * 1.5, wid), new THREE.MeshBasicMaterial({ map: wakeTexture(), transparent: true, opacity: 0.28, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI;
  m.position.x = -len * 0.95; m.position.y = 0.06;
  m.renderOrder = 2;
  grp.add(m);
  return grp as unknown as THREE.Mesh;
}
function easeOutBack(x: number): number { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

/* ===== MECH-B: enemy missile visuals (destroyer / Leviathan projectiles) =====
   Geometry is built along +X (the ship forward convention); materials and
   geometries are shared module-wide — the per-missile cost is one Group. */
const EM_BODY_GEO = new THREE.CylinderGeometry(0.3, 0.34, 2.6, 8); EM_BODY_GEO.rotateZ(Math.PI / 2);
const EM_NOSE_GEO = new THREE.ConeGeometry(0.3, 0.95, 8); EM_NOSE_GEO.rotateZ(-Math.PI / 2);
const EM_FLAME_GEO = new THREE.ConeGeometry(0.22, 0.85, 8); EM_FLAME_GEO.rotateZ(Math.PI / 2);
const EM_BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x7e2d24, roughness: 0.45, metalness: 0.35, emissive: 0x2a0803 });
const EM_NOSE_MAT = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.35, metalness: 0.5 });
const EM_FLAME_MAT = new THREE.MeshBasicMaterial({ color: 0xffa040 });
/* The warning beacon's material is shared too (QA round 2): a fresh
   SpriteMaterial per missile was never disposed on removal — a small
   but unbounded leak in long battles. Sharing means all beacons blink
   in unison; syncEnemyMissiles drives the blink on this one material. */
const EM_BEACON_MAT = new THREE.SpriteMaterial({ color: 0xff4030, transparent: true, opacity: 0.9, depthTest: false });
function enemyMissileMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(EM_BODY_GEO, EM_BODY_MAT); g.add(body);
  const nose = new THREE.Mesh(EM_NOSE_GEO, EM_NOSE_MAT); nose.position.x = 1.75; g.add(nose);
  const flame = new THREE.Mesh(EM_FLAME_GEO, EM_FLAME_MAT); flame.position.x = -1.7; flame.name = 'em-flame'; g.add(flame);
  const beacon = new THREE.Sprite(EM_BEACON_MAT);
  beacon.scale.set(0.9, 0.9, 1); beacon.position.set(0, 0.55, 0); beacon.name = 'em-beacon'; g.add(beacon);
  return g;
}

/* ===== VIS: building evolution (PRD §2.2 — five visual tiers at levels
   10/25/50/100) + night lamps registered with the map's night system ===== */
const BLD_BAND_COLORS = [0x8a8f96, 0xc98a4b, 0xcfd6dd, 0xffd24b, 0x38e1c6];
function buildingBand(level: number): number { return level >= 100 ? 4 : level >= 50 ? 3 : level >= 25 ? 2 : level >= 10 ? 1 : 0; }

/** Procedural add-ons grown onto the same GLB per band (local model units,
 *  placed against the model's own bounding box): annexes, tanks, masts,
 *  rooftop plant and — at band 4 — an emissive hi-tech crown + beacon.
 *  Exported for structural probes. The offshore platform (platform=true)
 *  keeps the generic bands 1–2 but gets its own deck-anchored bands 3–4
 *  (QA-VIS §7: the generic sy-anchored crown/mast float above its deck). */
export function buildEvoGroup(band: number, box: THREE.Box3, platform = false): THREE.Group {
  const g = new THREE.Group(); g.name = 'vis-evo';
  if (band <= 0) return g;
  const sx = box.max.x - box.min.x, sy = box.max.y - box.min.y, sz = box.max.z - box.min.z;
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, gy = box.min.y;
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b1a1, roughness: 0.85 });
  const steelM = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.5, metalness: 0.35 });
  const blueM = new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.6 });
  const tealM = new THREE.MeshStandardMaterial({ color: 0x2a9d8f, roughness: 0.6 });
  const bx = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); g.add(mesh); };
  const cy = (r: number, h: number, x: number, y: number, z: number, m: THREE.Material) => { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), m); mesh.position.set(x, y, z); g.add(mesh); };
  // band 1 — early industry: side annex + storage tank
  bx(sx * 0.34, sy * 0.38, sz * 0.5, cx + sx * 0.68, gy + sy * 0.19, cz, concrete);
  cy(Math.min(sx, sz) * 0.13, sy * 0.5, cx - sx * 0.68, gy + sy * 0.25, cz + sz * 0.18, steelM);
  if (band >= 2) { // second annex + comms mast
    bx(sx * 0.3, sy * 0.3, sz * 0.42, cx - sx * 0.66, gy + sy * 0.15, cz - sz * 0.3, blueM);
    cy(0.02 * sx + 0.05, sy * 0.95, cx + sx * 0.3, gy + sy * 0.47, cz - sz * 0.32, steelM);
  }
  if (band >= 3) { // rooftop plant + second tank
    if (platform) {
      // QA-VIS §7: platform.glb's bbox spans legs below and a derrick far
      // above its deck plate (deck top ≈ gy + 0.36·sy), so sy-anchored
      // pieces float in mid-air as plates/columns. Platform annexes sit ON
      // the deck and stay low and wide: equipment skid, helipad, deck tank.
      const deckY = gy + sy * 0.36;
      bx(sx * 0.26, sy * 0.10, sz * 0.20, cx - sx * 0.02, deckY + sy * 0.05, cz - sz * 0.28, concrete);
      cy(Math.min(sx, sz) * 0.17, sy * 0.03, cx + sx * 0.30, deckY + sy * 0.015, cz - sz * 0.02, tealM);
      cy(Math.min(sx, sz) * 0.10, sy * 0.16, cx + sx * 0.34, deckY + sy * 0.08, cz + sz * 0.10, steelM);
    } else {
      bx(sx * 0.52, sy * 0.2, sz * 0.52, cx, gy + sy * 1.1, cz, tealM);
      cy(Math.min(sx, sz) * 0.11, sy * 0.42, cx + sx * 0.62, gy + sy * 0.21, cz + sz * 0.34, steelM);
    }
  }
  if (band >= 4) { // hi-tech crown: emissive trim + beacon mast
    if (platform) {
      // QA-VIS §7: no full-height emissive trim plate and no standard beacon
      // mast on the platform — a slim deck derrick with a crane jib and a
      // small beacon keeps the hi-tech read at platform scale, on the deck.
      const deckY = gy + sy * 0.36;
      const mastH = Math.min(sx, sz) * 0.42;
      const mastX = cx + sx * 0.16, mastZ = cz - sz * 0.245;
      cy(0.02 * sx + 0.03, mastH, mastX, deckY + mastH / 2, mastZ, steelM);
      bx(sx * 0.30, sy * 0.03, sz * 0.045, mastX + sx * 0.13, deckY + mastH - sy * 0.02, mastZ, steelM);
      bx(sx * 0.20, sy * 0.08, sz * 0.20, cx + sx * 0.28, deckY + sy * 0.04, cz - sz * 0.30, blueM);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(Math.min(sx, sz) * 0.04 + 0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0x38e1c6 }));
      beacon.position.set(mastX, deckY + mastH + Math.min(sx, sz) * 0.04 + 0.05, mastZ); g.add(beacon);
    } else {
      bx(sx * 0.6, sy * 0.05, sz * 0.6, cx, gy + sy * 1.22, cz, new THREE.MeshBasicMaterial({ color: 0x38e1c6 }));
      cy(0.02 * sx + 0.05, sy * 0.7, cx - sx * 0.3, gy + sy * 1.35, cz + sz * 0.3, steelM);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(Math.min(sx, sz) * 0.06 + 0.04, 10, 8), new THREE.MeshBasicMaterial({ color: 0x38e1c6 }));
      beacon.position.set(cx - sx * 0.3, gy + sy * 1.74, cz + sz * 0.3); g.add(beacon);
    }
  }
  return g;
}

let _lampTex: THREE.Texture | null = null;
function lampTexture(): THREE.Texture {
  if (_lampTex) return _lampTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,225,160,1)'); g.addColorStop(0.35, 'rgba(255,190,90,0.55)'); g.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  _lampTex = new THREE.CanvasTexture(c);
  return _lampTex;
}

export class GameSync3D {
  private map: MapLike; private cb: SyncCallbacks;
  private root = new THREE.Group();
  private statics = new THREE.Group();
  private dyn = new THREE.Group();
  static { /* names set in ctor for debugging */ }
  private curves: Record<LaneName, THREE.CatmullRomCurve3>;
  private laneCache: Record<LaneName, { pts: THREE.Vector3[]; tans: THREE.Vector3[] }>;
  private lanePosTmp = new THREE.Vector3();
  private laneTanTmp = new THREE.Vector3();
  private lastDensity = -1;
  private towers = new Map<number, { url: string; obj: THREE.Object3D; born: number; base: number }>();
  private buildings = new Map<string, BldRec>();
  private towerMarks = new Map<number, { grp: THREE.Group; jam: THREE.Sprite; stun: THREE.Sprite }>();
  private enemyRibbonMat: THREE.LineDashedMaterial | null = null;
  private wavePulseAt = -1e9;
  private buildingActive: Record<string, boolean> = {};
  private platforms = new Map<number, THREE.Object3D>();
  private pads = new Map<number, THREE.Object3D>();
  // PERF: selection/target rings are two persistent meshes whose geometries
  // come from a small bounded cache (keyed by rounded radius). Previously every
  // setState (8x/s) built a new RingGeometry + MeshBasicMaterial and dropped
  // the old ones undisposed — a steady GPU-memory/GC leak.
  private rangeRingMesh: THREE.Mesh | null = null;
  private padRingMats = { open: new THREE.MeshBasicMaterial({ color: 0x53d769, transparent: true, opacity: 0.8, side: THREE.DoubleSide }), locked: new THREE.MeshBasicMaterial({ color: 0x8a8f96, transparent: true, opacity: 0.35, side: THREE.DoubleSide }) };
  private targetRingMesh: THREE.Mesh | null = null;
  private ringGeoCache = new Map<string, THREE.BufferGeometry>();
  private ringMatRange = new THREE.MeshBasicMaterial({ color: 0x7ac8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  private ringMatTarget = new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  private rangeRingNextMesh: THREE.Mesh | null = null;
  private ringMatNext = new THREE.MeshBasicMaterial({ color: 0x7ac8ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  private ringMatCurrent = new THREE.MeshBasicMaterial({ color: 0x51e88a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  private ents = new Map<string, Ent>();
  private aim = new Map<number, number>();
  private fx = new BattleFX();
  private lastSetStateAt = 0;
  private targetStep = 5;
  private emaMs = 16;
  private dprSteps: number[] = DPR_STEPS;
  private dprIdx = 0;
  private dprEvalAt = 0;
  /* PERF2 (D-020) ladder state: fps is measured from the renderer's own
   * rendered-frame counter between evaluation windows (dprLastFrame /
   * dprLastEvalAt), and a step-up needs dprUpStreak >= 2 consecutive fast
   * windows — the anti-oscillation hysteresis around the thermal ceiling. */
  private dprLastFrame = -1;
  private dprLastEvalAt = 0;
  private dprUpStreak = 0;
  private renderFps = 0;
  private towerAnims = new Map<number, TowerAnim>();
  private genericAnims = new Map<string, AnimNode[]>();
  private animTmp = new THREE.Vector3();
  private animTmp2 = new THREE.Vector3();
  private targets = new Map<string, { pos: THREE.Vector3; heading: number; y: number }>();
  private dying: { ent: Ent; t: number }[] = [];
  private pulseFx: { mesh: THREE.Mesh; t: number; maxR: number }[] = []; // MECH-A: EMP pulse rings
  private prevFlash = new Map<string, number>();
  private prevHp = new Map<string, number>();
  private kenneyRev = false;
  private lastShots: unknown = null;
  /* Camera shake (checklist ۱۳٫۲ — was completely absent, F-9): pack amounts
   * accumulate here, decay at the pack's 1.6/s, capped at the pack's 0.45. */
  shake = 0;
  /* 3D popup renderer (PRD §۸٫۳): floating numbers for crits, heavy missiles
   * and bounty/money ONLY — never for ordinary shots. */
  readonly popupSprites = new Map<number, PopupSprite>();
  private popupFree: PopupSprite[] = [];
  private popupSeq = -1;
  private seenPopups = new Set<number>();
  private prevCooldowns: Record<string, number> | null = null;
  private prevHearts: number | null = null;
  private entKinds = new Map<string, string>();
  /* MECH-B: enemy-missile render section state (own pool, own event cursor) */
  private eMissiles = new Map<number, THREE.Group>();
  private eMissileTrailAt = new Map<number, number>();
  private lastEvents: unknown = null;
  /* Shot/impact telemetry (fix program): window.__telemetry READS the
   * logic-side counters (GameState.fireStats — shots counted at fire time,
   * hits/fizzled resolved by the impact phase in game.ts) instead of
   * reconstructing them from render records with a wall-clock simulation
   * (QA جزئی-۲: the old simulation counted void shots as impacts, let
   * pirate-engagement records inflate tower counters, and silently dropped
   * whole ticks whenever the frame rate fell below the tick rate).
   * reset() is offset-based: it snapshots the cumulative counters and the
   * maps report deltas from that snapshot — logic state is never mutated. */
  private telemetry: { shots: Record<string, number>; impacts: Record<string, number>; fizzled: Record<string, number>; reset: () => void };
  private teleOffset: Record<string, { shots: number; hits: number; fizzled: number }> = {};
  private state: GameState | null = null;
  private placing = new Set<string>();
  private reconciling = false;
  private reconcileDirty = false;
  private selectedSlot: number | null = null;
  private targeting: string | null = null;
  private raf = 0; private alive = true; private last = performance.now();
  private ray = new THREE.Raycaster();
  private downPos: { x: number; y: number; t: number } | null = null;
  private detachFns: (() => void)[] = [];

  constructor(map: MapLike, cb: SyncCallbacks) {
    this.map = map; this.cb = cb;
    for (const n of ['enemy', 'trade', 'slots', 'ships', 'zones'] as const) { try { map.setLayer(n, false); } catch { /* layer may not exist */ } }
    this.root.name = 'gamesync-root'; this.statics.name = 'gamesync-statics'; this.dyn.name = 'gamesync-dyn';
    map.scene.add(this.root); this.root.add(this.statics); this.root.add(this.dyn); this.dyn.add(this.fx.group);
    // cheaper shadow filtering (PCF instead of PCFSoft) — same look at game scale, less GPU
    try { (map as unknown as { renderer?: THREE.WebGLRenderer }).renderer!.shadowMap.type = THREE.PCFShadowMap; } catch { /* noop */ }
    this.curves = Object.fromEntries((Object.keys(LANES) as LaneName[]).map(n => [n, new THREE.CatmullRomCurve3(LANES[n].map(([x, z]) => new THREE.Vector3(x, 0.35, z)), false, 'centripetal')])) as Record<LaneName, THREE.CatmullRomCurve3>;
    // PERF: sample every lane's points + tangents ONCE into a fixed-resolution
    // cache. setTarget used to call curve.getPointAt/getTangentAt (arc-length
    // reparam each call) for every entity on every frame.
    this.laneCache = Object.fromEntries((Object.keys(LANES) as LaneName[]).map(n => {
      const pts: THREE.Vector3[] = []; const tans: THREE.Vector3[] = [];
      for (let i = 0; i <= LANE_SAMPLES; i++) { pts.push(this.curves[n].getPointAt(i / LANE_SAMPLES)); tans.push(this.curves[n].getTangentAt(i / LANE_SAMPLES)); }
      return [n, { pts, tans }];
    })) as Record<LaneName, { pts: THREE.Vector3[]; tans: THREE.Vector3[] }>;
    // PERF (§16.3) built the ladder AROUND the device cap — [cap, ...steps
    // below it] — so the ratios the ladder can select always match what the
    // renderer can actually run; PERF2 (D-020) keeps that construction and
    // changes only WHERE the ladder starts on touch (see inside).
    { const cap = this.dprCap();
      if (cap <= 1.5) {
        // PERF2 (D-020): the touch ladder STARTS at DPR 1.25, one step below
        // the cap — v0.5.0 started at idx 0 (= the 1.5 cap) and its ladder
        // stepped UP at fps>57, so the phone rendered at maximum pixels
        // from the first frame until thermal throttling (audit2 team 1).
        // 1.5 remains reachable: tuneResolution earns it back only after
        // two consecutive windows above 58 rendered fps. The renderer's
        // own start ratio follows the ladder's start step.
        this.dprSteps = [cap, ...[1.25, 1.1, 1].filter(s => s < cap - 1e-6)];
        this.dprIdx = this.dprSteps.length > 1 ? 1 : 0;
        const r = (map as unknown as { renderer?: THREE.WebGLRenderer }).renderer;
        try { r?.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprSteps[this.dprIdx], cap)); } catch { /* noop */ }
      } else {
        this.dprSteps = [cap, ...DPR_STEPS.filter(s => s < cap - 1e-6)]; this.dprIdx = 0;
      } }
    // lane ribbons (subtle, only enemy + trade)
    // lane ribbons (subtle, only enemy + trade). The enemy route is the PRD
    // §2.3 dashed red line: dim at rest, bright pulse for a few seconds when
    // a wave starts (phase transition observed in setState).
    for (const n of ['enemy', 'trade'] as LaneName[]) {
      const pts = LANES[n].map(([x, z]) => new THREE.Vector3(x, 0.3, z));
      const mat = n === 'enemy'
        ? new THREE.LineDashedMaterial({ color: 0xff5040, transparent: true, opacity: 0.28, dashSize: 3.4, gapSize: 2.4 })
        : new THREE.LineBasicMaterial({ color: 0x53d769, transparent: true, opacity: 0.28 });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
      if (n === 'enemy') { line.computeLineDistances(); this.enemyRibbonMat = mat as THREE.LineDashedMaterial; }
      this.statics.add(line);
      this.freezeStatic(line, false);
    }
    // per-slot tower aim: barrel (+Z native) toward nearest point of the enemy lane
    {
      const samples = this.laneCache.enemy.pts;
      for (const sl of SLOTS) {
        let best: THREE.Vector3 | null = null; let bd = Infinity;
        for (const p of samples) { const d = (p.x - sl.x) ** 2 + (p.z - sl.z) ** 2; if (d < bd) { bd = d; best = p; } }
        if (best) this.aim.set(sl.id, Math.atan2(best.x - sl.x, best.z - sl.z));
      }
    }
    this.telemetry = {
      shots: {}, impacts: {}, fizzled: {},
      reset: () => {
        this.teleOffset = {};
        const fs = this.state?.fireStats ?? {};
        for (const k of Object.keys(fs)) { const v = fs[k]; this.teleOffset[k] = { shots: v?.shots ?? 0, hits: v?.hits ?? 0, fizzled: v?.fizzled ?? 0 }; }
        for (const m of [this.telemetry.shots, this.telemetry.impacts, this.telemetry.fizzled]) for (const k of Object.keys(m)) delete m[k];
      },
    };
    (window as unknown as { __telemetry?: unknown }).__telemetry = this.telemetry;
    this.bindPointer();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  /* PERF2 (D-020): release one pooled popup's GPU resources. Pool members
   * are REUSED across battles (bounded at 28 sprites), so this runs only
   * when a sprite leaves the pool for good — teardown — and guarantees its
   * 384×112 canvas texture + material do not stay resident on the GPU. */
  private disposePopup(ps: PopupSprite) {
    try { this.dyn.remove(ps.sp); } catch { /* already detached */ }
    ps.tex.dispose();
    ps.mat.dispose();
  }

  dispose() {
    this.alive = false; cancelAnimationFrame(this.raf);
    // PERF2 (D-020): drain the popup pool with real GPU disposal — v0.5.0
    // never disposed a single popup texture (audit2 team 1: the pool grew
    // to its 28-sprite cap in the first battles and every texture upload
    // stayed resident for the whole session).
    for (const ps of this.popupSprites.values()) this.disposePopup(ps);
    this.popupSprites.clear();
    for (const ps of this.popupFree) this.disposePopup(ps);
    this.popupFree = [];
    this.detachFns.forEach(f => f());
    this.map.scene.remove(this.root);
  }

  /** Which production buildings are actually working this tick — drives the
   *  chimney-smoke gate (checklist §12.2: smoke stops when production stops:
   *  full tank / zero fuel / missing inputs / capped output). */
  private computeBuildingActive(game: GameState) {
    const stats = getStats(game);
    const fuelCap = game.research.includes('reserve') ? 3000 : 2500;
    this.buildingActive = {
      oil: stats.oilCapacity > 0 && game.oil < stats.oilCapacity,
      refinery: game.oil > 0 && game.fuel < fuelCap,
      power: game.fuel > 0,
      steel: game.oil > 0 && game.fuel > 0 && game.steel < 2000,
      arms: game.fuel > 0 && game.steel > 0 && game.ammo < 5000,
    };
  }

  /** Warm lamp glows flagged userData.night so the map's night system
   *  (register() -> nightObjs) switches them on at night. Positions are in
   *  model-local units against the model's own bounding box. */
  private attachNightLamps(model: THREE.Object3D, localBox: THREE.Box3, baseScale: number, count: number) {
    const sx = localBox.max.x - localBox.min.x, sy = localBox.max.y - localBox.min.y, sz = localBox.max.z - localBox.min.z;
    const spots: [number, number, number][] = count >= 2
      ? [[localBox.min.x + sx * 0.22, localBox.min.y + sy * 0.85, localBox.min.z + sz * 0.22],
         [localBox.min.x + sx * 0.78, localBox.min.y + sy * 0.85, localBox.min.z + sz * 0.78]]
      : [[(localBox.min.x + localBox.max.x) / 2, localBox.max.y + sy * 0.05, (localBox.min.z + localBox.max.z) / 2]];
    for (const [x, y, z] of spots) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: lampTexture(), color: 0xffca7a, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.set(x, y, z);
      const w = 2.6 / Math.max(baseScale, 0.001); s.scale.set(w, w, 1);
      s.userData.night = true;
      model.add(s);
    }
  }

  private registerModel(model: THREE.Object3D) { try { this.map.register?.(model); } catch { /* map without a night registry */ } }
  private unregisterModel(model: THREE.Object3D) { try { this.map.unregister?.(model); } catch { /* noop */ } }

  private dropTowerMarks(slot: number) {
    const mk = this.towerMarks.get(slot);
    if (mk) { this.statics.remove(mk.grp); this.towerMarks.delete(slot); }
  }

  /** Refresh window.__telemetry from the logic counters (see the telemetry
   *  field note): maps hold per-modelKind deltas since the last reset(). */
  private syncTelemetry(game: GameState) {
    const fs = game.fireStats ?? {};
    const write = (map: Record<string, number>, field: "shots" | "hits" | "fizzled") => {
      for (const k of Object.keys(fs)) {
        const v = Math.max(0, (fs[k]?.[field] ?? 0) - (this.teleOffset[k]?.[field] ?? 0));
        if (v > 0) map[k] = v; else delete map[k];
      }
      for (const k of Object.keys(map)) if (!(k in fs)) delete map[k];
    };
    write(this.telemetry.shots, "shots");
    write(this.telemetry.impacts, "hits");
    write(this.telemetry.fizzled, "fizzled");
  }

  setState(game: GameState, opts: { selectedSlot: number | null; targeting: string | null; targetPreview: { x: number; y: number } }) {
    // wave-start signal for the enemy-route ribbon pulse: the phase edge
    // into battle (peace/intermission -> battle) is the wave launch moment.
    if (this.state && this.state.phase !== 'battle' && game.phase === 'battle') this.wavePulseAt = performance.now();
    this.state = game; this.selectedSlot = opts.selectedSlot; this.targeting = opts.targeting;
    this.syncTelemetry(game);
    this.consumePopups(game);
    this.detectStateEvents(game);
    this.computeBuildingActive(game);
    // movement stability: cap how far a target may move per state update (~22 u/s) so a
    // hitched tick can no longer teleport ships — they sail fast instead of streaking.
    const nowS = performance.now();
    this.targetStep = Math.max(0.05, Math.min(5, 22 * (nowS - this.lastSetStateAt) / 1000));
    this.lastSetStateAt = nowS;
    // PERF (§16.6): tell the map how dense the battle is so it can hide minor
    // labels in heavy fights (>12 live enemies).
    const dens = game.enemies.length;
    if (dens !== this.lastDensity) { this.lastDensity = dens; try { this.map.setBattleDensity?.(dens); } catch { /* noop */ } }
    this.reconcileStatics(game);
    this.updateSelectionVisuals(game, opts.targetPreview);
  }

  private sound(kind: BattleSound) {
    try { this.cb.onSound?.(kind); } catch { /* audio is best-effort */ }
  }

  /** Popup stream consumption. The logic curates which popups exist, but the
   *  3D renderer never consumed them (audit: the 3D battle was numberless).
   *  Rendering follows PRD §۸٫۳ — crits and money gains float; the 💥 marker
   *  becomes the strike's ballistic FX instead of a floating emoji, and the
   *  combo marker only plays its sound (the HUD badge already shows it). */
  private consumePopups(game: GameState) {
    for (const p of game.popups) {
      if (this.seenPopups.has(p.id)) continue;
      this.seenPopups.add(p.id);
      if (p.text === '💥') { this.strikeFx(p.x, p.y); continue; }
      if (p.text.startsWith('🔥')) { this.sound('combo'); continue; }
      if (p.text.startsWith('✸')) { this.sound('crit'); this.spawnPopup(p.x, p.y, p.text, '#ffb340', Math.max(0.7, p.life)); continue; }
      if (/^\+[0-9۰-۹]/.test(p.text)) this.spawnPopup(p.x, p.y, p.text, '#7be495', Math.max(0.7, p.life));
    }
    if (this.seenPopups.size > 400) this.seenPopups = new Set(game.popups.map(q => q.id));
  }

  /** State transitions the renderer owns: spell casts (EMP rings, overdrive
   *  sound) and heart leaks (alarm, checklist ۱۳٫۳). */
  private detectStateEvents(game: GameState) {
    const pc = this.prevCooldowns;
    if (pc) {
      if ((pc.emp ?? 0) < 85 && game.cooldowns.emp >= 85) this.empFx();
      if ((pc.overdrive ?? 0) < 115 && game.cooldowns.overdrive >= 115) this.sound('overdrive');
    }
    this.prevCooldowns = { ...game.cooldowns };
    if (this.prevHearts !== null && game.hearts < this.prevHearts) this.sound('alarm');
    this.prevHearts = game.hearts;
  }

  /** EMP spell (checklist §۵): three expanding rings from the map center. */
  private empFx() {
    this.sound('emp');
    const [cx, cz] = pctTo3d(50, 50);
    const center = new THREE.Vector3(cx, 0.5, cz);
    for (let i = 0; i < 3; i++) {
      this.fx.schedule(i * 0.28, () => this.fx.pulse(center, '#8b5cf6', 150 + i * 45, 1.7));
    }
  }

  /** Strike spell (checklist §۵): eight ballistic missiles staggered 0.1s,
   *  diving from the sky onto the marked point. The logic applies the damage
   *  (through applyDamage); this is its visible delivery. */
  private strikeFx(xPct: number, yPct: number) {
    const [tx, tz] = pctTo3d(xPct, yPct);
    for (let i = 0; i < 8; i++) {
      this.fx.schedule(i * 0.1, () => {
        const from = new THREE.Vector3(tx - 30 + i * 2.2, 52, tz - 12 + (i % 3) * 3);
        const to = new THREE.Vector3(tx + (Math.random() - 0.5) * 7, 0.4, tz + (Math.random() - 0.5) * 7);
        this.fx.shoot({ from, to, kind: 'missile', color: '#ffb347', dur: 0.8, arc: -4, size: 1.25, onArrive: () => { this.sound('explosion'); if (i === 0) this.addShake(0.12, to); } });
        this.sound('launch');
      });
    }
  }

  private spawnPopup(xPct: number, yPct: number, text: string, color: string, dur: number) {
    const [wx, wz] = pctTo3d(xPct, yPct);
    this.spawnPopupWorld(wx, wz, text, color, dur);
  }

  private spawnPopupWorld(wx: number, wz: number, text: string, color: string, dur: number) {
    let ps = this.popupFree.pop();
    if (!ps) {
      if (this.popupSprites.size >= 28) return; // hard cap — busiest frames stay bounded
      const cv = document.createElement('canvas'); cv.width = 384; cv.height = 112;
      const tex = new THREE.CanvasTexture(cv);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sp = new THREE.Sprite(mat); sp.renderOrder = 40;
      ps = { sp, mat, tex, cv, age: 0, dur: 1, wx: 0, wz: 0, baseY: 6, w: 12 };
      this.dyn.add(sp);
    }
    const ctx = ps.cv.getContext('2d')!;
    ctx.clearRect(0, 0, ps.cv.width, ps.cv.height);
    ctx.font = '800 52px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(4,16,26,0.88)';
    ctx.strokeText(text, 192, 56); ctx.fillStyle = color; ctx.fillText(text, 192, 56);
    ps.tex.needsUpdate = true;
    ps.age = 0; ps.dur = dur; ps.wx = wx; ps.wz = wz; ps.baseY = 6.5;
    ps.w = Math.min(26, 8 + text.length * 2.1);
    ps.sp.position.set(wx, ps.baseY, wz);
    ps.sp.scale.set(ps.w, ps.w * (112 / 384), 1);
    ps.sp.visible = true;
    this.popupSprites.set(this.popupSeq--, ps);
  }

  private updatePopups(dt: number) {
    if (!this.popupSprites.size) return;
    const speed = this.state?.speed ?? 1;
    for (const [id, ps] of [...this.popupSprites]) {
      ps.age += dt * speed;
      if (ps.age >= ps.dur) { ps.sp.visible = false; this.popupSprites.delete(id); this.popupFree.push(ps); continue; }
      const k = ps.age / ps.dur;
      ps.sp.position.y = ps.baseY + ps.age * 3.4;
      ps.mat.opacity = ps.age < 0.1 ? ps.age / 0.1 : 1 - Math.max(0, (k - 0.55) / 0.45);
      const pop = 0.72 + 0.28 * easeOutBack(Math.min(1, ps.age / 0.18));
      ps.sp.scale.set(ps.w * pop, ps.w * (112 / 384) * pop, 1);
    }
  }

  /** Pack camera shake (checklist ۱۳٫۲): amounts are the pack's fire-callback
   *  values, attenuated by the camera's distance from the shot, disabled
   *  under reduce-motion. Applied to the world root — the same group-jitter
   *  pattern as the pack's Stage (Stage.tsx). */
  private addShake(amount: number, at?: THREE.Vector3) {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let att = 1;
    if (at) { const d = this.map.camera.position.distanceTo(at); att = Math.max(0.2, Math.min(1, 130 / Math.max(60, d))); }
    this.shake = Math.min(0.45, this.shake + amount * att);
  }

  private applyShake(dt: number) {
    if (this.shake > 0.002) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      const camD = Math.max(60, this.map.camera.position.distanceTo(CENTER3D));
      const a = this.shake * camD * 0.03;
      this.root.position.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a * 0.55, (Math.random() - 0.5) * a * 0.7);
    } else if (this.root.position.x !== 0 || this.root.position.y !== 0 || this.root.position.z !== 0) {
      this.root.position.set(0, 0, 0);
    }
  }

  /** PRD §2.2 visual evolution: stepped scale growth + procedural add-ons on
   *  the same GLB + a base ring tinted by band (grey/bronze/silver/gold/teal). */
  private applyBuildingBand(rec: BldRec, band: number) {
    rec.band = band;
    const m = 1 + band * 0.1;
    rec.obj.scale.setScalar(rec.baseScale * m);
    rec.obj.position.y = rec.groundBase - rec.minY * m;
    const old = rec.obj.getObjectByName('vis-evo');
    if (old) rec.obj.remove(old);
    if (band > 0) rec.obj.add(buildEvoGroup(band, rec.local, rec.platform));
    (rec.ring.material as THREE.MeshBasicMaterial).color.setHex(BLD_BAND_COLORS[band]);
    rec.ring.scale.setScalar(rec.ringBase * (1 + band * 0.08));
  }

  /* PERF2 (D-020): placed statics (tower/building/platform models, pads,
   * tower marks, lane ribbons) never move after placement, but three.js
   * recomposed their world matrices on every frame (~3,000 scene objects —
   * audit2 team 1). Freeze each placed subtree once, at placement: compose
   * every node's local matrix from its final transform and switch off
   * per-frame recomposition. Two exclusions, both deliberate:
   *  - the placed ROOT when keepRootLive: the tower placement pop (380ms)
   *    and the building band evolution both animate the root transform;
   *    descendants are unaffected (their locals are static).
   *  - every `anim*` subtree, root and descendants alike: the pack's
   *    animation nodes (yaw/pitch/recoil/idle — names arrive from the GLB
   *    raw `anim:…` or sanitized `anim…`) belong to ANIM's runtime, which
   *    also animates some of their CHILDREN by captured reference
   *    (anim:mines children, anim:trolley hook), so the whole subtree
   *    stays live. */
  private freezeStatic(root: THREE.Object3D, keepRootLive: boolean) {
    const walk = (o: THREE.Object3D, isRoot: boolean) => {
      if (o.name && o.name.startsWith('anim')) return;
      if (!(isRoot && keepRootLive)) { o.updateMatrix(); o.matrixAutoUpdate = false; }
      for (const c of o.children) walk(c, false);
    };
    walk(root, true);
  }

  private towerUrl(t: GameState['towers'][number]): string {
    if (t.branch !== null && t.branch !== undefined) return `/models/towers/${BRANCH_MODEL[t.kind][t.branch]}-L100.glb`;
    return `/models/towers/${TOWER_MODEL[t.kind]}-L${[1, 25, 50, 75][Math.max(0, Math.min(3, t.tier - 1))]}.glb`;
  }

  private async reconcileStatics(game: GameState) {
    if (this.reconciling) { this.reconcileDirty = true; return; }
    this.reconciling = true;
    try { await this.reconcileStaticsInner(game); }
    finally {
      this.reconciling = false;
      if (this.reconcileDirty) { this.reconcileDirty = false; void this.reconcileStatics(this.state ?? game); }
    }
  }

  private async reconcileStaticsInner(game: GameState) {
    // towers (parallel loads)
    const seen = new Set<number>();
    await Promise.all(game.towers.map(async t => {
      seen.add(t.slot);
      const url = this.towerUrl(t);
      const cur = this.towers.get(t.slot);
      if (cur && cur.url === url) return;
      if (this.placing.has('tower-' + t.slot)) return;
      this.placing.add('tower-' + t.slot);
      try {
        if (cur) { this.unregisterModel(cur.obj); this.statics.remove(cur.obj); this.towers.delete(t.slot); this.towerAnims.delete(t.slot); this.dropTowerMarks(t.slot); }
        const slot = SLOTS.find(s => s.id === t.slot); if (!slot) return;
        const model = await loadModel(url);
        model.traverse(o => { o.userData.pick = { type: 'slot', id: t.slot }; });
        const fit = new THREE.Box3().setFromObject(model); const size = new THREE.Vector3(); fit.getSize(size);
        const baseScale = 5.2 / Math.max(size.x, size.z, 0.001);
        model.scale.setScalar(baseScale);
        const fit2 = new THREE.Box3().setFromObject(model);
        model.position.set(slot.x, groundY(this.map, slot.x, slot.z) - fit2.min.y, slot.z);
        model.rotation.y = this.aim.get(t.slot) ?? Math.PI;
        this.attachNightLamps(model, fit, baseScale, 1);
        this.statics.add(model);
        this.towers.set(t.slot, { url, obj: model, born: performance.now(), base: baseScale });
        this.bindTowerAnim(t.slot, url, model);
        this.registerModel(model);
        this.freezeStatic(model, true); // root stays live: placement pop animates its scale
        // status marks above the tower: jammed (boss-4) / disabled (boss-2 stun)
        const marks = new THREE.Group();
        const jam = glyphSprite('✕', '#c07aff', 2.6); jam.position.set(-1.7, 0, 0); jam.visible = false;
        const stun = glyphSprite('✸', '#ffd24b', 2.6); stun.position.set(1.7, 0, 0); stun.visible = false;
        marks.add(jam); marks.add(stun);
        marks.position.set(slot.x, groundY(this.map, slot.x, slot.z) + (fit2.max.y - fit2.min.y) + 2.8, slot.z);
        this.statics.add(marks);
        this.freezeStatic(marks, false); // children only toggle visibility (jam/stun)
        this.towerMarks.set(t.slot, { grp: marks, jam, stun });
        this.removePad(t.slot);
      } finally { this.placing.delete('tower-' + t.slot); }
    }));
    for (const [slotId, rec] of [...this.towers]) if (!seen.has(slotId)) { this.unregisterModel(rec.obj); this.statics.remove(rec.obj); this.towers.delete(slotId); this.towerAnims.delete(slotId); this.dropTowerMarks(slotId); }
    // slot pads
    for (const slot of SLOTS) {
      if (this.towers.has(slot.id)) { this.removePad(slot.id); continue; }
      const locked = !game.islands.includes(slot.island);
      const key = locked ? 'lock' : 'plus';
      const cur = this.pads.get(slot.id);
      if (cur && cur.userData.key === key) continue;
      this.removePad(slot.id);
      const pad = new THREE.Group(); pad.userData.key = key;
      const y = groundY(this.map, slot.x, slot.z);
      const ring = new THREE.Mesh(this.ringGeometry(2.4, 3.1, 40), locked ? this.padRingMats.locked : this.padRingMats.open);
      ring.rotation.x = -Math.PI / 2; ring.position.set(slot.x, y + 0.15, slot.z);
      pad.add(ring);
      const glyph = glyphSprite(locked ? '🔒' : '+', locked ? '#9aa3ad' : '#53d769');
      glyph.position.set(slot.x, y + 2.2, slot.z);
      glyph.traverse(o => { o.userData.pick = { type: 'slot', id: slot.id }; });
      ring.userData.pick = { type: 'slot', id: slot.id };
      pad.add(glyph);
      pad.userData.pickRing = ring;
      this.statics.add(pad); this.pads.set(slot.id, pad);
      this.freezeStatic(pad, false);
    }
    // buildings (level > 0, parallel loads) — each at its real island/coast
    // position from buildings-3d.json (audit جدید-۵: no longer one decorative
    // cluster), evolving through the five PRD §2.2 bands as it levels up.
    await Promise.all(Object.entries(BUILDINGS).map(async ([id, b]) => {
      const level = (game.buildings as Record<string, number>)[id] ?? 0;
      const rec = this.buildings.get(id);
      if (level > 0 && !rec) {
        if (this.placing.has('bld-' + id)) return;
        this.placing.add('bld-' + id);
        try {
          const model = await loadModel(`/models/buildings/${b.glb}.glb`);
          model.traverse(o => { o.userData.pick = { type: 'building', id }; });
          const fit = new THREE.Box3().setFromObject(model); const size = new THREE.Vector3(); fit.getSize(size);
          const baseScale = (b.glb === 'platform' ? 13 : 9.5) / Math.max(size.x, size.z, 0.001);
          model.scale.setScalar(baseScale);
          const fit2 = new THREE.Box3().setFromObject(model);
          const groundBase = b.water ? 0 : groundY(this.map, b.x, b.z);
          model.position.set(b.x, groundBase - fit2.min.y, b.z);
          this.attachNightLamps(model, fit, baseScale, 2);
          const ringBase = Math.max(size.x, size.z) * baseScale * 0.62;
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.02, 48), new THREE.MeshBasicMaterial({ color: BLD_BAND_COLORS[0], transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
          ring.rotation.x = -Math.PI / 2; ring.position.set(b.x, groundBase + 0.22, b.z); ring.scale.setScalar(ringBase);
          this.statics.add(model); this.statics.add(ring);
          const nrec: BldRec = { obj: model, band: -1, baseScale, groundBase, minY: fit2.min.y, local: fit.clone(), ring, ringBase, platform: b.glb === 'platform' };
          this.buildings.set(id, nrec);
          this.applyBuildingBand(nrec, buildingBand(level));
          this.genericAnims.set('bld-' + id, collectAnims(model, id).generic);
          this.registerModel(model);
          this.freezeStatic(model, true); // root stays live: band evolution rescales/repositions it
        } finally { this.placing.delete('bld-' + id); }
      } else if (level > 0 && rec) {
        const band = buildingBand(level);
        if (band !== rec.band) this.applyBuildingBand(rec, band);
      } else if (level <= 0 && rec) {
        this.unregisterModel(rec.obj);
        this.statics.remove(rec.obj); this.statics.remove(rec.ring); this.buildings.delete(id); this.genericAnims.delete('bld-' + id);
      }
    }));
    // platforms (parallel loads)
    const built = new Set(game.idle.platforms ?? []);
    await Promise.all(PLATFORMS.map(async p => {
      const has = this.platforms.has(p.id);
      if (built.has(p.id) && !has) {
        if (this.placing.has('plat-' + p.id)) return;
        this.placing.add('plat-' + p.id);
        try {
          const model = await loadModel('/models/buildings/platform.glb');
          const fit = new THREE.Box3().setFromObject(model); const size = new THREE.Vector3(); fit.getSize(size);
          const pScale = 12 / Math.max(size.x, size.z, 0.001);
          model.scale.setScalar(pScale);
          const fit2 = new THREE.Box3().setFromObject(model);
          model.position.set(p.x, -fit2.min.y, p.z);
          this.attachNightLamps(model, fit, pScale, 1);
          this.statics.add(model); this.platforms.set(p.id, model); this.genericAnims.set('plat-' + p.id, collectAnims(model, 'plat' + p.id).generic);
          this.registerModel(model);
          this.freezeStatic(model, true);
        } finally { this.placing.delete('plat-' + p.id); }
        if (this.pads.has(-100 - p.id)) { this.statics.remove(this.pads.get(-100 - p.id)!); this.pads.delete(-100 - p.id); }
      } else if (!built.has(p.id) && !has && !this.pads.has(-100 - p.id)) {
        const glyph = glyphSprite('+', '#ffb340', 3.8);
        glyph.position.set(p.x, 2.6, p.z);
        glyph.userData.pick = { type: 'platform', id: p.id };
        const grp = new THREE.Group(); grp.add(glyph);
        this.statics.add(grp); this.pads.set(-100 - p.id, grp);
        this.freezeStatic(grp, false);
      }
    }));
  }

  private removePad(slotId: number) {
    const pad = this.pads.get(slotId);
    if (pad) { this.statics.remove(pad); this.pads.delete(slotId); }
  }

  private ringGeometry(rIn: number, rOut: number, seg: number): THREE.BufferGeometry {
    const key = `${Math.round(rIn * 2)}:${Math.round(rOut * 2)}:${seg}`;
    let g = this.ringGeoCache.get(key);
    if (!g) {
      if (this.ringGeoCache.size >= 12) {
        const first = this.ringGeoCache.entries().next().value as [string, THREE.BufferGeometry];
        first[1].dispose(); this.ringGeoCache.delete(first[0]);
      }
      g = new THREE.RingGeometry(rIn, rOut, seg);
      this.ringGeoCache.set(key, g);
    }
    return g;
  }

  private updateSelectionVisuals(game: GameState, targetPreview: { x: number; y: number }) {
    // range ring (pooled mesh + shared material + cached geometry)
    let rangeShown = false;
    if (this.selectedSlot !== null) {
      const slot = SLOTS.find(s => s.id === this.selectedSlot);
      const tower = game.towers.find(t => t.slot === this.selectedSlot);
      if (slot) {
        // PRD §۸٫۲: green ring = current range, blue ring = next level's range.
        const rangePct = tower ? getRange(game, tower) : 17;
        const r = rangePct * 6.58;
        if (!this.rangeRingMesh) {
          this.rangeRingMesh = new THREE.Mesh(this.ringGeometry(r - 1.2, r, 64), this.ringMatCurrent);
          this.rangeRingMesh.rotation.x = -Math.PI / 2;
          this.statics.add(this.rangeRingMesh);
        } else this.rangeRingMesh.geometry = this.ringGeometry(r - 1.2, r, 64);
        this.rangeRingMesh.position.set(slot.x, groundY(this.map, slot.x, slot.z) + 0.4, slot.z);
        this.rangeRingMesh.visible = true;
        rangeShown = true;
        // PRD §۸٫۲ (UI): a placed tower below tier 4 also shows its NEXT
        // level's range ring (blue) beside the current one (green).
        if (tower && tower.tier < 4) {
          const rn = getRange(game, { ...tower, tier: tower.tier + 1 }) * 6.58;
          if (!this.rangeRingNextMesh) {
            this.rangeRingNextMesh = new THREE.Mesh(this.ringGeometry(rn - 1.2, rn, 64), this.ringMatNext);
            this.rangeRingNextMesh.rotation.x = -Math.PI / 2;
            this.statics.add(this.rangeRingNextMesh);
          } else this.rangeRingNextMesh.geometry = this.ringGeometry(rn - 1.2, rn, 64);
          this.rangeRingNextMesh.position.set(slot.x, groundY(this.map, slot.x, slot.z) + 0.4, slot.z);
          this.rangeRingNextMesh.visible = true;
        } else if (this.rangeRingNextMesh) this.rangeRingNextMesh.visible = false;
      }
    }
    if (!rangeShown && this.rangeRingMesh) this.rangeRingMesh.visible = false;
    if (!rangeShown && this.rangeRingNextMesh) this.rangeRingNextMesh.visible = false;
    // strike targeting ring (same pooling)
    if (this.targeting) {
      const [x, z] = pctTo3d(targetPreview.x, targetPreview.y);
      if (!this.targetRingMesh) {
        this.targetRingMesh = new THREE.Mesh(this.ringGeometry(110.2, 111.9, 64), this.ringMatTarget);
        this.targetRingMesh.rotation.x = -Math.PI / 2;
        this.statics.add(this.targetRingMesh);
      } else {
        // the ring must show the strike's real blast radius: 17 percent units
        // ≈ 111.9 world units (the old 9–11 ring understated it ~10x)
        this.targetRingMesh.geometry = this.ringGeometry(110.2, 111.9, 64);
      }
      this.targetRingMesh.position.set(x, 0.5, z);
      this.targetRingMesh.visible = true;
    } else if (this.targetRingMesh) this.targetRingMesh.visible = false;
  }

  /** Screen position (CSS px, viewport coords) of a slot — used by the radial menu. */
  projectSlot(slotId: number): { x: number; y: number } | null {
    const slot = SLOTS.find(x => x.id === slotId);
    const cam = (this.map as unknown as { camera?: THREE.Camera }).camera;
    const el = this.map.renderer?.domElement;
    if (!slot || !cam || !el) return null;
    const v = new THREE.Vector3(slot.x, groundY(this.map, slot.x, slot.z) + 0.3, slot.z).project(cam);
    if (v.z > 1) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  }

  private bindPointer() {
    const el = (this.map as unknown as { canvas?: HTMLCanvasElement }).canvas ?? this.map.renderer?.domElement;
    if (!el) return;
    const down = (e: PointerEvent) => { this.downPos = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    const move = (e: PointerEvent) => {
      if (!this.targeting || e.pointerType === 'touch') return;
      const p = this.groundPoint(e, el); if (p) this.cb.onGroundHover(p[0], p[1]);
    };
    const up = (e: PointerEvent) => {
      const d = this.downPos; this.downPos = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 600) return;
      if (this.targeting) { const p = this.groundPoint(e, el); if (p) this.cb.onGroundPoint(p[0], p[1]); return; }
      const pick = this.pick(e, el);
      if (!pick) return;
      if (pick.type === 'slot') this.cb.onSlot(pick.id as number);
      else if (pick.type === 'building') this.cb.onBuilding(pick.id as string);
      else if (pick.type === 'platform') this.cb.onPlatform(pick.id as number);
      else if (pick.type === 'hero') this.cb.onHero();
      else if (pick.type === 'hero2') this.cb.onHero2();
      else if (pick.type === 'contraband') this.cb.onInspect(pick.id as number);
    };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    this.detachFns.push(() => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); });
  }

  private ndc(e: PointerEvent, el: HTMLElement): THREE.Vector2 {
    const r = el.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  private pick(e: PointerEvent, el: HTMLElement): { type: string; id: number | string } | null {
    this.ray.setFromCamera(this.ndc(e, el), this.map.camera);
    const hits = this.ray.intersectObjects([this.statics, this.dyn], true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) { if (o.userData.pick) return o.userData.pick as { type: string; id: number | string }; o = o.parent; }
    }
    return null;
  }
  private groundPoint(e: PointerEvent, el: HTMLElement): [number, number] | null {
    this.ray.setFromCamera(this.ndc(e, el), this.map.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3);
    const out = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(plane, out)) return null;
    return point3dToPct(out.x, out.z);
  }

  private setTarget(key: string, lane: LaneName, progress: number, y: number, fwd: 'X' | 'Z', flip = false) {
    // PERF: read position/tangent from the fixed-resolution lane cache
    // (sampled once in the constructor), linearly interpolated — no per-frame
    // CatmullRom arc-length evaluation and no per-call Vector3 allocations.
    const cache = this.laneCache[lane];
    const u = Math.max(0, Math.min(1, progress));
    const f = u * LANE_SAMPLES;
    const i0 = Math.min(LANE_SAMPLES - 1, Math.floor(f));
    const fr = f - i0;
    const pos = this.lanePosTmp.copy(cache.pts[i0]).lerp(cache.pts[i0 + 1], fr);
    const tan = this.laneTanTmp.copy(cache.tans[i0]).lerp(cache.tans[i0 + 1], fr);
    const heading = (fwd === 'X' ? Math.atan2(-tan.z, tan.x) : Math.atan2(tan.x, tan.z) + (this.kenneyRev ? Math.PI : 0)) + (flip ? Math.PI : 0);
    const t = this.targets.get(key);
    if (t) {
      const dx = pos.x - t.pos.x, dz = pos.z - t.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > this.targetStep && d > 0) { const k = this.targetStep / d; t.pos.x += dx * k; t.pos.z += dz * k; }
      else { t.pos.x = pos.x; t.pos.z = pos.z; }
      t.pos.y = y; t.heading = heading; t.y = y;
    }
    else this.targets.set(key, { pos: new THREE.Vector3(pos.x, y, pos.z), heading, y });
  }

  private stepMotion(dt: number, now: number) {
    const kp = 1 - Math.exp(-dt * 5.5); const kh = 1 - Math.exp(-dt * 6.5);
    for (const [key, ent] of this.ents) {
      const t = this.targets.get(key); if (!t) continue;
      const o = ent.obj;
      if (!ent.init) { o.position.copy(t.pos); o.rotation.y = t.heading; ent.init = true; }
      else {
        o.position.x += (t.pos.x - o.position.x) * kp;
        o.position.z += (t.pos.z - o.position.z) * kp;
        let dh = t.heading - o.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        o.rotation.y += dh * kh;
      }
      if (ent.bobAmp > 0) {
        o.position.y = t.y + Math.sin(now / 700 + ent.phase) * ent.bobAmp;
        o.rotation.z = Math.sin(now / 900 + ent.phase * 1.7) * 0.022;
        o.rotation.x = Math.sin(now / 810 + ent.phase * 0.6) * 0.012;
      } else o.position.y = t.y;
      if (ent.wake) {
        const dx = t.pos.x - (ent.lastTx ?? t.pos.x), dz = t.pos.z - (ent.lastTz ?? t.pos.z);
        const inst = Math.hypot(dx, dz) / Math.max(dt, 0.001);
        ent.speed = (ent.speed ?? 0) + (inst - (ent.speed ?? 0)) * Math.min(1, dt * 3);
        ent.lastTx = t.pos.x; ent.lastTz = t.pos.z;
        const wm = ((ent.wake as unknown as THREE.Group).children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
        wm.opacity = Math.min(1, (ent.speed ?? 0) / 5) * (0.24 + Math.sin(now / 320 + ent.phase) * 0.05);
      }
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i]; d.t += dt; const k = d.t / 0.95; const o = d.ent.obj;
      o.position.y -= dt * 2.4; o.rotation.z += dt * 0.85;
      d.ent.mats?.forEach(m => { m.opacity = Math.max(0, 1 - k); });
      if (k >= 1) {
        this.dyn.remove(o);
        // PERF: the fade-out material clones made on the death path are unique
        // to this entity — release their GPU programs/textures now instead of
        // leaking one material set per kill for the whole session.
        d.ent.mats?.forEach(m => m.dispose());
        d.ent.mats = undefined;
        this.dying.splice(i, 1);
      }
    }
    for (const [, rec] of this.towers) {
      const age = (now - rec.born) / 380;
      if (age < 1) rec.obj.scale.setScalar(rec.base * (0.55 + 0.45 * easeOutBack(Math.max(0, age))));
      else if (Math.abs(rec.obj.scale.x - rec.base) > 0.0001) rec.obj.scale.setScalar(rec.base);
    }
  }

  private entPending = new Map<string, Promise<Ent | null>>();
  private ensureEnt(key: string, make: () => Promise<THREE.Group> | THREE.Group, opts: { bar?: number; bob?: number; wake?: { len: number; wid: number; fwd: 'X' | 'Z' } } = {}): Promise<Ent | null> {
    const cur = this.ents.get(key);
    if (cur) return Promise.resolve(cur);
    let p = this.entPending.get(key);
    if (!p) {
      p = (async () => {
        const obj = await make();
        if (!this.alive || this.entPending.get(key) !== p) return null; // dropped while loading
        const ent: Ent = { obj, phase: Math.random() * Math.PI * 2, bobAmp: opts.bob ?? 0 };
        if (opts.bar && opts.bar > 0) { ent.bar = barSprites(opts.bar); ent.bar.group.position.y = 3.4; obj.add(ent.bar.group); }
        if (opts.wake) { const w = makeWake(opts.wake.len, opts.wake.wid, opts.wake.fwd); obj.add(w); ent.wake = w; }
        this.dyn.add(obj); this.ents.set(key, ent);
        this.entPending.delete(key);
        return ent;
      })();
      this.entPending.set(key, p);
    }
    return p;
  }
  private dropEnt(key: string) {
    this.entPending.delete(key);
    const ent = this.ents.get(key);
    if (ent) {
      this.dyn.remove(ent.obj);
      // PERF: per-entity owned materials (HP-bar sprites, wake) are created
      // fresh for every entity — dispose them on removal. Model geometries /
      // GLB materials are shared via the model cache and are NOT touched.
      if (ent.bar) {
        (ent.bar.fg.material as THREE.Material).dispose();
        (ent.bar.bg.material as THREE.Material).dispose();
      }
      if (ent.wake) {
        // makeWake builds a fresh PlaneGeometry per entity — dispose it with
        // its material (the wake texture is shared and stays).
        const wmesh = (ent.wake as unknown as THREE.Group).children[0] as THREE.Mesh | undefined;
        (wmesh?.material as THREE.Material | undefined)?.dispose();
        wmesh?.geometry?.dispose();
      }
      this.ents.delete(key);
    }
  }

  /* ===== VIS: per-enemy status indicators (stun / slow / detected-sub /
     boss-3 shield halo). Predicates replicate the logic tick exactly:
     slow aura in game.ts uses `< getRange`, sub detection (canSeeSub) `<=`. */
  private ensureInd(ent: Ent, e: GameState['enemies'][number]) {
    if (ent.ind) return ent.ind;
    const boss = e.kind === 'boss';
    const y = boss ? 9.5 : 5.6; const sz = boss ? 3.6 : 2.5;
    const mk = (txt: string, color: string, x: number) => { const s = glyphSprite(txt, color, sz); s.position.set(x, y, 0); s.visible = false; ent.obj.add(s); return s; };
    const ind: NonNullable<Ent['ind']> = { stun: mk('✸', '#ffd24b', -sz * 0.72), slow: mk('❄', '#7ac8ff', 0), eye: mk('◎', '#53d769', sz * 0.72), shield: null };
    if (boss) {
      const r = e.boss === 4 ? 17.5 : 14.5;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 1.2, 56), new THREE.MeshBasicMaterial({ color: 0x7ac8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 1.8; ring.visible = false;
      ent.obj.add(ring); ind.shield = ring;
    }
    ent.ind = ind;
    return ind;
  }
  private enemySlowed(game: GameState, e: GameState['enemies'][number]): boolean {
    const pos = enemyPosition(e, game.layout); const slots = getSlots(game.layout);
    for (const t of game.towers) {
      if (t.kind !== 'ew' && !(t.kind === 'boat' && e.kind !== 'air')) continue;
      const sp = slots[t.slot]; if (sp && distance(sp, pos) < getRange(game, t)) return true;
    }
    return false;
  }
  private subDetected(game: GameState, e: GameState['enemies'][number]): boolean {
    const pos = enemyPosition(e, game.layout); const slots = getSlots(game.layout);
    for (const t of game.towers) {
      if (t.kind !== 'ew' && t.kind !== 'boat') continue;
      const sp = slots[t.slot]; if (sp && distance(sp, pos) <= getRange(game, t)) return true;
    }
    return false;
  }

  private loop(now: number) {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const game = this.state; if (!game) return;
    const alive = new Set<string>();
    // enemies
    for (const e of game.enemies) {
      const key = `enemy-${e.id}`; alive.add(key);
      // air flies at 8; subs run semi-submerged (hull mostly under, sail out)
      const y = e.kind === 'air' ? 8 : e.kind === 'sub' ? -0.7 : 0.35;
      // Siege second front (SCEN): rev units travel the lane from the far
      // end — sample the mirrored parameter and flip the heading π so the
      // hull faces its true direction of travel.
      this.setTarget(key, 'enemy', e.rev ? 1 - e.progress : e.progress, y, 'X', !!e.rev);
      // no water wake for air targets (audit: air dragged a wake at altitude)
      const wakeLen = e.kind === 'air' ? 0 : e.kind === 'boss' ? (e.boss === 4 ? 30 : 24) : e.kind === 'destroyer' ? 13.5 : e.kind === 'sub' ? 0 : e.kind === 'corvette' ? 10 : 6.5;
      void this.ensureEnt(key, () => enemyModel(e.kind, e.boss), { bar: e.kind === 'boss' ? 10 : 5, bob: e.kind === 'air' ? 0 : 0.09, wake: wakeLen ? { len: wakeLen, wid: wakeLen * 0.55, fwd: 'X' } : undefined });
      const ent = this.ents.get(key);
      if (ent) {
        if (ent.bar) setBar(ent.bar, e.hp / e.maxHp);
        if (e.hitFlash && e.hitFlash > 0) {
          ent.obj.scale.setScalar(1.07);
          if ((this.prevFlash.get(key) ?? 0) <= 0) { const t = this.targets.get(key); if (t) this.fx.spark(t.pos, '#ffa040', 6); }
        } else ent.obj.scale.setScalar(1);
        // status indicators (logic-true conditions, see ensureInd note)
        const ind = this.ensureInd(ent, e);
        ind.stun.visible = e.stun > 0;
        ind.slow.visible = e.stun <= 0 && this.enemySlowed(game, e);
        ind.eye.visible = e.kind === 'sub' && this.subDetected(game, e);
        if (ind.shield) {
          const on = e.boss === 3 && e.specialClock < 10; // shield cycle in applyDamage
          ind.shield.visible = on;
          if (on) { ind.shield.rotation.z += dt * 0.7; (ind.shield.material as THREE.MeshBasicMaterial).opacity = 0.42 + 0.18 * Math.sin(now / 170); }
        }
      }
      this.prevFlash.set(key, e.hitFlash ?? 0);
      this.prevHp.set(key, e.hp);
    }
    // pirates
    for (const p of game.pirates) {
      const key = `pirate-${p.id}`; alive.add(key);
      this.entKinds.set(key, 'pirate');
      this.setTarget(key, 'pirate', p.progress, 0.35, 'X');
      void this.ensureEnt(key, () => hull(0x14181d, 6, 2, 'patrol'), { bar: 5, bob: 0.09, wake: { len: 6, wid: 3.4, fwd: 'X' } });
      const ent = this.ents.get(key);
      if (ent?.bar) setBar(ent.bar, Math.max(0, p.hp) / 120);
      this.prevHp.set(key, p.hp);
    }
    // merchants
    for (const m of game.merchants) {
      const key = `merchant-${m.id}`; alive.add(key);
      this.setTarget(key, 'trade', m.progress, 0.3, 'Z');
      void this.ensureEnt(key, async () => {
        const g = await loadModel(m.kind === 'barge' ? '/models/kenney/boat-tug-a.glb' : '/models/kenney/ship-cargo-a.glb');
        const fit = new THREE.Box3().setFromObject(g); const size = new THREE.Vector3(); fit.getSize(size);
        g.scale.setScalar((m.kind === 'tanker' ? 15 : 12) / Math.max(size.x, size.z, 0.001));
        const fit2 = new THREE.Box3().setFromObject(g); g.position.y = -fit2.min.y;
        g.userData.baseY = g.position.y;
        return g;
      }, { bob: 0.1, wake: { len: m.kind === 'barge' ? 4.2 : 10.5, wid: m.kind === 'barge' ? 3.4 : 5.2, fwd: 'Z' } });
    }
    // contraband (on trade lane, pickable)
    for (const c of game.contraband) {
      const key = `contra-${c.id}`; alive.add(key);
      this.setTarget(key, 'trade', c.progress, 0.35, 'X');
      void this.ensureEnt(key, () => { const g = hull(0x59452c, 10, 3, 'cargo'); g.traverse(o => { o.userData.pick = { type: 'contraband', id: c.id }; }); return g; }, { bob: 0.09, wake: { len: 10, wid: 4.5, fwd: 'X' } });
    }
    // ===== MECH-A: boat entities & minefield (rendered here, logic in game.ts) =====
    // Boats sit on the enemy lane at their station progress plus a
    // perpendicular offset — positions come from the logic entities, the
    // meshes are simple hulls with HP bars (the pack models stay with the
    // tower bases; VIS owns richer boat art).
    for (const b of game.boats ?? []) {
      if (b.state !== 'active') continue; // sunk: gone until the logic redeploys it
      const key = `boat-${b.id}`; alive.add(key);
      const u = Math.max(0, Math.min(1, b.progress));
      const p3 = this.curves.enemy.getPointAt(u); const tan = this.curves.enemy.getTangentAt(u);
      const nl = Math.hypot(tan.x, tan.z) || 1;
      const x = p3.x + (-tan.z / nl) * b.offset * 6.58, z = p3.z + (tan.x / nl) * b.offset * 6.58;
      const heading = Math.atan2(-tan.z, tan.x);
      const y = b.role === 'ghadir' ? 0.12 : 0.35;
      const t = this.targets.get(key);
      if (t) { t.pos.set(x, y, z); t.heading = heading; t.y = y; }
      else this.targets.set(key, { pos: new THREE.Vector3(x, y, z), heading, y });
      void this.ensureEnt(key, () => hull(b.role === 'ghadir' ? 0x37424e : b.role === 'torpedo' ? 0x74553a : 0x546e4a, b.role === 'ghadir' ? 13 : 8, 2.8, 'patrol'),
        { bar: 4, bob: 0.08, wake: b.role === 'ghadir' ? { len: 4, wid: 2.4, fwd: 'X' } : { len: 7, wid: 3.6, fwd: 'X' } });
      const ent = this.ents.get(key);
      if (ent?.bar) setBar(ent.bar, Math.max(0, b.hp) / b.maxHp);
    }
    for (const m of game.mines ?? []) {
      const key = `mine-${m.id}`; alive.add(key);
      const [x, z] = pctTo3d(m.x, m.y);
      const t = this.targets.get(key);
      if (t) { t.pos.set(x, 0.3, z); t.y = 0.3; }
      else this.targets.set(key, { pos: new THREE.Vector3(x, 0.3, z), heading: 0, y: 0.3 });
      void this.ensureEnt(key, () => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6, metalness: 0.4 }));
        body.position.y = 0.2; g.add(body);
        const lamp = glyphSprite('✸', '#ff4040', 1.8); lamp.position.y = 1.6; g.add(lamp);
        return g;
      }, { bob: 0.06 });
    }
    // ===== SCEN objective entities (Wave-2 integration): the escort
    // caravan and the stranded rescue ship ride the trade lane; enemy sea
    // mines sit on it too. Positions come from the logic's own helpers
    // (objectiveShipPosition / enemyMinePosition sample the trade lane);
    // setTarget maps lane progress to the render curve. Objective ships
    // carry HP bars here; a structure objective's HP shows in the HUD
    // wave-caption (Game.tsx) — structure has no scene entity. =====
    const battleCtx = game.battle;
    if (battleCtx?.escort) {
      alive.add('obj-escort');
      this.setTarget('obj-escort', 'trade', battleCtx.escort.progress, 0.3, 'Z');
      void this.ensureEnt('obj-escort', async () => {
        const g = await loadModel('/models/kenney/ship-cargo-a.glb');
        const fit = new THREE.Box3().setFromObject(g); const size = new THREE.Vector3(); fit.getSize(size);
        g.scale.setScalar(13 / Math.max(size.x, size.z, 0.001));
        const fit2 = new THREE.Box3().setFromObject(g); g.position.y = -fit2.min.y;
        g.userData.baseY = g.position.y;
        return g;
      }, { bar: 5, bob: 0.1, wake: { len: 10, wid: 5, fwd: 'Z' } });
      const ent = this.ents.get('obj-escort');
      if (ent?.bar) setBar(ent.bar, Math.max(0, battleCtx.escort.hp) / Math.max(1, battleCtx.escort.maxHp));
    }
    if (battleCtx?.stranded) {
      alive.add('obj-stranded');
      this.setTarget('obj-stranded', 'trade', battleCtx.stranded.progress, 0.3, 'Z');
      void this.ensureEnt('obj-stranded', () => hull(0x8a4b3a, 11, 3.2, 'cargo'), { bar: 5, bob: 0.05, wake: { len: 0, wid: 0, fwd: 'X' } });
      const ent = this.ents.get('obj-stranded');
      if (ent?.bar) setBar(ent.bar, Math.max(0, battleCtx.stranded.hp) / Math.max(1, battleCtx.stranded.maxHp));
    }
    for (const m of battleCtx?.mines ?? []) {
      const key = `emine-${m.id}`; alive.add(key);
      this.setTarget(key, 'trade', m.progress, 0.25, 'X');
      void this.ensureEnt(key, () => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), new THREE.MeshStandardMaterial({ color: 0x4a2020, roughness: 0.55, metalness: 0.4 }));
        body.position.y = 0.15; g.add(body);
        const lamp = glyphSprite('✸', '#ff9040', 1.6); lamp.position.y = 1.5; g.add(lamp);
        return g;
      }, { bob: 0.05 });
    }
    // port tanker
    const tanker = game.idle.port?.tanker;
    if (tanker) {
      alive.add('tanker');
      this.setTarget('tanker', 'port', tanker.progress, 0.3, 'Z');
      void this.ensureEnt('tanker', async () => {
        const g = await loadModel('/models/kenney/ship-cargo-a.glb');
        const fit = new THREE.Box3().setFromObject(g); const size = new THREE.Vector3(); fit.getSize(size);
        g.scale.setScalar(15 / Math.max(size.x, size.z, 0.001));
        const bar = barSprites(5.5); bar.group.position.y = 5; g.add(bar.group); g.userData.bar = bar;
        return g;
      }, { bob: 0.08, wake: { len: 10.5, wid: 5.2, fwd: 'Z' } });
      const ent = this.ents.get('tanker');
      if (ent) {
        const bar = ent.obj.userData.bar as ReturnType<typeof barSprites> | undefined;
        if (bar) { const cap = 500 + game.buildings.dock * 500; setBar(bar, tanker.stage === 'loading' ? tanker.load / cap : tanker.stage === 'depart' ? 1 : 0.05); }
      }
    }
    // heroes (free-moving: target from % pos, heading from movement delta)
    const heroes: ['hero' | 'hero2', GameState['hero']][] = [['hero', game.hero]];
    if (game.hero2) heroes.push(['hero2', game.hero2]);
    for (const [which, h] of heroes) {
      const key = which; alive.add(key);
      void this.ensureEnt(key, () => {
        const g = hull(0x5b6b82, which === 'hero' ? 14 : 12, 3.4, 'patrol');
        const star = glyphSprite('✦', '#ffd27a', 3); star.position.y = 5.4; g.add(star);
        g.traverse(o => { o.userData.pick = { type: which }; });
        return g;
      }, { bob: 0.09, wake: { len: which === 'hero' ? 14 : 12, wid: 5, fwd: 'X' } });
      let [x, z] = pctTo3d(h.x, h.y);
      if (this.map.field && this.map.field.sample(x, z) > 0.2) {
        outer: for (let r = 2; r < 30; r += 2) for (let a = 0; a < 12; a++) {
          const nx = x + Math.cos((a / 12) * Math.PI * 2) * r, nz = z + Math.sin((a / 12) * Math.PI * 2) * r;
          if (this.map.field.sample(nx, nz) <= 0.2) { x = nx; z = nz; break outer; }
        }
      }
      const prev = this.targets.get(key);
      let heading = prev?.heading ?? -0.7;
      if (prev) { const dx = x - prev.pos.x, dz = z - prev.pos.z; if (dx * dx + dz * dz > 0.04) heading = Math.atan2(-dz, dx); }
      this.targets.set(key, { pos: new THREE.Vector3(x, 0.35, z), heading, y: 0.35 });
    }
    // enemy missiles — MECH-B's own render section (state-driven, see below)
    this.syncEnemyMissiles(game, now);
    // tower status marks: disabled by boss-2 stun (game.towerStuns) and
    // jammed by boss-4 (logic: towers within 26 of the carrier lose 40%)
    {
      const boss4 = game.enemies.find(e => e.kind === 'boss' && e.boss === 4 && e.hp > 0);
      const b4pos = boss4 ? enemyPosition(boss4, game.layout) : null;
      const slots = getSlots(game.layout);
      for (const t of game.towers) {
        const mk = this.towerMarks.get(t.slot); if (!mk) continue;
        mk.stun.visible = (game.towerStuns?.[t.slot] ?? 0) > 0;
        const sp = slots[t.slot];
        mk.jam.visible = !!b4pos && !!sp && distance(sp, b4pos) < 26;
      }
    }
    // enemy-route ribbon pulse after wave start (signal set in setState)
    if (this.enemyRibbonMat) {
      const since = (now - this.wavePulseAt) / 1000;
      if (since >= 0 && since < 4) {
        const k = 1 - since / 4;
        this.enemyRibbonMat.opacity = 0.28 + k * (0.5 + 0.22 * Math.sin(now / 85));
      } else if (this.enemyRibbonMat.opacity !== 0.28) this.enemyRibbonMat.opacity = 0.28;
    }
    // prune dead entities (killed enemies sink with an explosion; others just leave)
    for (const key of [...this.ents.keys()]) if (!alive.has(key)) {
      const ent = this.ents.get(key)!;
      const killed = (key.startsWith('enemy-') || key.startsWith('pirate-')) && ent.init && (this.prevHp.get(key) ?? 1) <= 0;
      if (killed) {
        this.fx.explode(ent.obj.position, '#ff7a30', 1.6);
        // death audio + the boss's own bigger shake (checklist ۱۳٫۲/۱۳٫۳ —
        // the 3D path used to be completely silent)
        const ek = this.entKinds.get(key);
        if (ek === 'boss') { this.sound('explosion'); this.addShake(0.35, ent.obj.position); }
        else if (ek === 'speed' || ek === 'air' || ek === 'pirate') this.sound('impact');
        else this.sound('explosion');
        const mats: THREE.Material[] = [];
        ent.obj.traverse(o => { const mm = (o as THREE.Mesh).material as THREE.Material | undefined; if (mm) { const c = mm.clone(); c.transparent = true; (o as THREE.Mesh).material = c; mats.push(c); } });
        ent.mats = mats;
        this.dying.push({ ent, t: 0 });
        this.ents.delete(key);
      } else this.dropEnt(key);
      this.targets.delete(key); this.prevFlash.delete(key); this.prevHp.delete(key); this.entKinds.delete(key);
    }
    this.stepMotion(dt, now);
    this.updateAnims(dt, now);
    this.fx.update(dt);
    this.updatePopups(dt);
    this.applyShake(dt);
    this.stepPulseFx(dt);
    this.tuneResolution(dt, now);
    // shots → the pack's real battle FX (projectiles/beams per weapon family)
    if (game.shots !== this.lastShots) {
      this.lastShots = game.shots;
      for (const s of game.shots) {
        const [x1, z1] = pctTo3d(s.x1, s.y1); const [x2, z2] = pctTo3d(s.x2, s.y2);
        // MECH-A: an EMP pulse record is an area ring at the tower, not a projectile
        if (s.modelKind === 'emp' && s.targetId === -1) {
          const tw = game.towers.find(t2 => t2.slot === s.slot);
          this.spawnPulseRing(x1, z1, tw ? getRange(game, tw) * 6.58 : 120);
          continue;
        }
        // MECH-A: a mine detonation record is an explosion at the mine, not a projectile
        if (s.boatId === -1 && s.modelKind === 'mine') {
          this.fx.explode(new THREE.Vector3(x1, 1, z1), '#7affc8', 2.4);
          continue;
        }
        const dx = x2 - x1, dz = z2 - z1; const len = Math.hypot(dx, dz) || 1;
        let sx = x1 + (dx / len) * 2.4, sz = z1 + (dz / len) * 2.4; let sy = 3.1;
        // fire event on the owning tower: the shot record names its tower —
        // nearest-slot guessing used to misattribute hero shots (audit جدید-۱)
        const bestSlot: number | null = typeof s.slot === 'number' && s.slot >= 0 ? s.slot : null;
        if (bestSlot !== null) {
          const ta = this.towerAnims.get(bestSlot);
          if (ta) {
            ta.targetPos = new THREE.Vector3(x2, 1.2, z2);
            // charge-cycle period comes from the shot record's real firing
            // interval (converted to wall time) — no more tick-arrival EMA,
            // so game speed scales the visual cadence (audit مهم-۳)
            if (s.interval > 0) ta.period = s.interval / Math.max(1, game.speed);
            ta.lastShotAt = now;
            // MECH-A: boat-fired shots originate at the boat (x1/y1 of the
            // record) — the tower model's muzzles must NOT override them,
            // and its recoil/shot rotation belongs to its own shots only.
            if (s.boatId == null) {
              const idx = ta.mz.length ? ta.shotIdx % ta.mz.length : 0;
              if (ta.rc.length) { const r = ta.rc[idx % ta.rc.length]; r.obj.position.z = r.bz - ta.spec.recoil; }
              if (ta.mz.length) { const p = ta.mz[idx].getWorldPosition(new THREE.Vector3()); sx = p.x; sy = p.y; sz = p.z; }
              ta.shotIdx++;
            }
          }
        }
        this.dispatchShotFx(s, sx, sy, sz, x2, z2, game);
      }
    }
  }

  /** Effective DPR ceiling for this device: the map's own cap when present
   *  (1.5 touch/Android, 2 desktop — §16.3), else the same rule recomputed. */
  private dprCap(): number {
    if (typeof this.map.dprCap === 'number') return this.map.dprCap;
    const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
    return coarse ? 1.5 : 2;
  }

  /* ===== MECH-B: enemy missile rendering (separate section) =====
     Draws state.enemyMissiles (destroyer + Leviathan projectiles) as
     physical missiles flying their launch→target arc, with a smoke trail,
     and plays the one-shot FX for the two arrival-class battle events
     (CIWS interception, tower disabled). Everything else about enemy
     projectiles — flight, interception, the 4s tower stun — is logic in
     game.ts; this section only reads state. */
  private syncEnemyMissiles(game: GameState, now: number) {
    EM_BEACON_MAT.opacity = (now / 260) % 1 < 0.55 ? 0.95 : 0.25; // warning blink, shared by every beacon
    const seen = new Set<number>();
    for (const m of game.enemyMissiles ?? []) {
      seen.add(m.id);
      let g = this.eMissiles.get(m.id);
      if (!g) { g = enemyMissileMesh(); this.dyn.add(g); this.eMissiles.set(m.id, g); }
      const p = enemyMissilePosition(m);
      const [x, z] = pctTo3d(p.x, p.y);
      const [tx, tz] = pctTo3d(m.x2, m.y2);
      const t = m.total > 0 ? Math.max(0, Math.min(1, 1 - m.eta / m.total)) : 1;
      const y = 2.3 + Math.sin(t * Math.PI) * 2.4; // low arc: rises off the launcher, dives onto the tower
      g.position.set(x, y, z);
      g.rotation.y = Math.atan2(-(tz - z), tx - x);
      const flame = g.getObjectByName('em-flame');
      if (flame) { const f = 0.8 + Math.sin(now / 31 + m.id) * 0.25; flame.scale.set(f, 1, 1); }
      if (now - (this.eMissileTrailAt.get(m.id) ?? 0) > 90) {
        this.eMissileTrailAt.set(m.id, now);
        this.fx.smoke(new THREE.Vector3(x, y, z), 0.38, false);
      }
    }
    // Removal needs no dispose: every geometry/material a missile mesh
    // uses is a shared module-level asset (see EM_* above), so dropping
    // the Group from the scene graph frees the whole per-missile cost.
    for (const [id, g] of [...this.eMissiles]) if (!seen.has(id)) { this.dyn.remove(g); this.eMissiles.delete(id); this.eMissileTrailAt.delete(id); }
    if (game.events !== this.lastEvents) {
      this.lastEvents = game.events;
      for (const ev of game.events ?? []) {
        if (ev.type === 'intercept') {
          const [x, z] = pctTo3d(ev.x, ev.y);
          const p = new THREE.Vector3(x, 3.4, z);
          this.fx.explode(p, '#7dd3fc', 1.1, false);
          this.fx.spark(p, '#bfe9ff', 8);
        } else if (ev.type === 'tower-disabled') {
          const [x, z] = pctTo3d(ev.x, ev.y);
          this.fx.explode(new THREE.Vector3(x, 3, z), '#ff6a5c', 1.5, false);
        }
      }
    }
  }

  /** Dynamic resolution (PERF2 rework, D-020): step the pixel ratio to
   *  hold the RENDER rate near the 60fps render cap. The fps signal is the
   *  renderer's own rendered-frame counter across the evaluation window —
   *  never the rAF cadence: on a 120Hz panel the old EMA read ~120 even
   *  while renders were the expensive part, and the old ladder stepped UP
   *  at fps>57 / down only at fps<47, so it parked at maximum quality
   *  until thermal throttling (audit2 team 1). New rules: step DOWN as
   *  soon as fps < 55; step UP only after fps > 58 in TWO consecutive
   *  windows (the hysteresis that stops oscillation around the thermal
   *  ceiling); 55–58 is a dead zone; never above the device cap (the
   *  top ladder step). While a calm flag is set, renders are capped at
   *  30 by design — a low rate there is the cap working, not GPU
   *  distress — so the ladder holds its step and resets the up-streak. */
  private tuneResolution(dt: number, now: number) {
    this.emaMs = this.emaMs * 0.96 + Math.min(dt, 0.1) * 1000 * 0.04;
    if (now < this.dprEvalAt) return;
    this.dprEvalAt = now + 3000;
    const r = (this.map as unknown as { renderer?: THREE.WebGLRenderer }).renderer;
    if (!r) return;
    const frame = r.info?.render?.frame ?? 0;
    const elapsed = this.dprLastEvalAt ? (now - this.dprLastEvalAt) / 1000 : 0;
    const frames = this.dprLastFrame >= 0 ? frame - this.dprLastFrame : 0;
    this.dprLastEvalAt = now; this.dprLastFrame = frame;
    if (elapsed < 2 || elapsed > 6 || frames <= 0) return; // first / stretched window: baseline only
    this.renderFps = frames / elapsed;
    const w = window as unknown as { __hormuzCalmUi?: boolean; __hormuzCalmPhase?: boolean };
    if (w.__hormuzCalmUi === true || w.__hormuzCalmPhase === true) { this.dprUpStreak = 0; return; }
    const steps = this.dprSteps;
    let idx = this.dprIdx;
    if (this.renderFps < 55) { if (idx < steps.length - 1) idx++; this.dprUpStreak = 0; }
    else if (this.renderFps > 58) {
      this.dprUpStreak++;
      if (this.dprUpStreak >= 2 && idx > 0) { idx--; this.dprUpStreak = 0; }
    } else this.dprUpStreak = 0;
    if (idx !== this.dprIdx) {
      this.dprIdx = idx;
      try { r.setPixelRatio(Math.min(window.devicePixelRatio || 1, steps[idx], this.dprCap())); } catch { /* noop */ }
    }
  }

  perfInfo() {
    const r = (this.map as unknown as { renderer?: THREE.WebGLRenderer }).renderer;
    const info = r?.info?.render;
    // fps reports the ladder's measured RENDER rate once it exists (the
    // pre-PERF2 EMA read the rAF cadence, which overstates renders on
    // high-refresh panels); EMA remains only as the pre-first-window value.
    return { calls: info?.calls ?? -1, tris: info?.triangles ?? -1, dpr: r?.getPixelRatio?.() ?? -1, fps: this.renderFps > 0 ? Math.round(this.renderFps) : Math.round(1000 / Math.max(1, this.emaMs)) };
  }

  /* MECH-A: EMP pulse visual — an expanding violet shock ring at the
   *  tower, grown to the tower's real range (checklist ۱٫۵). */
  private spawnPulseRing(x: number, z: number, maxR: number) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 1.1, z);
    this.dyn.add(mesh);
    this.pulseFx.push({ mesh, t: 0, maxR });
  }
  private stepPulseFx(dt: number) {
    for (let i = this.pulseFx.length - 1; i >= 0; i--) {
      const p = this.pulseFx[i]; p.t += dt;
      const k = p.t / 0.9;
      const r = Math.max(1, p.maxR * Math.min(1, k));
      p.mesh.scale.set(r, r, r);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.max(0, 1 - k);
      if (k >= 1) {
        this.dyn.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.pulseFx.splice(i, 1);
      }
    }
  }

  /* Per-family FX dispatch — projectile kind/color/arc/duration transcribed from the
     pack's own fire() callbacks (towers.tsx), re-timed for game-world distances.
     Wave-1 FX rules:
     - exactly ONE visual projectile per shot record (MECH-B contract: MLRS
       emits one record per rocket; Swarm/Bavar emit one record per volley
       missile, each with its own targetId — the old ×4/×3 display multipliers
       fabricated shots that never happened);
     - homing (track) goes ONLY to guided projectiles — missile, rocket,
       hyper, torpedo. Shells and tracers fly straight (audit مهم-۴۴);
     - tracking follows the record's OWN target (enemy or pirate by id), not
       the nearest entity to the impact point (audit جدید-۱);
     - EW fires no projectile: a local pulse ring at the tower + a spark at
       the affected target;
     - hero shots originate from the hero's own position (the record's x1/y1)
       in hero gold — never borrowed from the nearest tower slot. */
  private dispatchShotFx(s: Shot, sx: number, sy: number, sz: number, x2: number, z2: number, game: GameState) {
    const F = this.fx;
    const slot = typeof s.slot === 'number' && s.slot >= 0 ? s.slot : null;
    const ta = slot !== null ? this.towerAnims.get(slot) : undefined;
    const from = new THREE.Vector3(sx, sy, sz);
    const isHero = s.modelKind === 'hero';
    const kind = ta?.kind || (isHero ? '' : s.modelKind);
    const color = isHero ? '#ffd27a' : (PACK_GLOW[kind] ?? ('#' + (KIND_COLOR[s.kind] ?? 0xffffff).toString(16).padStart(6, '0')));
    const eKey = this.targets.has(`enemy-${s.targetId}`) ? `enemy-${s.targetId}` : this.targets.has(`pirate-${s.targetId}`) ? `pirate-${s.targetId}` : null;
    const tPos = eKey ? this.targets.get(eKey)!.pos : null;
    const to = tPos ? tPos.clone() : new THREE.Vector3(x2, 1.2, z2);
    const isAir = game.enemies.find(e => e.id === s.targetId)?.kind === 'air';
    const track = eKey ? () => this.targets.get(eKey)?.pos ?? null : undefined;
    const dist = from.distanceTo(to);
    const dir = to.clone().sub(from).normalize();
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    // Arrival effects shared by the projectile cases: per-family impact audio
    // and the heavy-missile damage number (PRD §۸٫۳). Crits are numbered by
    // the logic's own popup stream, so they are not duplicated here; pirate
    // records carry damage 0 and never spawn a number.
    const arrive = (soundKind: BattleSound | null) => () => {
      if (soundKind) this.sound(soundKind);
      if (!s.crit && s.damage > 0 && HEAVY_POPUP_KINDS.has(kind)) {
        const p = eKey ? this.targets.get(eKey)?.pos : null;
        this.spawnPopupWorld(p?.x ?? to.x, p?.z ?? to.z, `−${Math.max(1, Math.round(s.damage))}`, '#ffd9a0', 1.1);
      }
    };
    if (isHero) {
      if (s.kind === 'air') F.shoot({ from, to, kind: 'tracer', color, dur: Math.max(0.08, dist / 330), jitter: 0.4, air: isAir });
      else { F.shoot({ from, to, kind: 'missile', color, dur: clamp(dist / 70, 0.6, 1.6), arc: dist * 0.18, track, onArrive: arrive('impact') }); F.flashAt(from, dir, color, 1.2); }
      return;
    }
    switch (kind) {
      case 'railgun': F.rail(from, to, color); F.explode(to, color, 1.5); F.flashAt(from, dir, color, 2.4); this.addShake(0.15, from); break;
      case 'laser': {
        const cry = ta?.crystal ? ta.crystal.getWorldPosition(new THREE.Vector3()) : from;
        // beam width/brightness follow the tower's focus ramp (1 → ×5, the
        // same ramp the logic applies to beam damage) so the player sees
        // the beam charge up on a held target
        const tw = slot !== null ? game.towers.find(t => t.slot === slot) : undefined;
        const ramp = Math.min(5, 1 + (tw?.focusTime ?? 0));
        F.rail(cry, to, color, 0.22, ramp); F.spark(to, color, 4); F.flashAt(cry, dir, color, 1.1);
        break;
      }
      case 'howitzer': F.shoot({ from, to, kind: 'shell', color: '#ffb347', dur: clamp(dist / 95, 0.5, 1.5), arc: dist * 0.09, onArrive: arrive('impact') }); F.smoke(from, 0.7, false); F.flashAt(from, dir, '#ffb347', 1.8); this.addShake(0.06, from); this.sound('launch'); break;
      case 'mlrs': F.shoot({ from, to, kind: 'rocket', color, dur: clamp(dist / 85, 0.6, 1.6), arc: dist * 0.13, jitter: 2.4, track, onArrive: arrive('impact') }); F.smoke(from, 0.55, false); F.flashAt(from, dir, color, 1.6); this.sound('launch'); break;
      case 'silo': F.shoot({ from, to, kind: 'missile', color, dur: clamp(dist / 60, 0.9, 2.2), arc: dist * 0.32, track, onArrive: arrive('explosion') }); for (let i = 0; i < 6; i++) F.smoke(from, 0.8, false); F.flashAt(from, dir, color, 1.8); this.addShake(0.08, from); this.sound('launch'); break;
      case 'hypersonic': F.shoot({ from, to, kind: 'hyper', color, dur: clamp(dist / 220, 0.35, 0.8), arc: dist * 0.22, size: 1.4, track, onArrive: arrive('explosion') }); for (let i = 0; i < 8; i++) F.smoke(from, 0.9, false); F.flashAt(from, dir, color, 2); this.addShake(0.25, from); this.sound('launch'); break;
      case 'swarm': F.shoot({ from, to, kind: 'missile', color, dur: clamp(dist / 70, 0.7, 1.8), arc: dist * (0.10 + Math.random() * 0.08), size: 0.8, jitter: 1.2, track, onArrive: arrive('impact') }); F.smoke(from, 0.5, false); F.flashAt(from, dir, color, 1.4); this.sound('launch'); break;
      case 'bavar': F.shoot({ from, to, kind: 'missile', color, dur: clamp(dist / 65, 0.8, 1.8), arc: dist * 0.2, air: true, track, onArrive: arrive('impact') }); for (let i = 0; i < 5; i++) F.smoke(from, 0.7, false); F.flashAt(from, dir, color, 1.6); this.sound('launch'); break;
      case 'thermobaric': F.shoot({ from, to, kind: 'plasma', color, dur: clamp(dist / 80, 0.6, 1.4), arc: dist * 0.05, size: 1.2, onArrive: arrive('explosion') }); F.flashAt(from, dir, color, 2.2); this.addShake(0.12, from); break;
      case 'emp': F.shoot({ from, to, kind: 'plasma', color, dur: clamp(dist / 110, 0.4, 1.1), size: 1.1 }); F.flashAt(from, dir, color, 1.6); break;
      case 'sonar': F.shoot({ from, to, kind: 'rocket', color, dur: clamp(dist / 80, 0.6, 1.5), arc: dist * 0.06, size: 1.2, track, onArrive: arrive('impact') }); F.flashAt(from, dir, color, 1.5); this.sound('launch'); break;
      case 'ciws': F.shoot({ from, to, kind: 'tracer', color, dur: Math.max(0.08, dist / 360), jitter: 0.7, air: isAir }); F.flashAt(from, dir, color, 1.2); break;
      case 'aadefense': F.shoot({ from, to, kind: 'tracer', color, dur: Math.max(0.08, dist / 320), jitter: 0.4, air: isAir }); F.flashAt(from, dir, color, 1.1); break;
      case 'torpedo': F.shoot({ from, to, kind: 'torpedo', color, dur: clamp(dist / 34, 1, 2.6), track, onArrive: arrive('impact') }); F.flashAt(from, dir, color, 0.9); break;
      case 'mine': F.shoot({ from, to, kind: 'torpedo', color, dur: clamp(dist / 34, 1, 2.6), size: 1.3, track, onArrive: arrive('impact') }); break;
      case 'ew': F.pulse(from, color, 30, 0.85); F.spark(to, color, 3); break;
      case 'garrison': F.shoot({ from, to, kind: 'tracer', color, dur: Math.max(0.08, dist / 300), jitter: 0.3 }); F.flashAt(from, dir, color, 0.9); break;
      default: F.shoot({ from, to, kind: 'tracer', color, dur: Math.max(0.08, dist / 300), jitter: 0.3, air: isAir }); F.flashAt(from, dir, color, 1.3); break;
    }
  }

  /* ================= pack animation runtime ================= */
  private bindTowerAnim(slot: number, url: string, model: THREE.Object3D) {
    const kind = (url.split('/').pop() ?? '').replace(/-L\d+\.glb$/, '').replace('.glb', '');
    const { byName, generic } = collectAnims(model, 't' + slot);
    const beam = byName.get('anim:beam') ?? []; const outer = byName.get('anim:outer') ?? [];
    for (const b of [...beam, ...outer]) b.visible = false; // laser beam is driven by the Phase-1 battle FX
    const ta: TowerAnim = {
      kind, spec: WEAPON_SPEC[kind] ?? { turn: 5, recoil: 0.2 },
      yaw: byName.get('anim:yaw') ?? [], pitch: byName.get('anim:pitch') ?? [],
      mz: byName.get('anim:mz') ?? [],
      rc: (byName.get('anim:rc') ?? []).map(obj => ({ obj, bz: obj.position.z })),
      spin: (byName.get('anim:spin') ?? [])[0] ?? null,
      erector: (byName.get('anim:erector') ?? [])[0] ?? null,
      missile: (byName.get('anim:missile') ?? [])[0] ?? null,
      doorsL: byName.get('anim:doorL') ?? [], doorsR: byName.get('anim:doorR') ?? [], cells: byName.get('anim:cell') ?? [],
      crystal: (byName.get('anim:crystal') ?? [])[0] ?? null,
      generic, glowMats: CHARGE_GLOW_KINDS.has(kind) ? collectGlowMats(model, kind) : [],
      targetPos: null, lastShotAt: 0, period: 0, shotIdx: 0,
    };
    this.towerAnims.set(slot, ta);
  }

  private applyGeneric(nodes: AnimNode[], t: number, dt: number, smokeOn = true) {
    for (const n of nodes) {
      const o = n.obj; const ph = n.phase;
      switch (n.name) {
        case 'anim:rot': o.rotation.y += dt * 1.0; break;
        case 'anim:rotZ': o.rotation.z += dt * 2.2; break;
        case 'anim:sweep': o.rotation.y = Math.sin(t * 0.6 + ph) * 1.2; break;
        case 'anim:ping': {
          const p = ((t / 2.6) + ph) % 1; const sc = 0.5 + p * 7;
          o.scale.set(sc, sc, sc);
          if (n.mat) (n.mat as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - p);
          break;
        }
        case 'anim:bob': o.position.y = n.by + Math.sin(t * 1.4 + ph) * 0.05; o.rotation.z = Math.sin(t * 0.98 + ph) * 0.02; break;
        case 'anim:swing': o.rotation.z = n.brz + Math.sin(t * 1.6 + ph) * 0.28; break;
        case 'anim:trolley':
          o.position.x = n.bx + Math.sin(t * 0.35 + ph) * 1.1;
          if (n.hook) n.hook.position.y = (n.hookBaseY ?? 0) + Math.sin(t * 0.5 + ph) * 0.5;
          break;
        case 'anim:flame': {
          const f = 0.85 + Math.sin(t * 11 + ph) * 0.15 + Math.sin(t * 23 + ph + 1) * 0.1;
          o.scale.set(f, f * (1.1 + Math.sin(t * 7 + ph) * 0.2), f);
          break;
        }
        case 'anim:flameLight': {
          const l = o as unknown as THREE.PointLight;
          const f = 0.85 + Math.sin(t * 11 + ph) * 0.15 + Math.sin(t * 23 + ph + 1) * 0.1;
          if (l.isPointLight) l.intensity = Math.max(6, (l.userData.baseI ?? 20)) * f;
          break;
        }
        case 'anim:door':
          if (n.mat && n.baseColor) (n.mat as THREE.MeshBasicMaterial).color.copy(n.baseColor).multiplyScalar(3 + Math.sin(t * 2 + ph) * 1.2);
          break;
        case 'anim:smoke': {
          if (!smokeOn) break; // production stopped (full tank / no fuel / capped) — no puffs
          if (t >= (o.userData.fxNext ?? 0)) {
            o.userData.fxNext = t + 0.55 + Math.random() * 0.35;
            const wp = o.getWorldPosition(this.animTmp);
            const ws = o.getWorldScale(this.animTmp2);
            wp.y += 2.1 * ws.y;
            this.fx.smoke(wp, 0.85, true);
          }
          break;
        }
        case 'anim:scan': o.position.x = n.bx + Math.sin(t * 0.5 + ph) * 2.4; break;
        case 'anim:holo': o.rotation.y += dt * 0.5; o.position.y = n.by + Math.sin(t * 1.2 + ph) * 0.08; break;
        case 'anim:flag': o.rotation.y = Math.sin(t * 3 + ph) * 0.3; break;
        case 'anim:rings': o.rotation.y += dt * 1.0; o.rotation.x += dt * 0.4; break;
        case 'anim:crane': o.rotation.y = Math.sin(t * 0.3 + ph) * 0.8; break;
        case 'anim:sub': o.position.y = n.by + Math.sin(t * 0.4 + ph) * 0.22; o.position.z = n.bz + Math.sin(t * 0.25 + ph) * 0.6; break;
        case 'anim:mines':
          o.children.forEach((ch, i) => { ch.position.y = (n.childBaseY?.[i] ?? 0) + Math.sin(t * 1.5 + i * 1.7 + ph) * 0.06; ch.rotation.y += dt * 0.3; });
          break;
        case 'anim:boat': {
          const bcx = n.boatCx, bcz = n.boatCz, brad = n.boatR, ba0 = n.boatA0;
          if (bcx === undefined || bcz === undefined || brad === undefined || ba0 === undefined) break;
          const ang = ba0 + t * 0.55;
          o.position.set(bcx + Math.cos(ang) * brad, 0.02 + Math.sin(t * 3 + ph) * 0.03, bcz + Math.sin(ang) * brad * 0.7);
          const vx = -Math.sin(ang), vz = Math.cos(ang) * 0.7;
          o.rotation.set(Math.sin(t * 2 + ph) * 0.04, Math.atan2(vx, vz), -0.12);
          break;
        }
        case 'anim:crystal': o.rotation.y += dt * 1.5; o.position.y = n.by + Math.sin(t * 2 + ph) * 0.1; break;
        case 'anim:orb': o.position.y = n.by + Math.sin(t * 2 + ph) * 0.08; break;
        case 'anim:shell': {
          const p = ((t / 3) + ph) % 1; const sc = 0.3 + p * 9;
          o.scale.set(sc, sc, sc);
          if (n.mat) (n.mat as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - p * 1.4);
          break;
        }
        default: break;
      }
    }
  }

  private updateAnims(dt: number, nowMs: number) {
    const t = nowMs / 1000;
    const camPos = this.map.camera.position;
    // buildings + platforms: ambient motion only
    for (const [key, nodes] of this.genericAnims) {
      if (!nodes.length) continue;
      const p = nodes[0].obj.getWorldPosition(this.animTmp);
      if (p.distanceToSquared(camPos) > 320 * 320) continue;
      const smokeOn = key.startsWith('bld-') ? (this.buildingActive[key.slice(4)] ?? true) : true;
      this.applyGeneric(nodes, t, dt, smokeOn);
    }
    // towers: ambient + weapon articulation
    for (const [slot, ta] of this.towerAnims) {
      const rec = this.towers.get(slot); if (!rec) continue;
      const dist2 = rec.obj.position.distanceToSquared(camPos);
      if (dist2 > 500 * 500) continue;
      this.applyGeneric(ta.generic, t, dt);
      const cool = ta.lastShotAt && ta.period ? Math.max(0, Math.min(1, 1 - (nowMs - ta.lastShotAt) / 1000 / ta.period)) : 0;
      const hasTarget = ta.lastShotAt > 0 && nowMs - ta.lastShotAt < 1600;
      if (ta.spin) ta.spin.rotation.z += dt * (hasTarget ? 40 : 3);
      // recoil spring recovery (pack: exponential approach, rate 9)
      for (const r of ta.rc) r.obj.position.z += (r.bz - r.obj.position.z) * Math.min(1, dt * 9);
      // glow charge pulse (railgun coils / thermobaric rings / hypersonic rings)
      if (ta.glowMats.length) {
        const ch = 1 - cool;
        const mult = ta.kind === 'railgun' ? 1 + ch * ch * 9 + Math.sin(t * 40) * ch * 0.6
          : ta.kind === 'thermobaric' ? 2 + ch * 6 + Math.sin(t * 8)
          : ta.kind === 'hypersonic' ? 2 + (cool < 0.32 ? (0.32 - cool) * 25 : 0) + Math.sin(t * 5) * 0.8
          : 1 + ch * ch * 4 + Math.sin(t * 6) * ch * 0.5; // ew/garrison/torpedo/mine generic charge pulse
        for (const g of ta.glowMats) {
          if (g.basic) (g.mat as THREE.MeshBasicMaterial).color.copy(g.base).multiplyScalar(Math.max(0.4, mult));
          else (g.mat as THREE.MeshStandardMaterial).emissiveIntensity = g.baseIntensity * Math.max(0.4, mult * 0.6);
        }
      }
      // silo cells: hatch doors + next-missile visibility follow the firing cycle
      if (ta.cells.length) {
        const nCells = ta.cells.length;
        const next = ((ta.shotIdx % nCells) + nCells) % nCells;
        const prev = ((ta.shotIdx - 1) % nCells + nCells) % nCells;
        for (let j = 0; j < nCells; j++) {
          const open = (j === next && cool < 0.22) || (j === prev && cool > 0.8);
          const tgt = open ? 1.9 : 0; const k = Math.min(1, dt * 9);
          const dl = ta.doorsL[j], dr = ta.doorsR[j];
          if (dl) dl.rotation.z += (tgt - dl.rotation.z) * k;
          if (dr) dr.rotation.z += (-tgt - dr.rotation.z) * k;
          ta.cells[j].visible = !(j === prev && cool > 0.35);
        }
      }
      // hypersonic erector: raise/lower curve follows the charge cycle
      if (ta.erector) {
        let ang = 0;
        if (cool > 0.72) ang = ((1 - cool) / 0.28) * 1.45;
        else if (cool > 0.32) ang = 1.45;
        else ang = Math.max(0, (cool - 0.05) / 0.27) * 1.45;
        ta.erector.rotation.x += (ang - ta.erector.rotation.x) * Math.min(1, dt * 8);
        if (ta.missile) ta.missile.visible = cool < 0.72;
      }
      // aiming: yaw/pitch track the tower's real shot target; idle = face the lane
      if (ta.yaw.length) {
        const yaw = ta.yaw[0];
        let tp: THREE.Vector3;
        if (hasTarget && ta.targetPos) tp = ta.targetPos;
        else {
          const aimA = this.aim.get(slot) ?? Math.PI;
          tp = this.animTmp2.set(rec.obj.position.x + Math.sin(aimA) * 14, rec.obj.position.y + 1, rec.obj.position.z + Math.cos(aimA) * 14).clone();
        }
        if (yaw.parent) {
          yaw.parent.updateWorldMatrix(true, false);
          const local = yaw.parent.worldToLocal(this.animTmp.copy(tp));
          const want = Math.atan2(local.x - yaw.position.x, local.z - yaw.position.z);
          let diff = want - yaw.rotation.y;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          yaw.rotation.y += diff * Math.min(1, dt * ta.spec.turn * 2.2);
          const pitch = ta.pitch[0];
          if (pitch && pitch.parent) {
            pitch.parent.updateWorldMatrix(true, false);
            const lp = pitch.parent.worldToLocal(this.animTmp.copy(tp));
            const dist = Math.hypot(lp.x - pitch.position.x, lp.z - pitch.position.z);
            let w = -Math.atan2(lp.y - pitch.position.y, dist) - (ta.spec.loft ?? 0);
            w = Math.max(-(ta.spec.maxUp ?? 1.3), Math.min(0.12, w));
            pitch.rotation.x += (w - pitch.rotation.x) * Math.min(1, dt * ta.spec.turn * 2.2);
          }
        }
      }
    }
  }
}

