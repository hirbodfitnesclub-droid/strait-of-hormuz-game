const assert = require('node:assert/strict');
const { load } = require('./load-game.cjs');
const { SimulationClock } = load('src/lib/simulation-clock.ts');
const { localDailyStatus, readDailyReceipt } = load('src/lib/local-daily.ts');
const { batchStatics } = load('src/three-map/batch-statics.ts');
const THREE = require('three');
const { TapGesture } = load('src/lib/tap-gesture.ts');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('PASS', name); };
check('simulation time is identical at 30, 60 and 120Hz', () => {
 for(const hz of [30,60,120]) {const c=new SimulationClock();c.reset(0);let total=0;for(let i=1;i<=hz*10;i++)total+=c.advance(i*1000/hz).reduce((a,b)=>a+b,0);assert.equal(total,10);}
});
check('background never catches combat up', () => {const c=new SimulationClock();c.reset(0);assert.equal(c.advance(3600000,true).length,0);assert.equal(c.advance(3600125).length,1);});
check('stall catch-up is bounded',()=>{const c=new SimulationClock();c.reset(0);assert.equal(c.advance(10000).length,4);assert.equal(c.advance(10000).length,0);});
check('daily receipt replays the same reward after crash and rejects clock rollback',()=>{
 const r={day:20000,step:3,id:'receipt'};
 for(const d of [20000,19999]){const s=localDailyStatus(r,d*86400000);assert.equal(s.available,false);assert.equal(s.reward.id,'receipt');}
 assert.equal(localDailyStatus(r,20001*86400000).step,4);assert.equal(localDailyStatus(r,20002*86400000).step,1);
 assert.equal(localDailyStatus({day:20000,step:7,id:'end'},20001*86400000).step,1);
 assert.equal(readDailyReceipt('{broken'),null);assert.equal(readDailyReceipt('{"day":3,"step":999,"id":"x"}'),null);
});
check('static batching retains bounds, triangles and articulated subtrees',()=>{
 const root=new THREE.Group(), material=new THREE.MeshStandardMaterial();
 for(let i=0;i<12;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(1,2,3),material);m.position.set(i,2,0);m.rotation.y=.2*i;root.add(m);}
 const animated=new THREE.Group();animated.name='animyaw';const barrel=new THREE.Mesh(new THREE.BoxGeometry(),material);animated.add(barrel);root.add(animated);
 const triangles=r=>{let n=0;r.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3});return n;};
 const bounds=new THREE.Box3().setFromObject(root), count=triangles(root);batchStatics(root);
 assert.equal(triangles(root),count);assert.equal(animated.children[0],barrel);assert.equal(root.children.length,2);
 const after=new THREE.Box3().setFromObject(root);assert.ok(bounds.min.distanceTo(after.min)<1e-5);assert.ok(bounds.max.distanceTo(after.max)<1e-5);
});
check('tap, drag, pinch and cancellation cannot be confused',()=>{
 const t=new TapGesture();t.down(1,10,10,0);assert.equal(t.up(1,10,10,100),true);
 t.down(1,10,10,0);t.move(40,10);assert.equal(t.up(1,10,10,100),false);
 t.down(1,10,10,0);t.down(2,20,20,1);assert.equal(t.up(1,10,10,100),false);assert.equal(t.up(2,20,20,101),false);
 t.down(1,10,10,0);assert.equal(t.up(1,10,10,100,true),false);
});
check('all rendered shipping lanes match simulation coordinates',()=>{
 const {worldLane}=load('src/three-map/world-lane.ts'),n=load('src/lib/navigation.ts'),{pctTo3d}=load('src/three-map/coords.ts');
 for(const kind of ['enemy','trade','pirate','port'])for(let i=0;i<=1000;i++){const p=n.sampleLane(n.getLane('portrait',kind),i/1000),[x,z]=pctTo3d(p.x,p.y),v=worldLane(kind).getPointAt(i/1000);assert.ok(Math.hypot(x-v.x,z-v.z)<1e-8);}
});
console.log(`${passed} mobile core checks passed`);
