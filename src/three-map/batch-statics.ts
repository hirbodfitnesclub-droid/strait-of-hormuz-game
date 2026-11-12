import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Batch opaque, unanimated leaves only. Preserve complete animation subtrees,
 * transparent surfaces, skins, morphs and named articulation pivots. No mesh
 * simplification: every source triangle, normal and UV is retained. */
export function batchStatics(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<string, THREE.Mesh[]>();
  const visit = (node: THREE.Object3D) => {
    if (!node.visible || node.name.startsWith('anim') || Object.keys(node.userData).length) return;
    if (node instanceof THREE.Mesh && !node.children.length && !Array.isArray(node.material)
      && !node.material.transparent && !(node as THREE.SkinnedMesh).isSkinnedMesh
      && !Object.keys(node.geometry.morphAttributes).length && node.matrixWorld.determinant() > 0) {
      const signature = Object.entries(node.geometry.attributes as Record<string, THREE.BufferAttribute>).map(([k, a]) => `${k}:${a.itemSize}:${a.normalized}`).sort().join(',');
      const key = `${node.material.uuid}:${signature}:${node.castShadow}:${node.receiveShadow}`;
      const meshes = buckets.get(key) ?? []; meshes.push(node); buckets.set(key, meshes);
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      return geometry;
    });
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    if (!geometry) continue;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const batch = new THREE.Mesh(geometry, meshes[0].material);
    batch.name = 'static-batch';
    batch.castShadow = meshes[0].castShadow;
    batch.receiveShadow = meshes[0].receiveShadow;
    root.add(batch);
    meshes.forEach(mesh => mesh.removeFromParent());
  }
}
