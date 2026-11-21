// Inspect the actual WebGL meshes and exercise real touch targets on the static APK web bundle.
// OPENING_WORLD_URL points at assets/public/ extracted from that exact APK.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {createReadStream} = require('node:fs');
const {chromium} = require('playwright');
const {load} = require('./load-game.cjs');
const {freshPortGame, gameReducer} = load('src/lib/game.ts');

const url = process.env.OPENING_WORLD_URL;
const out = process.env.REOPENING_EVIDENCE;
assert.ok(url && out, 'Set OPENING_WORLD_URL and REOPENING_EVIDENCE');
const report = {runtime:'Chromium WebGL, 390×844 CSS pixels, touch, APK web bundle', runs:[]};

// Produce checkpoints with the real reducer; do not override the economy or advance
// the browser clock. The report explicitly distinguishes a restore from a fresh launch.
function checkpoint(second) {
  let state = freshPortGame();
  for (let i = 0; i < second; i++) state = gameReducer(state, {type:'tick', dt:1});
  assert.equal(state.opening.activeSeconds, second);
  return state;
}

function readScene() {
  const scene = window.__gamesync3d;
  const state = scene.state;
  const oil = scene.genericAnims.get('bld-oil');
  const pump = oil.find(a => a.name === 'anim:swing');
  const port = state.idle.port;
  function ship(key, landmark) {
    const hull = scene.ents.get(key)?.obj;
    if (!hull) return null;
    return {key, landmark, position:hull.position.toArray(), marker:hull.children.find(c=>c.name.startsWith('harbor-'))?.name,
      screen:scene.openingAnchor(landmark,false)};
  }
  const radar = scene.openingSignals;
  return {
    active:state.opening.activeSeconds, phase:state.phase, oceanDrawCalls:scene.perfInfo().calls,
    oil:state.oil, generated:state.opening.generated, blocked:state.opening.stalled,
    pumpArm:pump.obj.rotation.z, stalledIndicator:radar.stalled.visible, radarAngle:radar.antenna.rotation.y,
    radarReady:radar.ready.visible, radarScreen:scene.openingAnchor({kind:'radar'},false),
    oilExport:state.opening.lastExportIncome, ownCargo:port.tanker?.load, tankerStage:port.tanker?.stage,
    tanker:ship('tanker',{kind:'tanker',id:port.cycles}),
    merchants:state.merchants.map(m=>ship('merchant-'+m.id,{kind:'merchant',id:m.id})).filter(Boolean),
    popupFollowsMerchant:[...scene.popupSprites.values()].some(p=>p.anchor?.userData.pick?.type==='merchant')
  };
}

