// ============================================================
// mapEngine.ts — موتور نقشه سه‌بعدی تنگه هرمز (نسخه ۳: جغرافیای واقعی)
// ============================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  clamp, lerp, smoothstep, mulberry, sampleTerrain, terrainColor, groundHeight,
  CORE, CORE_W, CORE_D, OUTER, OUTER_W, OUTER_D, DEFENSE_SLOTS, OIL_SLOTS, CITY_SLOTS, ZONES, LABELS, CITIES,
  LANE_A, LANE_B, TRADE_LANE, TRADE_SPUR, BASE_POS, SPAWN_A, SPAWN_B, PIPE_TERMINALS, towerById, snapToLand,
  type SlotDef, type SlotKind, type TerrainSample,
} from './world';
import {
  makeGlowTex, makeFlameTex, makeSmokeTex, makeCloudTex, makeWakeTex, makeHelipadTex, makeIconTex,
  makeWaterNormal, makeWaterMaterial, patchTerrainMaterial, makeRibbonMaterial, makeRangeMaterial,
  makeShieldMaterial, makeCityLightsMaterial, makePadMaterial, makeBillboardMaterial, GradeShader, canvasTex,
} from './gfx';
import { Models, type AnimFn } from './models';
import { RTSCamera } from './rtsCamera';
import { mergeStatic } from './merge';
import { buildVegetation, buildDecorRigs, buildFlareSites, buildLandmarks, buildRoads, buildBirds, type DecorCtx, type VegLOD } from './decor';

export interface LayerState { enemyPath: boolean; tradePath: boolean; defense: boolean; oil: boolean; city: boolean; labels: boolean; fleet: boolean; air: boolean; }
export type ZoomTier = 'strategic' | 'tactical' | 'close';
export type Weather = 'clear' | 'storm' | 'dust';
export interface SlotInfo { id: string; kind: SlotKind; name: string; zone: string; occupied: boolean; buildId: string | null; level: number; branch: 'A' | 'B' | null; key: boolean; }
export interface SlotCounts { [zone: string]: { total: number; built: number } }
export interface SaveData { builds: Record<string, { b: string; l: number; br: 'A' | 'B' | null }>; unlocked: string[]; }
export interface EngineOpts {
  onSelect: (s: SlotInfo | null) => void; onCamera: (tier: ZoomTier, dist: number, yaw: number) => void;
  onCounts: (c: SlotCounts) => void; onLockTap: (zoneId: string) => void; onInteract: () => void;
}
interface SlotRT {
  def: SlotDef; idx: number; group: THREE.Group; structure: THREE.Group | null;
  occupied: boolean; buildId: string | null; level: number; branch: 'A' | 'B' | null; pipe: THREE.Mesh | null; topY: number; phase: number; visible: boolean;
}
interface LockRT { zone: string; sprites: THREE.Sprite[]; base: { y: number; a: number; r: number }[]; uniform: THREE.Vector4; badge: HTMLDivElement; fade: number; }
interface HGrid { w: number; h: number; data: Float32Array; x0: number; z0: number; sx: number; sz: number; }

const IS_MOBILE = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
export const TIER = { close: 60, tactical: 330 };

export class HormuzMap {
  private container: HTMLElement; private overlay: HTMLElement; private minimap: HTMLCanvasElement; private opts: EngineOpts;
  private renderer!: THREE.WebGLRenderer; private scene = new THREE.Scene(); private camera!: THREE.PerspectiveCamera;
  rts!: RTSCamera;
  private composer: EffectComposer | null = null; private bloom: UnrealBloomPass | null = null; private grade: ShaderPass | null = null;
  private sun!: THREE.DirectionalLight; private hemi!: THREE.HemisphereLight; private sunDir = new THREE.Vector3(0.5, 0.8, 0.3);
  private waterMat!: THREE.ShaderMaterial; private waterFarMat!: THREE.ShaderMaterial; private lightsMat!: THREE.ShaderMaterial; private windowMat!: THREE.MeshStandardMaterial;
  private padMat!: THREE.ShaderMaterial; private iconMat!: THREE.ShaderMaterial; private padMesh!: THREE.InstancedMesh; private iconMesh!: THREE.InstancedMesh;
  private padState!: THREE.InstancedBufferAttribute; private iconState!: THREE.InstancedBufferAttribute;
  private terrainU = { uTime: { value: 0 }, uGrid: { value: 0 }, uNight: { value: 0 }, uDetail: { value: 1 }, uLockA: { value: new THREE.Vector4(0, 0, 1, 0) }, uLockB: { value: new THREE.Vector4(0, 0, 1, 0) } };
  private models!: Models;
  private anims: AnimFn[] = []; private uiAnims: AnimFn[] = [];
  private clock = new THREE.Clock(); private worldTime = 0;
  private hg: HGrid | null = null; private hgFar: HGrid | null = null;
  private slots = new Map<string, SlotRT>(); private slotList: SlotRT[] = [];
  private locks = new Map<string, LockRT>();
  private labelEls: { el: HTMLElement; x: number; z: number; y: number; level: number; kind: string }[] = [];
  private zoneBadges: { el: HTMLDivElement; zone: string; x: number; z: number }[] = [];
  private groups = { enemy: new THREE.Group(), trade: new THREE.Group(), fleet: new THREE.Group(), merchants: new THREE.Group(), air: new THREE.Group(), lod: new THREE.Group() };
  private cloudSprites: { s: THREE.Sprite; m: THREE.SpriteMaterial; speed: number }[] = [];
  private lodIcons: { s: THREE.Sprite; follow: THREE.Object3D }[] = [];
  private selRing!: THREE.Group; private range!: THREE.Mesh; private range2!: THREE.Mesh; private shield!: THREE.Mesh;
  private rain!: THREE.LineSegments; private rainMat!: THREE.ShaderMaterial;
  private TEX = { glow: makeGlowTex(), flame: makeFlameTex(), smoke: makeSmokeTex(), wake: makeWakeTex(), helipad: makeHelipadTex() };
  private icons = { skull: makeIconTex('skull'), chevron: makeIconTex('chevron'), ship: makeIconTex('ship') };
  private layers: LayerState = { enemyPath: true, tradePath: true, defense: true, oil: true, city: true, labels: true, fleet: true, air: true };
  private selected: SlotRT | null = null; private anchorEl: HTMLElement | null = null;
  private timeH = 9.5; private autoCycle = false; private night = 0; private weather: Weather = 'clear'; private weatherK = { storm: 0, dust: 0 };
  private timeScale = 1; private tacticalManual = false; private gridVal = 0;
  private tier: ZoomTier = 'strategic'; private lastCamEmit = { d: 0, y: 0 };
  private mmBase: HTMLCanvasElement | null = null; private mmTimer = 0;
  private flash = 0; private nextLightning = 4;
  private disposed = false; private resizeObs: ResizeObserver | null = null;
  private v3 = new THREE.Vector3();
  private useComposer = true;
  private veg: VegLOD | null = null;
  attract = false;

  constructor(container: HTMLElement, overlay: HTMLElement, minimap: HTMLCanvasElement, opts: EngineOpts) {
    this.container = container; this.overlay = overlay; this.minimap = minimap; this.opts = opts;
  }

