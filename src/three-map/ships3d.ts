import * as THREE from 'three';
import lanesData from './lanes-3d.json';
import { loadModel } from './models3d';

type LaneName = 'enemy' | 'trade' | 'pirate' | 'port';
const LANES = lanesData as Record<LaneName, [number, number][]>;

export function hull(color: number, len: number, beam: number, detail: 'tanker' | 'cargo' | 'patrol'): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22282e, roughness: 0.7, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, len * 0.14, beam), mat);
  body.position.y = len * 0.07;
  g.add(body);
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(0, beam * 0.5, len * 0.24, 4, 1), mat);
  bow.rotation.z = -Math.PI / 2; bow.rotation.y = Math.PI / 4;
  bow.scale.set(1, 1, len * 0.14 / (beam * 0.5) / 2);
  bow.position.set(len * 0.6, len * 0.07, 0);
  g.add(bow);
  if (detail === 'tanker') {
    for (let i = -1; i <= 1; i++) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(beam * 0.32, beam * 0.32, len * 0.22, 10), dark);
      tank.rotation.z = Math.PI / 2; tank.position.set(i * len * 0.26, len * 0.16, 0);
      g.add(tank);
    }
  } else if (detail === 'cargo') {
    for (let i = 0; i < 3; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(len * 0.16, len * 0.12, beam * 0.8),
        new THREE.MeshStandardMaterial({ color: [0xb5493a, 0x3a6ea5, 0x4d7c4d][i], roughness: 0.8 }));
      box.position.set(-len * 0.22 + i * len * 0.2, len * 0.18, 0);
      g.add(box);
    }
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(len * 0.12, len * 0.16, beam * 0.7),
    new THREE.MeshStandardMaterial({ color: 0xe8ecf1, roughness: 0.5 }));
  bridge.position.set(-len * 0.38, len * 0.2, 0);
  g.add(bridge);
  return g;
}

interface ShipSpec { lane: LaneName; make: () => THREE.Group; speed: number; offset: number; pingpong?: boolean; pauseAtEnd?: number }
const SPECS: ShipSpec[] = [
  { lane: 'port', make: () => hull(0x7a2020, 13, 3.4, 'tanker'), speed: 3.2, offset: 0, pingpong: true, pauseAtEnd: 6 },
  { lane: 'trade', make: () => hull(0x2c4a66, 11, 3, 'cargo'), speed: 4.5, offset: 0.15 },
  { lane: 'trade', make: () => hull(0x59452c, 11, 3, 'cargo'), speed: 4.5, offset: 0.55 },
  { lane: 'enemy', make: () => hull(0x3a4048, 8, 2.4, 'patrol'), speed: 5.5, offset: 0.05 },
  { lane: 'enemy', make: () => hull(0x3a4048, 8, 2.4, 'patrol'), speed: 5.5, offset: 0.22 },
  { lane: 'pirate', make: () => hull(0x14181d, 5.5, 1.8, 'patrol'), speed: 6.5, offset: 0.4 },
];

/* ══ D-022 ship factory (fix program 2, team SHIPS) ══════════════════
 * Real low-poly hulls replace the procedural hull() for every game entity
 * (hull() above survives only for the standalone demo in attachShips).
 * Sources — all CC0, see CREDITS.md: Innerscene 3D Parts Library (primary)
 * and the Kenney Watercraft Kit. The Innerscene GLBs are texture-stripped
 * with each texture's average color baked into baseColorFactor, then
 * meshopt-decimated to 2-13k tris; the flat pass below turns the baked
 * colors into the game's flat-vector Style A materials — no realistic
 * textures reach the game. Every factory ship presents its bow toward +X
 * in entity space (the gamesync heading convention); per-model `rotY`
 * normalizes the source forward axis (Innerscene: bow +X native; Kenney
 * is inconsistent per model — speed/tug bow +Z, cargo-a bow −Z — measured
 * from profile renders, see the audit-2 SHIPS report).
 * The unarmed frigate/carrier hulls are armed here with flat-style
 * kitbash (turrets / VLS / CIWS / deck planes) in the game's own visual
 * language, per D-010/D-022. */

export const SHIP_MODELS = {
  frigate: '/models/ships/frigate.glb',
  carrier: '/models/ships/carrier.glb',
  tanker: '/models/ships/tanker.glb',
  container: '/models/ships/container.glb',
  bulk: '/models/ships/bulk.glb',
  submarine: '/models/ships/submarine.glb',
  pilot: '/models/ships/pilot.glb',
  research: '/models/ships/research.glb',
  supply: '/models/ships/supply.glb',
  ferry: '/models/ships/ferry.glb',
  speedboat: '/models/kenney/boat-speed-a.glb',
  tug: '/models/kenney/boat-tug-a.glb',
  cargoship: '/models/kenney/ship-cargo-a.glb',
} as const;
export type ShipModelKey = keyof typeof SHIP_MODELS;

