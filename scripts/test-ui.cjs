const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = process.env.TEST_URL || 'http://127.0.0.1:3000';
  const artifacts = path.join(process.cwd(), '.artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  desktop.on('pageerror', e => errors.push(e.message));
  await desktop.goto(root, { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(700);
  const mapFrame=await desktop.locator('.world-transform').evaluate(node=>{const world=node.getBoundingClientRect(),map=node.querySelector('.map-image').getBoundingClientRect();return {width:world.width,height:world.height,mapWidth:map.width,mapHeight:map.height};});
  assert.ok(mapFrame.height>300,`The water battlefield must keep its full playable height: ${JSON.stringify(mapFrame)}`);
  assert.ok(Math.abs(mapFrame.width-mapFrame.mapWidth)<1&&Math.abs(mapFrame.height-mapFrame.mapHeight)<1,`Map image and collision-navigation coordinates must stay in exact alignment: ${JSON.stringify(mapFrame)}`);
  assert.equal(await desktop.locator('.nav-item').count(), 5);
  await desktop.screenshot({ path: path.join(artifacts, 'desktop.png') });

  const initialTowers = await desktop.locator('.tower-pad.built').count();
  await desktop.locator('.tower-pad.empty:not(.locked)').first().click();
  assert.equal(await desktop.locator('.tower-choice').count(), 6);
  await desktop.getByRole('button', { name: 'انتخاب توپخانه سنگین', exact: true }).click();
  await desktop.screenshot({ path: path.join(artifacts, 'construction.png') });
  await desktop.locator('.build-confirm').click();
  assert.equal(await desktop.locator('.tower-pad.built').count(), initialTowers + 1);

  await desktop.locator('.nav-item').filter({ hasText: 'اقتصاد' }).click();
  await desktop.locator('.allocation-presets button').nth(2).click();
  assert.equal(await desktop.getByRole('slider', { name: 'درصد صادرات نفت' }).inputValue(), '20');
  await desktop.locator('.upgrade-button').first().click();
  await desktop.screenshot({ path: path.join(artifacts, 'economy.png') });
  await desktop.keyboard.press('Escape');
  assert.equal(await desktop.locator('.drawer').count(), 0);

  await desktop.locator('.nav-item').filter({ hasText: 'بیشتر' }).click();
  await desktop.locator('.more-grid > button').nth(1).click();
  assert.equal(await desktop.locator('.installed-tower').count(), initialTowers + 1);
  await desktop.locator('.installed-tower').first().click();
  assert.equal(await desktop.locator('.tower-sheet').count(), 1);
  await desktop.locator('.build-confirm').click();
  await desktop.getByRole('button', { name: 'بستن منوی برجک' }).click();
  await desktop.locator('.idle-battle-start').click();
  await desktop.waitForTimeout(2100);
  assert.ok(Number(await desktop.locator('.battle-canvas').getAttribute('data-enemies')) > 0);
  await desktop.locator('.main-battle-action').click();
  const frozenCount = await desktop.locator('.battle-canvas').getAttribute('data-enemies');
  await desktop.waitForTimeout(1800);
  assert.equal(await desktop.locator('.battle-canvas').getAttribute('data-enemies'), frozenCount);
  await desktop.locator('.main-battle-action').click();

  await desktop.locator('.quick-build-button').click();
  const choosingCount = await desktop.locator('.battle-canvas').getAttribute('data-enemies');
  await desktop.waitForTimeout(1200);
  assert.equal(await desktop.locator('.battle-canvas').getAttribute('data-enemies'), choosingCount);
  await desktop.getByRole('button', { name: 'بستن منوی برجک' }).click();
  await desktop.locator('.support-button.spell-emp').click();
  await desktop.waitForTimeout(500);
  assert.equal(await desktop.locator('.support-button.spell-emp.cooling').count(), 1);
  await desktop.screenshot({ path: path.join(artifacts, 'emp.png') });
  await desktop.locator('.support-button.spell-strike').click();
  assert.equal(await desktop.locator('.targeting-prompt').count(), 1);
  const map = await desktop.locator('.world-transform').boundingBox();
  await desktop.mouse.click(map.x + map.width * .83, map.y + map.height * .69);
  await desktop.waitForTimeout(1100);
  assert.equal(await desktop.locator('.support-button.spell-strike.cooling').count(), 1);
  await desktop.screenshot({ path: path.join(artifacts, 'ballistic.png') });

  await desktop.waitForTimeout(8500);
  const id = await desktop.evaluate(() => localStorage.getItem('hormuz-player-id'));
  const saved = await desktop.request.get(`${root}/api/save?id=${id}`);
  assert.equal(saved.status(), 200);
  assert.ok((await saved.json()).state);
  await desktop.reload({ waitUntil: 'networkidle' });
  assert.equal(await desktop.locator('.tower-pad.built').count(), initialTowers + 1);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', e => errors.push(`mobile: ${e.message}`));
  await mobile.goto(root, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(600);
  await mobile.screenshot({ path: path.join(artifacts, 'mobile.png') });
  const padAccess = await mobile.locator('.tower-pad').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect();
    return !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.tower-pad');
  }));
  assert.ok(padAccess.every(Boolean), `Map pads obscured by HUD: ${padAccess}`);
  const buildingAccess=await mobile.locator('.building-marker').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return !!document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('.building-marker');}));
  assert.ok(buildingAccess.every(Boolean),`Building markers obscured by another control: ${buildingAccess}`);
  assert.equal(padAccess.length,8);assert.equal(buildingAccess.length,9);
  await mobile.locator('.tower-pad.empty:not(.locked)').first().click();
  const reachable = await mobile.locator('.tower-choice').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect();
    return !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.tower-choice');
  }));
  assert.ok(reachable.every(Boolean), `Unreachable build choices: ${reachable}`);
  await mobile.screenshot({ path: path.join(artifacts, 'mobile-construction.png') });
  await mobile.getByRole('button', { name: 'بستن منوی برجک' }).click();
  await mobile.locator('.nav-item').filter({ hasText: 'بیشتر' }).click();
  assert.equal(await mobile.locator('.more-grid > button').count(), 7);
  await mobile.locator('.more-grid > button').filter({ hasText: 'تنظیمات' }).click();
  await mobile.getByRole('switch', { name: 'جلوه‌های سینمایی' }).click();
  assert.equal(await mobile.getByRole('switch', { name: 'جلوه‌های سینمایی' }).getAttribute('aria-checked'), 'false');
  await mobile.keyboard.press('Escape');
  await mobile.getByRole('button', { name: 'راهنمای سریع', exact: true }).click();
  assert.equal(await mobile.locator('.quick-guide li').count(), 3);
  await mobile.getByRole('button', { name: 'آماده‌ام، بریم' }).click();
  await mobile.emulateMedia({ reducedMotion: 'reduce' });
  await mobile.waitForTimeout(100);
  assert.equal(await mobile.locator('.game-shell.reduce-motion').count(), 1);

  await mobile.setViewportSize({ width: 320, height: 740 });
  await mobile.screenshot({ path: path.join(artifacts, 'mobile-small.png') });
  const overflow = await mobile.locator('.idle-command-bar').evaluate(node => {
    const r = node.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth;
  });
  assert.equal(overflow, false);
  assert.deepEqual(errors, []);
  console.log('PASS: construction, economy presets, upgrade, pause/resume, EMP, ballistic strike, server/local persistence, mobile controls, settings, guide, reduced motion and small-screen layout.');
  console.log(`Screenshots: ${artifacts}`);
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
