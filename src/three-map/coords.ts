// Shared coordinate chain: astra5 % <-> lon/lat <-> owner's 3D world (x, z).
// Constants MUST match the offline pipeline that produced lanes-3d.json / slots-3d.json.
const W = 1813, H = 1300;
const SCALE = (800 - 48) / ((57.90 - 53.30) * 99.44);
const KPLON = 111.32 * Math.cos((26.7 * Math.PI) / 180) * SCALE;
const KPLAT = 110.95 * SCALE;
const K = 68.0, COS = Math.cos((26.4 * Math.PI) / 180), CLON = 55.2, CLAT = 26.4;

export function pctToLonLat(px: number, py: number): [number, number] {
  const x = (px / 100) * W, y = (py / 100) * H;
  return [49.55 + (x - 24) / KPLON, 29.45 - (y - 40) / KPLAT];
}
export function lonLatToPct(lon: number, lat: number): [number, number] {
  const x = 24 + (lon - 49.55) * KPLON, y = 40 + (29.45 - lat) * KPLAT;
  return [(x / W) * 100, (y / H) * 100];
}
export function lonLatTo3d(lon: number, lat: number): [number, number] {
  return [(lon - CLON) * COS * K, -(lat - CLAT) * K];
}
export function unproject3d(x: number, z: number): [number, number] {
  return [x / (COS * K) + CLON, -z / K + CLAT];
}
export function pctTo3d(px: number, py: number): [number, number] {
  const [lon, lat] = pctToLonLat(px, py);
  return lonLatTo3d(lon, lat);
}
export function point3dToPct(x: number, z: number): [number, number] {
  const [lon, lat] = unproject3d(x, z);
  return lonLatToPct(lon, lat);
}
