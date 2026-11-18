// Fail and replace real GameSync loads without waiting for the network.
const assert = require('node:assert/strict');
const THREE = require('three');
const {load} = require('./load-game.cjs');
const {GameSync3D} = load('src/three-map/gamesync.ts');
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
async function main() {
  const sync = Object.assign(Object.create(GameSync3D.prototype), {
    ents: new Map(), entPending: new Map(), placementRetryAt: new Map(), dyn: new THREE.Group(), alive: true
  });
  let tries = 0;
  const model = () => {if (++tries === 1) throw Error('injected failure'); return new THREE.Group();};
  sync.ensureEnt('merchant', model);
  await nextTurn();
  for (let i=0;i<120;i++) sync.ensureEnt('merchant', model);
  await nextTurn();
  assert.equal(tries, 1, 'no frame-by-frame retry after an error');
  sync.entPending.get('merchant').retryAt = performance.now() - 1;
  sync.ensureEnt('merchant', model);
  sync.ensureEnt('merchant', model);
  await nextTurn();
  assert.equal(tries, 2);
  assert.equal(sync.ents.size, 1);
  const late = Promise.withResolvers(), replacement = new THREE.Group();
  sync.ensureEnt('hero', () => late.promise);
  sync.dropEnt('hero');
  sync.ensureEnt('hero', () => replacement);
  late.resolve(new THREE.Group());
  await nextTurn();
  assert.equal(sync.ents.get('hero').obj, replacement);
  assert.equal(sync.dyn.children.length, 2);

  const {GLTFLoader} = require('three/examples/jsm/loaders/GLTFLoader.js');
  global.window = {};
  let reads=0;
  GLTFLoader.prototype.loadAsync = async () => {
    if (++reads===1) throw Error('injected missing placement');
    return {scene:new THREE.Group()};
  };
  const url='/test-retry.glb';
  assert.equal(await sync.loadPlacement(url), null);
  assert.equal(await sync.loadPlacement(url), null);
  assert.equal(reads, 1);
  sync.placementRetryAt.set(url,0);
  assert.ok(await sync.loadPlacement(url));
  assert.equal(reads, 2);
  console.log('PASS bounded dynamic and static GLB retry, stale instance suppression, real Three attachment');
}
main().catch(error => {console.error(error); process.exitCode=1;});
