// TEST_URL must serve a production Android web export. Pass --baseline to collect
// the same measurements without applying the new regression thresholds.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.AUDIT_CHROMIUM || '/usr/bin/chromium',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/137.0 Mobile Safari/537.36' });
    await page.addInitScript(() => {
      window.androidBridge = {postMessage() {}};
      window.Capacitor = {
        PluginHeaders: [{name:'App', methods:[{name:'addListener'},{name:'removeListener',rtype:'promise'}]}],
        nativeCallback(plugin, method, options, cb) {
          if (plugin === 'App' && options.eventName === 'appStateChange') window.simulateAppState = cb;
          return Promise.resolve('test-listener-id');
        },
        nativePromise() { return Promise.resolve(); }
      };
    });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3310', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__gamesync3d?.state && window.simulateAppState, null, {timeout: 360000});
    // Settle the opening camera to the normal flight destination before
    // sampling. SwiftShader can take minutes to present 28 animation frames.
    await page.evaluate(() => {
      const map = window.__map3d;
      if (map.fly) { map.fly.t = 1; map.tick(0); }
    });
    await page.waitForFunction(() => window.__gamesync3d?.perfInfo().calls > 0 && !window.__map3d.fly);
    const result = await page.evaluate(async () => {
      const map = window.__map3d, sync = window.__gamesync3d;
      const cssRender = map.labelRenderer.render.bind(map.labelRenderer);
      let cssRoot, frames = 0, cssMs = 0, syncCalls = 0, cssLabels = 0;
      map.labelRenderer.render = (root, camera) => {
        cssRoot = root;
        const start = performance.now();
        cssRender(root, camera);
        cssMs += performance.now() - start;
        frames++;
      };
      const tune = sync.tuneResolution.bind(sync);
      sync.tuneResolution = (...args) => { syncCalls++; return tune(...args); };
      const previous = [], ids = [], calls = [];
      window.__hormuzFrameHook = now => {
        previous.push(now);
        ids.push(map.renderer.info.render.triangles);
        calls.push(map.renderer.info.render.calls);
      };
      const until = performance.now() + 32000;
      await new Promise(resolve => {
        const poll = setInterval(() => {
          if (performance.now() >= until) {clearInterval(poll); resolve();}
        }, 250);
      });
      let cssObjects = 0;
      cssRoot.traverse(object => {cssObjects++; if(object.isCSS2DObject) cssLabels++;});
      const memory = {...map.renderer.info.memory};
      const deltas = previous.slice(1).map((t,i) => t - previous[i]).sort((a,b) => a-b);
      const median = seq => seq.sort((a,b) => a-b)[Math.floor(seq.length/2)];
      const rendered = {
        frames, syncCalls, cssObjects, cssLabels, cssCpuMsPerFrame: +(cssMs / frames).toFixed(2),
        callsMedian: median(calls), trisMedian: median(ids), dpr: map.renderer.getPixelRatio(),
        frameMsMedian: median(deltas), frameMsP95: deltas[Math.floor(deltas.length * .95)],
        fps: +(1000 * (frames-1) / (previous.at(-1)-previous[0])).toFixed(2),
        hudFps: sync.perfInfo().fps, memory, jsHeapBytes: performance.memory?.usedJSHeapSize ?? null
      };
      const labelRects = [...map.labelRenderer.domElement.querySelectorAll('.map-label')].filter(el=>el.style.display !== 'none');
      const terrain = map.scene.getObjectByName('terrain');
      const terrainFaces = terrain.children.reduce((total, tile) => total + tile.geometry.index.count / 3, 0);
      const visibleLabelCount = labelRects.length;
      map.setLayer('labels', false);
      map.tick(0);
      cssRender(cssRoot, map.camera);
      const hiddenPlaceLabels = [...map.labelRenderer.domElement.querySelectorAll('.map-label')].filter(
        el => el.querySelector('[class^="lbl-"][class*=" t"]') && el.style.display !== 'none'
      ).length;
      map.setLayer('labels', true);
      const beforeBackground = frames;
      window.simulateAppState({isActive:false});
      const backgroundHasScheduledFrame = 'frameId' in map ? map.frameId !== null : null;
      await new Promise(resolve => setTimeout(resolve, 4500));
      const backgroundFrames = frames - beforeBackground;
      window.simulateAppState({isActive:true});
      const activeAgain = frames;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('map never resumed')), 20000);
        function check() {
          if (frames > activeAgain) {clearTimeout(timeout); resolve();}
          else setTimeout(check, 150);
        }
        check();
      });
      // An opaque magenta sheet immediately below the original deepest
      // seabed would show through any visible hole left by geometry pruning.
      const water = map.scene.children.find(o => o.material?.uniforms === map.waterU);
      const witness = water.clone();
      witness.material = map.rangeRing.children[0].material.clone();
      Object.assign(witness.material, {opacity:1, transparent:false, depthTest:true, depthWrite:true});
      witness.material.color.set(0xff00ff);
      witness.position.y = -2.74;
      witness.updateMatrix();
      map.scene.add(witness);
      const camera = map.camera.clone();
      const changedPixels = [];
      const gl = map.renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const ref = new Uint8Array(w*h*4), test = new Uint8Array(ref.length);
      for (const view of [null, [85,14,24, 85,0,-20], [-80,24,24,-80,0,-30]]) {
        if (view) {
          camera.position.set(...view.slice(0,3)); camera.lookAt(...view.slice(3));
        }
        for (const enabled of [false, true]) {
          witness.visible = enabled;
          map.renderer.render(map.scene, camera);
          gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,enabled ? test : ref);
        }
        let count = 0;
        for (let i=0; i<ref.length; i+=4) {
          if (Math.abs(test[i]-ref[i]) > 2 || Math.abs(test[i+1]-ref[i+1]) > 2 || Math.abs(test[i+2]-ref[i+2]) > 2) count++;
        }
        changedPixels.push(count);
      }
      map.scene.remove(witness);
      witness.material.dispose();
      return { ...rendered, cssVisible: visibleLabelCount, terrainFaces, changedPixels,
        backgroundFrames, backgroundHasScheduledFrame, hiddenPlaceLabels };

    });
    console.log(JSON.stringify({ ...result, pageErrors: errors }, null, 2));
    assert.deepEqual(errors, []);
    assert.equal(result.hiddenPlaceLabels, 0);
    assert.ok(result.frames >= 2 && result.cssVisible > 0 && result.cssLabels > 0);
    if (!process.argv.includes('--baseline')) {
      assert.equal(result.backgroundFrames, 0, 'inactive Capacitor with visible WebView');
      assert.equal(result.backgroundHasScheduledFrame, false);
      assert.deepEqual(result.changedPixels, [0,0,0], 'culled seabed is fully hidden in the three measured views');
      assert.equal(result.frames, result.syncCalls, 'one animation update per drawn frame');
      assert.ok(result.cssObjects < 300, 'labels traverse only their own nodes');
      assert.ok(result.terrainFaces < 480000, 'deep seabed faces excluded from mobile mesh');
    }
  } finally { await browser.close(); }
}
main().catch(err => {console.error(err); process.exitCode = 1;});
