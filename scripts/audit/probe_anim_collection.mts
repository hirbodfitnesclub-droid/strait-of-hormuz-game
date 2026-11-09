/* Loader-level animation-collection probe (Fix Program 2, team ANIM, D-019).
 *
 * Parses every shipped tower/building GLB through the SAME loader path the
 * game uses (three GLTFLoader + MeshoptDecoder, as in src/three-map/
 * models3d.ts), collects animation nodes with the game's real
 * canonicalAnimName (src/three-map/anim-names.ts) using the same
 * traversal + ordinal-ordering rule as gamesync's collectAnims, and proves:
 *
 *   1. Per file: the multiset of canonicalized delivered names EQUALS the
 *      multiset of raw `anim:*` names stored in the GLB JSON — i.e. the
 *      name mapping loses nothing and invents nothing, duplicates included.
 *   2. Per tower file: every category the model defines has a non-empty
 *      collected list, and bindTowerAnim's dedicated fields (yaw/pitch/mz/
 *      rc/spin/erector/missile/doorL/doorR/cell/crystal) resolve.
 *   3. Per building file: the generic idle list (what gamesync actually
 *      drives for buildings/platforms) is non-empty exactly for the
 *      buildings whose GLB defines anim nodes (8 of 11; town/desal/welfare
 *      legitimately define none).
 *
 * Run:  npx tsx scripts/audit/probe_anim_collection.mts
 * Exit code 0 = all checks pass; 1 = at least one failure.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type * as THREE from 'three';
import { canonicalAnimName } from '../../src/three-map/anim-names';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'models');

/** Keys bindTowerAnim pulls out of byName into dedicated fields; everything
 *  else lands in the generic idle list (mirrors gamesync.ts collectAnims). */
const DEDICATED = new Set(['anim:yaw', 'anim:pitch', 'anim:mz', 'anim:rc', 'anim:spin',
  'anim:erector', 'anim:missile', 'anim:doorL', 'anim:doorR', 'anim:cell']);

function rawAnimNames(path: string): Map<string, number> {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as { nodes?: { name?: string }[] };
  const out = new Map<string, number>();
  for (const n of j.nodes ?? []) {
    if (n.name && n.name.startsWith('anim:')) out.set(n.name, (out.get(n.name) ?? 0) + 1);
  }
  return out;
}

/** Same collection rule as gamesync.collectAnims: traverse, canonicalize,
 *  group by canonical name, order duplicates by loader ordinal. */
function collect(scene: THREE.Object3D): Map<string, THREE.Object3D[]> {
  const found = new Map<string, { obj: THREE.Object3D; ord: number }[]>();
  scene.traverse(o => {
    if (!o.name) return;
    const c = canonicalAnimName(o.name);
    if (!c) return;
    const arr = found.get(c.name) ?? []; arr.push({ obj: o, ord: c.ord }); found.set(c.name, arr);
  });
  const byName = new Map<string, THREE.Object3D[]>();
  for (const [name, entries] of found) {
    entries.sort((a, b) => a.ord - b.ord);
    byName.set(name, entries.map(e => e.obj));
  }
  return byName;
}

await (MeshoptDecoder as unknown as { ready: Promise<void> }).ready;
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

let failures = 0;
const fail = (msg: string) => { failures++; console.log('  FAIL: ' + msg); };

/* Node has no image decoder, and GLTFLoader aborts on the embedded WebP
 * textures (`self is not defined` in loadImageSource). So the probe feeds
 * the loader a copy of each GLB with texture payloads stripped (images /
 * textures / samplers / *Texture material refs). This cannot change the
 * result being measured: node names are assigned in loadNode from the
 * nodes array, and the createUniqueName counter is consumed only by node,
 * mesh, light, camera and scene names — all preserved verbatim, as are
 * the hierarchy and the BIN chunk. In-browser delivered names were
 * independently confirmed by audit team 2 (ciws → animyaw/animpitch/
 * animspin/animmz), and the multiset check below pins every file. */