async function inspect(page, target, expected, run) {
  const plan = await page.evaluate(target => {
    const scene = window.__gamesync3d, map = window.__map3d;
    const hull = target.kind === 'radar' ? scene.openingSignals.scanner
      : scene.ents.get(target.kind === 'merchant' ? 'merchant-'+target.id : 'tanker')?.obj;
    if (!hull) return {absent:true};
    window.stopWorldProbeTracking?.();
    if (target.kind === 'merchant') {
      // Keep the moving target centered between out-of-process touch delivery and
      // the next rendered frame on software WebGL. Hull, input, clock and UI stay live.
      window.stopWorldProbeTracking = map.onBeforeFrame(()=>{
        if (hull.parent) map.flyTo(hull.position.x,hull.position.z,90,.0001);
      });
      return {focused:true, cameraTracksHull:true};
    }
    const canvas = map.renderer.domElement, r = canvas.getBoundingClientRect();
    const a = scene.openingAnchor(target,false);
    const top = a && document.elementFromPoint(r.x+r.width*a.x/100,r.y+r.height*a.y/100);
    if (top === canvas) return {focused:false};
    // Stand-in for a user panning the map. The final inspection always uses a touchscreen.
    map.flyTo(hull.position.x,hull.position.z,95,.12);
    return {focused:true};
  },target);
  assert.ok(!plan.absent, 'active hull exists for '+target.kind);
  if (plan.focused) await page.waitForFunction(()=>!window.__map3d.fly,null,{timeout:15000});
  const point = await page.evaluate(target=>{
    const s=window.__gamesync3d, canvas=window.__map3d.renderer.domElement;
    const a=s.openingAnchor(target,false), r=canvas.getBoundingClientRect();
    if (!a) return null;
    const x=r.left+r.width*a.x/100, y=r.top+r.height*a.y/100;
    return {x,y,exposed:document.elementFromPoint(x,y)===canvas,cover:document.elementFromPoint(x,y)?.outerHTML.slice(0,240),active:s.state.opening.activeSeconds};
  },target);
  run.lastAim={target,plan,point};
  assert.ok(point?.exposed, target.kind+' must have an exposed touch target after camera focus');
  await page.evaluate(() => {
    for (const type of ['pointerdown','pointerup']) addEventListener(type,e=>{
      const s=window.__gamesync3d,c=window.__map3d.renderer.domElement;
      (window.sceneTaps ||= []).push({type,active:s.state.opening.activeSeconds,paused:s.paused,
        hit:e.target.tagName,direct:s.pick(e,c),nearest:s.nearbyOpeningLandmark(e,c),x:e.clientX,y:e.clientY});
    },{capture:true,once:true});
  });
  await page.touchscreen.tap(point.x,point.y);
  const card=page.locator('aside[aria-label]').filter({hasText:expected});
  try { await card.waitFor({timeout:6000}); }
  catch (error) {
    run.failedTouch=await page.evaluate(()=>({events:window.sceneTaps,readouts:[...document.querySelectorAll('aside[aria-label]')].map(e=>[e.getAttribute('aria-label'),e.style.visibility]),status:document.querySelector('.game-shell').getAttribute('data-opening-target')}));
    throw error;
  }
  const text=(await card.innerText()).trim();
  run.inspections.push({target, cameraFocused:plan.focused, cameraTracksHull:!!plan.cameraTracksHull, point, text});
  await page.screenshot({path:path.join(out,'world-'+target.kind+'.png')});
  return card;
}

// Trigger trusted touch directly from the first unobscured merchant frame. This
// avoids a multi-second CDP read/compute/click round trip on software WebGL.
async function firstHarborTouch(page, context) {
  const cdp=await context.newCDPSession(page);
  await page.exposeBinding('qaTapMovingHull',async(_,point)=>{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  });
  await page.addInitScript(()=>{
    const probe=window.initialHarborTouch={attempts:[],events:[],readout:null};
    for (const type of ['pointerdown','pointerup']) addEventListener(type,e=>{
      if (probe.sent) probe.events.push({type,trusted:e.isTrusted,active:window.__gamesync3d?.state?.opening?.activeSeconds});
    },{capture:true});
    const tick=()=>{
      const s=window.__gamesync3d, m=window.__map3d;
      if (!s || !s.state?.opening || s.state.opening.activeSeconds>16 || probe.readout) return;
      const card=document.querySelector('aside[aria-label^="عوارض عبور"]');
      if (card && card.style.visibility==='visible') {
        probe.readout={text:card.innerText,label:card.getAttribute('aria-label'),active:s.state.opening.activeSeconds};
        return;
      }
      const enabled=document.querySelector('.map-view-toggle:not([disabled])');
      if (!enabled || !s.ents.get('merchant-1')?.init || probe.sent && performance.now()-probe.sent<1100) return;
      const a=s.openingAnchor({kind:'merchant',id:1},false), c=m.renderer.domElement, r=c.getBoundingClientRect();
      if (!a) return;
      const x=r.left+r.width*a.x/100,y=r.top+r.height*a.y/100;
      if (document.elementFromPoint(x,y)!==c) return;
      probe.sent=performance.now();
      probe.attempts.push({x,y,active:s.state.opening.activeSeconds});
      window.qaTapMovingHull({x,y}).catch(()=>{});
    };
    setInterval(tick,50);
  });
}

