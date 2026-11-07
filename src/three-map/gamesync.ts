import * as THREE from 'three';
import lanesData from './lanes-3d.json';
import slotsData from './slots-3d.json';
import buildingsData from './buildings-3d.json';
import { loadModel, TOWER_MODEL, BRANCH_MODEL, groundY } from './models3d';
import { hull } from './ships3d';
import { pctTo3d, point3dToPct } from './coords';
import { getRange, type GameState } from '@/lib/game';

type LaneName = 'enemy' | 'trade' | 'pirate' | 'port';
const LANES = lanesData as Record<LaneName, [number, number][]>;
const SLOTS = (slotsData as { slots: { id: number; island: string; x: number; z: number }[] }).slots;
const PLATFORMS = (slotsData as { platforms: { id: number; x: number; z: number }[] }).platforms;
const BUILDINGS = buildingsData as Record<string, { glb: string; x: number; z: number; water: boolean }>;

export interface SyncCallbacks {
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
}

const KIND_COLOR: Record<string, number> = { cannon: 0xffd27a, heavy: 0xff9a5c, missile: 0xff6a5c, air: 0x7ac8ff, ew: 0xc07aff, boat: 0x7affc8 };

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
  if (kind === 'sub') { const g = hull(0x232a31, 11, 2.4, 'patrol'); g.position.y = -0.5; return g; }
  if (kind === 'speed') return hull(0x39424c, 6.5, 2, 'patrol');
  if (kind === 'corvette') return hull(0x46505c, 10, 2.8, 'patrol');
  return hull(0x525e6b, 13.5, 3.2, 'patrol'); // destroyer
}

