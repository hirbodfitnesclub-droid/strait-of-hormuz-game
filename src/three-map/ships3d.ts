import * as THREE from 'three';
import lanesData from './lanes-3d.json';

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
