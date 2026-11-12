// ============================================================
// merge.ts — ادغام مش‌های ایستای یک مدل بر اساس متریال (کاهش draw call)
// گره‌هایی که userData.anim دارند (یا زیر چنین گرهی هستند) دست نمی‌خورند.
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeStatic(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const remove: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || (o as THREE.InstancedMesh).isInstancedMesh) return;
    if (Array.isArray(o.material)) return;
    let p: THREE.Object3D | null = o, anim = false;
    while (p && p !== root) { if (p.userData.anim) { anim = true; break; } p = p.parent; }
    if (anim || o.userData.anim) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()) as THREE.BufferGeometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const list = byMat.get(o.material) ?? [];
    list.push(g); byMat.set(o.material, list);
    remove.push(o);
  });
  for (const m of remove) m.removeFromParent();
  byMat.forEach((geos, mat) => {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
  });
}