/** draft = sink as a fraction of bbox height; rotY = forward-axis fix;
 *  mono = single flat color (Kenney hulls carry their color in a colormap
 *  texture with a white baseColorFactor, so the baked-color pass would
 *  bleach them — they get one flat hull color instead, tinted per role). */
const SHIP_GEO: Record<ShipModelKey, { draft: number; rotY: number; mono?: number }> = {
  frigate: { draft: 0.13, rotY: 0 },
  carrier: { draft: 0.15, rotY: 0 },
  tanker: { draft: 0.25, rotY: 0 },
  container: { draft: 0.22, rotY: 0 },
  bulk: { draft: 0.22, rotY: 0 },
  submarine: { draft: 0.38, rotY: 0 },
  pilot: { draft: 0.25, rotY: 0 },
  research: { draft: 0.18, rotY: 0 },
  supply: { draft: 0.12, rotY: 0 },
  ferry: { draft: 0.20, rotY: 0 },
  speedboat: { draft: 0.15, rotY: Math.PI / 2, mono: 0x46505c },
  tug: { draft: 0.20, rotY: Math.PI / 2, mono: 0x8a4b3a },
  cargoship: { draft: 0.25, rotY: -Math.PI / 2, mono: 0x59452c },
};

export type ShipArm = 'destroyer' | 'corvette' | 'boss' | 'carrier' | 'hero' | 'torpedo';

export interface ShipOpts {
  len: number;                 // target length in world units
  tint?: number; tintAmt?: number; // lerp baked colors toward tint (default amt 0.35)
  gold?: boolean;              // VIP: gilded tanker (luxe gold lerp)
  arm?: ShipArm;
  draft?: number;              // override the per-model sink fraction
}

const flatMatCache = new Map<string, THREE.MeshStandardMaterial>();
function flatMat(color: THREE.Color): THREE.MeshStandardMaterial {
  const key = color.getHexString();
  let m = flatMatCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: color.clone(), roughness: 0.85, metalness: 0.05, flatShading: true }); flatMatCache.set(key, m); }
  return m;
}
const gunmetal = new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.6, metalness: 0.35, flatShading: true });
const ciwsWhite = new THREE.MeshStandardMaterial({ color: 0xdfe5ea, roughness: 0.5, metalness: 0.1, flatShading: true });
const deckDark = new THREE.MeshStandardMaterial({ color: 0x39424c, roughness: 0.85, metalness: 0.05, flatShading: true });

function gunTurret(s: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * s, 0.38 * s, 0.22 * s, 8), gunmetal); base.position.y = 0.11 * s; g.add(base);
  const house = new THREE.Mesh(new THREE.BoxGeometry(0.62 * s, 0.3 * s, 0.44 * s), gunmetal); house.position.set(-0.04 * s, 0.36 * s, 0); g.add(house);
  for (const dz of [-0.11, 0.11]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.045 * s, 0.85 * s, 6), gunmetal);
    barrel.rotation.z = Math.PI / 2; barrel.position.set(0.5 * s, 0.4 * s, dz * s); g.add(barrel);
  }
  return g;
}
function vlsBlock(s: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.7 * s, 0.16 * s, 0.5 * s), deckDark); m.position.y = 0.08 * s; return m;
}
function ciws(s: number): THREE.Group {
  const g = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.18 * s, 0.3 * s, 8), gunmetal); ped.position.y = 0.15 * s; g.add(ped);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2 * s, 10, 8), ciwsWhite); dome.position.y = 0.42 * s; g.add(dome);
  return g;
}
function torpedoTubes(s: number): THREE.Group {
  const g = new THREE.Group();
  for (const dz of [-0.16, 0.16]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.09 * s, 0.9 * s, 8), gunmetal);
    tube.rotation.z = Math.PI / 2; tube.position.set(0, 0.16 * s, dz * s); g.add(tube);
  }
  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.12 * s, 0.5 * s), gunmetal); mount.position.y = 0.05 * s; g.add(mount);
  return g;
}
function deckPlane(s: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 0.07 * s, 0.16 * s), deckDark); g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.05 * s, 0.62 * s), deckDark); wing.position.x = -0.05 * s; g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.2 * s, 0.05 * s), deckDark); tail.position.set(-0.42 * s, 0.1 * s, 0); g.add(tail);
  return g;
}

/** Build one game ship: flat-passed GLB scaled to `len`, draft sunk into
 *  an inner group (gamesync's stepMotion owns the outer group's Y), plus
 *  optional flat-style armament. Bow faces +X in the returned group. */
