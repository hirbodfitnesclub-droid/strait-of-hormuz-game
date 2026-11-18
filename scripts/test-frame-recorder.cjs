// Drive the actual rendered-frame hook. Delayed initialization must not shift
// first-minute counts; a rejected native share sheet must leave a retry path.
const assert = require('node:assert/strict');
const { load } = require('./load-game.cjs');
const reports = [];
load('src/lib/export-file.ts').exportJson = async (filename, report) => {
  reports.push({ filename, report });
  if (reports.length === 1) throw Error('cancelled');
};
const { startFrameRecorder } = load('src/lib/frame-recorder.ts');
let now = 0;
let sample;
let element;
global.performance = { now: () => now };
global.window = { setInterval: fn => { sample = fn; return 1; }, clearInterval() {} };
global.document = {
  createElement: () => Object.assign(new EventTarget(), { style: {}, remove() {} }),
  body: { appendChild: node => { element = node; } },
};
global.setTimeout = () => 0;
(async () => {
  const stop = startFrameRecorder(() => ({ calls: 40, tris: 50000, dpr: 1.5 }));
  for (now = 30000; now < 60000; now += 1000) {
    window.__hormuzFrameHook(now);
    sample();
  }
  for (now = 60000; now < 60300; now += 10) window.__hormuzFrameHook(now);
  stop();
  await new Promise(setImmediate);
  assert.equal(reports.length, 1);
  const { filename, report } = reports[0];
  assert.match(filename, /^hormuz-fps-.*\.json$/);
  assert.equal(report.minuteAvgFps['1'], 0.5); // thirty first-minute frames
  assert.equal(report.frames, 60);
  assert.equal(report.stalls.count, 30);
  assert.equal(report.timeline.length, 30);
  assert.equal(report.timeline[0].seconds, 30);
  assert.equal(report.render.maxCalls, 40);
  assert.equal(window.__hormuzFrameHook, undefined);
  element.dispatchEvent(new Event('click'));
  await new Promise(setImmediate);
  assert.equal(reports.length, 2);
  assert.strictEqual(reports[1].report, report);
  console.log('PASS frame timeline, render-hook stalls, first wall-clock minute, native export retry');
})().catch(e => { console.error(e); process.exitCode = 1; });
