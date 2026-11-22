const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { load } = require('./load-game.cjs');
const nav = load('src/lib/navigation.ts');
const game = load('src/lib/game.ts');
for (const layout of ['landscape', 'portrait']) {
  for (const kind of ['enemy', 'trade', 'inbound', 'outbound', 'pirate']) {
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
// Inspect the bow, stern and beam as the largest merchant turns, in world units.
const coords = load('src/three-map/coords.ts');
const inbound = nav.getLane('portrait','inbound'), outbound = nav.getLane('portrait','outbound');
function inWorld(path, t) {
  const p=nav.sampleLane(path,t);
  return coords.pctTo3d(p.x,p.y);
}
for (const path of [inbound,outbound]) {
  for (let i=0;i<=2000;i++) {
    const t=i/2000, [x,z]=inWorld(path,t);
    const a=inWorld(path,t-.001), b=inWorld(path,t+.001);
    const dx=b[0]-a[0], dz=b[1]-a[1], length=Math.hypot(dx,dz);
    for(const fore of [-9,0,9]) for(const beam of [-2,2]) {
      const [px,py]=coords.point3dToPct(x+(fore*dx-beam*dz)/length,z+(fore*dz+beam*dx)/length);
      assert.ok(nav.isSurfaceWater({x:px,y:py},'portrait'),'merchant hull must clear land');
    }
  }
}
assert.ok(inbound[0].x>inbound.at(-1).x && outbound[0].x<outbound.at(-1).x);
const opposite=Array.from({length:1001},(_,i)=>inWorld(outbound,i/1000));
for(let i=0;i<=1000;i++) {
  const [x,z]=inWorld(inbound,i/1000);
  assert.ok(opposite.every(([ox,oz])=>Math.hypot(ox-x,oz-z)>4),'opposing hulls must stay separated');
}
const voyages=game.freshPortGame();
voyages.merchants.push({...voyages.merchants[0],id:999,inbound:true,progress:.25});
const resumed=game.hydrateGame(voyages).game;
for(const ship of voyages.merchants) {
  const next=resumed.merchants.find(m=>m.id===ship.id);
  assert.equal(next.inbound,ship.inbound);
  assert.deepEqual(game.merchantPosition(next),game.merchantPosition(ship));
}
console.log('PASS: opposite voyages, hull clearance, lane separation and saved route');
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