  // ============ راه‌اندازی ============
  async init(progress: (p: number, msg: string) => void, save?: SaveData | null) {
    const step = async (p: number, msg: string) => { progress(p, msg); await new Promise((r) => setTimeout(r, 24)); };
    await step(0.03, 'راه‌اندازی موتور گرافیک');
    this.setupRenderer();
    await step(0.08, 'نگاشت خطوط ساحلی واقعی خلیج فارس');
    groundHeight(0, 0);
    await step(0.14, 'شکل‌دهی زاگرس، مسندم و جزایر');
    this.buildTerrain();
    if (this.disposed) return;
    await step(0.46, 'شبیه‌سازی آب‌های خلیج فارس و دریای عمان');
    this.buildWater();
    await step(0.54, 'ساخت شهرها، جاده‌ها و نورهای شبانه');
    const ctx: DecorCtx = { scene: this.scene, models: this.models, hAt: (x, z) => this.hAt(x, z), anims: this.anims, mobile: IS_MOBILE };
    const roadLights = buildRoads(ctx);
    this.buildCities(roadLights);
    await step(0.62, 'کاشت نخلستان‌ها، جنگل حرا و صخره‌ها');
    this.veg = buildVegetation(ctx);
    await step(0.7, 'ترسیم مسیرهای تهاجم و کریدور تجاری');
    this.buildPaths(); this.buildBase();
    await step(0.76, 'تعریف مواضع دفاعی و بلوک‌های نفتی');
    this.buildSlots();
    await step(0.83, 'استقرار ناوگان، سکوها و لندمارک‌ها');
    buildDecorRigs(ctx); buildFlareSites(ctx); buildLandmarks(ctx); buildBirds(ctx);
    this.buildShips(); this.buildAir();
    await step(0.9, 'آسمان، ابرها و مه جنگ');
    this.buildClouds(); this.buildLocks(); this.buildRain(); this.buildLabels(); this.buildSelection();
    if (save) this.applySave(save);
    await step(0.95, 'کامپایل شیدرها');
    this.setupPost();
    this.setTimeOfDay(this.timeH);
    this.renderer.compile(this.scene, this.camera);
    this.buildMinimapBase();
    this.emitCounts();
    await step(1, 'آماده نبرد');
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private setupRenderer() {
    const w = this.container.clientWidth || 400, h = this.container.clientHeight || 800;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? 1.75 : 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#bcd9ea');
    this.scene.fog = new THREE.Fog('#bcd9ea', 500, 1400);
    this.camera = new THREE.PerspectiveCamera(42, w / h, 1, 7000);
    this.rts = new RTSCamera(this.camera, this.renderer.domElement);
    this.rts.maxDist = w / h < 0.8 ? 1300 : 760;
    this.rts.dist = 400;
    this.rts.target.set(0, 0, -5);
    this.rts.apply();
    this.rts.onTap = (x, y) => this.pick(x, y);
    this.rts.onDoubleTap = (x, y) => this.rts.zoomAt(0.45, x, y);
    this.rts.onInteract = () => this.opts.onInteract();
    this.hemi = new THREE.HemisphereLight('#cfe4ff', '#9a8466', 0.8);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1dc', 2.6);
    this.sun.castShadow = true;
    const sm = IS_MOBILE ? 1536 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.camera.near = 20; this.sun.shadow.camera.far = 900;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
    this.resizeObs = new ResizeObserver(() => this.onResize());
    this.resizeObs.observe(this.container);
    this.windowMat = this.makeWindowMat();
    this.models = new Models(this.anims, this.TEX, this.windowMat);
  }
  private makeWindowMat(): THREE.MeshStandardMaterial {
    const draw = (lit: boolean) => canvasTex(128, (ctx, s) => {
      ctx.fillStyle = lit ? '#000' : '#d8dadc'; ctx.fillRect(0, 0, s, s);
      for (let y = 6; y < s - 6; y += 14) for (let x = 6; x < s - 6; x += 12) {
        const on = ((x * 7 + y * 13) % 7) < 3;
        ctx.fillStyle = lit ? (on ? '#ffd08a' : '#05070a') : (on ? '#8fa0ad' : '#5f6e7a');
        ctx.fillRect(x, y, 7, 9);
      }
    });
    return new THREE.MeshStandardMaterial({ color: '#ffffff', map: draw(false), emissiveMap: draw(true), emissive: new THREE.Color('#ffc477'), emissiveIntensity: 0, roughness: 0.75, metalness: 0.1 });
  }
  private setupPost() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: IS_MOBILE ? 2 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  // ============ زمین ============
  private gridSample(g: HGrid, x: number, z: number): number | null {
    const fx = (x - g.x0) / g.sx, fz = (z - g.z0) / g.sz;
    if (fx < 0 || fz < 0 || fx >= g.w - 1 || fz >= g.h - 1) return null;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = g.data[j * g.w + i], b = g.data[j * g.w + i + 1], c = g.data[(j + 1) * g.w + i], d = g.data[(j + 1) * g.w + i + 1];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  hAt(x: number, z: number): number {
    if (this.hg) { const v = this.gridSample(this.hg, x, z); if (v !== null) return v; }
    if (this.hgFar) { const v = this.gridSample(this.hgFar, x, z); if (v !== null) return v; }
    return groundHeight(x, z);
  }
  private seaward(x: number, z: number): number {
    const e = 1.6;
    return Math.atan2(-(this.hAt(x + e, z) - this.hAt(x - e, z)), -(this.hAt(x, z + e) - this.hAt(x, z - e)));
  }
  private makeTerrainMesh(rect: { x0: number; x1: number; z0: number; z1: number }, step: number, detail: boolean): { mesh: THREE.Mesh; grid: HGrid } {
    const W = rect.x1 - rect.x0, D = rect.z1 - rect.z0;
    const SX = Math.round(W / step), SZ = Math.round(D / step);
    const geo = new THREE.PlaneGeometry(W, D, SX, SZ);
    geo.rotateX(-Math.PI / 2); geo.translate(rect.x0 + W / 2, 0, rect.z0 + D / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const n = pos.count, heights = new Float32Array(n), samples: TerrainSample[] = new Array(n);
    for (let i = 0; i < n; i++) { const s = sampleTerrain(pos.getX(i), pos.getZ(i)); pos.setY(i, s.h); heights[i] = s.h; samples[i] = s; }
    const gw = SX + 1, gh = SZ + 1;
    const grid: HGrid = { w: gw, h: gh, data: heights, x0: rect.x0, z0: rect.z0, sx: W / SX, sz: D / SZ };
    const H = (i: number, j: number) => heights[clamp(j, 0, gh - 1) * gw + clamp(i, 0, gw - 1)];
    const col = new Float32Array(n * 3);
    const k1 = detail ? 2 : 1, k2 = detail ? 6 : 2;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const idx = j * gw + i, h = heights[idx];
      const sx = (H(i + 1, j) - H(i - 1, j)) / (2 * grid.sx), sz = (H(i, j + 1) - H(i, j - 1)) / (2 * grid.sz);
      const sl = Math.hypot(sx, sz); const slope = sl / (1 + sl);
      const cav = h - 0.25 * (H(i + k1, j) + H(i - k1, j) + H(i, j + k1) + H(i, j - k1));
      const cav2 = h - 0.25 * (H(i + k2, j) + H(i - k2, j) + H(i, j + k2) + H(i, j - k2));
      const ao = clamp(1 + cav * 0.32 + cav2 * 0.07, 0.62, 1.14);
      const c = terrainColor(pos.getX(idx), pos.getZ(idx), samples[idx], slope, ao);
      col[idx * 3] = c[0]; col[idx * 3 + 1] = c[1]; col[idx * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: !detail, polygonOffsetFactor: detail ? 0 : 2, polygonOffsetUnits: detail ? 0 : 2 });
    patchTerrainMaterial(mat, this.terrainU);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true; mesh.castShadow = detail;
    return { mesh, grid };
  }
  private buildTerrain() {
    const core = this.makeTerrainMesh(CORE, IS_MOBILE ? 0.95 : 0.72, true);
    this.hg = core.grid; this.scene.add(core.mesh);
    const far = this.makeTerrainMesh(OUTER, 3.4, false);
    this.hgFar = far.grid; this.scene.add(far.mesh);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#0b3552' }));
    floor.position.y = -18; this.scene.add(floor);
  }

  // ============ آب ============
  private depthTex(g: HGrid): THREE.DataTexture {
    const dd = new Uint8Array(g.w * g.h * 4);
    for (let i = 0; i < g.w * g.h; i++) { const v = g.data[i] >= 0 ? 0 : clamp(-g.data[i] / 17, 0.004, 1); dd[i * 4] = v * 255; dd[i * 4 + 3] = 255; }
    const t = new THREE.DataTexture(dd, g.w, g.h, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    return t;
  }
  private buildWater() {
    const normal = makeWaterNormal();
    const core = new THREE.Vector4(CORE.x0, CORE.z0, CORE_W, CORE_D), outer = new THREE.Vector4(OUTER.x0, OUTER.z0, OUTER_W, OUTER_D);
    const dC = this.depthTex(this.hg!), dF = this.depthTex(this.hgFar!);
    this.waterMat = makeWaterMaterial(dC, dF, normal, core, outer, true);
    this.waterFarMat = makeWaterMaterial(dC, dF, normal, core, outer, false);
    this.waterFarMat.uniforms = this.waterMat.uniforms;
    this.waterMat.uniforms.uLockA = this.terrainU.uLockA; this.waterMat.uniforms.uLockB = this.terrainU.uLockB;
    const seg = IS_MOBILE ? 110 : 170;
    const wc = new THREE.Mesh(new THREE.PlaneGeometry(CORE_W + 36, CORE_D + 36, seg, Math.round(seg * CORE_D / CORE_W)).rotateX(-Math.PI / 2), this.waterMat);
    wc.position.set(CORE.x0 + CORE_W / 2, 0, CORE.z0 + CORE_D / 2); wc.renderOrder = 1; wc.frustumCulled = false;
    const wf = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2), this.waterFarMat);
    wf.position.y = -0.02; wf.renderOrder = 0; wf.frustumCulled = false;
    this.scene.add(wc, wf);
  }

  // ============ شهرها + نورهای شب ============
  private nearSlot(x: number, z: number, r2: number): boolean {
    for (const s of DEFENSE_SLOTS) { const dx = x - s.x, dz = z - s.z; if (dx * dx + dz * dz < r2) return true; }
    for (const s of CITY_SLOTS) { const dx = x - s.x, dz = z - s.z; if (dx * dx + dz * dz < r2 * 2.5) return true; }
    return false;
  }
  private buildCities(roadLights: { x: number; z: number }[]) {
    const rng = mulberry(77);
    const inst: { x: number; z: number; w: number; d: number; h: number; r: number; c: THREE.Color }[] = [];
    const palette = [new THREE.Color('#f1ede4'), new THREE.Color('#e3d3b0'), new THREE.Color('#d8cbb4'), new THREE.Color('#ffffff')];
    const glass = new THREE.Color('#9fc2dc');
    for (const c of CITIES) {
      let placed = 0, guard = 0;
      const n = IS_MOBILE ? Math.round(c.n * 0.7) : c.n;
      while (placed < n && guard++ < n * 6) {
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * c.r;
        const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr * 0.85;
        const h = this.hAt(x, z);
        if (h < 0.55 || h > 6.5) continue;
        if (this.nearSlot(x, z, 6)) continue;
        const centerK = Math.exp(-((rr / c.r) ** 2) * 3);
        const tall = rng() < 0.1 + centerK * 0.35 && c.maxH > 2.5;
        const hh = tall ? 1.5 + rng() * (c.maxH - 1.5) * centerK : 0.4 + rng() * 0.9;
        const fw = tall ? 0.6 + rng() * 0.6 : 0.5 + rng() * 0.8;
        inst.push({ x, z, w: fw, d: fw * (0.7 + rng() * 0.6), h: hh, r: rng() * Math.PI, c: tall && hh > 4 ? glass : palette[Math.floor(rng() * 4)] });
        placed++;
      }
    }
    const roof = new THREE.MeshStandardMaterial({ color: '#e9e2d2', roughness: 0.95 });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), [this.windowMat, this.windowMat, roof, roof, this.windowMat, this.windowMat], Math.max(1, inst.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    inst.forEach((b, i) => {
      e.set(0, b.r, 0); q.setFromEuler(e); v.set(b.x, this.hAt(b.x, b.z) + b.h / 2 - 0.15, b.z); s.set(b.w, b.h, b.d);
      m4.compose(v, q, s); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, b.c);
    });
    mesh.count = inst.length; mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
    // نورهای شبانه
    const P: number[] = [], S: number[] = [], C: number[] = [], R: number[] = [];
    const warm = [1, 0.62, 0.3], white = [1, 0.92, 0.78], sodium = [1, 0.5, 0.15];
    const push = (x: number, z: number, size: number, c: number[]) => { P.push(x, this.hAt(x, z) + 0.35, z); S.push(size); C.push(c[0], c[1], c[2]); R.push(rng()); };
    for (const c of CITIES) {
      let k = 0, guard = 0;
      while (k < c.lights && guard++ < c.lights * 4) {
        const a = rng() * Math.PI * 2, rr = Math.pow(rng(), 0.7) * c.r * 1.3;
        const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr * 0.85;
        if (this.hAt(x, z) < 0.35) continue;
        push(x, z, 0.35 + rng() * 0.7, rng() > 0.4 ? warm : white); k++;
      }
    }
    for (const l of roadLights) push(l.x, l.z, 0.3, sodium);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 1));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(R, 1));
    this.lightsMat = makeCityLightsMaterial(this.TEX.glow);
    const pts = new THREE.Points(g, this.lightsMat);
    pts.frustumCulled = false; pts.renderOrder = 3;
    this.scene.add(pts);
  }

  // ============ مسیرها ============
  private curve(pts: number[][]): THREE.CatmullRomCurve3 { return new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0.3, z)), false, 'catmullrom', 0.4); }
  private ribbon(curve: THREE.Curve<THREE.Vector3>, width: number, mat: THREE.Material, y: number, N = 300, offset = 0): THREE.Mesh {
    const P = new Float32Array((N + 1) * 6), U = new Float32Array((N + 1) * 4), I: number[] = [];
    const p = new THREE.Vector3(), t = new THREE.Vector3();
    const len = curve.getLength();
    for (let i = 0; i <= N; i++) {
      const u = i / N; curve.getPointAt(u, p); curve.getTangentAt(u, t);
      const nx = -t.z, nz = t.x, hw = width / 2, cx = p.x + nx * offset, cz = p.z + nz * offset;
      P.set([cx + nx * hw, y, cz + nz * hw, cx - nx * hw, y, cz - nz * hw], i * 6);
      const uu = (u * len) / 7; U.set([uu, 0, uu, 1], i * 4);
      if (i < N) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); g.setIndex(I);
    const m = new THREE.Mesh(g, mat); m.renderOrder = 4; m.frustumCulled = false;
    return m;
  }
  private arrows(curve: THREE.Curve<THREE.Vector3>, color: string, count: number, speed: number, size: number, offset = 0, reverse = false): THREE.InstancedMesh {
    const geo = new THREE.ConeGeometry(size, size * 2.2, 3); geo.rotateX(Math.PI / 2); geo.scale(1, 0.25, 1);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.95 }), count);
    im.frustumCulled = false; im.renderOrder = 5;
    const p = new THREE.Vector3(), t = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(1, 1, 1);
    let off = 0;
    this.anims.push((_t, dt) => {
      off = (off + dt * speed) % 1;
      for (let i = 0; i < count; i++) {
        let u = (off + i / count) % 1; if (reverse) u = 1 - u;
        curve.getPointAt(u, p); curve.getTangentAt(u, t); if (reverse) t.negate();
        const sgn = reverse ? -1 : 1; p.x += -t.z * offset * sgn; p.z += t.x * offset * sgn;
        q.setFromAxisAngle(up, Math.atan2(t.x, t.z)); p.y = 0.5; m4.compose(p, q, s); im.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true;
    });
    return im;
  }
  private laneA!: THREE.CatmullRomCurve3; private laneB!: THREE.CatmullRomCurve3; private trade!: THREE.CatmullRomCurve3; private spur!: THREE.CatmullRomCurve3;
  private buildPaths() {
    this.laneA = this.curve(LANE_A); this.laneB = this.curve(LANE_B); this.trade = this.curve(TRADE_LANE); this.spur = this.curve(TRADE_SPUR);
    const ra = makeRibbonMaterial('#ff2a3d', 0.5, 0.95, 0.5, 1.8), rb = makeRibbonMaterial('#ff6a1a', 0.42, 0.85, 0.5, 1.7);
    const tr1 = makeRibbonMaterial('#22e5d4', 0.22, 0.6, 0.35, 1.3), tr2 = makeRibbonMaterial('#22e5d4', -0.22, 0.6, 0.35, 1.3), tr3 = makeRibbonMaterial('#22e5d4', 0.22, 0.5, 0.35, 1.2);
    this.groups.enemy.add(this.ribbon(this.laneA, 1.6, ra, 0.34), this.ribbon(this.laneB, 1.4, rb, 0.34));
    this.groups.enemy.add(this.arrows(this.laneA, '#ff3348', 12, 0.025, 0.7), this.arrows(this.laneB, '#ff8a30', 14, 0.018, 0.65));
    this.groups.trade.add(this.ribbon(this.trade, 1.1, tr1, 0.32, 400, 1.9), this.ribbon(this.trade, 1.1, tr2, 0.32, 400, -1.9), this.ribbon(this.spur, 1.0, tr3, 0.32, 120));
    this.groups.trade.add(this.arrows(this.trade, '#5ff7e8', 16, 0.009, 0.5, 1.9), this.arrows(this.trade, '#5ff7e8', 16, 0.009, 0.5, 1.9, true));
    this.anims.push((t) => { for (const m of [ra, rb, tr1, tr2, tr3]) m.uniforms.uTime.value = t; });
    for (const sp of [SPAWN_A, SPAWN_B]) {
      const g = new THREE.Group(); g.position.set(sp.x, 0.35, sp.z);
      const mk = (r1: number, r2: number, seg: number, op: number) => {
        const m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, seg, 1, 0, Math.PI * 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a3d').multiplyScalar(2.4), transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2; g.add(m); return m;
      };
      const a = mk(3.2, 3.8, 48, 0.9), b = mk(4.4, 4.7, 48, 0.6), c = mk(1.8, 2.2, 32, 0.8);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 3.4, 22, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a3d').multiplyScalar(1.5), transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      beam.position.y = 11; g.add(beam);
      const skull = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.icons.skull, transparent: true, depthWrite: false, sizeAttenuation: false }));
      skull.center.set(0.5, 0); skull.scale.set(0.075, 0.075, 1); skull.position.y = 5; g.add(skull);
      this.groups.enemy.add(g);
      this.anims.push((t) => { a.rotation.z = t * 1.2; b.rotation.z = -t * 0.7; c.rotation.z = t * 2.4; a.scale.setScalar(1 + 0.08 * Math.sin(t * 4)); (beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.06 * Math.sin(t * 3); });
    }
    this.scene.add(this.groups.enemy, this.groups.trade);
  }
  private buildBase() {
    const g = new THREE.Group();
    const bx = BASE_POS.x + 8, bz = BASE_POS.z - 7;
    g.position.set(bx, 0, bz);
    const shieldMat = makeShieldMaterial('#38d8ff');
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(15, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), shieldMat);
    this.shield.scale.set(1.3, 0.5, 0.8);
    g.add(this.shield);
    const ring = new THREE.Mesh(new THREE.RingGeometry(14.5, 15, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color('#38d8ff').multiplyScalar(2), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6; ring.scale.set(1.3, 0.8, 1); g.add(ring);
    this.scene.add(g);
    this.anims.push((t) => { shieldMat.uniforms.uTime.value = t; const k = smoothstep(60, 170, this.rts.dist); shieldMat.uniforms.uOp.value = 0.5 * k; this.shield.visible = k > 0.01; ring.visible = k > 0.01; });
    const hp = new THREE.Group(); hp.position.set(BASE_POS.x, 0.3, BASE_POS.z);
    const hr = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.7, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b5c').multiplyScalar(2.5), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    hr.rotation.x = -Math.PI / 2; hp.add(hr);
    const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.TEX.glow, color: new THREE.Color(3, 0.6, 0.9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    heart.scale.set(5, 5, 1); heart.position.y = 1.5; hp.add(heart);
    this.scene.add(hp);
    this.anims.push((t) => { hr.rotation.z = t * 0.8; hr.scale.setScalar(1 + 0.12 * Math.sin(t * 3)); heart.scale.setScalar(4.5 + Math.sin(t * 3) * 0.8); });
  }

  // ============ اسلات‌ها (Instanced) ============
  private slotColor(k: SlotKind) { return k === 'defense' ? '#2ee6ff' : k === 'oil' ? '#ffb020' : '#b99bff'; }
  private buildSlots() {
    const defs: SlotDef[] = [...DEFENSE_SLOTS, ...OIL_SLOTS, ...CITY_SLOTS];
    const n = defs.length;
    const padGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.padMat = makePadMaterial();
    this.padMesh = new THREE.InstancedMesh(padGeo, this.padMat, n);
    this.padMesh.frustumCulled = false; this.padMesh.renderOrder = 6;
    const colors = new Float32Array(n * 3), phases = new Float32Array(n), states = new Float32Array(n), kinds = new Float32Array(n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    // اطلس آیکون‌ها
    const atlas = document.createElement('canvas'); atlas.width = 384; atlas.height = 128;
    const actx = atlas.getContext('2d')!;
    (['defense', 'oil', 'city'] as const).forEach((k, i) => { const t = makeIconTex(k); actx.drawImage(t.image as HTMLCanvasElement, i * 128, 0); t.dispose(); });
    const atlasTex = new THREE.CanvasTexture(atlas); atlasTex.colorSpace = THREE.SRGBColorSpace;
    this.iconMat = makeBillboardMaterial(atlasTex, 3);
    this.iconMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.iconMat, n);
    this.iconMesh.frustumCulled = false; this.iconMesh.renderOrder = 20;
    defs.forEach((def, i) => {
      let x = def.x, z = def.z, y: number;
      if (def.kind === 'defense') { const s = snapToLand(def.x, def.z, def.ax, def.az, 0.7); x = s.x; z = s.z; y = this.hAt(x, z) + 0.1; }
      else if (def.kind === 'city') y = Math.max(this.hAt(x, z), 0.5) + 0.1;
      else y = 0.08;
      const group = new THREE.Group(); group.position.set(x, y, z); this.scene.add(group);
      const c = new THREE.Color(this.slotColor(def.kind));
      colors.set([c.r, c.g, c.b], i * 3); phases[i] = (i * 0.37) % 1; states[i] = 1; kinds[i] = def.kind === 'defense' ? 0 : def.kind === 'oil' ? 1 : 2;
      v.set(x, y + 0.05, z); sc.set(4.2, 1, 4.2); m4.compose(v, q, sc); this.padMesh.setMatrixAt(i, m4);
      v.set(x, y + 1.2, z); sc.set(1, 1, 1); m4.compose(v, q, sc); this.iconMesh.setMatrixAt(i, m4);
      const rt: SlotRT = { def, idx: i, group, structure: null, occupied: false, buildId: null, level: 1, branch: null, pipe: null, topY: 1.5, phase: i * 0.61, visible: true };
      this.slots.set(def.id, rt); this.slotList.push(rt);
    });
    this.padState = new THREE.InstancedBufferAttribute(states, 1); this.padState.setUsage(THREE.DynamicDrawUsage);
    this.iconState = new THREE.InstancedBufferAttribute(states.slice(), 1); this.iconState.setUsage(THREE.DynamicDrawUsage);
    padGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
    padGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    padGeo.setAttribute('aState', this.padState);
    const ig = this.iconMesh.geometry;
    ig.setAttribute('aKind', new THREE.InstancedBufferAttribute(kinds, 1));
    ig.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases.slice(), 1));
    ig.setAttribute('aState', this.iconState);
    this.scene.add(this.padMesh, this.iconMesh);
    for (const rt of this.slotList) if (rt.def.built) this.build(rt.def.id, rt.def.built, true);
  }
  private refreshSlotStates(dist: number) {
    const showPads = dist < 460, showIcons = dist < 170;
    let changed = false;
    for (const rt of this.slotList) {
      const locked = this.locks.has(rt.def.zone);
      const vis = !rt.occupied && !locked && this.layers[rt.def.kind];
      rt.visible = vis;
      const ps = vis && showPads ? 1 : 0, is = vis && showIcons ? 1 : 0;
      if (this.padState.getX(rt.idx) !== ps) { this.padState.setX(rt.idx, ps); changed = true; }
      if (this.iconState.getX(rt.idx) !== is) { this.iconState.setX(rt.idx, is); changed = true; }
      if (rt.structure) rt.structure.visible = !locked || !!rt.def.built;
    }
    if (changed) { this.padState.needsUpdate = true; this.iconState.needsUpdate = true; }
  }
  private buildSelection() {
    this.selRing = new THREE.Group();
    const r = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.5, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(2.2), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
    r.rotation.x = -Math.PI / 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 2.2, 10, 6, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#7df3ff').multiplyScalar(1.6), transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.position.y = 5;
    this.selRing.add(r, beam); this.selRing.visible = false; this.selRing.renderOrder = 7;
    this.scene.add(this.selRing);
    this.range = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), makeRangeMaterial('#34f5a0'));
    this.range.renderOrder = 5; this.range.visible = false;
    this.range2 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), makeRangeMaterial('#4aa8ff'));
    (this.range2.material as THREE.ShaderMaterial).uniforms.uDashed.value = 1;
    this.range2.renderOrder = 5; this.range2.visible = false;
    this.scene.add(this.range, this.range2);
    this.uiAnims.push((t) => {
      r.rotation.z = t * 0.9; r.scale.setScalar(1 + 0.05 * Math.sin(t * 5));
      (this.range.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      (this.range2.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    });
  }

  // ============ سازه‌ها ============
  private makeStructure(rt: SlotRT, buildId: string, level: number, branch: 'A' | 'B' | null): THREE.Group | null {
    const { x, z } = rt.group.position;
    let g: THREE.Group | null = null;
    if (rt.def.kind === 'defense' && towerById(buildId)) g = this.models.tower(buildId, level, branch);
    else if (rt.def.kind === 'oil' && buildId === 'rig') g = this.models.rig();
    else if (rt.def.kind === 'city') g = this.models.city(buildId);
    if (!g) return null;
    const baseY = 0.1 - rt.group.position.y;
    g.traverse((o) => { if (o.userData.isBoat) o.userData.baseY = baseY; });
    mergeStatic(g);
    g.rotation.y = rt.def.kind === 'oil' ? (rt.phase * 2.3) % 6.28 : this.seaward(x, z);
    rt.topY = rt.def.kind === 'oil' ? 9 : rt.def.kind === 'city' ? 4.5 : 3.8;
    return g;
  }
  build(id: string, buildId: string, silent = false, level = 1, branch: 'A' | 'B' | null = null): boolean {
    const rt = this.slots.get(id);
    if (!rt || rt.occupied) return false;
    const g = this.makeStructure(rt, buildId, level, branch);
    if (!g) return false;
    rt.group.add(g); rt.structure = g; rt.occupied = true; rt.buildId = buildId; rt.level = level; rt.branch = branch;
    if (rt.def.kind === 'oil') this.addPipe(rt);
    this.refreshSlotStates(this.rts.dist);
    if (!silent) { this.popIn(g, rt.group.position); this.select(id); this.emitCounts(); }
    return true;
  }
  private popIn(g: THREE.Group, at: THREE.Vector3) {
    const target = g.scale.clone();
    g.scale.set(target.x, 0.01, target.z);
    const dust = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.8, 32), new THREE.MeshBasicMaterial({ color: '#fff4dc', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    dust.rotation.x = -Math.PI / 2; dust.position.copy(at); dust.position.y += 0.3;
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.TEX.glow, color: new THREE.Color(1.5, 2.5, 2.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flash.position.copy(at); flash.position.y += 2;
    this.scene.add(dust, flash);
    let life = 0;
    const a: AnimFn = (_t, dt) => {
      life += dt;
      const k = clamp(life / 0.75, 0, 1), c1 = 1.70158, c3 = c1 + 1;
      const ease = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
      g.scale.y = target.y * Math.max(0.01, ease);
      dust.scale.setScalar(1 + life * 8); (dust.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - life);
      flash.scale.setScalar(2 + life * 16); (flash.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - life * 1.6);
      if (life > 1) { g.scale.copy(target); this.scene.remove(dust, flash); this.uiAnims.splice(this.uiAnims.indexOf(a), 1); }
    };
    this.uiAnims.push(a);
  }
  private addPipe(rt: SlotRT) {
    const p = rt.group.position;
    let best = PIPE_TERMINALS[0], bd = 1e9;
    for (const t of PIPE_TERMINALS) { const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < bd) { bd = d; best = t; } }
    const mid = new THREE.Vector3((p.x + best.x) / 2 + (best.z - p.z) * 0.12, 0.2, (p.z + best.z) / 2 - (best.x - p.x) * 0.12);
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(p.x, 0.2, p.z), mid, new THREE.Vector3(best.x, 0.2, best.z));
    const m = makeRibbonMaterial('#ffb020', 0.15, 0.55, 0.3, 1.4);
    rt.pipe = this.ribbon(c, 0.4, m, 0.22, 80);
    this.scene.add(rt.pipe);
    this.anims.push((t) => { m.uniforms.uTime.value = t; });
  }
  upgrade(id: string): boolean { const rt = this.slots.get(id); if (!rt || !rt.occupied || rt.def.kind !== 'defense' || rt.level >= 3 || !rt.buildId) return false; return this.rebuild(rt, rt.level + 1, null); }
  specialize(id: string, branch: 'A' | 'B'): boolean { const rt = this.slots.get(id); if (!rt || !rt.occupied || rt.def.kind !== 'defense' || rt.level !== 3 || !rt.buildId) return false; return this.rebuild(rt, 4, branch); }
  private rebuild(rt: SlotRT, level: number, branch: 'A' | 'B' | null): boolean {
    if (rt.structure) rt.group.remove(rt.structure);
    const g = this.makeStructure(rt, rt.buildId!, level, branch);
    if (!g) return false;
    rt.group.add(g); rt.structure = g; rt.level = level; rt.branch = branch;
    this.popIn(g, rt.group.position); this.select(rt.def.id);
    return true;
  }
  demolish(id: string): boolean {
    const rt = this.slots.get(id);
    if (!rt || !rt.occupied || rt.def.built) return false;
    if (rt.structure) rt.group.remove(rt.structure);
    if (rt.pipe) { this.scene.remove(rt.pipe); rt.pipe = null; }
    rt.structure = null; rt.occupied = false; rt.buildId = null; rt.level = 1; rt.branch = null;
    this.refreshSlotStates(this.rts.dist);
    this.select(id); this.emitCounts();
    return true;
  }
  getSave(): SaveData {
    const builds: SaveData['builds'] = {};
    this.slots.forEach((rt) => { if (rt.occupied && !rt.def.built && rt.buildId) builds[rt.def.id] = { b: rt.buildId, l: rt.level, br: rt.branch }; });
    return { builds, unlocked: ZONES.filter((z) => z.locked && !this.locks.has(z.id)).map((z) => z.id) };
  }
  private applySave(s: SaveData) {
    for (const z of s.unlocked ?? []) this.unlockZone(z, false);
    for (const [id, b] of Object.entries(s.builds ?? {})) this.build(id, b.b, true, b.l, b.br);
  }

  // ============ مه جنگ ============
  private buildLocks() {
    const lockZones = ZONES.filter((z) => z.locked);
    const cloudTexs = [makeCloudTex(3), makeCloudTex(8)];
    lockZones.forEach((z, zi) => {
      const uniform = (zi === 0 ? this.terrainU.uLockA.value : this.terrainU.uLockB.value) as THREE.Vector4;
      uniform.set(z.x, z.z, z.lockR ?? 15, 1);
      const sprites: THREE.Sprite[] = []; const base: LockRT['base'] = [];
      const rng = mulberry(500 + zi);
      for (let i = 0; i < 22; i++) {
        const m = new THREE.SpriteMaterial({ map: cloudTexs[i % 2], transparent: true, depthWrite: false, color: new THREE.Color('#8e9bad'), opacity: 0.85 });
        const s = new THREE.Sprite(m);
        const sc = 16 + rng() * 16; s.scale.set(sc, sc * 0.55, 1);
        base.push({ y: 5 + rng() * 10, a: rng() * Math.PI * 2, r: Math.sqrt(rng()) * (z.lockR ?? 15) * 0.85 });
        this.scene.add(s); sprites.push(s);
      }
      const badge = document.createElement('div');
      badge.className = 'lock-badge';
      badge.innerHTML = `<div class="lb-ico"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div><div class="lb-txt"><b>${z.fa}</b><span>آزادسازی منطقه</span></div>`;
      badge.addEventListener('pointerdown', (e) => e.stopPropagation());
      badge.addEventListener('click', (e) => { e.stopPropagation(); this.opts.onLockTap(z.id); });
      this.overlay.appendChild(badge);
      const lk: LockRT = { zone: z.id, sprites, base, uniform, badge, fade: 1 };
      this.locks.set(z.id, lk);
      this.anims.push((t) => {
        sprites.forEach((s, i) => {
          const b = base[i], spread = 1 + (1 - lk.fade) * 2.4, a = b.a + t * 0.02 * (i % 2 ? 1 : -1);
          s.position.set(z.x + Math.cos(a) * b.r * spread, b.y + (1 - lk.fade) * 12, z.z + Math.sin(a) * b.r * spread);
          s.material.opacity = 0.85 * lk.fade;
        });
      });
    });
  }
  isLocked(zone: string) { return this.locks.has(zone); }
  unlockZone(zone: string, animate = true) {
    const lk = this.locks.get(zone);
    if (!lk) return;
    this.locks.delete(zone); lk.badge.remove();
    const finish = () => { lk.sprites.forEach((s) => this.scene.remove(s)); lk.uniform.w = 0; };
    if (!animate) { lk.fade = 0; finish(); this.refreshSlotStates(this.rts.dist); this.emitCounts(); return; }
    let life = 0;
    const a: AnimFn = (_t, dt) => { life += dt; lk.fade = Math.max(0, 1 - life / 2.4); lk.uniform.w = lk.fade; if (life > 2.4) { finish(); this.uiAnims.splice(this.uiAnims.indexOf(a), 1); } };
    this.uiAnims.push(a);
    this.flash = 0.25;
    setTimeout(() => { this.refreshSlotStates(this.rts.dist); this.emitCounts(); }, 900);
    const z = ZONES.find((zz) => zz.id === zone);
    if (z) this.rts.flyTo(z.x, z.z, z.dist, 1.8);
  }

  // ============ کشتی‌ها و هواگردها ============
  private lodIcon(follow: THREE.Object3D, color: string, tex: THREE.Texture) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
    s.scale.set(0.026, 0.026, 1); s.renderOrder = 15;
    this.groups.lod.add(s); this.lodIcons.push({ s, follow });
  }
  private buildShips() {
    const p = new THREE.Vector3(), t = new THREE.Vector3();
    const nM = IS_MOBILE ? 6 : 9;
    for (let i = 0; i < nM; i++) {
      const ship = this.models.merchant(i); mergeStatic(ship);
      this.groups.merchants.add(ship);
      const dir = i % 2 ? 1 : -1;
      let u = (i / nM + 0.05) % 1;
      const speed = 0.0028 + (i % 3) * 0.0008;
      this.anims.push((tt, dt) => {
        u = (u + dt * speed * dir + 1) % 1;
        this.trade.getPointAt(u, p); this.trade.getTangentAt(u, t);
        const off = dir > 0 ? 1.9 : -1.9;
        ship.position.set(p.x - t.z * off, Math.sin(tt * 1.4 + i) * 0.05, p.z + t.x * off);
        ship.rotation.y = Math.atan2(t.x * dir, t.z * dir);
        ship.rotation.z = Math.sin(tt * 1.1 + i) * 0.025 * (1 + this.weatherK.storm * 3);
      });
      this.lodIcon(ship, '#4ff5e6', this.icons.ship);
    }
    // تانکر به سمت بندر
    { const ship = this.models.merchant(1); mergeStatic(ship); this.groups.merchants.add(ship); let u = 0.2;
      this.anims.push((tt, dt) => { u = (u + dt * 0.004) % 1; const uu = u < 0.5 ? u * 2 : 2 - u * 2; this.spur.getPointAt(uu, p); this.spur.getTangentAt(uu, t); const dir = u < 0.5 ? 1 : -1; ship.position.set(p.x, Math.sin(tt) * 0.04, p.z); ship.rotation.y = Math.atan2(t.x * dir, t.z * dir); }); }
    this.scene.add(this.groups.merchants);
    const fleet = (curve: THREE.CatmullRomCurve3, nShips: number, nBoats: number, startU: number) => {
      const units: { o: THREE.Group; lane: number; lag: number; boat: boolean }[] = [];
      for (let i = 0; i < nShips; i++) { const o = this.models.warship(); mergeStatic(o); units.push({ o, lane: (i % 2 ? 1 : -1) * 0.9, lag: i * 0.012, boat: false }); }
      for (let i = 0; i < nBoats; i++) { const o = this.models.speedboat('#3a2a2a'); mergeStatic(o); units.push({ o, lane: (i % 3 - 1) * 1.6, lag: -0.008 - (i % 3) * 0.003 - Math.floor(i / 3) * 0.006, boat: true }); }
      let u = startU;
      units.forEach((un) => {
        const ring = new THREE.Mesh(new THREE.RingGeometry(un.boat ? 0.9 : 2.2, un.boat ? 1.05 : 2.45, un.boat ? 3 : 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a3d').multiplyScalar(2), transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; un.o.add(ring);
        this.groups.fleet.add(un.o);
        if (!un.boat) this.lodIcon(un.o, '#ff3348', this.icons.chevron);
      });
      this.anims.push((tt, dt) => {
        u = (u + dt * 0.0055) % 1;
        units.forEach((un, i) => {
          const uu = ((u - un.lag) % 1 + 1) % 1;
          curve.getPointAt(uu, p); curve.getTangentAt(uu, t);
          un.o.position.set(p.x - t.z * un.lane, Math.sin(tt * 2 + i) * 0.05, p.z + t.x * un.lane);
          un.o.rotation.y = Math.atan2(t.x, t.z);
        });
      });
    };
    fleet(this.laneA, 3, 6, 0.25); fleet(this.laneB, 2, 6, 0.12);
    this.scene.add(this.groups.fleet, this.groups.lod);
  }
  private buildAir() {
    const H = [{ cx: BASE_POS.x + 6, cz: BASE_POS.z - 2, r: 14, y: 9, sp: 0.16 }, { cx: -10, cz: -16, r: 18, y: 11, sp: -0.12 }, { cx: 38, cz: -24, r: 10, y: 8, sp: 0.2 }];
    H.forEach((hp, i) => {
      const h = this.models.heli(); mergeStatic(h); this.groups.air.add(h);
      this.anims.push((t) => {
        const a = t * hp.sp + i * 2;
        h.position.set(hp.cx + Math.cos(a) * hp.r, hp.y + Math.sin(t * 0.8 + i) * 0.6, hp.cz + Math.sin(a) * hp.r * 0.7);
        const da = hp.sp > 0 ? 1 : -1;
        h.rotation.y = Math.atan2(-Math.sin(a) * da, Math.cos(a) * 0.7 * da); h.rotation.z = -0.15 * da;
      });
      this.lodIcon(h, '#a7f3d0', this.icons.chevron);
    });
    for (let k = 0; k < 2; k++) {
      const jet = this.models.jet(); mergeStatic(jet); jet.scale.setScalar(1.4); this.groups.air.add(jet);
      const N = 80, trail: THREE.Vector3[] = [];
      const P = new Float32Array(N * 6), C = new Float32Array(N * 6), I: number[] = [];
      for (let i = 0; i < N - 1; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setIndex(I);
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      mesh.frustumCulled = false; this.groups.air.add(mesh);
      this.anims.push((t) => {
        const a = t * 0.06 + k * 0.12;
        const x = 10 + Math.cos(a) * 95, z = 5 + Math.sin(a) * 45, y = 40 + k * 1.5, off = k ? 2.5 : 0;
        jet.position.set(x + Math.sin(a) * off, y, z - Math.cos(a) * off);
        jet.rotation.set(0, Math.atan2(-Math.sin(a) * 95, Math.cos(a) * 45), 0.5);
        trail.unshift(jet.position.clone()); if (trail.length > N) trail.pop();
        for (let i = 0; i < N; i++) {
          const q = trail[Math.min(i, trail.length - 1)] ?? jet.position; const w = 0.12 + i * 0.012;
          P.set([q.x, q.y + w, q.z, q.x, q.y - w * 0.2, q.z], i * 6);
          const f = Math.max(0, 1 - i / N) * 0.55; C.set([f, f, f, f, f, f], i * 6);
        }
        g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
      });
      this.lodIcon(jet, '#93c5fd', this.icons.chevron);
    }
    this.scene.add(this.groups.air);
  }

  // ============ ابر و باران ============
  private buildClouds() {
    const texs = [makeCloudTex(11), makeCloudTex(23), makeCloudTex(37)];
    const rng = mulberry(9);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.SpriteMaterial({ map: texs[i % 3], transparent: true, depthWrite: false, opacity: 0, fog: false });
      const s = new THREE.Sprite(m);
      s.position.set(-420 + rng() * 580, 95 + rng() * 60, -220 + rng() * 420);
      const sc = 70 + rng() * 80; s.scale.set(sc, sc * 0.55, 1); s.renderOrder = 30;
      this.scene.add(s); this.cloudSprites.push({ s, m, speed: 0.6 + rng() * 0.8 });
    }
  }
  private buildRain() {
    const N = IS_MOBILE ? 1400 : 2600;
    const P = new Float32Array(N * 6), O = new Float32Array(N * 6);
    const rng = mulberry(5);
    for (let i = 0; i < N; i++) { const x = rng() * 2 - 1, y = rng(), z = rng() * 2 - 1; P.set([0, 0, 0, 0, -1, 0], i * 6); O.set([x, y, z, x, y, z], i * 6); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aOff', new THREE.BufferAttribute(O, 3));
    this.rainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uSize: { value: 100 }, uOp: { value: 0 } },
      vertexShader: `attribute vec3 aOff; uniform float uTime, uSize;
        void main(){ float H = uSize*0.8; vec3 p = vec3(aOff.x*uSize, mod(aOff.y*H - uTime*H*1.6, H), aOff.z*uSize);
          p += position * vec3(0.0, uSize*0.025, 0.0) + vec3(position.y*uSize*0.004, 0.0, 0.0);
          gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `uniform float uOp; void main(){ gl_FragColor = vec4(0.75,0.82,0.92, uOp); }`,
    });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false; this.rain.visible = false;
    this.scene.add(this.rain);
  }

  // ============ برچسب‌ها ============
  private buildLabels() {
    for (const l of LABELS) {
      const el = document.createElement('div');
      el.className = `map-label ml-${l.kind}`;
      el.innerHTML = l.en ? `<b>${l.fa}</b><i>${l.en}</i>` : `<b>${l.fa}</b>`;
      this.overlay.appendChild(el);
      this.labelEls.push({ el, x: l.x, z: l.z, y: Math.max(this.hAt(l.x, l.z), 0) + 1.5, level: l.level, kind: l.kind });
    }
    for (const z of ZONES) {
      if (z.id === 'overview') continue;
      const el = document.createElement('div');
      el.className = 'zone-badge'; el.style.setProperty('--zc', z.color);
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => { e.stopPropagation(); this.flyToZone(z.id); });
      this.overlay.appendChild(el);
      this.zoneBadges.push({ el, zone: z.id, x: z.x, z: z.z });
    }
  }
  private updateBadges() {
    const counts = this.countsNow();
    for (const b of this.zoneBadges) {
      const z = ZONES.find((zz) => zz.id === b.zone)!, c = counts[b.zone] ?? { total: 0, built: 0 }, locked = this.locks.has(b.zone);
      b.el.classList.toggle('locked', locked);
      b.el.innerHTML = `<span class="zb-prd">${z.prd}</span><b>${z.fa}</b><span class="zb-c">${locked ? 'قفل' : `${c.built.toLocaleString('fa-IR')}/${c.total.toLocaleString('fa-IR')}`}</span>`;
    }
  }
  private project(x: number, y: number, z: number, w: number, h: number): { x: number; y: number; ok: boolean } {
    this.v3.set(x, y, z).project(this.camera);
    return { x: (this.v3.x * 0.5 + 0.5) * w, y: (-this.v3.y * 0.5 + 0.5) * h, ok: this.v3.z < 1 && Math.abs(this.v3.x) < 1.1 && Math.abs(this.v3.y) < 1.1 };
  }
  private updateOverlay(dist: number) {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const maxLevel = dist > 520 ? 0 : dist > 190 ? 1 : 2;
    const strategic = dist > TIER.tactical * 1.25;
    const placed: number[][] = [];
    const fits = (x: number, y: number, ww: number, hh: number) => {
      const r = [x - ww / 2 - 3, y - hh / 2 - 3, x + ww / 2 + 3, y + hh / 2 + 3];
      for (const q of placed) if (r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]) return false;
      placed.push(r); return true;
    };
    for (const b of this.zoneBadges) {
      if (!(strategic && this.layers.labels)) { b.el.style.display = 'none'; continue; }
      const p = this.project(b.x, 2, b.z, w, h);
      if (!p.ok) { b.el.style.display = 'none'; continue; }
      b.el.style.display = '';
      const bw = b.el.offsetWidth || 90, bh = b.el.offsetHeight || 40;
      if (!fits(p.x, p.y + 6 + bh / 2, bw, bh)) { b.el.style.display = 'none'; continue; }
      b.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${(p.y + 6).toFixed(1)}px,0) translate(-50%,0)`;
    }
    for (const l of this.labelEls) {
      let show = this.layers.labels && l.level <= maxLevel;
      if (l.kind === 'country' && dist < 260) show = false;
      if (l.kind === 'water' && l.level === 0 && dist < 140) show = false;
      if (!show) { if (l.el.style.display !== 'none') l.el.style.display = 'none'; continue; }
      const p = this.project(l.x, l.y, l.z, w, h);
      if (!p.ok) { l.el.style.display = 'none'; continue; }
      l.el.style.display = '';
      if (!fits(p.x, p.y, l.el.offsetWidth || 60, l.el.offsetHeight || 18)) { l.el.style.display = 'none'; continue; }
      l.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) translate(-50%,-50%)`;
    }
    this.locks.forEach((lk) => {
      const z = ZONES.find((zz) => zz.id === lk.zone)!;
      const p = this.project(z.x, 6, z.z, w, h);
      if (!p.ok || strategic) { lk.badge.style.display = 'none'; return; }
      lk.badge.style.display = '';
      lk.badge.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) translate(-50%,-50%)`;
    });
    if (this.selected && this.anchorEl) {
      const g = this.selected.group.position;
      const p = this.project(g.x, g.y + (this.selected.occupied ? this.selected.topY * 0.5 : 0.6), g.z, w, h);
      this.anchorEl.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`;
      this.anchorEl.style.opacity = p.ok ? '1' : '0';
    }
  }

  // ============ انتخاب ============
  private pick(cx: number, cy: number) {
    const r = this.renderer.domElement.getBoundingClientRect(), w = r.width, h = r.height, dist = this.rts.dist;
    if (dist > TIER.tactical * 1.25) {
      const g = new THREE.Vector3();
      if (this.rts.groundAt(cx, cy, g)) this.rts.flyTo(g.x, g.z, 180, 1.2);
      this.select(null); return;
    }
    let best: SlotRT | null = null, bd = (IS_MOBILE ? 46 : 36) ** 2;
    for (const rt of this.slotList) {
      if (!rt.visible && !rt.occupied) continue;
      if (this.locks.has(rt.def.zone) && !rt.def.built) continue;
      const p = rt.group.position, yOff = rt.occupied ? rt.topY * 0.45 : 1.2;
      const s = this.project(p.x, p.y + yOff, p.z, w, h); if (!s.ok) continue;
      const s2 = this.project(p.x, p.y, p.z, w, h);
      const dd = Math.min((s.x - (cx - r.left)) ** 2 + (s.y - (cy - r.top)) ** 2, (s2.x - (cx - r.left)) ** 2 + (s2.y - (cy - r.top)) ** 2);
      if (dd < bd) { bd = dd; best = rt; }
    }
    if (best) {
      const b = best as SlotRT;
      this.select(b.def.id);
      if (navigator.vibrate) navigator.vibrate(8);
      const p = b.group.position;
      this.rts.flyTo(p.x, p.z, dist > 90 ? 52 : dist, 0.7);
    } else this.select(null);
  }
  info(rt: SlotRT): SlotInfo { return { id: rt.def.id, kind: rt.def.kind, name: rt.def.name, zone: rt.def.zone, occupied: rt.occupied, buildId: rt.buildId, level: rt.level, branch: rt.branch, key: !!rt.def.built }; }
  select(id: string | null) {
    this.selected = id ? this.slots.get(id) ?? null : null;
    const rt = this.selected;
    this.range.visible = false; this.range2.visible = false;
    if (!rt) { this.selRing.visible = false; this.opts.onSelect(null); return; }
    const p = rt.group.position;
    this.selRing.visible = true; this.selRing.position.set(p.x, p.y + 0.12, p.z);
    if (rt.def.kind === 'defense') {
      const tw = rt.buildId ? towerById(rt.buildId) : null, base = tw?.range ?? 16, lvl = rt.occupied ? rt.level : 1;
      const r1 = base * (1 + (lvl - 1) * 0.12);
      this.range.visible = true; this.range.position.set(p.x, 0.4, p.z); this.range.scale.set(r1, 1, r1);
      (this.range.material as THREE.ShaderMaterial).uniforms.uColor.value.set(rt.occupied ? (tw?.color ?? '#34f5a0') : '#34f5a0');
      if (rt.occupied && rt.level < 4) { const r2 = base * (1 + lvl * 0.12); this.range2.visible = true; this.range2.position.set(p.x, 0.41, p.z); this.range2.scale.set(r2, 1, r2); }
    }
    this.opts.onSelect(this.info(rt));
  }
  setAnchor(el: HTMLElement | null) { this.anchorEl = el; }

  // ============ کنترل‌های عمومی ============
  setLayers(l: LayerState) {
    this.layers = { ...l };
    this.groups.enemy.visible = l.enemyPath; this.groups.trade.visible = l.tradePath;
    this.groups.fleet.visible = l.fleet; this.groups.air.visible = l.air; this.groups.merchants.visible = l.tradePath;
    this.refreshSlotStates(this.rts.dist);
  }
  setTactical(b: boolean) { this.tacticalManual = b; }
  setTimeScale(s: number) { this.timeScale = s; }
  setAutoCycle(b: boolean) { this.autoCycle = b; }
  getTime() { return this.timeH; }
  setWeather(w: Weather) { this.weather = w; }
  flyToZone(id: string) {
    const z = ZONES.find((zz) => zz.id === id);
    if (!z) return;
    this.rts.flyTo(z.x, z.z, Math.min(z.dist, this.rts.maxDist * 0.96), 1.7, 0);
  }
  flyToTier(t: ZoomTier) {
    const d = t === 'strategic' ? this.rts.maxDist * 0.75 : t === 'tactical' ? 160 : 40;
    this.rts.flyTo(this.rts.target.x, this.rts.target.z, d, 1.0);
  }
  zoomBy(f: number) { this.rts.zoomAt(f); }
  resetNorth() { this.rts.flyTo(this.rts.target.x, this.rts.target.z, this.rts.dist, 0.8, 0); }
  panTo(x: number, z: number) { this.rts.flyTo(x, z, Math.min(this.rts.dist, 400), 0.9); }

  setTimeOfDay(hh: number) {
    this.timeH = ((hh % 24) + 24) % 24;
    const ang = ((this.timeH - 6) / 12) * Math.PI, ex = Math.cos(ang), ey = Math.sin(ang);
    const day = smoothstep(-0.08, 0.22, ey), dusk = clamp(1 - Math.abs(ey) * 3.6, 0, 1) * (ey > -0.25 ? 1 : 0);
    this.night = 1 - day;
    const C = (a: string) => new THREE.Color(a);
    const mix3 = (d: string, du: string, n: string) => C(n).lerp(C(d), day).lerp(C(du), dusk * 0.7);
    const st = this.weatherK.storm, du = this.weatherK.dust;
    if (ey > -0.1) {
      this.sunDir.set(ex * 0.8, Math.max(ey, 0.06) + 0.12, 0.45).normalize();
      this.sun.color.copy(C('#fff3e2').lerp(C('#ff9046'), dusk * 0.85));
      this.sun.intensity = lerp(2.9, 1.5, dusk) * (1 - st * 0.65) * (1 - du * 0.4);
    } else { this.sunDir.set(-ex * 0.6, 0.75, -0.3).normalize(); this.sun.color.set('#9db4ea'); this.sun.intensity = 0.9; }
    this.hemi.intensity = lerp(0.42, 0.9, day) * (1 - st * 0.3);
    this.hemi.color.copy(mix3('#d2e6ff', '#ffc9a0', '#4a5f9a'));
    let fog = mix3('#bfdcec', '#f2a36a', '#0a1428');
    if (st > 0) fog = fog.lerp(C(this.night > 0.5 ? '#0b1220' : '#5d6b78'), st * 0.85);
    if (du > 0) fog = fog.lerp(C(this.night > 0.5 ? '#2a1c10' : '#c89a5e'), du * 0.85);
    (this.scene.background as THREE.Color).copy(fog); (this.scene.fog as THREE.Fog).color.copy(fog);
    const U = this.waterMat.uniforms;
    (U.uDeep.value as THREE.Color).copy(C('#06325c').lerp(C('#020a18'), this.night * 0.85).lerp(C('#1f3340'), st * 0.5));
    (U.uShallow.value as THREE.Color).copy(C('#0f7fa6').lerp(C('#062636'), this.night * 0.85).lerp(C('#35606a'), st * 0.5));
    (U.uTurq.value as THREE.Color).copy(C('#34d2c6').lerp(C('#0b3a40'), this.night * 0.85).lerp(C('#6f9a92'), st * 0.5).lerp(C('#a8b48a'), du * 0.4));
    (U.uSkyTop.value as THREE.Color).copy(mix3('#3d85c6', '#4b4f8c', '#03070f').lerp(C('#3c4652'), st));
    (U.uSkyHor.value as THREE.Color).copy(fog);
    (U.uSunCol.value as THREE.Color).copy(this.sun.color).multiplyScalar(this.night > 0.6 ? 0.45 : 1);
    (U.uSunDir.value as THREE.Vector3).copy(this.sunDir); (U.uFog.value as THREE.Color).copy(fog);
    U.uNight.value = this.night; U.uStorm.value = st;
    this.terrainU.uNight.value = this.night;
    this.lightsMat.uniforms.uNight.value = smoothstep(0.35, 0.85, this.night);
    this.windowMat.emissiveIntensity = smoothstep(0.3, 0.9, this.night) * 2.4;
    this.renderer.toneMappingExposure = lerp(0.85, 1.02, day) * (1 - st * 0.15);
    if (this.bloom) { this.bloom.strength = lerp(0.7, 0.3, day); this.bloom.threshold = lerp(0.88, 1.05, day); }
    if (this.grade) {
      const tint = new THREE.Vector3(1, 1, 1);
      if (dusk > 0) tint.lerp(new THREE.Vector3(1.06, 0.98, 0.9), dusk);
      if (this.night > 0.5) tint.lerp(new THREE.Vector3(0.88, 0.95, 1.12), this.night - 0.5);
      if (du > 0) tint.lerp(new THREE.Vector3(1.12, 0.98, 0.8), du * 0.7);
      this.grade.uniforms.uTint.value.copy(tint); this.grade.uniforms.uSat.value = 1.14 - st * 0.35;
    }
    this.cloudSprites.forEach((c) => c.m.color.copy(C('#ffffff').lerp(C('#ffb08a'), dusk * 0.7).lerp(C('#2b3550'), this.night * 0.85).lerp(C('#7d8691'), st * 0.6)));
  }

  // ============ مینی‌مپ ============
  private buildMinimapBase() {
    const W = 330, H = 240;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = OUTER.x0 + (i / (W - 1)) * OUTER_W, z = OUTER.z0 + (j / (H - 1)) * OUTER_D;
      const hh = this.hAt(x, z), k = (j * W + i) * 4;
      if (hh < 0.05) { const d = clamp(-hh / 14, 0, 1); img.data[k] = lerp(60, 8, d); img.data[k + 1] = lerp(190, 50, d); img.data[k + 2] = lerp(200, 100, d); }
      else { const sh = clamp(0.8 + (this.hAt(x - 2, z - 2) - hh) * 0.12, 0.5, 1.2); const t = hh > 6 ? [150, 135, 120] : hh > 2.5 ? [190, 165, 125] : [222, 203, 150]; img.data[k] = t[0] * sh; img.data[k + 1] = t[1] * sh; img.data[k + 2] = t[2] * sh; }
      img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const path = (pts: number[][], color: string, wd: number) => {
      ctx.strokeStyle = color; ctx.lineWidth = wd; ctx.setLineDash([4, 3]); ctx.beginPath();
      pts.forEach(([x, z], k) => { const px = ((x - OUTER.x0) / OUTER_W) * W, py = ((z - OUTER.z0) / OUTER_D) * H; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
      ctx.stroke(); ctx.setLineDash([]);
    };
    path(TRADE_LANE, 'rgba(60,240,220,0.85)', 1.2); path(LANE_A, 'rgba(255,50,70,1)', 1.8); path(LANE_B, 'rgba(255,130,40,1)', 1.8);
    this.mmBase = c;
  }
  private drawMinimap() {
    if (!this.mmBase) return;
    const cv = this.minimap, W = cv.width, H = cv.height;
    if (!W || !H) return;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, W, H); ctx.drawImage(this.mmBase, 0, 0, W, H);
    const px = (x: number) => ((x - OUTER.x0) / OUTER_W) * W, pz = (z: number) => ((z - OUTER.z0) / OUTER_D) * H;
    this.locks.forEach((lk) => {
      const z = ZONES.find((zz) => zz.id === lk.zone)!;
      ctx.fillStyle = 'rgba(10,16,28,0.6)'; ctx.beginPath(); ctx.arc(px(z.x), pz(z.z), ((z.lockR ?? 15) / OUTER_W) * W, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(167,139,250,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
    });
    for (const rt of this.slotList) { if (!rt.visible && !rt.occupied) continue; ctx.fillStyle = rt.occupied ? '#ffffff' : this.slotColor(rt.def.kind); ctx.fillRect(px(rt.group.position.x) - 1.2, pz(rt.group.position.z) - 1.2, 2.4, 2.4); }
    ctx.fillStyle = '#ff3b5c'; ctx.beginPath(); ctx.arc(px(BASE_POS.x), pz(BASE_POS.z), 3.5, 0, 7); ctx.fill();
    const r = this.renderer.domElement.getBoundingClientRect();
    const corners = [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]];
    const g = new THREE.Vector3();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); let ok = true;
    corners.forEach(([x, y], i) => { if (!this.rts.groundAt(x, y, g)) { ok = false; return; } if (i === 0) ctx.moveTo(px(g.x), pz(g.z)); else ctx.lineTo(px(g.x), pz(g.z)); });
    if (ok) { ctx.closePath(); ctx.fill(); ctx.stroke(); }
  }
  minimapClick(fx: number, fy: number) { this.panTo(OUTER.x0 + fx * OUTER_W, OUTER.z0 + fy * OUTER_D); }

  // ============ شمارنده‌ها ============
  private countsNow(): SlotCounts {
    const c: SlotCounts = {};
    for (const rt of this.slotList) {
      const z = rt.def.zone; c[z] = c[z] ?? { total: 0, built: 0 }; c[z].total++; if (rt.occupied) c[z].built++;
      const k = `kind:${rt.def.kind}`; c[k] = c[k] ?? { total: 0, built: 0 }; c[k].total++; if (rt.occupied) c[k].built++;
    }
    return c;
  }
  private emitCounts() { this.opts.onCounts(this.countsNow()); this.updateBadges(); }

  // ============ حلقه اصلی ============
  private onResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h || !this.renderer) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h); this.composer?.setSize(w, h);
    this.rts.maxDist = w / h < 0.8 ? 1300 : 760;
  }
  private tick() {
    if (this.disposed) return;
    const rdt = Math.min(this.clock.getDelta(), 0.05), dt = rdt * this.timeScale;
    this.worldTime += dt;
    const t = this.worldTime, ut = this.clock.elapsedTime;
    if (this.attract && !this.rts.isBusy()) this.rts.yaw += rdt * 0.03;
    this.rts.update(rdt);
    const dist = this.rts.dist;
    const ws = this.weather === 'storm' ? 1 : 0, wd = this.weather === 'dust' ? 1 : 0;
    const oldK = this.weatherK.storm + this.weatherK.dust;
    this.weatherK.storm = lerp(this.weatherK.storm, ws, 1 - Math.exp(-rdt * 1.5));
    this.weatherK.dust = lerp(this.weatherK.dust, wd, 1 - Math.exp(-rdt * 1.5));
    if (this.autoCycle) this.setTimeOfDay(this.timeH + rdt * 0.4);
    else if (Math.abs(this.weatherK.storm + this.weatherK.dust - oldK) > 0.0005) this.setTimeOfDay(this.timeH);
    const fogF = this.scene.fog as THREE.Fog, wk = Math.max(this.weatherK.storm * 0.7, this.weatherK.dust);
    fogF.near = lerp(dist * 1.0 + 50, dist * 0.3, wk); fogF.far = lerp(dist * 2.5 + 260, dist * 1.4 + 60, wk);
    (this.waterMat.uniforms.uFogRange.value as THREE.Vector2).set(fogF.near, fogF.far);
    this.waterMat.uniforms.uTime.value = t; this.terrainU.uTime.value = t;
    (this.waterMat.uniforms.uCam.value as THREE.Vector3).copy(this.camera.position);
    this.lightsMat.uniforms.uTime.value = ut; this.lightsMat.uniforms.uScale.value = this.renderer.domElement.height * 0.9;
    this.padMat.uniforms.uTime.value = ut; this.padMat.uniforms.uScale.value = clamp(dist / 70, 0.85, 1.6);
    this.iconMat.uniforms.uTime.value = ut;
    this.iconMat.uniforms.uPx.value = IS_MOBILE ? 42 : 36;
    this.terrainU.uDetail.value = 1 - smoothstep(50, 170, dist);
    if (this.veg) { const v = this.veg; v.far.forEach((o) => { o.visible = dist < 520; }); v.mid.forEach((o) => { o.visible = dist < 230; }); v.near.forEach((o) => { o.visible = dist < 150; }); }
    this.iconMat.uniforms.uPxToWorld.value = (2 * Math.tan((this.camera.fov * Math.PI) / 360)) / this.container.clientHeight;
    const autoGrid = smoothstep(380, 700, dist) * 0.6;
    this.gridVal = lerp(this.gridVal, Math.max(autoGrid, this.tacticalManual ? 0.9 : 0), 1 - Math.exp(-rdt * 5));
    this.terrainU.uGrid.value = this.gridVal; this.waterMat.uniforms.uGrid.value = this.gridVal;
    // سایه
    const half = clamp(dist * 0.62, 18, 330), sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - half) > half * 0.04) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
    const texel = (half * 2) / this.sun.shadow.mapSize.x;
    const tx = Math.round(this.rts.target.x / texel) * texel, tz = Math.round(this.rts.target.z / texel) * texel;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + this.sunDir.x * 400, this.sunDir.y * 400, tz + this.sunDir.z * 400);
    const shadowK = 1 - smoothstep(520, 850, dist);
    (this.sun.shadow as unknown as { intensity: number }).intensity = shadowK;
    this.sun.castShadow = shadowK > 0.02 && this.useComposer;
    // ابر
    const cloudK = smoothstep(380, 900, dist) * 0.5 + this.weatherK.storm * 0.3, holeR = dist * 0.2;
    for (const c of this.cloudSprites) {
      c.s.position.x += rdt * c.speed * (1 + this.weatherK.storm * 3); if (c.s.position.x > 200) c.s.position.x = -440;
      const hole = smoothstep(holeR * 0.6, holeR * 1.6, Math.hypot(c.s.position.x - this.rts.target.x, c.s.position.z - this.rts.target.z));
      c.m.opacity = cloudK * hole * (0.8 + this.weatherK.storm * 0.2);
    }
    this.rain.visible = this.weatherK.storm > 0.05;
    if (this.rain.visible) {
      this.rain.position.set(this.rts.target.x, 0, this.rts.target.z);
      this.rainMat.uniforms.uSize.value = clamp(dist * 0.9, 30, 320); this.rainMat.uniforms.uTime.value = ut; this.rainMat.uniforms.uOp.value = 0.45 * this.weatherK.storm;
      this.nextLightning -= rdt;
      if (this.nextLightning < 0 && this.weather === 'storm') { this.flash = 0.6; this.nextLightning = 3 + Math.random() * 7; }
    }
    this.flash = Math.max(0, this.flash - rdt * 2.5);
    if (this.grade) { this.grade.uniforms.uFlash.value = this.flash * (Math.random() > 0.3 ? 0.35 : 0.1); this.grade.uniforms.uVig.value = lerp(0.26, 0.42, smoothstep(500, 1300, dist)); }
    const tierNow: ZoomTier = dist > TIER.tactical ? 'strategic' : dist > TIER.close ? 'tactical' : 'close';
    this.refreshSlotStates(dist);
    const lodK = dist > 300;
    this.groups.lod.visible = lodK;
    if (lodK) for (const li of this.lodIcons) { li.follow.getWorldPosition(li.s.position); li.s.position.y += 2; li.s.visible = this.visibleChain(li.follow); }
    this.selRing.scale.setScalar(this.selected && !this.selected.occupied ? clamp(dist / 70, 0.9, 1.6) : 1.6);
    for (const a of this.anims) a(t, dt);
    for (const a of [...this.uiAnims]) a(ut, rdt);
    this.updateOverlay(dist);
    if (tierNow !== this.tier || Math.abs(dist - this.lastCamEmit.d) > dist * 0.03 || Math.abs(this.rts.yaw - this.lastCamEmit.y) > 0.03) {
      this.tier = tierNow; this.lastCamEmit = { d: dist, y: this.rts.yaw }; this.opts.onCamera(tierNow, dist, this.rts.yaw);
    }
    this.mmTimer += rdt;
    if (this.mmTimer > 0.2) { this.mmTimer = 0; this.drawMinimap(); }
    if (this.composer && this.useComposer) this.composer.render(rdt); else this.renderer.render(this.scene, this.camera);
  }
  private visibleChain(o: THREE.Object3D): boolean { let p: THREE.Object3D | null = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; }
  setQuality(q: 'high' | 'low') {
    this.useComposer = q === 'high';
    this.renderer.shadowMap.enabled = q === 'high';
    this.renderer.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, IS_MOBILE ? 1.75 : 2) : 1);
    this.onResize();
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (!m) return; (Array.isArray(m) ? m : [m]).forEach((mm) => { mm.needsUpdate = true; }); });
  }
  dispose() {
    this.disposed = true;
    if (!this.renderer) return;
    this.renderer.setAnimationLoop(null);
    this.resizeObs?.disconnect(); this.rts?.dispose(); this.composer?.dispose(); this.renderer.dispose();
    this.renderer.domElement.remove(); this.overlay.innerHTML = '';
  }
}
