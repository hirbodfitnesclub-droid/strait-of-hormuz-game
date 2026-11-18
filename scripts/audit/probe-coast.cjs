// Run against the built mobile game. Compare the actual renderer's lanes and loaded model
// geometry to its terrain field; the authored route/mask alone can't catch a coast mismatch.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../load-game.cjs');
const G = load('src/lib/game.ts');
const evidence = process.env.SCENE_EVIDENCE || 'review/coast';
async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const seed = G.gameReducer(G.initialGame(), { type: 'build-tower', slot: 0, kind: 'cannon' });
    assert.ok(seed.towers.some(t => t.slot === 0));
    await page.addInitScript(s => {
      localStorage.setItem('hormuz-game-v1', JSON.stringify({ ...s, lastSavedAt: Date.now() }));
      localStorage.setItem('hormuz-preferences-v2', JSON.stringify({ coachDismissed: true, sound: false }));
    }, seed);
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3310', { waitUntil: 'domcontentloaded' });
    const ready = () => window.__gamesync3d?.towers.get(0)?.obj && window.__gamesync3d?.ents.get('tanker')?.init;
    try { await page.waitForFunction(ready, null, { timeout: 360000, polling: 350 }); }
    catch (e) {
      console.error(await page.evaluate(() => {
        const s = window.__gamesync3d;
        return { map: window.__m3d, towers: s && [...s.towers.keys()], dynamic: s && [...s.ents.keys()], port: s?.state?.idle.port, models: window.__m3dlog?.slice(-4), text: document.body.innerText.slice(0,160) };
      }));
      throw e;
    }
    const report = await page.evaluate(() => {
      const sync = window.__gamesync3d, map = window.__map3d;
      const lanes = {};
      for (const [kind, length] of Object.entries({ enemy: 25, trade: 20, pirate: 6, port: 18 })) {
        const curve = sync.curves[kind]; let centersOnLand = 0, hullsOnLand = 0, minClearance = Infinity;
        for (let n = 0; n <= 2000; n++) {
          const p = curve.getPointAt(n / 2000), t = curve.getTangentAt(n / 2000);
          const sd = map.field.sample(p.x, p.z);
          if (sd > 0) centersOnLand++;
          let worst = sd;
          // Five transverse stations approximating the widest hull used on this lane.
          for (let i = -2; i <= 2; i++) for (let side = -1; side <= 1; side++) {
            const along = length * i / 4, across = (2 - Math.abs(i)) * length * 0.055 * side;
            worst = Math.max(worst, map.field.sample(p.x + along * t.x - across * t.z, p.z + along * t.z + across * t.x));
          }
          if (worst > 0) hullsOnLand++;
          minClearance = Math.min(minClearance, -worst);
        }
        lanes[kind] = { samples: 2001, centersOnLand, hullsOnLand, minHullClearance: +minClearance.toFixed(3) };
      }
      const tower = sync.towers.get(0);
      let mounds = 0;
      tower.obj.traverse(node => {
        if (!node.isMesh || !node.geometry.hasAttribute('color')) return;
        node.geometry.computeBoundingBox();
        const box = node.geometry.boundingBox;
        if (Math.abs(box.min.y + 1.4) < 0.02 && Math.abs(box.max.y - 0.42) < 0.03) mounds++;
      });
      const slots = [...sync.pads].filter(([id]) => id >= 0).map(([,pad]) => pad.userData.pickRing.position).concat(tower.obj.position);
      const clearance = Math.min(...slots.map(p => map.field.sample(p.x,p.z)));
      const foundationGap = tower.obj.position.y + 0.42 * tower.base - map.field.height(tower.obj.position.x,tower.obj.position.z);
      const terrainRay = new map.raycaster.constructor();
      terrainRay.ray.origin.set(tower.obj.position.x,100,tower.obj.position.z);
      terrainRay.ray.direction.set(0,-1,0);
      const ground = terrainRay.intersectObject(map.scene.getObjectByName('terrain'),true)[0];
      const groundMeshGap = ground ? tower.obj.position.y + 0.42*tower.base-ground.point.y : null;
      const ship = sync.ents.get('tanker').obj;
      const navigation = { x: ship.position.x, y: ship.position.y, z: ship.position.z, shore: map.field.sample(ship.position.x,ship.position.z) };
      map.flyTo(tower.obj.position.x,tower.obj.position.z,19,0.25);
      return { lanes, tower: { mounds, foundationGap, groundMeshGap, url: tower.url }, slotCount: slots.length, minimumSlotClearance: +clearance.toFixed(3), navigation };
    });
    await page.waitForFunction(() => !window.__map3d.fly && !document.body.innerText.includes('در حال آماده‌سازی تنگه'), null, { timeout: 90000 });
    await page.screenshot({ path: path.join(evidence, 'foundation.png') });
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => {
      const s = window.__gamesync3d.ents.get('tanker')?.obj;
      return s && { x: s.position.x, y: s.position.y, z: s.position.z, shore: window.__map3d.field.sample(s.position.x,s.position.z) };
    });
    report.shipAfter = after;
    fs.writeFileSync(path.join(evidence, 'coast.json'), JSON.stringify(report, null, 2)+'\n');
    console.log(JSON.stringify(report));
    for (const [name,lane] of Object.entries(report.lanes)) assert.equal(lane.hullsOnLand,0,name+' intersects visible terrain');
    assert.equal(report.slotCount,29); assert.ok(report.minimumSlotClearance>0);
    assert.equal(report.tower.mounds,0); assert.ok(Math.abs(report.tower.foundationGap)<0.01);
    assert.ok(report.tower.groundMeshGap !== null && Math.abs(report.tower.groundMeshGap)<0.15, "footing must contact the drawn terrain triangles");
    assert.ok(report.navigation.shore<0 && after?.shore<0);
    assert.ok(Math.abs(report.navigation.y)<0.15 && Math.abs(after.y)<0.15,'tanker root above/below model waterline');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
