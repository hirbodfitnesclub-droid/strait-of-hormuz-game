// Paired runs on a newly created Android Virtual Device. Do not clear an existing installation.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const [baseline, candidate, directory, suite = 'all'] = process.argv.slice(2);
assert.ok(directory && candidate && baseline, 'Supply baseline APK, candidate APK and evidence directory');
assert.ok(['all','opening','operations'].includes(suite));
const app = 'ir.hormuz.sovereign';
mkdirSync(directory, { recursive: true });
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', timeout: 90000, maxBuffer: 16000000 }).trim();
const save = (name, value) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2));
const screenshot = name => writeFileSync(join(directory, name + '.png'), execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 12000000 }));

async function until(read, timeout = 120000) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    try {
      const value = await read();
      if (value) return value;
    } catch (error) { lastError = error; }
    await delay(400);
  }
  throw Error('Timed out waiting for Android app' + (lastError ? ': ' + lastError.message : ''));
}

async function attach() {
  const pid = await until(() => adb('shell', 'pidof', '-s', app));
  await until(() => adb('shell', 'cat', '/proc/net/unix').includes('webview_devtools_remote_' + pid));
  const port = adb('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid);
  const tab = await until(async () => {
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    return tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl && t.url.includes('localhost'));
  });
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 0;
  const pending = new Map();
  socket.onmessage = ({data}) => {
    const msg = JSON.parse(data);
    pending.get(msg.id)?.(msg);
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 60000);
    pending.set(id, msg => {
      clearTimeout(timer);
      pending.delete(id);
      if (msg.error) reject(Error(msg.error.message));
      else resolve(msg.result);
    });
    socket.send(JSON.stringify({id, method, params}));
  });
  return {
    async evaluate(expression) {
      const reply = await send('Runtime.evaluate', {expression, returnByValue:true});
      if (reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description ?? 'Runtime evaluation failed');
      return reply.result.value;
    },
    send,
    close() { socket.close(); adb('forward','--remove','tcp:' + port); }
  };
}

function sample() {
  const world = window.__gamesync3d;
  if (!world?.state || !world.perfInfo().calls) return null;
  const s = world.state, o = s.opening;
  const button = document.querySelector('.idle-battle-start');
  const box = button?.getBoundingClientRect();
  return {seed:o?.seed, active:o?.activeSeconds, firstToll:o?.firstTollAt, phase:s.phase,
    started:o?.manualWaveAt, cash:s.cash, bank:s.idle.bank, oil:s.oil, cargo:s.idle.port.tanker?.load,
    stalled:o?.stalled, production:o?.generated, mastery:o?.mastery, ledger:o?.ledger, events:o?.events,
    action:box?.width && !button.disabled ? {x:box.left+box.width/2,y:box.top+box.height/2} : null};
}

