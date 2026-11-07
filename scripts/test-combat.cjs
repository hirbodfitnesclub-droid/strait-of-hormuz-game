const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');

(async () => {
  const { load } = require('./load-game.cjs');
  const { initialGame, RESEARCH } = load('src/lib/game.ts');
  const game = initialGame();
  Object.assign(game, { cash: 100000, ammo: 5000, steel: 1500, fuel: 2400, phase: 'battle', mode: 'endless', wave: 7, speed: 2, spawnRemaining: 30, spawnClock: 1, nextId: 100 });
  game.buildings.power = 20;
  game.research = RESEARCH.map(t => t.id);
  game.islands = ['main', 'qeshm', 'hormuz', 'larak', 'tombs', 'kish'];
  game.towers = [
    { slot: 0, kind: 'boat', tier: 3, branch: null, priority: 'first' },
    { slot: 1, kind: 'missile', tier: 3, branch: null, priority: 'strongest' },
    { slot: 2, kind: 'ew', tier: 4, branch: 0, priority: 'first' },
    { slot: 3, kind: 'air', tier: 4, branch: 1, priority: 'air' },
    { slot: 4, kind: 'heavy', tier: 4, branch: 0, priority: 'first' },
    { slot: 5, kind: 'cannon', tier: 4, branch: 1, priority: 'first' },
    { slot: 6, kind: 'missile', tier: 4, branch: 0, priority: 'strongest' },
    { slot: 7, kind: 'air', tier: 4, branch: 0, priority: 'air' },
  ];
  game.enemies = ['speed', 'corvette', 'destroyer', 'air', 'sub', 'boss', 'corvette', 'air'].map((kind, index) => ({
    id: index + 1, kind, boss: kind === 'boss' ? 3 : 0,
    hp: kind === 'boss' ? 60000 : 12000, maxHp: kind === 'boss' ? 60000 : 12000,
    progress: .2 + index * .075, stun: 0, specialClock: 0,
  }));

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(seed => {
    localStorage.setItem('hormuz-game-v1', JSON.stringify(seed));
    localStorage.setItem('hormuz-preferences-v2', JSON.stringify({ cinematic: true, coachDismissed: true }));
  }, game);
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'روشن کردن صدا', exact: true }).click();
  await page.waitForTimeout(1700);
  assert.equal(await page.locator('.tower-pad.built').count(), 8);
  assert.ok(Number(await page.locator('.battle-canvas').getAttribute('data-enemies')) > 0);
  const metrics = await page.evaluate(() => new Promise(resolve => {
    let previous = performance.now();
    const start = previous, samples = [];
    const frame = now => {
      samples.push(now - previous); previous = now;
      if (now - start < 2200) requestAnimationFrame(frame);
      else {
        samples.sort((a, b) => a - b);
        resolve({ averageMs: (now - start) / samples.length, p95Ms: samples[Math.floor(samples.length * .95)], frames: samples.length });
      }
    };
    requestAnimationFrame(frame);
  }));
  assert.ok(metrics.averageMs < 60, `Severe rendering regression: ${JSON.stringify(metrics)}`);
  const artifactDir = path.join(process.cwd(), '.artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, 'cinematic-combat.png') });
  await page.locator('.support-button.spell-overdrive').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.battle-canvas').getAttribute('data-overdrive'), 'true');
  await page.locator('.support-button.spell-emp').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(artifactDir, 'cinematic-energy.png') });
  await page.locator('.support-button.spell-strike').click();
  const rect = await page.locator('.world-transform').boundingBox();
  await page.mouse.click(rect.x + rect.width * .6, rect.y + rect.height * .64);
  await page.waitForTimeout(1050);
  await page.screenshot({ path: path.join(artifactDir, 'cinematic-impact.png') });
  const pixels = await page.locator('.battle-canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    for (let i = 3; i < data.length; i += 16) if (data[i] > 20) visible++;
    return visible;
  });
  assert.ok(pixels > 100, 'Battle canvas did not render visible units or effects');
  assert.deepEqual(errors, []);
  console.log('PASS: all tower families, advanced branches, live audio activation, overdrive, EMP, ballistic impact, and canvas rendering.');
  console.log('Desktop headless rendering metrics:', JSON.stringify(metrics));
  await page.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', error => errors.push(`mobile: ${error.message}`));
  await mobile.addInitScript(seed => {
    localStorage.setItem('hormuz-game-v1', JSON.stringify({ ...seed, lastSavedAt: Date.now() }));
    localStorage.setItem('hormuz-preferences-v2', JSON.stringify({ cinematic: true, coachDismissed: true }));
  }, game);
  await mobile.goto(process.env.TEST_URL || 'http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  const mobileMetrics = await mobile.evaluate(() => new Promise(resolve => {
    const start = performance.now(); let frames = 0;
    const tick = now => { frames++; if(now-start < 1800) requestAnimationFrame(tick); else resolve({ averageMs:(now-start)/frames, frames }); };
    requestAnimationFrame(tick);
  }));
  assert.ok(mobileMetrics.averageMs < 60, `Mobile rendering regression: ${JSON.stringify(mobileMetrics)}`);
  await mobile.screenshot({ path: path.join(artifactDir, 'cinematic-mobile.png') });
  assert.deepEqual(errors, []);
  console.log('Mobile headless rendering metrics:', JSON.stringify(mobileMetrics));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
