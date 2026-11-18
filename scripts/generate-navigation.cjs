// Build collision data in game coordinates from the coastline used to draw the 3D terrain.
const fs = require('node:fs');
const { load } = require('./load-game.cjs');
const { lonLatToPct, pctTo3d, point3dToPct } = load('src/three-map/coords.ts');
const coast = require('../src/three-map/coastline.json');
const waypoints = require('../src/three-map/lanes-3d.json');

const size = 321;
const cell = (v) => v / 100 * (size - 1);
const [x0, z0] = pctTo3d(0, 0), [x1, z1] = pctTo3d(100, 100);
const cellX = (x1 - x0) / (size - 1), cellZ = (z1 - z0) / (size - 1);

function build() {
  const land = new Uint8Array(size * size);
  for (const ring of coast) {
    const polygon = ring.map(([lon, lat]) => lonLatToPct(lon, lat).map(cell));
    for (let y = 0; y < size; y++) {
      const crossings = [];
      for (let i = 0; i < polygon.length; i++) {
        const [ax, ay] = polygon[i], [bx, by] = polygon[(i+1) % polygon.length];
        if ((ay > y) !== (by > y)) crossings.push(ax + (bx - ax) * (y - ay) / (by - ay));
      }
      crossings.sort((a,b) => a-b);
      for (let i = 1; i < crossings.length; i += 2) {
        for (let x = Math.max(0,Math.ceil(crossings[i-1])); x <= Math.min(size - 1,crossings[i]); x++) land[y * size + x] = 1;
      }
    }
  }
  // The game percentages extend slightly beyond the rendered rectangle. Treat the edge as an obstacle.
  const [east, south] = [5.4 * 68 * Math.cos(26.4 * Math.PI / 180), 3.4 * 68];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (Math.abs(x0 + x * cellX) > east || Math.abs(z0 + y * cellZ) > south) land[y * size + x] = 1;
  }
  function maskWithClearance(clearance) {
    const offsets = [];
    for (let dy = -Math.ceil(clearance / cellZ); dy <= Math.ceil(clearance / cellZ); dy++) {
      for (let dx = -Math.ceil(clearance / cellX); dx <= Math.ceil(clearance / cellX); dx++) {
        if (Math.hypot(dx * cellX, dy * cellZ) <= clearance) offsets.push([dx, dy]);
      }
    }
    const blocked = land.slice();
    for (let i = 0; i < land.length; i++) if (land[i]) {
      const x = i % size, y = Math.floor(i / size);
      for (const [dx, dy] of offsets) if (x + dx >= 0 && x + dx < size && y + dy >= 0 && y + dy < size) blocked[(y + dy) * size + x + dx] = 1;
    }
    return blocked.join('');
  }
  const heroMask = maskWithClearance(7.6);
  const map = { size, land: land.join(''), blocked: heroMask, enemy: [], trade: [], pirate: [], port: [] };
  // Construct paths with the same water checks and router the player uses.
  const filename = require.resolve('../src/data/navigation.json');
  require.cache[filename] = {id: filename, filename, loaded: true, exports: {landscape: map, portrait: map}};
  const nav = load('src/lib/navigation.ts');
  const toPoint = ([x, z]) => { const [px, py] = point3dToPct(x, z); return {x: px, y: py}; };
  // Keep the original combat centerline and its progress-to-position mapping.
  map.enemy = waypoints.enemy.map(toPoint).map(({x,y}) => ({x: +x.toFixed(1), y: +y.toFixed(1)}));
  // Preserve the intended shipping corridors. The civilian lane passes seaward of the island chain;
  // the narrow northern channel does not admit the full turning envelope of the largest tanker.
  const routes = {
    trade: [[-316, -166], [-205, -88], [-125, 4], [-62, 29], [31, 28], [92, 2], [126, 65], [220, 145], [305, 184]],
    pirate: [waypoints.pirate[0], waypoints.pirate[2], waypoints.pirate.at(-1)],
    port: [[36, -32], waypoints.port.at(-1)],
  };
  for (const [kind, anchors] of Object.entries(routes)) {
    // Largest civilian vessel is 20 world units, including length while turning.
    map.blocked = kind === 'trade' ? maskWithClearance(12.0) : heroMask;
    for (let i = 1; i < anchors.length; i++) {
      const segment = nav.findWaterRoute(toPoint(anchors[i-1]), toPoint(anchors[i]));
      if (segment.length < 2) throw Error('No navigable section in '+kind+' at '+i);
      map[kind].push(...(i === 1 ? segment : segment.slice(1)));
    }
  }
  map.blocked = heroMask;
  for (const kind of Object.keys(waypoints)) {
    for (let i = 1; i < map[kind].length; i++) {
      if (!nav.safeSegment(map[kind][i-1], map[kind][i])) throw Error('Unnavigable '+kind+' at '+i);
    }
  }
  fs.writeFileSync('src/data/navigation.json', JSON.stringify({landscape: map, portrait: map})+'\n');
}
build();
