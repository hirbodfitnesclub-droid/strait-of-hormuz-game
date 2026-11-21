// Runs the reduced-motion, dismissal and foreground lifecycle route against the exact APK's assets.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const {serveBundle, checksum} = require('./test-reopening-apk.cjs');
const {load} = require('./load-game.cjs');

async function run() {
  const apk = process.env.REOPENING_APK;
  assert.ok(apk, 'Set REOPENING_APK to the debug APK to inspect');
  const {freshPortGame, gameReducer} = load('src/lib/game.ts');
  const fixture = gameReducer(freshPortGame(), {type:'advance', steps:0, battlePaused:false, openingElapsed:88});
  assert.equal(fixture.opening.stalled, true);
  const digest = await checksum(apk);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'reopening-hint-'));
  let server, browser;
  try {
    execFileSync('unzip', ['-oq', apk, 'assets/public/*', '-d', work]);
    const host = await serveBundle(path.join(work, 'assets/public'));
    server = host.server;
    browser = await chromium.launch({executablePath:process.env.AUDIT_CHROMIUM || '/usr/bin/chromium', args:['--no-sandbox', '--enable-unsafe-swiftshader']});
    const page = await browser.newPage({viewport:{width:390,height:844}, deviceScaleFactor:1, isMobile:true, hasTouch:true, reducedMotion:'reduce'});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(90000);
    await page.addInitScript(fixture => {
      if (sessionStorage.getItem('hint-fixture')) return;
      fixture.lastSavedAt = Date.now();
      localStorage.setItem('hormuz-game-v2',JSON.stringify({version:2,state:fixture}));
      sessionStorage.setItem('hint-fixture','1');
    }, fixture);
    const age = () => page.evaluate(() => window.__gamesync3d.state.opening.activeSeconds);
    const at = second => page.waitForFunction(t=>window.__gamesync3d?.state.opening.activeSeconds>=t,second);
    const target = () => page.locator('.game-shell').getAttribute('data-opening-target');
    const tap = selector => page.locator(selector).tap();
    await page.goto(host.url);
    await page.locator('[data-opening-highlight=tank]').waitFor();
    assert.equal(await page.locator('[data-opening-highlight]').count(),1);
    assert.equal(await page.locator('[data-opening-highlight=tank]').evaluate(el => getComputedStyle(el).animationName),'none');
    await tap('.opening-skip');
    await tap('.opening-dismiss');
    await page.waitForFunction(()=>!document.querySelector('[data-opening-highlight]'));
    const dismissedAt = await age();
    console.log("Dismissed tank focus at",dismissedAt);
    await page.evaluate(() => {
      window.repeatedOpeningPulse = false;
      new MutationObserver(() => {if (document.querySelector('[data-opening-highlight=tank]')) window.repeatedOpeningPulse = true;})
        .observe(document.querySelector('.game-shell'), {attributes:true, attributeFilter:['data-opening-highlight'], childList:true, subtree:true});
    });
    await tap('.opening-tank-status');
    assert.equal(await target(),'none');
    const readingAt = await age();
    await at(readingAt+2);
    await page.getByRole('button',{name:'راهنمای این توقف'}).tap();
    assert.ok(await page.evaluate(()=>window.__gamesync3d.state.opening.helpRequestedAt >= 88));
    await tap('.building-sheet .close-control');
    await tap('.resource-port');
    await tap('.command-plaque.settings');
    assert.equal(await target(),'none');
    await tap('.panel-settings .icon-close');
    await at(dismissedAt+12);
    assert.equal(await target(),'tank');
    assert.equal(await page.evaluate(()=>window.repeatedOpeningPulse),false);
    console.log("Help and settings closed; no repeat across full 11s cadence");
    assert.equal(await page.locator('.quick-guide,.opening-skip,[data-opening-highlight]').count(),0);
    // Trigger the same foreground notification HTML receives from its browser host.
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>document.querySelector('.game-shell').dataset.openingTarget==='none');
    await page.waitForTimeout(300);
    const suspendedAt=await age();
    await new Promise(resolve=>setTimeout(resolve,1800));
    assert.equal(await age(),suspendedAt);
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>document.querySelector('.game-shell').dataset.openingTarget==='tank');
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('.game-shell')?.dataset.openingTarget==='tank');
    assert.equal(await page.locator('.quick-guide,.opening-skip,[data-opening-highlight],[role=dialog]').count(),0);
    console.log("Skipped guide and dismissed focus preserved across suspend/resume and reload");
    await at(120);
    await page.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',repeat:true,bubbles:true})));
    assert.equal(await page.evaluate(()=>window.__gamesync3d.state.phase),'peace');
    await tap('.idle-battle-start');
    await page.locator('.battle-running').waitFor();
    await tap('.battle-running');
    await page.locator('.battle-running.is-paused').waitFor();
    await page.waitForTimeout(300);
    const pausedAt=await age();
    await new Promise(resolve=>setTimeout(resolve,1800));
    assert.equal(await age(),pausedAt);
    assert.equal(await page.locator('.quick-guide,[data-opening-highlight],[role=dialog],[role=alertdialog]').count(),0);
    await tap('.battle-running');
    await at(pausedAt+1);
    assert.deepEqual(errors,[]);
    const result={apkSha256:digest,platform:'headless Chromium, extracted APK assets, reduced motion',initialFixture:'fresh industry advanced to active second 88, no input',dismissedAt,suspendedAt,pausedAt,passed:true};
    if(process.env.REOPENING_HINT_RESULT) await fs.writeFile(process.env.REOPENING_HINT_RESULT,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  } finally {
    if(browser) await browser.close();
    if(server) await new Promise(resolve=>server.close(resolve));
    await fs.rm(work,{recursive:true,force:true});
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
