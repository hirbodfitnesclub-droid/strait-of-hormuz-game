// Exercise real HUD buttons against the live 3D camera. Only Capacitor's OS
// event source is substituted so both Android event orders can be replayed.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { load } = require('./load-game.cjs');
const game = load('src/lib/game.ts');

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.AUDIT_CHROMIUM || '/usr/bin/chromium',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
    page.setDefaultTimeout(90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const initial = game.gameReducer(game.initialGame(), {type:'start'});
    await page.addInitScript(state => {
      localStorage.setItem('hormuz-game-v1', JSON.stringify({...state, lastSavedAt: Date.now()}));
      localStorage.setItem('hormuz-preferences-v2', JSON.stringify({sound:true, vibration:false, coachDismissed:true}));
      window.androidBridge = {postMessage() {}};
      window.appEvents = {};
      window.toneSources = 0;
      window.AudioContext = class extends AudioContext {
        constructor(options) {
          super(options);
          window.observedAudio = this;
        }
        createOscillator() {
          window.toneSources++;
          return super.createOscillator();
        }
      };
      window.Capacitor = {
        PluginHeaders: [{name: 'App', methods: [{name:'addListener'}, {name:'removeListener', rtype:'promise'}]}],
        nativeCallback(plugin, method, options, listener) {
          window.appEvents[options.eventName] = listener;
          return Promise.resolve(options.eventName);
        },
        nativePromise() { return Promise.resolve(); },
      };
    }, initial);
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3310', {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.appEvents.backButton && window.appEvents.appStateChange &&
      window.__gamesync3d?.perfInfo().calls > 0 && !window.__map3d.fly &&
      !document.body.innerText.includes('در حال آماده‌سازی تنگه'), null, {timeout: 180000, polling: 200}).catch(async error => {
      const snapshot = await page.evaluate(() => ({
        bridge: Object.keys(window.appEvents || {}), state: window.__m3d, context: window.__map3d?.contextLost,
        cameraFly: window.__map3d?.fly?.t, render: window.__gamesync3d?.perfInfo(), hidden: document.hidden,
        message: document.querySelector('.world-error')?.textContent,
      }));
      console.error('Scene startup failed', snapshot, errors);
      throw error;
    });
    const distance = () => page.evaluate(() => window.__map3d.distance());
    const settleCamera = () => page.waitForFunction(() => !window.__map3d.fly, null, {timeout: 60000});
    const back = () => page.evaluate(() => window.appEvents.backButton({canGoBack: false}));
    const savedAt = () => page.evaluate(() => JSON.parse(localStorage.getItem('hormuz-game-v1')).lastSavedAt);

    const signal = isActive => page.evaluate(active => window.appEvents.appStateChange({isActive:active}), isActive);
    await signal(false);
    await signal(true);
    const audioBeforeGesture = await page.evaluate(() => window.observedAudio?.state ?? null);
    await page.getByRole('button', {name:/^فولاد /}).click();
    await page.locator('.drawer').waitFor();
    await page.waitForFunction(() => window.observedAudio?.state === 'running');
    await back();
    await page.locator('.drawer').waitFor({state:'hidden'});
    await page.getByRole('button', {name:'فرماندهی بندر'}).click();
    await page.locator('.more-menu').waitFor();
    await back();
    await page.locator('.more-menu').waitFor({state:'hidden'});
    const toneSources = await page.evaluate(() => window.toneSources);

    const before = await distance();
    await page.getByRole('button', {name: 'کنترل نمای نقشه'}).click();
    await page.getByRole('button', {name: 'بزرگ‌نمایی', exact: true}).click();
    await settleCamera();
    const zoomIn = await distance();
    await page.getByRole('button', {name: 'کوچک‌نمایی', exact: true}).click();
    await settleCamera();
    const zoomOut = await distance();
    await page.getByRole('button', {name: 'بزرگ‌نمایی', exact: true}).click();
    await settleCamera();
    await page.getByRole('button', {name: 'بازنشانی نما'}).click();
    await settleCamera();
    const reset = await distance();
    await page.getByRole('button', {name: 'کنترل نمای نقشه'}).click();

    await back();
    await page.getByRole('button', {name:'ادامهٔ بازی'}).click();
    await page.waitForTimeout(1200);
    const battleAfterCancel = await page.evaluate(() => window.__gamesync3d.state.battleTime);
    await signal(false);
    await page.waitForFunction(() => window.observedAudio?.state === 'suspended');
    const atBackground = await savedAt();
    // Older WebViews can deliver appStateChange before visibilitychange.
    // Simulate another pause event and a delayed pagehide while still inactive.
    await page.waitForTimeout(9000);
    await page.evaluate(() => {
      window.appEvents.appStateChange({isActive:false});
      window.dispatchEvent(new Event('pagehide'));
    });
    const atPageHide = await savedAt();
    await signal(true);
    await page.waitForFunction(() => window.observedAudio?.state === 'running');
    console.log(JSON.stringify({audioBeforeGesture, toneSources, before, zoomIn, zoomOut, reset, battleAfterCancel,
      overwrittenBackgroundMs: atPageHide - atBackground, errors}));
    assert.ok(zoomIn < before * 0.85, 'zoom-in must move the actual 3D camera');
    assert.ok(zoomOut > zoomIn * 1.1, 'zoom-out must move the actual 3D camera');
    assert.ok(Math.abs(reset - before) < 1, 'reset must restore the game camera');
    assert.equal(battleAfterCancel, 0, 'cancelling exit must preserve the manual pause');
    assert.equal(atPageHide, atBackground, 'the offline clock must start at the first background event');
    assert.equal(audioBeforeGesture, null, 'returning to untouched game should not start an audio graph');
    assert.ok(toneSources > 0, 'UI feedback must reach the real Web Audio graph');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
