const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage();
    await page.goto(process.env.TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:30000});
    const cached=await page.evaluate(async()=>{const cache=await caches.open('hormuz-static-v4');return (await cache.keys()).length;});
    assert.ok(cached>60,'Core assets should be prepared for offline play');
    const credits=await context.newPage();
    await credits.goto((process.env.TEST_URL||'http://127.0.0.1:3000')+'/assets/CREDITS.txt',{waitUntil:'domcontentloaded'});
    await credits.close();
    await page.waitForTimeout(500);
    // Apply the aged save after the previous page's unload save, before the new app hydrates.
    await page.addInitScript(()=>{
      if(localStorage.getItem('hormuz-offline-test-seeded'))return;
      const state=JSON.parse(localStorage.getItem('hormuz-game-v1'));
      state.lastSavedAt=Date.now()-60*60*1000;state.idle.contract={id:'coastal',elapsed:10};state.idle.boostCharges=0;
      localStorage.setItem('hormuz-game-v1',JSON.stringify(state));localStorage.setItem('hormuz-offline-test-seeded','yes');
    });
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.offline-dialog').waitFor({timeout:20000});
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('hormuz-game-v1')));
    assert.ok(before.idle.offline.cash>0);assert.equal(before.idle.contract.elapsed,60);assert.equal(before.idle.boostCharges,3);
    await page.locator('.offline-dialog .primary-action').click();
    await page.locator('.idle-command-bar').waitFor();
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('hormuz-game-v1')));
    assert.equal(after.idle.offline,null);assert.ok(after.cash>before.cash);
    await page.locator('.mission-hud-cta').click();
    if(await page.locator('.reward-confirm').count())await page.locator('.reward-confirm').click();
    await page.locator('.building-marker').first().click();
    await page.locator('.building-sheet').waitFor();
    assert.ok(await page.locator('.building-showcase .building-main-sprite').evaluate(image=>image.complete&&image.naturalWidth>0));
    console.log(`PASS: installed shell, ${cached} cached assets, offline reload, actual offline earnings, contract completion, charge refill and model rendering without internet.`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
