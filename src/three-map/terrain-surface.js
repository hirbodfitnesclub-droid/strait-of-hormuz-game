// Index the upward-facing triangles once. Buildings, pads and the camera can
// then sample the visible GLB surface without raycasting the entire island mesh.
export function terrainHeightSampler(geometry) {
  const positions = geometry.getAttribute('position');
  const indices = geometry.getIndex();
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const cellSize = 6;
  const columns = Math.floor((max.x - min.x) / cellSize) + 1;
  const rows = Math.floor((max.z - min.z) / cellSize) + 1;
  const bins = new Array(columns * rows);
  const col = x => Math.floor((x - min.x) / cellSize);
  const row = z => Math.floor((z - min.z) / cellSize);
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
    const x = positions.getX(a), z = positions.getZ(a);
    const bx = positions.getX(b), bz = positions.getZ(b);
    const cx = positions.getX(c), cz = positions.getZ(c);
    if ((bz - z) * (cx - x) - (bx - x) * (cz - z) <= 0) continue;
    const right = col(Math.max(x, bx, cx)), bottom = row(Math.max(z, bz, cz));
    for (let r = row(Math.min(z, bz, cz)); r <= bottom; r++) {
      for (let k = col(Math.min(x, bx, cx)); k <= right; k++) {
        (bins[r * columns + k] ??= []).push(i);
      }
    }
  }
  return (x, z) => {
    const c = col(x), r = row(z);
    if (c < 0 || r < 0 || c >= columns || r >= rows) return null;
    const candidates = bins[r * columns + c];
    if (!candidates) return null;
    let top = -Infinity;
    for (const i of candidates) {
      const a = indices.getX(i), b = indices.getX(i + 1), d = indices.getX(i + 2);
      const ax = positions.getX(a), az = positions.getZ(a);
      const bx = positions.getX(b) - ax, bz = positions.getZ(b) - az;
      const dx = positions.getX(d) - ax, dz = positions.getZ(d) - az;
      const det = bx * dz - bz * dx;
      const u = ((x - ax) * dz - (z - az) * dx) / det;
      const v = (bx * (z - az) - bz * (x - ax)) / det;
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) {
        const ay = positions.getY(a);
        top = Math.max(top, ay + u * (positions.getY(b) - ay) + v * (positions.getY(d) - ay));
      }
    }
    return top === -Infinity ? null : top;
  };
}