export async function makeShip(key: ShipModelKey, opts: ShipOpts): Promise<THREE.Group> {
  const geo = SHIP_GEO[key];
  const model = await loadModel(SHIP_MODELS[key]);
  const tintC = opts.gold ? new THREE.Color(0xd8a833) : opts.tint !== undefined ? new THREE.Color(opts.tint) : null;
  const amt = opts.tintAmt ?? (opts.gold ? 0.45 : 0.35);
  model.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const conv = mats.map(m => {
      const c = geo.mono !== undefined ? new THREE.Color(geo.mono)
        : m && (m as THREE.MeshStandardMaterial).color ? (m as THREE.MeshStandardMaterial).color.clone() : new THREE.Color(0x8a939c);
      if (tintC) c.lerp(tintC, amt);
      return flatMat(c);
    });
    mesh.material = Array.isArray(mesh.material) ? conv : conv[0];
  });
  const fit = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3(); fit.getSize(size);
  const s = opts.len / Math.max(size.x, size.z, 0.001);
  model.scale.setScalar(s);
  const fit2 = new THREE.Box3().setFromObject(model);
  const inner = new THREE.Group();
  inner.rotation.y = geo.rotY;
  model.position.set(-(fit2.min.x + fit2.max.x) / 2, -fit2.min.y - size.y * s * (opts.draft ?? geo.draft), -(fit2.min.z + fit2.max.z) / 2);
  inner.add(model);
  const outer = new THREE.Group();
  outer.add(inner);
  const H = size.y * s; // world height
  const deckY = (frac: number) => H * frac - size.y * s * (opts.draft ?? geo.draft);
  const place = (part: THREE.Object3D, fx: number, fy: number, fz = 0) => { part.position.set(fx * opts.len, fy, fz * opts.len); outer.add(part); };
  if (opts.arm === 'destroyer' || opts.arm === 'boss') {
    const ts = opts.arm === 'boss' ? 1.5 : 1.15;
    place(gunTurret(ts), 0.33, deckY(0.26)); place(gunTurret(ts * 0.9), -0.31, deckY(0.26));
    place(vlsBlock(ts), 0.14, deckY(0.26)); place(ciws(1), -0.40, deckY(0.36));
    if (opts.arm === 'boss') { place(vlsBlock(ts), -0.16, deckY(0.26)); place(ciws(1), 0.22, deckY(0.44)); }
  } else if (opts.arm === 'corvette') {
    place(gunTurret(1), 0.33, deckY(0.26)); place(ciws(0.9), -0.38, deckY(0.36));
  } else if (opts.arm === 'carrier') {
    place(deckPlane(1.6), 0.24, deckY(0.315)); place(deckPlane(1.6), -0.02, deckY(0.315)); place(deckPlane(1.6), -0.28, deckY(0.315));
    place(ciws(1.1), 0.06, deckY(0.62), 0.10); place(ciws(1.1), 0.44, deckY(0.315), 0.08);
  } else if (opts.arm === 'hero') {
    place(gunTurret(0.8), 0.30, deckY(0.33));
  } else if (opts.arm === 'torpedo') {
    place(torpedoTubes(0.9), -0.14, deckY(0.38));
  }
  return outer;
}

export function attachShips(map: { scene: THREE.Scene; setLayer(name: string, on: boolean): void }): () => void {
  map.setLayer('enemy', false);
  map.setLayer('trade', false);
  map.setLayer('ships', false);
  const group = new THREE.Group();
  map.scene.add(group);
  // lane ribbons
  const ribbonCols: Record<LaneName, number> = { enemy: 0xff5040, trade: 0x53d769, pirate: 0xffb340, port: 0xd653ff };
  for (const name of Object.keys(LANES) as LaneName[]) {
    const pts = LANES[name].map(([x, z]) => new THREE.Vector3(x, 0.32, z));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: ribbonCols[name], transparent: true, opacity: 0.55 }));
    group.add(line);
  }
  const ships = SPECS.map(spec => {
    const pts = LANES[spec.lane].map(([x, z]) => new THREE.Vector3(x, 0.35, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const mesh = spec.make();
    group.add(mesh);
    return { spec, curve, len: curve.getLength(), mesh, pause: 0 };
  });
  let raf = 0; let last = performance.now(); let alive = true;
  const tick = (now: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const s of ships) {
      if (s.pause > 0) { s.pause -= dt; }
      else {
        s.spec.offset += (s.spec.speed * dt) / s.len;
        if (s.spec.pingpong) {
          if (s.spec.offset >= 1) { s.spec.offset = 1; s.pause = s.spec.pauseAtEnd ?? 0; s.spec.speed = -Math.abs(s.spec.speed); }
          if (s.spec.offset <= 0) { s.spec.offset = 0; s.pause = 2; s.spec.speed = Math.abs(s.spec.speed); }
        } else if (s.spec.offset > 1) s.spec.offset -= 1;
      }
      const u = Math.max(0, Math.min(1, s.spec.offset));
      const pos = s.curve.getPointAt(u);
      const tan = s.curve.getTangentAt(u);
      if (s.spec.speed < 0) tan.negate();
      s.mesh.position.set(pos.x, 0.35 + Math.sin(now / 700 + s.len) * 0.05, pos.z);
      s.mesh.rotation.y = Math.atan2(-tan.z, tan.x);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { alive = false; cancelAnimationFrame(raf); map.scene.remove(group); };
}
