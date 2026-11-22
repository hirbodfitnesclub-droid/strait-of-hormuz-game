// Emulates native platform detection only; hardware plugins need device QA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

async function main() {
  const captureDir = process.env.UI_CAPTURE_DIR || 'review/mobile';
  fs.mkdirSync(captureDir, {recursive:true});
  const browser = await chromium.launch({
    executablePath: process.env.AUDIT_CHROMIUM || '/usr/lib/chromium/chromium',
    args:['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
    const screenshot = name => page.screenshot({path:path.join(captureDir,name), animations:'disabled'});
    const port = page.getByRole('button', {name:'فرماندهی بندر'});
    const command = page.locator('.more-menu');
    await page.addInitScript(() => { window.androidBridge = {postMessage() {}}; });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3310', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.__gamesync3d?.perfInfo().calls > 0 &&
      !window.__map3d.fly && !document.body.innerText.includes('در حال آماده‌سازی تنگه'), null, {timeout:180000});
    await screenshot('03-after.png');
    assert.equal(await page.locator('.bottom-navigation:visible').count(), 0, 'map bottom must be clear of the old tab bar');
    assert.equal(await page.locator('.game-map').evaluate(el => Math.round(el.getBoundingClientRect().height)), 844);
    console.log('PERF', await page.evaluate(() => window.__gamesync3d.perfInfo()));

    await page.getByRole('button', {name:/^فولاد /}).click();
    await page.locator('.drawer').waitFor();
    await screenshot('04-economy.png');
    await page.keyboard.press('Escape');
    await port.click();
    await command.getByRole('button', {name:'عملیات', exact:true}).click();
    await page.locator('.operation-grid').waitFor();
    assert.equal(await page.locator('.operation-node').count(), 25);
    assert.ok(await page.locator('.preparation-tips button').count() > 0);
    await page.locator('.operation-mode-tabs').getByRole('button', {name:'چالش تاکتیکی'}).click();
    await page.locator('.alternate-mode').waitFor();
    await screenshot('09-preparation.png');
    await page.locator('.preparation-tips button').first().click();
    const assets = () => page.evaluate(() => {
      const s=window.__gamesync3d.state;
      return {cash:s.cash,steel:s.steel,towers:s.towers.map(t=>t.kind)};
    });
    const before=await assets();
    const option=page.locator('.radial-kind:not(.unaffordable)').last();
    await option.tap();
    await page.locator('.tower-sheet').waitFor();
    assert.deepEqual(await assets(),before,'preview must not buy a tower');
    await page.locator('.workshop-cancel').tap();
    assert.deepEqual(await assets(),before,'cancel must not spend resources');
    await page.locator('.radial-details').click();
    await page.locator('.tower-sheet').waitFor();
    await page.getByRole('button', {name:'بستن منوی برجک'}).click();
    await page.locator('.radial-close').click();

    // Tap the rendered "+" at its projected position, not a substitute HUD command.
    const site = await page.evaluate(() => {
      const entry=[...window.__gamesync3d.pads].find(([,pad])=>pad.userData.key==='plus');
      const point=entry[1].userData.pickRing.position;
      window.__map3d.flyTo(point.x,point.z,55,.3);
      return entry[0];
    });
    await page.waitForFunction(()=>!window.__map3d.fly);
    const point=await page.evaluate(id=>{
      const sync=window.__gamesync3d, map=window.__map3d;
      const glyph=sync.pads.get(id).children.find(o=>o.isSprite);
      const projected=glyph.getWorldPosition(glyph.position.clone()).project(map.camera);
      const rect=map.renderer.domElement.getBoundingClientRect();
      return {x:rect.left+(1+projected.x)*rect.width/2,y:rect.top+(1-projected.y)*rect.height/2};
    },site);
    const atPad=await assets();
    await page.touchscreen.tap(point.x,point.y);
    await page.locator('.wheel-empty').waitFor();
    assert.deepEqual(await assets(),atPad,'tapping the 3D plus must only open the chooser');
    const choice=page.locator('.radial-kind:not(.unaffordable)').last();
    const index=await choice.evaluate(el=>[...el.parentElement.querySelectorAll('.radial-kind')].indexOf(el));
    const {TOWER_KINDS,TOWERS}=require('./load-game.cjs').load('src/lib/game.ts');
    const kind=TOWER_KINDS[index];
    await choice.tap();
    assert.deepEqual(await assets(),atPad,'choosing a kind must only preview it');
    await page.locator('.build-confirm').tap();
    await page.waitForFunction(count=>window.__gamesync3d.state.towers.length===count+1,atPad.towers.length);
    const built=await assets();
    assert.equal(built.towers.at(-1),kind);
    assert.equal(built.cash,atPad.cash-TOWERS[kind].cost);
    console.log('PASS 3D plus, choice, cancel and explicit touch confirmation for',kind);

    await port.click();
    await command.waitFor();
    await screenshot('05-command.png');
    await command.getByRole('button', {name:/هدیهٔ روزانه/}).click();
    await page.getByRole('button', {name:'دریافت هدیهٔ امروز'}).click();
    await page.locator('.reward-daily').waitFor();
    await screenshot('06-daily.png');
    assert.ok(await page.evaluate(() => localStorage.getItem('hormuz-daily-v1')));
    assert.deepEqual(errors, []);
    console.log('PASS mobile layout, economy, 25-operation grid, challenge preparation, tower actions, port command and native daily claim');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