interface Ent { obj: THREE.Group; bar?: ReturnType<typeof barSprites>; init?: boolean; phase: number; bobAmp: number; wake?: THREE.Mesh; mats?: THREE.Material[]; speed?: number; lastTx?: number; lastTz?: number }

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
let _burstTex: THREE.Texture | null = null;
function burstTexture(): THREE.Texture {
  if (_burstTex) return _burstTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,210,120,0.85)'); g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  _burstTex = new THREE.CanvasTexture(c);
  return _burstTex;
}
function easeOutBack(x: number): number { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

export class GameSync3D {
  private map: MapLike; private cb: SyncCallbacks;
  private root = new THREE.Group();
  private statics = new THREE.Group();
  private dyn = new THREE.Group();
  static { /* names set in ctor for debugging */ }
  private curves: Record<LaneName, THREE.CatmullRomCurve3>;
  private towers = new Map<number, { url: string; obj: THREE.Object3D; born: number; base: number }>();
  private buildings = new Map<string, THREE.Object3D>();
  private platforms = new Map<number, THREE.Object3D>();
  private pads = new Map<number, THREE.Object3D>();
  private rangeRing: THREE.Mesh | null = null;
  private targetRing: THREE.Mesh | null = null;
  private ents = new Map<string, Ent>();
  private shotLines: { line: THREE.Line; ttl: number }[] = [];
  private aim = new Map<number, number>();
  private targets = new Map<string, { pos: THREE.Vector3; heading: number; y: number }>();
  private dying: { ent: Ent; t: number }[] = [];
  private bursts: { parts: { s: THREE.Sprite; v: THREE.Vector3 }[]; t: number; life: number }[] = [];
  private flashes: { s: THREE.Sprite; t: number }[] = [];
  private prevFlash = new Map<string, number>();
  private prevHp = new Map<string, number>();
  private kenneyRev = false;
  private lastShots: unknown = null;
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
    map.scene.add(this.root); this.root.add(this.statics); this.root.add(this.dyn);
    this.curves = Object.fromEntries((Object.keys(LANES) as LaneName[]).map(n => [n, new THREE.CatmullRomCurve3(LANES[n].map(([x, z]) => new THREE.Vector3(x, 0.35, z)), false, 'centripetal')])) as Record<LaneName, THREE.CatmullRomCurve3>;
    // lane ribbons (subtle, only enemy + trade)
    for (const n of ['enemy', 'trade'] as LaneName[]) {
      const pts = LANES[n].map(([x, z]) => new THREE.Vector3(x, 0.3, z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: n === 'enemy' ? 0xff5040 : 0x53d769, transparent: true, opacity: 0.28 }));
      this.statics.add(line);
    }
    // per-slot tower aim: barrel (+Z native) toward nearest point of the enemy lane
    {
      const samples: THREE.Vector3[] = [];
      for (let i = 0; i <= 240; i++) samples.push(this.curves.enemy.getPointAt(i / 240));
      for (const sl of SLOTS) {
        let best: THREE.Vector3 | null = null; let bd = Infinity;
        for (const p of samples) { const d = (p.x - sl.x) ** 2 + (p.z - sl.z) ** 2; if (d < bd) { bd = d; best = p; } }
        if (best) this.aim.set(sl.id, Math.atan2(best.x - sl.x, best.z - sl.z));
      }
    }
    this.bindPointer();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose() {
    this.alive = false; cancelAnimationFrame(this.raf);
    this.detachFns.forEach(f => f());
    this.map.scene.remove(this.root);
  }

  setState(game: GameState, opts: { selectedSlot: number | null; targeting: string | null; targetPreview: { x: number; y: number } }) {
    this.state = game; this.selectedSlot = opts.selectedSlot; this.targeting = opts.targeting;
    this.reconcileStatics(game);
    this.updateSelectionVisuals(game, opts.targetPreview);
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
        if (cur) { this.statics.remove(cur.obj); this.towers.delete(t.slot); }
        const slot = SLOTS.find(s => s.id === t.slot); if (!slot) return;
        const model = await loadModel(url);
        model.traverse(o => { o.userData.pick = { type: 'slot', id: t.slot }; });
        const fit = new THREE.Box3().setFromObject(model); const size = new THREE.Vector3(); fit.getSize(size);
        const baseScale = 5.2 / Math.max(size.x, size.z, 0.001);
        model.scale.setScalar(baseScale);
        const fit2 = new THREE.Box3().setFromObject(model);
        model.position.set(slot.x, groundY(this.map, slot.x, slot.z) - fit2.min.y, slot.z);
        model.rotation.y = this.aim.get(t.slot) ?? Math.PI;
        this.statics.add(model);
        this.towers.set(t.slot, { url, obj: model, born: performance.now(), base: baseScale });
        this.removePad(t.slot);
      } finally { this.placing.delete('tower-' + t.slot); }
    }));
    for (const [slotId, rec] of [...this.towers]) if (!seen.has(slotId)) { this.statics.remove(rec.obj); this.towers.delete(slotId); }
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
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.1, 40), new THREE.MeshBasicMaterial({ color: locked ? 0x8a8f96 : 0x53d769, transparent: true, opacity: locked ? 0.35 : 0.8, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(slot.x, y + 0.15, slot.z);
      pad.add(ring);
      const glyph = glyphSprite(locked ? '🔒' : '+', locked ? '#9aa3ad' : '#53d769');
      glyph.position.set(slot.x, y + 2.2, slot.z);
      glyph.traverse(o => { o.userData.pick = { type: 'slot', id: slot.id }; });
      ring.userData.pick = { type: 'slot', id: slot.id };
      pad.add(glyph);
      pad.userData.pickRing = ring;
      this.statics.add(pad); this.pads.set(slot.id, pad);
    }
    // buildings (level > 0, parallel loads)
    await Promise.all(Object.entries(BUILDINGS).map(async ([id, b]) => {
      const level = (game.buildings as Record<string, number>)[id] ?? 0;
      const has = this.buildings.has(id);
      if (level > 0 && !has) {
        if (this.placing.has('bld-' + id)) return;
        this.placing.add('bld-' + id);
        try {
          const model = await loadModel(`/models/buildings/${b.glb}.glb`);
          model.traverse(o => { o.userData.pick = { type: 'building', id }; });
          const fit = new THREE.Box3().setFromObject(model); const size = new THREE.Vector3(); fit.getSize(size);
          model.scale.setScalar((b.glb === 'platform' ? 13 : 9.5) / Math.max(size.x, size.z, 0.001));
          const fit2 = new THREE.Box3().setFromObject(model);
          model.position.set(b.x, (b.water ? 0 : groundY(this.map, b.x, b.z)) - fit2.min.y, b.z);
          this.statics.add(model); this.buildings.set(id, model);
        } finally { this.placing.delete('bld-' + id); }
      } else if (level <= 0 && has) { this.statics.remove(this.buildings.get(id)!); this.buildings.delete(id); }
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
          model.scale.setScalar(12 / Math.max(size.x, size.z, 0.001));
          const fit2 = new THREE.Box3().setFromObject(model);
          model.position.set(p.x, -fit2.min.y, p.z);
          this.statics.add(model); this.platforms.set(p.id, model);
        } finally { this.placing.delete('plat-' + p.id); }
        if (this.pads.has(-100 - p.id)) { this.statics.remove(this.pads.get(-100 - p.id)!); this.pads.delete(-100 - p.id); }
      } else if (!built.has(p.id) && !has && !this.pads.has(-100 - p.id)) {
        const glyph = glyphSprite('+', '#ffb340', 3.8);
        glyph.position.set(p.x, 2.6, p.z);
        glyph.userData.pick = { type: 'platform', id: p.id };
        const grp = new THREE.Group(); grp.add(glyph);
        this.statics.add(grp); this.pads.set(-100 - p.id, grp);
      }
    }));
  }

  private removePad(slotId: number) {
    const pad = this.pads.get(slotId);
    if (pad) { this.statics.remove(pad); this.pads.delete(slotId); }
  }

  private updateSelectionVisuals(game: GameState, targetPreview: { x: number; y: number }) {
    if (this.rangeRing) { this.statics.remove(this.rangeRing); this.rangeRing = null; }
    if (this.targetRing) { this.statics.remove(this.targetRing); this.targetRing = null; }
    if (this.selectedSlot !== null) {
      const slot = SLOTS.find(s => s.id === this.selectedSlot);
      const tower = game.towers.find(t => t.slot === this.selectedSlot);
      if (slot) {
        const rangePct = tower ? getRange(game, tower) : 17;
        const r = rangePct * 6.58;
        const ring = new THREE.Mesh(new THREE.RingGeometry(r - 1.2, r, 64), new THREE.MeshBasicMaterial({ color: 0x7ac8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(slot.x, groundY(this.map, slot.x, slot.z) + 0.4, slot.z);
        this.statics.add(ring); this.rangeRing = ring;
      }
    }
    if (this.targeting) {
      const [x, z] = pctTo3d(targetPreview.x, targetPreview.y);
      const ring = new THREE.Mesh(new THREE.RingGeometry(9, 11, 48), new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.5, z);
      this.statics.add(ring); this.targetRing = ring;
    }
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

  private setTarget(key: string, lane: LaneName, progress: number, y: number, fwd: 'X' | 'Z') {
    const curve = this.curves[lane];
    const u = Math.max(0, Math.min(1, progress));
    const pos = curve.getPointAt(u); const tan = curve.getTangentAt(u);
    const heading = fwd === 'X' ? Math.atan2(-tan.z, tan.x) : Math.atan2(tan.x, tan.z) + (this.kenneyRev ? Math.PI : 0);
    const t = this.targets.get(key);
    if (t) { t.pos.set(pos.x, y, pos.z); t.heading = heading; t.y = y; }
    else this.targets.set(key, { pos: new THREE.Vector3(pos.x, y, pos.z), heading, y });
  }

  private spawnBurst(pos: THREE.Vector3, n = 12, scale = 1) {
    const parts: { s: THREE.Sprite; v: THREE.Vector3 }[] = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: burstTexture(), color: i % 3 === 0 ? 0xffe9b0 : 0xff8a3c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const sp = new THREE.Sprite(m);
      const a = Math.random() * Math.PI * 2; const spd = (2 + Math.random() * 5) * scale;
      sp.position.set(pos.x, pos.y + 1.3, pos.z);
      sp.scale.setScalar((1 + Math.random() * 1.7) * scale);
      this.dyn.add(sp);
      parts.push({ s: sp, v: new THREE.Vector3(Math.cos(a) * spd, (2.5 + Math.random() * 3.5) * scale, Math.sin(a) * spd) });
    }
    this.bursts.push({ parts, t: 0, life: 0.55 });
  }

  private spawnFlash(pos: THREE.Vector3, color: number) {
    const m = new THREE.SpriteMaterial({ map: burstTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const sp = new THREE.Sprite(m);
    sp.position.copy(pos); sp.scale.setScalar(2.2); sp.renderOrder = 28;
    this.dyn.add(sp);
    this.flashes.push({ s: sp, t: 0 });
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
      if (k >= 1) { this.dyn.remove(o); this.dying.splice(i, 1); }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]; b.t += dt; const f = Math.max(0, 1 - b.t / b.life);
      for (const p of b.parts) {
        p.s.position.addScaledVector(p.v, dt); p.v.y -= 5.5 * dt;
        (p.s.material as THREE.SpriteMaterial).opacity = f;
        p.s.scale.multiplyScalar(1 + dt * 1.6);
      }
      if (b.t >= b.life) { b.parts.forEach(p => { this.dyn.remove(p.s); (p.s.material as THREE.Material).dispose(); }); this.bursts.splice(i, 1); }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i]; fl.t += dt; const k = fl.t / 0.09;
      fl.s.scale.setScalar(2.2 + k * 3.2);
      (fl.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k);
      if (k >= 1) { this.dyn.remove(fl.s); (fl.s.material as THREE.Material).dispose(); this.flashes.splice(i, 1); }
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
    if (ent) { this.dyn.remove(ent.obj); this.ents.delete(key); }
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
      const y = e.kind === 'air' ? 8 : e.kind === 'sub' ? 0.1 : 0.35;
      this.setTarget(key, 'enemy', e.progress, y, 'X');
      const wakeLen = e.kind === 'boss' ? (e.boss === 4 ? 30 : 24) : e.kind === 'destroyer' ? 13.5 : e.kind === 'sub' ? 0 : e.kind === 'corvette' ? 10 : 6.5;
      void this.ensureEnt(key, () => enemyModel(e.kind, e.boss), { bar: e.kind === 'boss' ? 10 : 5, bob: e.kind === 'air' ? 0 : 0.09, wake: wakeLen ? { len: wakeLen, wid: wakeLen * 0.55, fwd: 'X' } : undefined });
      const ent = this.ents.get(key);
      if (ent) {
        if (ent.bar) setBar(ent.bar, e.hp / e.maxHp);
        if (e.hitFlash && e.hitFlash > 0) {
          ent.obj.scale.setScalar(1.07);
          if ((this.prevFlash.get(key) ?? 0) <= 0) { const t = this.targets.get(key); if (t) this.spawnBurst(t.pos, 6, 0.8); }
        } else ent.obj.scale.setScalar(1);
      }
      this.prevFlash.set(key, e.hitFlash ?? 0);
      this.prevHp.set(key, e.hp);
    }
    // pirates
    for (const p of game.pirates) {
      const key = `pirate-${p.id}`; alive.add(key);
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
    // prune dead entities (killed enemies sink with an explosion; others just leave)
    for (const key of [...this.ents.keys()]) if (!alive.has(key)) {
      const ent = this.ents.get(key)!;
      const killed = (key.startsWith('enemy-') || key.startsWith('pirate-')) && ent.init && (this.prevHp.get(key) ?? 1) <= 0;
      if (killed) {
        this.spawnBurst(ent.obj.position, key.includes('enemy-') && this.prevHp.get(key) !== undefined ? 14 : 12, 1.15);
        const mats: THREE.Material[] = [];
        ent.obj.traverse(o => { const mm = (o as THREE.Mesh).material as THREE.Material | undefined; if (mm) { const c = mm.clone(); c.transparent = true; (o as THREE.Mesh).material = c; mats.push(c); } });
        ent.mats = mats;
        this.dying.push({ ent, t: 0 });
        this.ents.delete(key);
      } else this.dropEnt(key);
      this.targets.delete(key); this.prevFlash.delete(key); this.prevHp.delete(key);
    }
    this.stepMotion(dt, now);
    // shots → tracers with short TTL + muzzle flash at the tower
    if (game.shots !== this.lastShots) {
      this.lastShots = game.shots;
      for (const s of game.shots) {
        const [x1, z1] = pctTo3d(s.x1, s.y1); const [x2, z2] = pctTo3d(s.x2, s.y2);
        const dx = x2 - x1, dz = z2 - z1; const len = Math.hypot(dx, dz) || 1;
        const sx = x1 + (dx / len) * 2.4, sz = z1 + (dz / len) * 2.4;
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sx, 3.1, sz), new THREE.Vector3(x2, 1.2, z2)]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: KIND_COLOR[s.kind] ?? 0xffffff, transparent: true, opacity: 0.9 }));
        this.dyn.add(line); this.shotLines.push({ line, ttl: 0.13 });
        this.spawnFlash(new THREE.Vector3(sx, 3.1, sz), KIND_COLOR[s.kind] ?? 0xffffff);
      }
    }
    for (let i = this.shotLines.length - 1; i >= 0; i--) {
      const s = this.shotLines[i]; s.ttl -= dt;
      (s.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, s.ttl / 0.13) * 0.9;
      if (s.ttl <= 0) { this.dyn.remove(s.line); s.line.geometry.dispose(); this.shotLines.splice(i, 1); }
    }
  }
}
