// The Android bundle is local content. Fulfil every request from out/ while
// Chromium is offline: no service worker, remote server, or CDN is available.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {load}=require('./load-game.cjs'),G=load('src/lib/game.ts');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.AUDIT_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const external=[],errors=[];let assets=0;
  await c.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!=='https://hormuz.local'){external.push(u.origin);return route.abort();}
   let relative=decodeURIComponent(u.pathname).replace(/^\//,'')||'index.html';
   const root=path.resolve('out');let file=path.resolve(root,relative);
   if(!file.startsWith(root+path.sep))return route.abort();
   if(!fs.existsSync(file)&&!path.extname(file))file+='.html';
   if(!fs.existsSync(file)){errors.push('missing bundled resource '+relative);return route.abort();}
   if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
   assets++;const ext=path.extname(file),types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.glb':'model/gltf-binary'};
   await route.fulfill({path:file,contentType:types[ext]||'application/octet-stream'});
  });
  await c.setOffline(true);
  let seed=G.initialGame();seed.lastSavedAt=Date.now()-3600e3;seed.idle.exportWindowDollars=12000;seed.idle.exportWindowTime=6000;seed.idle.contract={id:'coastal',elapsed:10};seed.idle.boostCharges=0;
  await c.addInitScript(s=>{
   if(localStorage.getItem('test-seeded'))return;
   localStorage.setItem('hormuz-game-v1','{corrupt-primary');
   localStorage.setItem('hormuz-game-backup-v1',JSON.stringify(s));
   localStorage.setItem('hormuz-preferences-v2',JSON.stringify({coachDismissed:true,sound:false}));
   localStorage.setItem('test-seeded','1');
  },seed);
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto('https://hormuz.local',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.__gamesync3d?.perfInfo().calls>0,null,{timeout:180000});
  await p.locator('.offline-dialog').waitFor({timeout:90000});
  const before=await p.evaluate(()=>window.__gamesync3d.state);
  assert.ok(before.idle.offline.cash>0);assert.equal(before.idle.contract.elapsed,60);assert.equal(before.idle.boostCharges,3);
  await p.locator('.offline-dialog .primary-action').click({timeout:90000});
  await p.waitForFunction(()=>window.__gamesync3d.state.idle.offline===null);
  const after=await p.evaluate(()=>window.__gamesync3d.state);assert.ok(after.cash>before.cash);
  await p.reload({waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.__gamesync3d?.state?.idle?.offline===null&&window.__gamesync3d.perfInfo().calls>0,null,{timeout:180000});
  assert.equal(await p.evaluate(()=>window.__gamesync3d.state.cash),after.cash,'claimed offline income survives reload exactly once');
  const sw=await p.evaluate(async()=>navigator.serviceWorker?(await navigator.serviceWorker.getRegistrations()).length:0);assert.equal(sw,0);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  fs.mkdirSync('review/mobile',{recursive:true});await p.screenshot({path:'review/mobile/07-offline.png'});
  console.log(`PASS ${assets} bundled asset requests; no network/service worker; corrupt-primary backup recovery; offline reward once; contract/boost timers; reload and 3D rendering`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
