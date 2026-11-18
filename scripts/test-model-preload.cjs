// Exercise production cache/preloader and placement with real Three groups.
// Substitute only the I/O at the GLTFLoader boundary.
const assert = require('node:assert/strict');
const THREE = require('three');
const { GLTFLoader } = require('three/examples/jsm/loaders/GLTFLoader.js');
const { load } = require('./load-game.cjs');
const { preloadModels, loadModel } = load('src/three-map/models3d.ts');
let reads = 0, copies = 0;
GLTFLoader.prototype.loadAsync = async () => {
  reads++;
  const scene = new THREE.Group();
  scene.clone = function (...args) { copies++; return THREE.Group.prototype.clone.apply(this, args); };
  return { scene };
};
global.window = {};
console.info = () => {};
(async () => {
  let total = 0;
  await preloadModels((_, count) => { total = count; });
  assert.ok(total >= 20);
  assert.equal(reads, total);
  assert.equal(copies, 0, 'warmup must not clone then discard a model');
  const url = '/models/towers/autocannon-L1.glb';
  const [a, b] = await Promise.all([loadModel(url), loadModel(url)]);
  assert.equal(reads, total);
  assert.notEqual(a, b);
  assert.equal(copies, 2);
  console.log(`PASS ${total} warmups without a discarded clone; placements clone independently`);
})().catch(e => { console.error(e); process.exitCode = 1; });
