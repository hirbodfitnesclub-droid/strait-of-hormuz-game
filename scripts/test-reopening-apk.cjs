// Exercise the static runtime shipped in a debug APK. ADB/device testing is a separate gate.
// REOPENING_APK=... REOPENING_EVIDENCE=... node scripts/test-reopening-apk.cjs [natural|paid|bank|poor|legacy]
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');

const output = path.resolve(process.env.REOPENING_EVIDENCE || 'review/reopening');
const apk = process.env.REOPENING_APK && path.resolve(process.env.REOPENING_APK);
const viewport = { width: 390, height: 844 };
const openingFixture = require('./fixtures/reopening/opening-validation.json');
const uninterrupted = require('./fixtures/reopening/opening-unattended-seconds.json');
const mime = { '.js':'text/javascript', '.html':'text/html', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml',
  '.glb':'model/gltf-binary', '.woff2':'font/woff2' };
const save = (name, data) => fs.writeFile(path.join(output, name), JSON.stringify(data, null, 2));

async function serveBundle(directory) {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const filename = path.resolve(directory, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
      if (!filename.startsWith(directory + path.sep)) throw new Error('outside APK bundle');
      const info = await fs.stat(filename);
      response.writeHead(200, {'Content-Type':mime[path.extname(filename)] || 'application/octet-stream', 'Content-Length':info.size});
      createReadStream(filename).on('error', () => response.destroy()).pipe(response);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {url:'http://127.0.0.1:' + server.address().port, server};
}

async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

// Read the existing renderer's diagnostic state. All writes to game state go through actual
// controls, except explicitly labelled balances on restored QA fixtures before boot.
function observe({ fixture, legacy }) {
  if (fixture && !sessionStorage.getItem('fixture-loaded')) {
    const initial = {...fixture, lastSavedAt:Date.now()};
    localStorage.setItem(legacy ? 'hormuz-game-v1' : 'hormuz-game-v2',
      JSON.stringify(legacy ? initial : {version:2, state:initial}));
    sessionStorage.setItem('fixture-loaded', '1');
    if (legacy) sessionStorage.setItem('original-legacy-bytes', JSON.stringify(initial));
  }
  const wallOrigin = Number(sessionStorage.getItem('qa-evidence-time-origin')) || performance.timeOrigin;
  sessionStorage.setItem('qa-evidence-time-origin',String(wallOrigin));
  const wallMs = () => Math.round(performance.timeOrigin + performance.now() - wallOrigin);
  const capture = {samples:[], touches:[], checkpoints:{}, visibility:[], firstView:null};
  window.reopeningQA = capture;
  let previous = '';
  const sample = () => {
    const scene = window.__gamesync3d;
    const state = scene?.state, opening = state?.opening;
    if (!opening || scene.perfInfo().calls < 1) return;
    const shell = document.querySelector('.game-shell');
    const sec = opening.activeSeconds;
    const target = shell?.getAttribute('data-opening-target');
    const highlights = [...document.querySelectorAll('[data-opening-highlight]')]
      .filter(el => el.getClientRects().length > 0).map(el => el.getAttribute('data-opening-highlight'));
    const dialogs = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')]
      .filter(el => el.getClientRects().length > 0).map(el => el.getAttribute('aria-label') || el.className);
    const key = JSON.stringify([sec, target, highlights, state.phase, state.cash, state.buildings.tank, dialogs]);
    if (key === previous) return;
    previous = key;
    const datum = {active:sec, wallMs:wallMs(), cash:state.cash, bank:state.idle.bank,
      oil:state.oil, phase:state.phase, wave:state.wave, tank:state.buildings.tank, cargo:state.idle.port.tanker?.load || 0,
      tanker:state.idle.port.tanker?.stage || 'away', production:opening.generated, stalled:opening.stalled,
      firstToll:opening.firstTollAt, mastery:opening.mastery, manualWaveAt:opening.manualWaveAt,
      seed:opening.seed, target, highlights, dialogs, ledger:{...opening.ledger}};
    capture.samples.push(datum);
    if (!capture.firstView) capture.firstView = datum;
    if (opening.stalled && !capture.checkpoints[70]) {
      capture.checkpoints[70] = JSON.parse(JSON.stringify(state));
    }
  };
  setInterval(sample, 75);
  addEventListener('pointerdown', event => {
    if (!event.isTrusted) return;
    const control = event.target.closest('button,summary,[role=button]');
    capture.touches.push({wallMs:wallMs(),active:window.__gamesync3d?.state?.opening?.activeSeconds,
      x:event.clientX,y:event.clientY,source:event.pointerType,control:control?.getAttribute('aria-label') || control?.innerText?.trim() || 'map'});
  }, {capture:true});
  document.addEventListener('visibilitychange', () => capture.visibility.push({hidden:document.hidden,wallMs:wallMs()}));
}

async function readState(page) {
  return await page.evaluate(() => {
    const s = window.__gamesync3d.state;
    return {cash:s.cash, bank:s.idle.bank, oil:s.oil, level:s.buildings.tank, phase:s.phase, wave:s.wave,
      opening:s.opening, target:document.querySelector('.game-shell').getAttribute('data-opening-target')};
  });
}
async function at(page, second) {
  await page.waitForFunction(t => (window.__gamesync3d?.state?.opening?.activeSeconds ?? -1) >= t,
    second,{timeout:Math.max(90000, second * 4500),polling:75});
}
async function ready(page) {
  // The renderer submits frames while assets are still loading; the map button is enabled
  // by the game's normal "world ready" and camera conditions after the first scene settles.
  await page.waitForFunction(() => window.__gamesync3d?.perfInfo().calls > 0 &&
    document.querySelector('.map-view-toggle:not(:disabled)') && !document.querySelector('.world-error'),
    null,{timeout:180000,polling:100});
}
async function shot(page, name) {
  await page.screenshot({path:path.join(output,name + '.png')});
}
async function tap(page, selector) {
  await page.locator(selector).first().tap({timeout:30000});
}
async function startWave(page) {
  const before = await readState(page);
  assert.ok(before.opening.firstTollAt !== null && before.opening.activeSeconds >= 120);
  assert.equal(before.phase, 'peace');
  assert.equal(before.opening.manualWaveAt, null);
  await tap(page, '.idle-battle-start');
  await page.waitForFunction(() => window.__gamesync3d.state.phase === 'battle');
  const state = await readState(page);
  assert.ok(state.opening.manualWaveAt >= 120 && state.opening.manualWaveAt <= 180,
    'manual first-wave action must remain inside the measured 180s interval');
  assert.equal(state.wave, 1);
}
async function buyTank(page, name) {
  const before = await readState(page);
  assert.equal(before.target, 'tank');
  await tap(page, '.opening-tank-status');
  const confirm = page.locator('.building-sheet .primary-action');
  await confirm.waitFor();
  // The active clock includes reading an opened panel.
  await at(page, before.opening.activeSeconds + 1);
  const inspecting = await readState(page);
  assert.equal(inspecting.cash, before.cash, 'inspecting must not spend funds');
  assert.equal(inspecting.opening.mastery,false,'reading the quote is not a recovery action');
  assert.ok(await confirm.isEnabled());
  await shot(page,name + '-tank-card');
  await confirm.tap();
  await page.waitForFunction(() => window.__gamesync3d.state.buildings.tank === 2);
  await page.waitForFunction(() => window.__gamesync3d.state.opening.mastery === true);
  const after = await readState(page);
  assert.equal(after.cash, before.cash - 90);
  assert.ok(after.opening.generated > 0);
  const sheet = page.locator('.building-sheet');
  if (await sheet.isVisible()) await sheet.locator('.close-control').tap();
}
async function treasury(page) {
  const before = await readState(page);
  await tap(page, '.collect-income');
  await page.waitForFunction(cash => window.__gamesync3d.state.cash > cash, before.cash);
  const after = await readState(page);
  assert.ok(after.opening.collectedFirstToll);
  assert.ok(Number.isInteger(after.cash - before.cash));
}
async function writeCheckpoint(page, second, sha) {
  await page.waitForFunction(s => !!window.reopeningQA.checkpoints[s], second);
  const state = await page.evaluate(s => window.reopeningQA.checkpoints[s], second);
  assert.ok(state.opening.activeSeconds < 120 && state.opening.stalled,
    'checkpoint must be a rendered stalled state before the first wave is offered');
  await save('natural-t' + second + '-save.json',state);
  await save('natural-t' + second + '-origin.json',{sha256:sha, scenario:'natural', active:state.opening.activeSeconds});
}
async function observeNatural(page, sha) {
  await at(page, 12);
  await page.waitForFunction(() => window.__gamesync3d.state.opening.firstTollAt != null);
  await shot(page,'opening-toll');
  await at(page, 70);
  await page.waitForFunction(() => window.__gamesync3d.state.opening.stalled === true);
  await writeCheckpoint(page,70,sha);
  await shot(page,'opening-stalled');
  await at(page, 138);
  await page.waitForFunction(() => !window.__gamesync3d.state.opening.stalled);
  await shot(page,'opening-natural-resume');
  await at(page, 180);
  await page.waitForFunction(() => window.reopeningQA.samples.some(s => s.active >= 180));
  const state = await readState(page);
  assert.equal(state.phase,'peace');
  assert.equal(state.opening.manualWaveAt,null);
  assert.equal(state.opening.mastery,false);
  assert.equal(state.level,1);
  assert.equal(state.cash,1200);
}

async function runCase(name, browser, url, sha) {
  let fixture, fixtureAdjustment;
  if (name === 'bank' || name === 'poor') {
    const checkpoint = 70;
    const origin = JSON.parse(await fs.readFile(path.join(output,'natural-t' + checkpoint + '-origin.json'),'utf8'));
    assert.equal(origin.sha256,sha,'the restored checkpoint must come from the same APK');
    fixture = JSON.parse(await fs.readFile(path.join(output,'natural-t' + checkpoint + '-save.json'),'utf8'));
    fixtureAdjustment = {activeSecond:fixture.opening.activeSeconds, original:{cash:fixture.cash,bank:fixture.idle.bank},
      applied:{cash:name === 'bank' ? 20 : 0,bank:name === 'bank' ? 260 : 0}};
    fixture.cash = fixtureAdjustment.applied.cash;
    fixture.idle.bank = fixtureAdjustment.applied.bank;
  }
  if (name === 'legacy') {
    assert.ok(process.env.REOPENING_LEGACY_SAVE, 'set REOPENING_LEGACY_SAVE to an original 0.7.4 save');
    fixture = JSON.parse(await fs.readFile(process.env.REOPENING_LEGACY_SAVE,'utf8'));
  }
  const record = process.env.REOPENING_VIDEO !== '0';
  const context = await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1,
    ...(record ? {recordVideo:{dir:output,size:viewport}} : {})});
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.addInitScript(observe,{fixture,legacy:name==='legacy'});
  const started = Date.now();
  let failure, beforeReload;
  try {
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await ready(page);
    if (name === 'legacy') {
      const actual = await page.evaluate(() => ({opening:window.__gamesync3d.state.opening,
        old:JSON.parse(localStorage.getItem('hormuz-game-v1')), unchanged:localStorage.getItem('hormuz-game-v1') === sessionStorage.getItem('original-legacy-bytes'), state:window.__gamesync3d.state}));
      assert.ok(!actual.opening, 'existing 0.7.4 ports must not restart the opening');
      assert.ok(actual.unchanged, 'source save bytes must survive migration');
      assert.equal(actual.old.oil,fixture.oil);
      assert.equal(actual.old.cash,fixture.cash);
      assert.equal(actual.state.buildings.tank, fixture.buildings.tank);
      await shot(page,'legacy-restored');
      assert.deepEqual(errors,[]);
      console.log(name + ': PASS');
      return;
    }
    await at(page, 0);
    console.log(name + ': interactive');
    if (name === 'paid' || name === 'natural') {
      const early = page.locator('.idle-battle-start');
      assert.ok(!(await early.isVisible()) || !(await early.isEnabled()),'first wave must wait for active time and dues');
    }
    if (name === 'natural') await observeNatural(page,sha);
    if (name === 'paid') {
      await at(page, 12);
      await treasury(page);
      await at(page, 87);
      await buyTank(page, name);
      await shot(page,'opening-paid-resume');
      await at(page, 120);
      await startWave(page);
      await shot(page,'opening-manual-wave');
    }
    if (name === 'bank') {
      assert.equal((await readState(page)).target,'treasury_to_tank');
      await treasury(page);
      await buyTank(page, name);
    }
    if (name === 'poor') {
      await at(page, fixture.opening.activeSeconds);
      const state = await readState(page);
      assert.ok(state.cash + Math.floor(state.bank) < 90);
      assert.equal(state.target,'none');
      const skip = page.locator('.opening-skip');
      await skip.tap();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('hormuz-preferences-v2') || '{}').coachDismissed);
      beforeReload = await page.evaluate(() => {
        const {samples,touches,visibility} = window.reopeningQA;
        return {samples,touches,visibility};
      });
      await page.reload({waitUntil:'domcontentloaded'});
      await ready(page);
      await at(page, 0);
      assert.ok(!await skip.isVisible(), 'skipping the optional guide survives an ordinary reload');
      assert.equal(await page.locator('[role=alertdialog]:visible,[role=dialog]:visible').count(),0);
      await at(page, 120);
      assert.equal((await readState(page)).target,'wave');
      await startWave(page);
      assert.equal((await readState(page)).level, 1);
    }
    const probe = await page.evaluate(() => window.reopeningQA);
    assert.ok(probe.samples.every(s => s.highlights.length <= 1), 'at most one highlight must be painted');
    if (name === 'natural') {
      assert.equal(probe.touches.length,0);
      assert.ok(probe.samples.every(s => s.dialogs.length === 0),'unattended opening must not force a dialog');
      // Compare every visible active second. Slow renderers can present several simulation
      // ticks in one frame, including the exact second used in a sparse reference snapshot.
      const observed = new Set();
      for (const actual of probe.samples.filter(s => s.active >= 1 && s.active <= 180)) {
        const [second,oil,cargo,production,bank,phase] = uninterrupted.samples[actual.active-1];
        assert.equal(second,actual.active);
        for (const [key,quantity] of Object.entries({oil,cargo,production,bank})) {
          assert.ok(Math.abs(actual[key] - quantity) < .0005,
            'APK at active ' + second + 's: ' + key + ' = ' + actual[key] + ', expected ' + quantity);
        }
        const expectedPhase = {arrival:'approach',departure:'depart',gap:'away'}[phase] || phase;
        assert.equal(actual.tanker, expectedPhase, 'tanker phase at ' + second);
        observed.add(actual.active);
      }
      for (const [from,to] of [[1,69],[70,137],[138,180]]) {
        assert.ok([...observed].filter(t => t >= from && t <= to).length >= 5,
          'not enough distinct reference samples for active interval ' + from + '–' + to);
      }
      const sparse = openingFixture.controls.find(c => c.initial_oil === 400 && c.initial_export_cargo === 625 && !c.claim_t12);
      for (const s of sparse.samples.filter(s => s.active_s <= 180)) {
        assert.deepEqual(uninterrupted.samples[s.active_s-1],
          [s.active_s,s.stored,s.cargo_total,s.produced,s.bank,s.tanker],'expanded oracle differs from the published fixture');
      }
      await save('natural-oracle.json',{reference:uninterrupted.reference,modelSha256:uninterrupted.modelSha256,
        fullReferenceSeconds:180,matchedActiveSeconds:[...observed],
        matchedPublishedSnapshots:sparse.samples.map(s => s.active_s).filter(t => observed.has(t))});
      const blocked = probe.samples.find(s => s.stalled);
      const {opening} = await readState(page);
      assert.equal(opening.events.find(e => e.kind === 'stall')?.at,70);
      assert.equal(opening.events.find(e => e.kind === 'natural_recovery')?.at,138);
      assert.ok(blocked.active >= 70 && blocked.active < 120);
      assert.equal(blocked.ledger.exportedOil,375);
      assert.equal(blocked.ledger.exportIncome,93.75);
      const recovered = probe.samples.find(s => s.active>70 && !s.stalled && s.production>0);
      assert.ok(recovered.active >= 138 && recovered.active <= 180);
      assert.equal(probe.samples.find(s => s.firstToll !== null)?.firstToll,12);
    }
    assert.deepEqual(errors,[]);
  } catch(error) {
    failure = error;
    await shot(page,name+'-failure').catch(()=>{});
    throw error;
  } finally {
    const evidence = await page.evaluate(()=>({
      samples:window.reopeningQA?.samples,touches:window.reopeningQA?.touches,visibility:window.reopeningQA?.visibility,
      events:window.__gamesync3d?.state?.opening?.events,perf:window.__gamesync3d?.perfInfo(),userAgent:navigator.userAgent,
      final:window.__gamesync3d?.state
    })).catch(()=>({}));
    await save(name+'-trace.json',{scenario:name,testSurface:'APK web bundle in touch Chromium/SwiftShader',
      sha256:sha,viewport,sourceFixture:name==='bank'?'first observed stall save; cash20, bank260':name==='poor'?'first observed stall save; cash0, bank0':name==='legacy'?'original 0.7.4 save':'fresh installation',
      fixtureAdjustment, beforeReload, observer:'Automated QA; excluded from player study',status:failure?'FAILED':'VERIFIED',
      failure:failure?.message,errors,wallSeconds:(Date.now()-started)/1000,...evidence});
    const video = page.video();
    await context.close();
    if (video) { await video.saveAs(path.join(output,name+'.webm')); await video.delete(); }
  }
  console.log(name + ': PASS');
}

async function main() {
  assert.ok(apk,'REOPENING_APK must identify the exact APK under test');
  const names = process.argv.slice(2);
  const cases = names.length ? names : ['natural','paid','bank','poor'];
  assert.ok(cases.every(name=>['natural','paid','bank','poor','legacy'].includes(name)));
  await fs.mkdir(output,{recursive:true});
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'reopening-apk-'));
  let browser, server;
  try {
    execFileSync('unzip',['-oq',apk,'assets/public/*','-d',dir]);
    const bundle = path.join(dir,'assets/public');
    const host = await serveBundle(bundle);
    server = host.server;
    const sha = await checksum(apk);
    console.log('APK',sha,'serving',host.url);
    browser = await chromium.launch({executablePath:process.env.AUDIT_CHROMIUM || '/usr/bin/chromium',
      args:['--no-sandbox','--enable-unsafe-swiftshader']});
    for (const name of cases) await runCase(name,browser,host.url,sha);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve=>server.close(resolve));
    await fs.rm(dir,{recursive:true,force:true});
  }
}
module.exports = { serveBundle, checksum };
if (require.main === module) main().catch(error=>{console.error(error);process.exitCode=1;});
