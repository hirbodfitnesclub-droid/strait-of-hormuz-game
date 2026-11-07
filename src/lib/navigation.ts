import generated from "@/data/navigation.json";

export type MapLayout = "landscape" | "portrait";
export type Point = { x: number; y: number };
type NavigationMap = { size: number; blocked: string; land: string; enemy: Point[]; trade: Point[]; pirate: Point[]; port: Point[] };
const maps: Record<MapLayout, NavigationMap> = generated;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function getNavigation(layout: MapLayout = "landscape") { return maps[layout] ?? maps.landscape; }
function gridPoint(point: Point, size: number) {
  return { x: clamp(Math.round(point.x / 100 * (size - 1)), 0, size - 1), y: clamp(Math.round(point.y / 100 * (size - 1)), 0, size - 1) };
}
function worldPoint(x: number, y: number, size: number) { return { x: x / (size - 1) * 100, y: y / (size - 1) * 100 }; }
export function isWater(point: Point, layout: MapLayout = "landscape") {
  const map = getNavigation(layout), p = gridPoint(point, map.size);
  return map.blocked.charCodeAt(p.y * map.size + p.x) === 48;
}
/** Undilated shoreline, for keeping the visible hull clear of actual land. */
export function isSurfaceWater(point: Point, layout: MapLayout = "landscape") {
  if (point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) return false;
  const map = getNavigation(layout), p = gridPoint(point, map.size);
  return map.land.charCodeAt(p.y * map.size + p.x) === 48;
}
export function nearestWater(point: Point, layout: MapLayout = "landscape"): Point {
  const map = getNavigation(layout), p = gridPoint(point, map.size);
  if (map.blocked.charCodeAt(p.y * map.size + p.x) === 48) return worldPoint(p.x, p.y, map.size);
  for (let radius = 1; radius < map.size; radius++) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const x = p.x + dx, y = p.y + dy;
      if (x < 0 || y < 0 || x >= map.size || y >= map.size || map.blocked.charCodeAt(y * map.size + x) !== 48) continue;
      const d = dx * dx + dy * dy;
      if (!best || d < best.d) best = { x, y, d };
    }
    if (best) return worldPoint(best.x, best.y, map.size);
  }
  return getNavigation(layout).enemy[0];
}

export function safeSegment(a: Point, b: Point, layout: MapLayout = "landscape") {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 42));
  for (let i = 0; i <= steps; i++) if (!isWater({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }, layout)) return false;
  return true;
}

// Round corners only where the entire curve is still inside the water mask.
function rounded(path: Point[], layout: MapLayout): Point[] {
  if (path.length < 3) return path;
  const result = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1], b = path[i], c = path[i + 1];
    const d1 = Math.hypot(b.x - a.x, b.y - a.y), d2 = Math.hypot(c.x - b.x, c.y - b.y);
    const radius = Math.min(2, d1 * 0.22, d2 * 0.22);
    if (radius < 0.08) { result.push(b); continue; }
    const before = { x: b.x + (a.x - b.x) * radius / d1, y: b.y + (a.y - b.y) * radius / d1 };
    const after = { x: b.x + (c.x - b.x) * radius / d2, y: b.y + (c.y - b.y) * radius / d2 };
    const curve = [before];
    for (let n = 1; n <= 6; n++) { const t = n / 6, u = 1 - t; curve.push({ x: u*u*before.x + 2*u*t*b.x + t*t*after.x, y: u*u*before.y + 2*u*t*b.y + t*t*after.y }); }
    if (curve.every((p, n) => isWater(p, layout) && (!n || safeSegment(curve[n - 1], p, layout)))) result.push(...curve);
    else result.push(b);
  }
  result.push(path[path.length - 1]);
  return result;
}
const lanes: Record<MapLayout, { enemy: Point[]; trade: Point[]; pirate: Point[]; port: Point[] }> = {
  landscape: { enemy: rounded(maps.landscape.enemy, "landscape"), trade: rounded(maps.landscape.trade, "landscape"), pirate: rounded(maps.landscape.pirate, "landscape"), port: rounded(maps.landscape.port, "landscape") },
  portrait: { enemy: rounded(maps.portrait.enemy, "portrait"), trade: rounded(maps.portrait.trade, "portrait"), pirate: rounded(maps.portrait.pirate, "portrait"), port: rounded(maps.portrait.port, "portrait") },
};
export function getLane(layout: MapLayout = "landscape", kind: "enemy" | "trade" | "pirate" | "port" = "enemy") { return lanes[layout][kind]; }

