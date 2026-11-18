const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {load}=require('./load-game.cjs'),G=load('src/lib/game.ts');
(async()=>{const b=await chromium.launch({executablePath:process.env.AUDIT_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});try{
 const p=await b.newPage();const s=G.initialGame();s.phase='intermission';s.countdown=.01;s.idle.autoBattle=true;
 await p.addInitScript(s=>{localStorage.setItem('hormuz-game-v1',JSON.stringify({...s,lastSavedAt:Date.now()}));localStorage.setItem('hormuz-preferences-v2',JSON.stringify({coachDismissed:true,sound:false}));},s);
 p.on('pageerror',e=>{throw e});await p.goto(process.env.TEST_URL||'http://127.0.0.1:3310',{waitUntil:'domcontentloaded'});
 await p.waitForFunction(()=>window.__gamesync3d?.state?.phase==='battle',null,{timeout:120000});
 assert.equal(await p.locator('.main-battle-action.is-paused').count(),0);
 const info=await p.evaluate(()=>({phase:window.__gamesync3d.state.phase,wave:window.__gamesync3d.state.wave,auto:window.__gamesync3d.state.idle.autoBattle}));
 console.log('PASS opted-in intermission reload enters battle after world becomes ready',info);
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
