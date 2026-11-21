// Paired runs on a newly created Android Virtual Device. Do not clear an existing installation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [baseline, candidate, directory] = process.argv.slice(2);
assert.ok(directory && candidate && baseline, 'Supply baseline APK, candidate APK and evidence directory');
const app = 'ir.hormuz.sovereign';
mkdirSync(directory, { recursive: true });
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', timeout: 90000 }).trim();
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
    const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 20000);
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

async function run(apk, label, opening) {
  adb('install', apk);
  adb('shell','am','start','-W','-n',app + '/.MainActivity');
  const trace = {apkSha256:createHash('sha256').update(readFileSync(apk)).digest('hex'), samples:[], touches:[]};
  const cdp = await attach();
  const read = () => cdp.evaluate('(' + sample.toString() + ')()');
  try {
    const initial = await until(read, 180000);
    screenshot(label + '-first');
    trace.samples.push(initial);
    if (!opening) {
      assert.equal(initial.active, undefined);
      await delay(12000);
      trace.samples.push(await read());
      return;
    }
    let previous = initial.active;
    const observations = new Set();
    await until(async () => {
      const s = await read();
      if (!s || s.active === previous) return false;
      previous = s.active;
      trace.samples.push(s);
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
    assert.ok(last.action);
    trace.touches.push({active:last.active, ...last.action, target:'start-wave-1'});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[last.action]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const battle = await until(async () => { const s=await read(); return s?.phase === 'battle' && s; }, 15000);
    assert.ok(battle.started >= 180);
    trace.samples.push(battle);
    screenshot(label + '-battle');
  } finally {
    save(label + '.json',trace);
    cdp.close();
  }
}

assert.equal(adb('shell','getprop','ro.kernel.qemu'),'1','Requires a disposable emulator');
assert.ok(!adb('shell','pm','list','packages',app).includes('package:' + app),'Requires an unused AVD without an existing game');
save('device.json',{kind:'Android Virtual Device',sdk:adb('shell','getprop','ro.build.version.sdk'),
  model:adb('shell','getprop','ro.product.model'), webview:adb('shell','dumpsys','webviewupdate'), size:adb('shell','wm','size')});
try {
  await run(baseline,'baseline-074',false);
  adb('uninstall',app);
  await run(candidate,'opening',true);
  console.log('PASS paired APK installation, WebView rendering, stall, natural restart and manual start on AVD');
} finally {
  writeFileSync(join(directory,'android.log'),adb('logcat','-d','-t','1000'));
}
