const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { load } = require('./load-game.cjs');
const nav = load('src/lib/navigation.ts');
const game = load('src/lib/game.ts');
for (const layout of ['landscape', 'portrait']) {
  for (const kind of ['enemy', 'trade', 'pirate']) {
    const lane = nav.getLane(layout, kind);
    for (let i = 0; i <= 5000; i++) {
      const point = nav.sampleLane(lane, i / 5000);
      assert.ok(nav.isWater(point, layout), `${layout} ${kind} crosses land at ${JSON.stringify(point)}`);
    }
  }
  const lane = nav.getLane(layout, 'enemy');
  for (let i = 0; i < 12; i++) {
    const from = nav.sampleLane(lane, i / 12);
    const destination = { x: 10 + i * 7, y: 15 + (i * 31) % 75 };
    const route = nav.findWaterRoute(from, destination, layout);
    assert.ok(route.length > 0);
    for (let j = 1; j < route.length; j++) assert.ok(nav.safeSegment(route[j - 1], route[j], layout), `${layout} hero route crosses land`);
  }
  let state = game.gameReducer(game.initialGame(), { type: 'layout', layout });
  state = game.gameReducer(state, { type: 'start' });
  for (let i = 0; i < 900; i++) {
    state = game.gameReducer(state, { type: 'tick', dt: .125 });
    for (const enemy of state.enemies) if (enemy.kind !== 'air') assert.ok(nav.isWater(game.enemyPosition(enemy, layout), layout), `${layout} enemy on land`);
    for (const pirate of state.pirates) assert.ok(nav.isWater(game.piratePosition(pirate, layout), layout), `${layout} pirate on land`);
    for (const merchant of state.merchants) assert.ok(nav.isWater(game.merchantPosition(merchant, layout), layout), `${layout} merchant on land`);
  }
  const target = nav.sampleLane(nav.getLane(layout, 'trade'), .2);
  state = game.gameReducer(state, { type: 'hero', ...target });
  for (let i = 0; i < 400; i++) { state = game.gameReducer(state, { type: 'tick', dt: .125 }); assert.ok(nav.isWater(state.hero, layout), `${layout} hero on land`); }
  console.log(`PASS ${layout}: all lanes, pathfinding, combat ships, merchant traffic and hero movement stay on water`);
}
const legacy = game.initialGame();
delete legacy.layout; delete legacy.merchants;
const restored = game.hydrateGame(legacy);
assert.ok(restored?.game.layout && Array.isArray(restored.game.merchants));
console.log('PASS: previous saves remain compatible');

// The simulation and the 3D asset placement must share the same foundation.
const { pctTo3d } = load('src/three-map/coords.ts');
const anchors = require('../src/three-map/slots-3d.json').slots;
for (const slot of game.getSlots('portrait')) {
  const [x,z] = pctTo3d(slot.x, slot.y);
  assert.ok(Math.hypot(x-anchors[slot.id].x,z-anchors[slot.id].z)<1e-8);
}
const vip = game.piratePosition({ progress: .4, vipEscort: true });
assert.deepEqual(vip, nav.sampleLane(nav.getLane('portrait','trade'), .4));
const shore = { x: 16, y: 5 };
assert.ok(!nav.isWater(shore,'portrait'), 'legacy waypoint fixture must be on actual land');
const naval = game.initialGame();
naval.hero.route = [{x: naval.hero.x, y: naval.hero.y}, shore];
naval.hero.routeIndex = 1;
const corrected = game.hydrateGame(naval).game.hero;
assert.ok(corrected.route?.length, 'an invalid legacy route must be recovered');
for (let i=1; i<(corrected.route?.length ?? 0); i++) assert.ok(nav.safeSegment(corrected.route[i-1],corrected.route[i],'portrait'));
assert.ok(nav.isWater(corrected, 'portrait'));
const voyage = nav.findWaterRoute(naval.hero, nav.getLane('portrait','trade').at(-1),'portrait');
assert.ok(voyage.length>=2, 'offshore lanes must be connected for player travel');
assert.deepEqual(voyage[0], {x: naval.hero.x, y: naval.hero.y}, 'issuing a route must not snap a ship already on water to the grid');
console.log('PASS actual slot mapping, VIP escorts, continuous route starts and legacy navigation repair');
