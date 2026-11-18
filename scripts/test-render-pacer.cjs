const assert = require('node:assert/strict');
const { load } = require('./load-game.cjs');
const { RenderPacer } = load('src/lib/render-pacer.ts');

for (const displayHz of [60, 90, 120, 144]) {
  for (const targetHz of [30, 60]) {
    const pacer = new RenderPacer();
    let seconds = 0, frames = 0;
    for (let i = 0; i <= displayHz * 10; i++) {
      const dt = pacer.step(i * 1000 / displayHz, 1 / targetHz);
      if (dt === null) continue;
      seconds += dt;
      frames++;
    }
    assert.equal(frames, 10 * targetHz + 1);
    assert.ok(Math.abs(seconds - 10) < .001, `animation clock drift on ${displayHz} Hz display`);
  }
}
const pacer = new RenderPacer();
pacer.step(0, 1 / 60);
assert.equal(pacer.step(2000, 1 / 60), 0.05, 'stalled frame bounded');
assert.equal(pacer.step(2001, 1 / 60), null, 'no catch-up burst');
pacer.reset();
assert.equal(pacer.step(4000, 1 / 30), 0, 'foreground frame excludes background interval');
assert.ok(pacer.step(4017, 1 / 60) !== null, 'immediate interactive cadence when camera moves');
console.log('PASS 30/60 Hz frame and animation budgets at 60/90/120/144 Hz, stall and resume');
// Exercise the public HUD metric by advancing the renderer's own frame
// counter across two severe stalls. The animation dt is capped at 50 ms.
const {GameSync3D} = load('src/three-map/gamesync.ts');
const renderer = { info: { render: {frame:10, calls:5, triangles:20} }, getPixelRatio: () => 1 };
const sync = Object.assign(Object.create(GameSync3D.prototype), {map:{renderer}, dprLastFrame:-1});
global.window = { __hormuzCalmPhase:true };
sync.tuneResolution(0,1000);
assert.equal(sync.perfInfo().fps,0);
renderer.info.render.frame++;
sync.tuneResolution(.05,3000);
assert.equal(sync.perfInfo().fps,.5);
renderer.info.render.frame++;
sync.tuneResolution(.05,11000);
assert.equal(sync.perfInfo().fps,.2);
sync.tuneResolution(0,65000);
assert.equal(sync.perfInfo().fps,0, 'reset estimate after foregrounding');
console.log('PASS HUD reports counted frames through stalls and resets on resume');
