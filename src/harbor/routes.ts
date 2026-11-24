import type { Lane } from "./catalog";
type Point = readonly [number, number];
type Pair = readonly [readonly Point[], readonly Point[]];
// Normalized stage coordinates are shared by the painted paths, moving signals, hit pulses and convoy.
const routes: Record<string, Pair> = {
  single: [
    [
      [50, 13],
      [62, 31],
      [59, 53],
      [46, 72],
      [42, 85],
    ],
    [
      [40, 13],
      [30, 32],
      [45, 57],
      [50, 72],
      [42, 85],
    ],
  ],
  escort: [
    [
      [37, 13],
      [31, 31],
      [46, 48],
      [64, 65],
      [63, 85],
    ],
    [
      [66, 13],
      [71, 34],
      [57, 52],
      [47, 70],
      [44, 85],
    ],
  ],
  fan: [
    [
      [32, 13],
      [38, 31],
      [53, 50],
      [62, 67],
      [53, 85],
    ],
    [
      [68, 13],
      [63, 31],
      [47, 50],
      [39, 68],
      [49, 85],
    ],
  ],
  return: [
    [
      [60, 13],
      [73, 33],
      [64, 51],
      [39, 64],
      [42, 85],
    ],
    [
      [36, 13],
      [26, 30],
      [40, 49],
      [61, 65],
      [58, 85],
    ],
  ],
  join: [
    [
      [32, 13],
      [30, 32],
      [40, 50],
      [51, 67],
      [48, 85],
    ],
    [
      [69, 13],
      [71, 32],
      [61, 50],
      [50, 67],
      [48, 85],
    ],
  ],
  berth: [
    [
      [62, 13],
      [65, 32],
      [50, 48],
      [34, 66],
      [40, 85],
    ],
    [
      [35, 13],
      [36, 32],
      [50, 48],
      [38, 68],
      [40, 85],
    ],
  ],
  split: [
    [
      [31, 13],
      [29, 32],
      [42, 48],
      [38, 68],
      [31, 85],
    ],
    [
      [69, 13],
      [72, 32],
      [58, 48],
      [63, 68],
      [69, 85],
    ],
  ],
};
export function pathPoint(board: string, lane: Lane, progress: number) {
  const points = (routes[board] ?? routes.single)[lane === "A" ? 0 : 1];
  const t = Math.max(0, Math.min(1, progress)) * (points.length - 1),
    i = Math.min(points.length - 2, Math.floor(t)),
    u = t - i;
  const a = points[Math.max(0, i - 1)],
    b = points[i],
    c = points[i + 1],
    d = points[Math.min(i + 2, points.length - 1)];
  const smooth = (k: 0 | 1) =>
    0.5 *
    (2 * b[k] +
      (-a[k] + c[k]) * u +
      (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * u * u +
      (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * u * u * u);
  return { x: smooth(0), y: smooth(1) };
}