async function tapControl(cdp, trace, selector, timeout = 30000, webviewTouch = false) {
  const point = await until(() => cdp.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el || el.disabled || !el.getClientRects().length) return null;
    el.scrollIntoView({block:'center',behavior:'instant'});
    const b = el.getBoundingClientRect();
    const x=b.left+b.width/2, y=b.top+b.height*0.4;
    if (!el.contains(document.elementFromPoint(x,y))) return null;
    const scale=window.devicePixelRatio*(window.visualViewport?.scale ?? 1);
    return {x,y,deviceX:Math.round(x*scale),deviceY:Math.round(y*scale),active:window.__gamesync3d.state.opening.activeSeconds};
  })()`), timeout);
  trace.touches.push({selector,...point,source:webviewTouch ? 'WebView touch' : 'ADB touch'});
  if (webviewTouch) {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  } else {
    adb('shell','input','tap',String(point.deviceX),String(point.deviceY));
  }
}

async function reopenCheckpoint(cdp, snapshot) {
  // Finish the live page's unload writes before seeding storage. A local stylesheet
  // shares the game's origin and has no application, lifecycle listener or autosave.
  const urls=await cdp.evaluate("({game:location.href,asset:document.querySelector('link[rel=stylesheet]').href})");
  assert.equal(new URL(urls.game).origin,new URL(urls.asset).origin);
  await cdp.send('Page.navigate',{url:urls.asset});
  await until(() => cdp.evaluate(`location.href === ${JSON.stringify(urls.asset)} && !window.__gamesync3d`));
  const restoredSecond = await cdp.evaluate(`(() => {
    const s=${JSON.stringify(snapshot)};
    s.lastSavedAt=Date.now();
    localStorage.setItem('hormuz-game-v2',JSON.stringify({version:2,state:s}));
    return JSON.parse(localStorage.getItem('hormuz-game-v2')).state.opening.activeSeconds;
  })()`);
  assert.equal(restoredSecond,snapshot.opening.activeSeconds);
  await cdp.send('Page.navigate',{url:urls.game});
  await until(() => cdp.evaluate(`window.__gamesync3d?.perfInfo().calls &&
    !!document.querySelector('.map-view-toggle:not(:disabled)') && !document.querySelector('.battle-result-dialog') &&
    window.__gamesync3d.state.phase === ${JSON.stringify(snapshot.phase)} && window.__gamesync3d.state.wave === ${snapshot.wave}`));
}

async function playOperations(cdp, trace) {
  const state = field => cdp.evaluate('window.__gamesync3d?.state?.' + field);
  trace.operations = [];
  async function finish(wave, clean) {
    for (let i = 0; i < 2 && (await state('speed')) < 3; i++) {
      const lastSpeed = await state('speed');
      await tapControl(cdp,trace,'.battle-speed');
      await until(async () => (await state('speed')) !== lastSpeed);
    }
    const report = await until(() => cdp.evaluate(`document.querySelector('.battle-result-dialog') && window.__gamesync3d.state.idle.lastBattle?.wave === ${wave} && window.__gamesync3d.state.idle.lastBattle`),240000);
    assert.equal(report.victory,clean);
    assert.equal(report.openingReceipt.damage,clean ? 0 : 2);
    assert.equal(report.cash,clean ? 80 + 10 * wave : 0);
    trace.operations.push(report);
    screenshot((clean ? 'clear-' : 'damage-') + wave);
  }
  for (let wave = 1; wave <= 3; wave++) {
    if (wave > 1) await tapControl(cdp,trace,'.idle-battle-start');
    await until(async () => (await state('phase')) === 'battle');
    await finish(wave,true);
    if (wave < 3) {
      const reportId=trace.operations.at(-1).id;
      const pending=() => cdp.evaluate(`!!document.querySelector('.battle-result-dialog') &&
        window.__gamesync3d.state.idle.lastBattle?.id === ${JSON.stringify(reportId)} &&
        !window.__gamesync3d.state.idle.lastBattle?.claimed`);
      // Only retry while this same receipt is outstanding. Scrolling a long sheet
      // or its opening animation can consume a native tap at the edge of the viewport.
      for (let attempt=0; attempt<3 && await pending(); attempt++) {
        await tapControl(cdp,trace,'.battle-result-dialog .primary-action',30000,attempt === 2);
        await delay(1200);
      }
      await until(() => cdp.evaluate("!document.querySelector('.battle-result-dialog')"),30000);
      assert.equal(await cdp.evaluate("document.querySelectorAll('[role=dialog]').length"),0);
    }
  }
  // The alternate checkpoint was reached through actual reducer actions, including moving the hero.
  const {campaignSaves} = createRequire(import.meta.url)('./test-opening-operations.cjs');
  const {damagedThree} = campaignSaves();
  await reopenCheckpoint(cdp,damagedThree);
  await tapControl(cdp,trace,'.idle-battle-start');
  await until(async () => (await state('phase')) === 'battle');
  await finish(3,false);
  const balances = () => cdp.evaluate('({cash:window.__gamesync3d.state.cash,steel:window.__gamesync3d.state.steel,damage:window.__gamesync3d.state.openingOperations.dockDamage})');
  const before = await balances();
  await tapControl(cdp,trace,'.battle-result-dialog .opening-dock-order button');
  await until(async () => (await balances()).damage === 1);
  const after = await balances();
  assert.deepEqual(after,{cash:before.cash-24,steel:before.steel-4,damage:1});
  trace.repair={before,after};
  screenshot('repaired');
}

async function run(apk, label, opening) {
  adb('install', apk);
  adb('shell','am','start','-W','-n',app + '/.MainActivity');
  // A new AVD can present an Android SystemUI lesson over the entire game. CDP sees
  // the WebView underneath it, but device taps must go to the unobstructed window.
  await delay(2500);
  const file='/data/local/tmp/hormuz-window-' + label + '.xml';
  const dumped=adb('shell','uiautomator','dump','--compressed',file);
  const tree=dumped.includes(file) ? adb('shell','cat',file) : '';
  if (/Viewing full screen/i.test(tree)) {
    const ok=tree.match(/<node\b(?=[^>]*text="Got it")[^>]*>/i)?.[0];
    const bounds=ok?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    assert.ok(bounds,'Android full-screen confirmation is covering the game');
    const [left,top,right,bottom]=bounds.slice(1).map(Number);
    adb('shell','input','tap',String(Math.round((left+right)/2)),String(Math.round((top+bottom)/2)));
    save(label + '-system-ui.json',{acknowledged:'Android full-screen confirmation',bounds:bounds.slice(1)});
  }
  const trace = {apkSha256:createHash('sha256').update(readFileSync(apk)).digest('hex'), samples:[], touches:[]};
  const cdp = await attach();
  const read = () => cdp.evaluate('(' + sample.toString() + ')()');
  const movie = '/sdcard/Download/' + label + '.mp4';
  let recorder, finished;
  try {
    const initial = await until(read, 180000);
    screenshot(label + '-first');
    trace.samples.push(initial);
    if (!opening) {
      assert.equal(initial.active, undefined);
      await delay(12000);
      trace.samples.push(await until(read));
      return;
    }
    recorder = spawn('adb', ['shell','screenrecord','--size','320x568','--bit-rate','750000','--time-limit','180',movie], {stdio:'ignore'});
    finished = new Promise(resolve => recorder.once('close', resolve));
    if (suite === 'operations') {
      const {campaignSaves} = createRequire(import.meta.url)('./test-opening-operations.cjs');
      const {port}=campaignSaves();
      await reopenCheckpoint(cdp,port);
      await tapControl(cdp,trace,'.idle-battle-start');
      trace.manualStart=await until(async () => { const s=await read(); return s?.phase === 'battle' && s; });
      await playOperations(cdp,trace);
      return;
    }
    let previous = initial.active;
    let beforeManualStart;
    const observations = new Set();
    await until(async () => {
      const s = await read();
      if (!s || s.active === previous) return false;
      previous = s.active;
      trace.samples.push(s);
      if (s.stalled && !beforeManualStart) {
        beforeManualStart = await cdp.evaluate('window.__gamesync3d.state');
        save('manual-branch-source',beforeManualStart);
      }
      const marks = [[s.stalled,'stall'], [s.action && s.stalled,'eligible'], [s.active >= 138 && !s.stalled,'resume']];
      for (const [test,name] of marks) if (test && !observations.has(name)) {
        observations.add(name);
        screenshot(label + '-' + name);
      }
      return s.active >= 180;
    }, 300000);
    const last = trace.samples.at(-1);
    assert.equal(last.firstToll,12);
    assert.equal(last.started,null);
    assert.equal(last.phase,'peace');
    assert.equal(last.mastery,false);
    assert.equal(last.cash,1200);
    assert.ok(trace.samples.some(s => s.stalled && s.oil === 500 && s.production === 0));
    assert.ok(last.events.some(e => e.kind === 'stall' && e.at === 70));
    assert.ok(last.events.some(e => e.kind === 'natural_recovery' && e.at === 138));
    assert.ok(last.action && beforeManualStart);
    trace.unattendedThrough=last.active;
    trace.branchFrom=beforeManualStart.opening.activeSeconds;
    await reopenCheckpoint(cdp,beforeManualStart);
    // A checkpoint at the first stall precedes the 120-second button by about 50 active seconds.
    await tapControl(cdp,trace,'.idle-battle-start',180000);
    const battle = await until(async () => { const s=await read(); return s?.phase === 'battle' && s; });
    trace.manualStart=battle;
    assert.ok(battle.started >= 120,'native start must follow eligibility');
    screenshot(label + '-battle');
    assert.ok(battle.started <= 180,'voluntary start must occur within the observed interval');
    if (suite === 'all') await playOperations(cdp,trace);
  } finally {
    save(label + '.json',trace);
    screenshot(label + '-last');
    cdp.close();
    if (recorder) {
      try {
        // Android finalizes the MP4 on SIGINT. This AVD started empty and runs one player.
        if (recorder.exitCode === null) {
          const pid = adb('shell','pidof','-s','screenrecord');
          if (/^\d+$/.test(pid)) adb('shell','kill','-2',pid);
        }
        await finished;
        adb('pull',movie,join(directory,label + '.mp4'));
      } catch (error) { console.warn('Screen recording unavailable:',error.message); }
    }
  }
}

assert.equal(adb('shell','getprop','ro.kernel.qemu'),'1','Requires a disposable emulator');
assert.ok(!adb('shell','pm','list','packages',app).includes('package:' + app),'Requires an unused AVD without an existing game');
// Keep a phone-sized CSS viewport on both APKs and limit the virtual software compositor's pixel workload.
adb('shell','wm','size','540x960');
adb('shell','wm','density','220');
adb('shell','settings','put','secure','immersive_mode_confirmations','confirmed');
// WindowManager reads this secure setting on startup. Restart the unused virtual device
// before the paired measurements so both versions get the same system configuration.
adb('reboot');
await delay(2500);
adb('wait-for-device');
await until(() => adb('shell','getprop','sys.boot_completed') === '1',180000);
adb('shell','input','keyevent','82');
save('device.json',{kind:'Android Virtual Device',sdk:adb('shell','getprop','ro.build.version.sdk'),
  model:adb('shell','getprop','ro.product.model'), webview:adb('shell','dumpsys','webviewupdate'),
  size:adb('shell','wm','size'), density:adb('shell','wm','density')});
try {
  if (suite !== 'operations') {
    await run(baseline,'baseline-074',false);
    adb('uninstall',app);
  }
  await run(candidate,suite === 'operations' ? 'operations' : 'opening',true);
  console.log('PASS installed Android suite:',suite);
} finally {
  writeFileSync(join(directory,'android.log'),adb('logcat','-d','-t','1000'));
}
