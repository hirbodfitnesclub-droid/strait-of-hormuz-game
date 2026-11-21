// Run the actual assets embedded in a signed APK with normal game controls.
// REOPENING_APK=... REOPENING_EVIDENCE=... node scripts/test-opening-combat-apk.cjs
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');
const {serveBundle,checksum} = require('./test-reopening-apk.cjs');
const {campaignSaves} = require('./test-opening-operations.cjs');
const output = path.resolve(process.env.REOPENING_EVIDENCE || 'review/reopening');

function bootstrap(state) {
  if(!sessionStorage.getItem('restored')) {
    localStorage.setItem('hormuz-game-v2',JSON.stringify({version:2,state:{...state,lastSavedAt:Date.now()}}));
    sessionStorage.setItem('restored','1');
  }
  window.campaignTrace={samples:[],touches:[]};
  document.addEventListener('click',event=>{
    const el=event.target.closest('button,summary');
    if(el) window.campaignTrace.touches.push({ms:Math.round(performance.now()),label:el.getAttribute('aria-label') || el.innerText});
  },true);
  let last='';
  setInterval(()=>{
    const s=window.__gamesync3d?.state;
    if(!s?.opening || !window.__gamesync3d.perfInfo().calls) return;
    const frame=[s.wave,s.phase,s.spawnIndex,s.hearts,s.battle?.markedEscaped,s.openingOperations?.dockDamage,s.speed].join('/');
    if(frame===last) return;
    last=frame;
    window.campaignTrace.samples.push({
      ms:Math.round(performance.now()),active:s.opening.activeSeconds,combat:s.battle?.elapsed,wave:s.wave,
      phase:s.phase,spawned:s.spawnIndex,hearts:s.hearts,quotaEscaped:s.battle?.markedEscaped,
      owned:s.towers.length,loan:!!s.battle?.trainingLoan,escorted:s.battle?.deliveredEscortHP,
      damage:s.openingOperations?.dockDamage || 0,speed:s.speed,
    });
  },100);
}

async function runBranch(browser,url,name,initial,sha) {
  const viewport={width:390,height:844};
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1,
    recordVideo:{dir:output,size:viewport}});
  const page=await context.newPage();
  page.setDefaultTimeout(60000);
  const evidence={apkSha256:sha,execution:'Chromium, assets extracted from APK, mobile viewport, software WebGL',
    initial:{wave:initial.wave,active:initial.opening.activeSeconds,seed:initial.opening.seed,source:'normal reducer actions and fixed-step simulation from freshPortGame'},results:[],errors:[]};
  page.on('pageerror',error=>evidence.errors.push(error.message));
  await page.addInitScript(bootstrap,initial);
  try {
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__gamesync3d?.perfInfo().calls>0,null,{timeout:180000});
    const report=page.locator('.battle-result-dialog');
    for(let wave=initial.wave;wave<=3;wave++){
      await page.locator('.idle-battle-start:visible').click();
      await page.waitForFunction(n=>window.__gamesync3d.state.phase==='battle'&&window.__gamesync3d.state.wave===n,wave);
      const speed=page.locator('.battle-speed:visible');
      for(let i=0;i<2 && (await page.evaluate(()=>window.__gamesync3d.state.speed))<3;i++) {
        const old=await page.evaluate(()=>window.__gamesync3d.state.speed);
        await speed.click(); await page.waitForFunction(n=>window.__gamesync3d.state.speed!==n,old);
      }
      await report.waitFor({state:'visible',timeout:240000});
      const result=await page.evaluate(()=>structuredClone(window.__gamesync3d.state.idle.lastBattle));
      assert.equal(result.wave,wave); assert.equal(result.victory,name==='clean');
      assert.equal(result.openingReceipt.damage,name==='clean'?0:2);
      assert.equal(result.cash,name==='clean'?80+10*wave:0);
      evidence.results.push(result);
      console.log(name,'M'+wave,result.title,result.seconds,result.hearts,result.openingReceipt.damage);
      if(name==='clean' && wave===3) {
        const wallet=await page.evaluate(()=>window.__gamesync3d.state.cash);
        await report.locator('summary').click();
        assert.equal(await page.evaluate(()=>window.__gamesync3d.state.cash),wallet);
        assert.equal(await report.locator('details').getAttribute('open'),'');
      }
      await page.screenshot({path:path.join(output,`combat-${name}-m${wave}.png`)});
      if(name==='damaged'){
        assert.equal(result.reason,'marked-quota');
        const wallet=await page.evaluate(()=>({cash:window.__gamesync3d.state.cash,steel:window.__gamesync3d.state.steel}));
        await report.getByRole('button',{name:'تعمیر یک واحد',exact:true}).click();
        await page.waitForFunction(()=>window.__gamesync3d.state.openingOperations.dockDamage===1);
        const after=await page.evaluate(()=>({cash:window.__gamesync3d.state.cash,steel:window.__gamesync3d.state.steel}));
        assert.equal(after.cash,wallet.cash-24); assert.equal(after.steel,wallet.steel-4);
        evidence.repair={before:wallet,after};
        await page.screenshot({path:path.join(output,'combat-damaged-repair.png')});
      }
      if(wave<3) {
        await report.locator('.primary-action').click();
        await report.waitFor({state:'hidden'});
        assert.equal(await page.getByRole('dialog').count(),0,'no secondary mandatory bulletin after the result');
      }
    }
    assert.deepEqual(evidence.errors,[]);
    evidence.pass=true;
  } catch(error) {
    evidence.pass=false; evidence.failure=String(error);
    await page.screenshot({path:path.join(output,`combat-${name}-failure.png`)}).catch(()=>{});
    throw error;
  } finally {
    evidence.trace=await page.evaluate(()=>window.campaignTrace).catch(()=>null);
    await fs.writeFile(path.join(output,`combat-${name}.json`),JSON.stringify(evidence,null,2));
    const video=page.video(); await context.close();
    if(video) await fs.rename(await video.path(),path.join(output,`combat-${name}.webm`));
  }
}

async function main(){
  assert.ok(process.env.REOPENING_APK,'REOPENING_APK must contain the APK path');
  const apk=path.resolve(process.env.REOPENING_APK);
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'reopening-combat-'));
  let browser,host;
  try {
    await fs.mkdir(output,{recursive:true});
    execFileSync('unzip',['-oq',apk,'assets/public/*','-d',temp]);
    host=await serveBundle(path.join(temp,'assets/public'));
    const sha=await checksum(apk);
    const {port,damagedThree}=campaignSaves();
    browser=await chromium.launch({executablePath:process.env.AUDIT_CHROMIUM || '/usr/bin/chromium',
      args:['--no-sandbox','--enable-unsafe-swiftshader']});
    for(const branch of (process.argv.length>2?process.argv.slice(2):['clean','damaged'])){
      assert.ok(['clean','damaged'].includes(branch));
      await runBranch(browser,host.url,branch,branch==='clean'?port:damagedThree,sha);
    }
  } finally {
    if(browser)await browser.close();
    if(host)await new Promise(resolve=>host.server.close(resolve));
    await fs.rm(temp,{recursive:true,force:true});
  }
}
main().catch(err=>{console.error(err);process.exitCode=1});
