// Fail WebGL creation, then send a driver restore notice without a usable
// renderer. The notice alone must never remove the retry UI or resume battle.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

async function main() {
  const browser = await chromium.launch({executablePath: process.env.AUDIT_CHROMIUM || '/usr/bin/chromium',
    args:['--no-sandbox', '--disable-webgl']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3310', {waitUntil:'domcontentloaded'});
    const failure = page.locator('.world-error');
    await failure.waitFor({timeout:60000});
    await page.getByLabel('نقشه سه‌بعدی تنگه هرمز').dispatchEvent('webglcontextrestored');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const remainsFailed = await failure.isVisible();
    const syncCreated = await page.evaluate(() => !!window.__gamesync3d);
    console.log(JSON.stringify({remainsFailed, syncCreated}));
    assert.ok(remainsFailed, 'restore notice cannot clear a failed scene initialization');
    assert.equal(syncCreated, false);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
