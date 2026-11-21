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
    await page.locator('.radial-details').click();
    await page.locator('.tower-sheet').waitFor();
    await page.getByRole('button', {name:'بستن منوی برجک'}).click();
    await page.locator('.radial-close').click();

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