async function runCase(browser, second) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const run={restoreSecond:second || null, inspections:[], frames:[]};
  report.runs.push(run);
  try {
    const page=await context.newPage();
    if (!second) await firstHarborTouch(page,context);
    if (second) await page.addInitScript(s => {
      s.lastSavedAt=Date.now();
      localStorage.setItem('hormuz-game-v2',JSON.stringify({version:2,state:s}));
    },checkpoint(second));
    await page.addInitScript(()=>{
      setInterval(()=>{
        const s=window.__gamesync3d;
        if (s && [...s.popupSprites.values()].some(p=>p.anchor?.userData.pick?.id===1)) window.seenFirstReceiptOnHull=true;
      },60);
    });
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>{
      const s=window.__gamesync3d;
      return s?.genericAnims.get('bld-oil')?.some(a=>a.name==='anim:swing') && s.openingSignals && s.perfInfo().calls>0 &&
        !document.querySelector('.loading-screen') && s.state?.opening && s.ents.get('tanker')?.init;
    },null,{timeout:150000,polling:80});
    run.frames.push(await page.evaluate(readScene));
    await page.waitForFunction(()=> {
      const b=document.querySelector('.map-view-toggle');
      return b && !b.disabled;
    },null,{timeout:50000});
    console.log('interactive at checkpoint',second);
    if (!second) {
      await page.waitForFunction(()=>window.initialHarborTouch.readout || window.__gamesync3d.state.opening.activeSeconds>=6,null,{timeout:65000});
      run.normalCameraTouch=await page.evaluate(()=>window.initialHarborTouch);
      if (run.normalCameraTouch.readout) {
        run.inspections.push({target:{kind:'merchant',id:1},cameraFocused:false,text:run.normalCameraTouch.readout.text});
        await page.screenshot({path:path.join(out,'world-merchant.png')});
      } else {
        const merchant=await inspect(page,{kind:'merchant',id:1},/عوارض عبور/,run);
        await merchant.getByRole('button',{name:'بستن اطلاعات نقشه'}).tap();
      }
      const own=await inspect(page,{kind:'tanker',id:0},/فروش نفت/,run);
      assert.match(await own.innerText(),/محموله/);
      await own.getByRole('button',{name:'بستن اطلاعات نقشه'}).tap();
      await page.waitForFunction(()=>window.seenFirstReceiptOnHull,null,{timeout:40000,polling:70});
    }
    await page.waitForTimeout(850);
    run.frames.push(await page.evaluate(readScene));
    const [a,b]=run.frames;
    assert.notEqual(a.radarAngle,b.radarAngle,'the actual antenna must turn in both pump states');
    assert.equal(b.stalledIndicator,second===75,'amber marker must follow a real stall');
    if (second===75) {
      assert.equal(b.generated,0); assert.equal(a.pumpArm,b.pumpArm);
      await page.evaluate(()=>{
        const oil=window.__gamesync3d.buildings.get('oil').obj.position;
        window.__map3d.flyTo(oil.x,oil.z,70,.16);
      });
      await page.waitForFunction(()=>!window.__map3d.fly,null,{timeout:20000});
      await page.screenshot({path:path.join(out,'world-stopped-pump.png')});
    }
    else { assert.ok(b.generated>0); assert.notEqual(a.pumpArm,b.pumpArm); }
    if (!second) {
      run.receiptAttachedToFirstHull=await page.evaluate(()=>window.seenFirstReceiptOnHull);
      assert.equal(run.receiptAttachedToFirstHull,true);
      assert.equal(a.tanker.marker,'harbor-cargo');
      assert.ok(a.merchants.some(m=>m.marker==='harbor-toll'));
    }
    if (second===140) {
      assert.equal(b.radarReady,true);
      const radar=await inspect(page,{kind:'radar'},/رادار بندر/,run);
      assert.equal(await page.evaluate(()=>window.__gamesync3d.state.phase),'peace');
      await radar.getByRole('button',{name:'شروع دفاع'}).tap();
      await page.waitForFunction(()=>window.__gamesync3d.state.phase==='battle');
      run.manualWaveAt=await page.evaluate(()=>window.__gamesync3d.state.opening.manualWaveAt);
    }
  } finally { await context.close(); }
}

(async()=>{
  await fs.mkdir(out,{recursive:true});
  if (process.env.REOPENING_APK) {
    const hash=createHash('sha256');
    for await (const bytes of createReadStream(process.env.REOPENING_APK)) hash.update(bytes);
    report.apkSha256=hash.digest('hex');
  }
  report.sourceUrl=url;
  const browser=await chromium.launch({executablePath:process.env.AUDIT_CHROMIUM || '/usr/bin/chromium',
    args:['--no-sandbox','--enable-unsafe-swiftshader']});
  try {
    for (const second of [0,75,140]) await runCase(browser,second);
    report.ok=true;
  } catch (error) { report.ok=false; report.error=error.message; throw error; }
  finally {
    await fs.writeFile(path.join(out,'world-inspection.json'),JSON.stringify(report,null,2)+'\n');
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
