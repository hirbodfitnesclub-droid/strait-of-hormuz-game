// Inspect the running game after restoring each depot tier through normal save hydration.
// The same assertions run on the APK web bundle locally and on the installed Android APK.
const assert = require('node:assert/strict');
const {load} = require('./load-game.cjs');
const {freshPortGame} = load('src/lib/game.ts');
const slots = require('../src/three-map/slots-3d.json').slots;
const buildings = require('../src/three-map/buildings-3d.json');

function checkpoint(level) {
  const state = freshPortGame();
  for (const id of Object.keys(buildings)) state.buildings[id] = 1;
  state.buildings.arms = level;
  state.towers = [{slot:0, kind:'cannon', tier:1, branch:null, priority:'first'}];
  return state;
}

function inspect({slots, buildings, level, offset}) {
  const sync = window.__gamesync3d, map = window.__map3d;
  const depot = sync?.buildings.get('arms');
  if (!depot || depot.band !== (level === 50 ? 3 : 4) || sync.buildings.size !== 11 ||
      sync.towers.size !== 1 || !slots.every(slot=>sync.towers.has(slot.id) || sync.pads.has(slot.id))) return null;
  const terrain = map.scene.getObjectByName('Terrain_StraitOfHormuz');
  const ocean = map.scene.getObjectByName('Ocean_PersianGulf');
  const ray = new map.raycaster.constructor();
  function surface(x, z) {
    ray.ray.origin.set(x,100,z);
    ray.ray.direction.set(0,-1,0);
    return ray.intersectObject(terrain,false)[0]?.point.y ?? null;
  }
  const errors = [];
  function close(name, a, b) {
    if (b === null || Math.abs(a - b) > 0.001) errors.push([name,a,b]);
  }
  const sites = Object.entries(buildings);
  if (offset < sites.length + slots.length) {
    for (const [id,b] of sites.slice(offset,offset+4)) {
      const rec = sync.buildings.get(id);
      close(id, rec.groundBase, b.water ? 0 : surface(b.x,b.z));
    }
    for (const slot of slots.slice(Math.max(0,offset-sites.length),Math.max(0,offset+4-sites.length))) {
      const tower = sync.towers.get(slot.id);
      const padY = tower ? tower.obj.position.y + 0.42 * tower.base : sync.pads.get(slot.id).userData.pickRing.position.y - 0.15;
      close('slot '+slot.id,padY,surface(slot.x, slot.z));
    }
  }
  if (offset === 0) {
    const body = depot.obj.getObjectByName('StaticStructure');
    let ground = Infinity, left = Infinity, right = -Infinity;
    body.traverse(mesh=>{
      if (!mesh.isMesh) return;
      const pos=mesh.geometry.getAttribute('position'), v=mesh.position.clone();
      for(let i=0;i<pos.count;i++) {
        v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
        ground=Math.min(ground,v.y); left=Math.min(left,v.x); right=Math.max(right,v.x);
      }
    });
    close('depot floor',ground,depot.groundBase);
    close('depot width',right-left,6.2 * 9.5 / 8.845724);
    for (const [lane,curve] of Object.entries(sync.curves)) {
      for (let i=0; i<=256; i++) {
        const pt=curve.getPointAt(i/256);
        if (map.field.height(pt.x,pt.z)>0.03) {errors.push(['land crosses ship lane',lane,i]);break;}
      }
    }
  }
  const nodes=sync.genericAnims.get('bld-arms');
  const beacon=nodes.filter(n=>n.name==='anim:beacon').map(n=>n.mat.color.r);
  const get=name=>nodes.find(n=>n.name==='anim:'+name)?.obj;
  return {errors, water:ocean.material.uniforms?.uOceanColor.value?.isTexture === true,
    contextLost:map.renderer.getContext().isContextLost(), calls:sync.perfInfo().calls,
    effects:[...beacon,get('rot')?.rotation.y,get('sweep')?.rotation.y,get('flame')?.scale.y,get('flameLight')?.intensity],
    ships:Object.fromEntries([...sync.ents].filter(([id,e])=>id.startsWith('merchant-') && e.init).map(([id,e])=>[id,e.obj.position.toArray()])), slots:slots.length, buildings:sync.buildings.size};
}

async function checkLevel(read,level,timeout=90000) {
  const deadline=Date.now()+timeout;
  let first,latest,offset=0,sailing=false;
  const shipOrigins = new Map();
  const moved = new Set();
  while (Date.now()<deadline) {
    latest=await read(inspect,{slots,buildings,level,offset});
    if (latest) {
      assert.deepEqual(latest.errors,[]);
      assert.equal(latest.contextLost,false);
      assert.ok(latest.water && latest.calls>0);
      assert.equal(latest.effects.length,6);
      assert.ok(latest.effects.every(Number.isFinite));
      if (!first) console.log('Loaded depot and terrain at level', level);
      first ??= latest;
      offset += 4;
      for (const [id, pos] of Object.entries(latest.ships)) {
        const origin = shipOrigins.get(id);
        if (origin) sailing ||= Math.hypot(pos[0]-origin[0], pos[2]-origin[2])>.001;
        else shipOrigins.set(id,pos);
      }
      latest.effects.forEach((v,i)=>{if(Math.abs(v-first.effects[i])>0.00001)moved.add(i);});
      if(moved.size===6 && sailing && offset>=Object.keys(buildings).length+slots.length) {
        console.log('PASS depot level',level,latest.buildings,'buildings,',latest.slots,'tower sites, six animated parts, ship motion and navigable lanes');
        return latest;
      }
    }
    await new Promise(resolve=>setTimeout(resolve,180));
  }
  throw Error('Scene did not reach a functioning depot at level '+level+'; moving parts '+[...moved]+'; last sample '+JSON.stringify(latest));
}

async function desktop() {
  const {chromium}=require('playwright');
  const browser=await chromium.launch({executablePath:process.env.AUDIT_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
  try {
    for(const level of [50,100]) {
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
      const errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      page.on('console',m=>{if(m.type()==='error' && /Shader Error|VALIDATE_STATUS/.test(m.text()))errors.push(m.text());});
      await page.addInitScript(s=>{s.lastSavedAt=Date.now();localStorage.setItem('hormuz-game-v2',JSON.stringify({version:2,state:s}));},checkpoint(level));
      await page.goto(process.env.TEST_URL,{waitUntil:'domcontentloaded'});
      await checkLevel((fn,arg)=>page.evaluate(fn,arg),level);
      assert.deepEqual(errors,[]);
      await page.close();
    }
  } finally { await browser.close(); }
}
module.exports={checkpoint,checkLevel};
if(require.main===module) desktop().catch(err=>{console.error(err);process.exitCode=1;});