const pathLengths = new WeakMap<Point[], { parts: number[]; total: number }>();
export function sampleLane(path: Point[], progress: number): Point {
  if (!path.length) return { x: 50, y: 50 };
  if (path.length === 1) return path[0];
  let metrics = pathLengths.get(path);
  if (!metrics) {
    const parts: number[] = []; let total = 0;
    for (let i = 1; i < path.length; i++) { total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); parts.push(total); }
    metrics = { parts, total }; pathLengths.set(path, metrics);
  }
  const target = clamp(progress, 0, 1) * metrics.total;
  let index = metrics.parts.findIndex(length => length >= target);
  if (index < 0) index = metrics.parts.length - 1;
  const previous = index ? metrics.parts[index - 1] : 0;
  const t = (target - previous) / Math.max(0.0001, metrics.parts[index] - previous);
  return { x: path[index].x + (path[index + 1].x - path[index].x) * t, y: path[index].y + (path[index + 1].y - path[index].y) * t };
}

class MinHeap {
  private data: { id: number; f: number }[] = [];
  push(value: { id: number; f: number }) { const a = this.data; a.push(value); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= value.f) break; a[i] = a[p]; i = p; } a[i] = value; }
  pop() { const a = this.data, first = a[0], last = a.pop()!; if (a.length) { let i = 0; while (2 * i + 1 < a.length) { let c = 2 * i + 1; if (c + 1 < a.length && a[c + 1].f < a[c].f) c++; if (a[c].f >= last.f) break; a[i] = a[c]; i = c; } a[i] = last; } return first; }
  get length() { return this.data.length; }
}

/** Find a safe course for a player-controlled ship, avoiding island polygons and coast clearance. */
export function findWaterRoute(from: Point, destination: Point, layout: MapLayout = "landscape"): Point[] {
  const map = getNavigation(layout), size = map.size;
  const startPoint = nearestWater(from, layout), endPoint = nearestWater(destination, layout);
  if (safeSegment(startPoint, endPoint, layout)) return [startPoint, endPoint];
  const start = gridPoint(startPoint, size), end = gridPoint(endPoint, size);
  const startId = start.y * size + start.x, goal = end.y * size + end.x;
  const costs = new Float32Array(size * size); costs.fill(Infinity); costs[startId] = 0;
  const parent = new Int32Array(size * size); parent.fill(-1);
  const heap = new MinHeap(); heap.push({ id: startId, f: 0 });
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  let iterations = 0;
  while (heap.length && iterations++ < size * size * 4) {
    const current = heap.pop().id; if (current === goal) break;
    const x = current % size, y = Math.floor(current / size);
    for (const [dx, dy] of directions) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const id = ny * size + nx;
      if (map.blocked.charCodeAt(id) !== 48 || (dx && dy && (map.blocked.charCodeAt(y * size + nx) !== 48 || map.blocked.charCodeAt(ny * size + x) !== 48))) continue;
      const nextCost = costs[current] + (dx && dy ? 1.414 : 1);
      if (nextCost >= costs[id]) continue;
      costs[id] = nextCost; parent[id] = current;
      heap.push({ id, f: nextCost + Math.hypot(end.x - nx, end.y - ny) });
    }
  }
  if (goal !== startId && parent[goal] < 0) return [startPoint];
  const path: Point[] = [];
  for (let id = goal; id >= 0; id = parent[id]) path.push(worldPoint(id % size, Math.floor(id / size), size));
  path.reverse();
  const simplified = [path[0]];
  let i = 0;
  while (i < path.length - 1) { let j = path.length - 1; while (j > i + 1 && !safeSegment(path[i], path[j], layout)) j--; simplified.push(path[j]); i = j; }
  return rounded(simplified, layout);
}