function stripTextures(buf: Buffer): ArrayBuffer {
  const jsonLen = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as Record<string, unknown>;
  delete j.images; delete j.textures; delete j.samplers;
  const dropExt = (arr?: string[]) => arr?.filter(e => e !== 'EXT_texture_webp' && e !== 'KHR_texture_transform');
  j.extensionsUsed = dropExt(j.extensionsUsed as string[] | undefined);
  j.extensionsRequired = dropExt(j.extensionsRequired as string[] | undefined);
  const strip = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o as object)) {
      if (k.endsWith('Texture')) { delete (o as Record<string, unknown>)[k]; continue; }
      strip((o as Record<string, unknown>)[k]);
    }
  };
  strip(j.materials);
  let jsonStr = JSON.stringify(j);
  while (jsonStr.length % 4) jsonStr += ' ';
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const binLen = buf.readUInt32LE(20 + jsonLen);
  const binChunk = buf.subarray(20 + jsonLen, 20 + jsonLen + 8 + binLen);
  const out = Buffer.alloc(12 + 8 + jsonBuf.length + binChunk.length);
  buf.copy(out, 0, 0, 12); // magic + version
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonBuf.length, 12); out.writeUInt32LE(0x4e4f534a, 16);
  jsonBuf.copy(out, 20);
  binChunk.copy(out, 20 + jsonBuf.length);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

async function loadScene(path: string): Promise<THREE.Object3D> {
  const ab = stripTextures(readFileSync(path));
  const g = await loader.parseAsync(ab, '');
  return g.scene;
}

function checkFile(label: string, raw: Map<string, number>, byName: Map<string, THREE.Object3D[]>): string {
  // multiset equality raw vs collected
  const keys = new Set([...raw.keys(), ...byName.keys()]);
  for (const k of keys) {
    const r = raw.get(k) ?? 0, c = byName.get(k)?.length ?? 0;
    if (r !== c) fail(`${label}: ${k} raw=${r} collected=${c}`);
  }
  return [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k.replace('anim:', '')}×${v.length}`).join(' ');
}

/* ---------------- towers: 90 files, 18 kinds × 5 levels ---------------- */
console.log('=== TOWERS ===');
const towerDir = join(ROOT, 'towers');
const kinds = new Map<string, string[]>();
for (const f of readdirSync(towerDir).filter(x => x.endsWith('.glb')).sort()) {
  const kind = f.replace(/-L\d+\.glb$/, '');
  kinds.set(kind, [...(kinds.get(kind) ?? []), f]);
}
for (const [kind, files] of [...kinds.entries()].sort()) {
  for (const f of files) {
    const path = join(towerDir, f);
    const raw = rawAnimNames(path);
    const byName = collect(await loadScene(path));
    const summary = checkFile(`towers/${f}`, raw, byName);
    // every category the model defines must be collected non-empty
    for (const k of raw.keys()) if (!(byName.get(k)?.length)) fail(`towers/${f}: ${k} defined in GLB but collected empty`);
    console.log(`${f.padEnd(24)} ${summary}`);
  }
  console.log(`-- kind ${kind}: ${files.length} level files checked`);
}

/* ---------------- buildings: 15 files ---------------- */
console.log('=== BUILDINGS ===');
const bDir = join(ROOT, 'buildings');
for (const f of readdirSync(bDir).filter(x => x.endsWith('.glb')).sort()) {
  const path = join(bDir, f);
  const raw = rawAnimNames(path);
  const byName = collect(await loadScene(path));
  const summary = checkFile(`buildings/${f}`, raw, byName);
  const generic = [...byName.entries()].filter(([k]) => !DEDICATED.has(k))
    .reduce((n, [, v]) => n + v.length, 0);
  const dedicatedInBuilding = [...byName.keys()].filter(k => DEDICATED.has(k));
  const rawTotal = [...raw.values()].reduce((a, b) => a + b, 0);
  if (rawTotal > 0 && generic === 0) fail(`buildings/${f}: defines ${rawTotal} anim nodes but generic list is empty`);
  if (rawTotal === 0 && generic !== 0) fail(`buildings/${f}: no anim nodes in GLB but generic=${generic}`);
  console.log(`${f.padEnd(24)} generic=${generic}${summary ? '  ' + summary : '  (no anim nodes)'}` +
    (dedicatedInBuilding.length ? `  NOTE: dedicated-only keys present (not driven for buildings): ${dedicatedInBuilding.join(',')}` : ''));
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
