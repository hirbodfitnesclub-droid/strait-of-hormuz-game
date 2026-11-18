import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { batchStatics } from './batch-statics';
import slotsData from './slots-3d.json';
import buildingsData from './buildings-3d.json';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<THREE.Group>>();

function mlog(msg: string) {
  const w = window as unknown as { __m3dlog?: string[] };
  (w.__m3dlog ??= []).push(msg);
  console.info('[models3d]', msg);
}

let decoderReady: Promise<void> | undefined;

function waitForDecoder(): Promise<void> {
  if (!decoderReady) {
    decoderReady = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('meshopt decoder timeout')), 10000);
      MeshoptDecoder.ready.then(resolve, reject).finally(() => clearTimeout(timer));
    }).catch(error => {
      decoderReady = undefined;
      throw error;
    });
  }
  return decoderReady;
}

function cachedModel(url: string): Promise<THREE.Group> {
  const existing = cache.get(url);
  if (existing) return existing;
  const pending = (async () => {
    await waitForDecoder();
    mlog('load-start ' + url);
    const { scene } = await loader.loadAsync(url);
    scene.traverse(node => { if ((node as THREE.Mesh).isMesh) node.castShadow = true; });
    if (url.startsWith('/models/towers/')) {
      // Legacy pack exports place the vertex-painted showroom Island before the Pad.
      // Strip that single mesh before bounds/placement; the battle map supplies its own land.
      const tower = scene.children[0]?.children[0];
      const island = tower?.children[0] as THREE.Mesh | undefined;
      if (island?.isMesh && island.geometry.hasAttribute('color')) {
        island.geometry.computeBoundingBox();
        const box = island.geometry.boundingBox!;
        if (Math.abs(box.min.y + 1.4) < 0.02 && Math.abs(box.max.y - 0.42) < 0.03) island.removeFromParent();
      }
    }
    batchStatics(scene);
    mlog('load-done ' + url);
    return scene;
  })().catch(error => {
    cache.delete(url);
    throw error;
  });
  cache.set(url, pending);
  return pending;
}

export async function loadModel(url: string): Promise<THREE.Group> {
  return (await cachedModel(url)).clone(true);
}

/** Tall offshore derricks must not obscure adjacent lanes in the portrait view. */
export function buildingScale(size: THREE.Vector3, offshore: boolean): number {
  return Math.min((offshore ? 7 : 9.5) / Math.max(size.x, size.z, 0.001), 8.5 / Math.max(size.y, 0.001));
}

function fitWidth(obj: THREE.Object3D, target: number) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = target / Math.max(size.x, size.z, 0.001);
  obj.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box2.min.y;
  return obj;
}

// Terrain height comes from the map's own field (same function that built the mesh) — no raycasts.
interface FieldLike { height(x: number, z: number): number }

/** Preload every model the game can place, so nothing decodes/compiles mid-battle. */
export async function preloadModels(onProgress?: (done: number, total: number) => void): Promise<void> {
  const urls: string[] = [];
  for (const base of Object.values(TOWER_MODEL)) for (const st of [1]) urls.push(`/models/towers/${base}-L${st}.glb`);
  for (const b of ['platform', 'tankfarm', 'dock', 'refinery', 'steel', 'ammo', 'power', 'desal', 'town', 'welfare', 'customs']) urls.push(`/models/buildings/${b}-T1.glb`);
  urls.push('/models/kenney/ship-cargo-a.glb', '/models/kenney/boat-tug-a.glb', '/models/kenney/boat-speed-a.glb');
  // D-022 ship hulls (Innerscene CC0, flat-baked + decimated — CREDITS.md)
  urls.push('/models/ships/frigate.glb', '/models/ships/carrier.glb', '/models/ships/tanker.glb', '/models/ships/container.glb', '/models/ships/bulk.glb', '/models/ships/submarine.glb', '/models/ships/pilot.glb', '/models/ships/research.glb', '/models/ships/supply.glb', '/models/ships/ferry.glb');
  const total = urls.length;
  let done = 0;
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift()!;
      try { await cachedModel(u); } catch { /* a failed preload just falls back to lazy load */ }
      done++;
      onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: 2 }, worker));
}

export function groundY(map: { field?: FieldLike }, x: number, z: number): number {
  return map.field ? Math.max(0, map.field.height(x, z)) : 0;
}

// astra5 tower kind -> model-pack tower id (+ stage file by level band)
export const TOWER_MODEL: Record<string, string> = {
  cannon: 'autocannon', heavy: 'howitzer', missile: 'silo', air: 'aadefense', ew: 'ew', boat: 'garrison',
};
// astra5 branch index (0/1) -> model-pack tower id, per basic kind
export const BRANCH_MODEL: Record<string, [string, string]> = {
  cannon: ['ciws', 'railgun'], heavy: ['mlrs', 'thermobaric'], missile: ['hypersonic', 'swarm'],
  air: ['bavar', 'laser'], ew: ['emp', 'sonar'], boat: ['torpedo', 'mine'],
};
export function stageFile(level: number): number {
  return level < 20 ? 1 : level < 45 ? 25 : level < 70 ? 50 : level < 90 ? 75 : 100;
}

interface MapLike { scene: THREE.Scene; field?: FieldLike; setLayer(name: string, on: boolean): void }

export async function attachDemoModels(map: MapLike): Promise<() => void> {
  map.setLayer('slots', false);
  const group = new THREE.Group();
  map.scene.add(group);
  const slots = (slotsData as { slots: { id: number; x: number; z: number }[] }).slots;
  const demoTowers: Record<number, { kind: string; level: number }> = {
    0: { kind: 'missile', level: 50 }, 1: { kind: 'cannon', level: 25 }, 2: { kind: 'air', level: 75 },
    3: { kind: 'heavy', level: 1 }, 5: { kind: 'cannon', level: 100 }, 7: { kind: 'ew', level: 50 },
    9: { kind: 'missile', level: 75 }, 10: { kind: 'air', level: 25 }, 12: { kind: 'cannon', level: 50 },
    13: { kind: 'boat', level: 25 },
  };
  const buildings = buildingsData as Record<string, { glb: string; x: number; z: number; water: boolean }>;
  const jobs: { url: string; width: number; x: number; z: number; y: number; faceSea?: boolean }[] = [];
  for (const [idStr, t] of Object.entries(demoTowers)) {
    const slot = slots.find(s => s.id === Number(idStr));
    if (!slot) continue;
    jobs.push({ url: `/models/towers/${TOWER_MODEL[t.kind]}-L${stageFile(t.level)}.glb`, width: 5.2, x: slot.x, z: slot.z, y: groundY(map, slot.x, slot.z), faceSea: true });
  }
  for (const b of Object.values(buildings)) {
    jobs.push({ url: `/models/buildings/${b.glb}.glb`, width: b.glb === 'platform' ? 13 : 9.5, x: b.x, z: b.z, y: b.water ? 0 : groundY(map, b.x, b.z) });
  }
  // Parallel loads (cache dedups shared URLs) — sequential loads stall the scene for minutes.
  await Promise.all(jobs.map(async j => {
    const model = await loadModel(j.url);
    fitWidth(model, j.width);
    model.position.set(j.x, j.y, j.z);
    if (j.faceSea) model.rotation.y = Math.PI;
    group.add(model);
  }));
  return () => { map.scene.remove(group); };
}
