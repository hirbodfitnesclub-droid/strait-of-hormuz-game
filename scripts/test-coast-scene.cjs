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

function inspect({slots, buildings, level, checkPlacement}) {
  const sync = window.__gamesync3d, map = window.__map3d;
  const depot = sync?.buildings.get('arms');
  if (!depot || depot.band !== (level === 50 ? 3 : 4) || sync.buildings.size !== 11 ||
      sync.towers.size !== 1 || !slots.every(slot=>sync.towers.has(slot.id) || sync.pads.has(slot.id)) || !sync.ents.get('merchant-1')?.init) return null;
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
  if (checkPlacement) {
    for (const [id,b] of Object.entries(buildings)) {
      const rec = sync.buildings.get(id);
      close(id, rec.groundBase, b.water ? 0 : surface(b.x,b.z));
    }
    for (const slot of slots) {
      const tower = sync.towers.get(slot.id);
      const padY = tower ? tower.obj.position.y + 0.42 * tower.base : sync.pads.get(slot.id).userData.pickRing.position.y - 0.15;
      close('slot '+slot.id,padY,surface(slot.x, slot.z));
    }
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
    glError:map.renderer.getContext().getError(), calls:sync.perfInfo().calls,
    effects:[...beacon,get('rot')?.rotation.y,get('sweep')?.rotation.y,get('flame')?.scale.y,get('flameLight')?.intensity],
    ship:sync.ents.get('merchant-1').obj.position.toArray(), slots:slots.length, buildings:sync.buildings.size};
}

async function checkLevel(read,level,timeout=90000) {
  const deadline=Date.now()+timeout;
  let first,latest;
  const moved = new Set();
  while (Date.now()<deadline) {
    latest=await read(inspect,{slots,buildings,level,checkPlacement:!first});
    if (latest) {
      assert.deepEqual(latest.errors,[]);
      assert.equal(latest.glError,0);
      assert.ok(latest.water && latest.calls>0);
      assert.equal(latest.effects.length,6);
      assert.ok(latest.effects.every(Number.isFinite));
      first ??= latest;
      latest.effects.forEach((v,i)=>{if(Math.abs(v-first.effects[i])>0.00001)moved.add(i);});
      if(moved.size===6 && Math.hypot(latest.ship[0]-first.ship[0],latest.ship[2]-first.ship[2])>.001) {
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
