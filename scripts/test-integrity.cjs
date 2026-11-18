const assert = require('node:assert/strict');
const { load } = require('./load-game.cjs');
const G = load('src/lib/game.ts');
let checks = 0;
function test(name, run) { run(); checks++; console.log('PASS', name); }
function battle(mode = 'campaign', wave = 1) {
  const s = G.initialGame(); s.mode = mode; s.wave = wave;
  s.towers = [{slot: 4, kind: 'cannon', tier: 3, branch: null, priority: 'first'}];
  return G.gameReducer(s, {type:'start'});
}
test('non-campaign victory cannot unlock campaign or award campaign stars', () => {
  let s = battle('endless', 7); s.spawnRemaining = 0; s.enemies = []; s.battle.escort = null;
  s = G.gameReducer(s, {type:'tick', dt:.125});
  assert.equal(s.highestWave, 0); assert.deepEqual(s.idle.stars, {}); assert.equal(s.idle.modeBest.endless, 7);
});
test('new operation restores its full integrity; unclaimed rewards cannot be discarded by switching mode', () => {
  let s = G.initialGame(); s.hearts = 4;
  s = G.gameReducer(s, {type:'start'}); assert.equal(s.hearts,20);
  assert.equal(G.gameReducer(s,{type:'mode',mode:'endless'}).mode,'campaign');
  s.spawnRemaining = 0; s.enemies = [];
  s = G.gameReducer(s,{type:'tick',dt:.125});
  assert.equal(G.gameReducer(s,{type:'select-operation',wave:1}).idle.lastBattle.id,s.idle.lastBattle.id);
});
test('identical battle action produces identical output without mutating input', () => {
  const s = battle(); s.spawnRemaining=0;
  s.enemies=[{id:90,kind:'destroyer',boss:0,hp:100000,maxHp:100000,progress:.5,stun:30,specialClock:0}];
  const before=JSON.stringify(s);
  assert.deepEqual(G.gameReducer(s,{type:'advance',steps:4,battlePaused:false}),G.gameReducer(s,{type:'advance',steps:4,battlePaused:false}));
  assert.equal(JSON.stringify(s),before);
});
test('mid-battle persistence retains hostile and friendly projectiles, reverse lanes, hacks and boss limits', () => {
  const s=battle();
  s.enemies=[{id:90,kind:'destroyer',boss:0,hp:100,maxHp:100,progress:.5,stun:0,specialClock:4,rev:true,hackTimer:8,fireClock:3,weaponDownUntil:50,radarDownUntil:50,empSlow:3,isAdd:true,addsSpawned:40,noReward:true,shieldUp:true}];
  s.pendingImpacts=[{targetId:90,eta:.8,damage:30,crit:true,slot:4,kind:'cannon',modelKind:'autocannon',branch:null}];
  s.enemyMissiles=[{id:100,sourceId:90,source:'destroyer',targetSlot:4,eta:.9,total:1,x1:1,y1:2,x2:3,y2:4}];
  s.battle.failed=true; s.battle.failReason='intercept-crossed'; s.battle.sweep={4:2};
  const restored=G.hydrateGame(JSON.parse(JSON.stringify(s))).game;
  assert.deepEqual(restored.enemies,s.enemies);
  assert.equal(restored.pendingImpacts[0].eta,.8); assert.deepEqual(restored.enemyMissiles,s.enemyMissiles);
  assert.equal(restored.battle.failed,true); assert.deepEqual(restored.battle.sweep,s.battle.sweep);
  assert.ok(restored.nextId>100);
});
test('malformed numeric actions and over-cap saved buildings cannot poison the economy', () => {
  const s=G.initialGame();
  assert.equal(G.gameReducer(s,{type:'tick',dt:NaN}),s);
  assert.equal(G.gameReducer(s,{type:'split',value:NaN}).oilSplit,40);
  s.buildings.oil=1e100; s.steel=-100;
  const h=G.hydrateGame(s).game;
  assert.equal(h.buildings.oil,100); assert.equal(h.steel,0); assert.ok(Number.isFinite(G.getStats(h).oilRate));
  assert.equal(G.gameReducer(s,{type:'unlock',island:'invented'}).islands.includes('invented'),false);
});
test('prestige retires previous-run combat and event entities', () => {
  const s=G.initialGame();s.cash=100000;s.highestWave=10;
  s.mines=[{id:2,slot:4,x:40,y:40}]; s.pirates=[{id:3,progress:.5,hp:10}];
  s.event='vip';s.vipShip={progress:.5,hp:50,maxHp:100,age:8};
  const p=G.gameReducer(s,{type:'prestige'});
  assert.equal(p.prestige,1); assert.deepEqual(p.mines,[]);assert.deepEqual(p.pirates,[]);assert.equal(p.vipShip,null);
});
test('escort victory requires the caravan to reach its destination', () => {
  let s=battle('campaign',2);s.spawnRemaining=0;s.enemies=[];
  s=G.gameReducer(s,{type:'tick',dt:.125});
  assert.equal(s.phase,'battle');assert.ok(s.battle.escort.progress<1);
  for(let i=0;i<500&&s.phase==='battle';i++) s=G.gameReducer(s,{type:'tick',dt:.125});
  assert.equal(s.phase,'intermission');assert.equal(s.battle.escort,null);
});
test('allied hacked aircraft cannot fail an interception objective', () => {
  let s=battle('campaign',4);s.spawnRemaining=1;s.spawnClock=50;
  s.enemies=[{id:80,kind:'air',boss:0,hp:100,maxHp:100,progress:.6,stun:0,specialClock:0,hackTimer:5}];
  s=G.gameReducer(s,{type:'tick',dt:.125});assert.equal(s.phase,'battle');
});
test('selling returns the stated fraction of all invested tower upgrades',()=>{
 let s=G.initialGame();s.cash=100000;s.steel=2000;s.research=G.RESEARCH.map(r=>r.id);
 const before=s.cash,steel=s.steel;for(const a of [{type:'build-tower',slot:4,kind:'cannon'},...Array.from({length:3},()=>({type:'upgrade-tower',slot:4,branch:0}))])s=G.gameReducer(s,a);
 const cashSpent=before-s.cash,steelSpent=steel-s.steel,refund=G.towerSellRefund(s,s.towers[0]);
 assert.equal(refund.cash,Math.floor(cashSpent*.8));assert.equal(refund.steel,Math.floor(steelSpent*.8));
 s.research=[];assert.equal(G.towerSellRefund(s,s.towers[0]).cash,Math.floor(cashSpent*.5));
});
test('saving during combat preserves the next 15 seconds of deterministic mechanics',()=>{
 let s=G.initialGame();s.wave=15;s.cash=100000;s.fuel=2000;s.ammo=5000;s.steel=2000;
 s.research=G.RESEARCH.map(r=>r.id);s.buildings.power=20;s.buildings.refinery=10;s.buildings.oil=20;
 s.towers=[{slot:4,kind:'cannon',tier:3,branch:null,priority:'first'},{slot:5,kind:'missile',tier:4,branch:0,priority:'first'}];
 s=G.gameReducer(s,{type:'start'});for(let i=0;i<80;i++)s=G.gameReducer(s,{type:'tick',dt:.125});
 let restored=G.hydrateGame(JSON.parse(JSON.stringify({...s,lastSavedAt:Date.now()}))).game;
 for(let i=0;i<120;i++){s=G.gameReducer(s,{type:'tick',dt:.125});restored=G.gameReducer(restored,{type:'tick',dt:.125});}
 for(const field of ['cash','oil','fuel','steel','ammo','rngState','hearts','destroyed','phase','spawnRemaining','battleTime'])assert.deepEqual(restored[field],s[field],field);
 const enemies=x=>x.enemies.map(e=>({id:e.id,hp:e.hp,progress:e.progress,kind:e.kind}));assert.deepEqual(enemies(restored),enemies(s));
});

test('preparation coverage matches battle range in fog plus storm and short-range challenge',()=>{
 const {operationReadiness}=load('src/lib/readiness.ts');
 for(const [mode,runs] of [['campaign',0],['challenge',0],['challenge',1],['challenge',2]]){
  const s=G.initialGame();s.mode=mode;s.wave=2;s.event='storm';s.challengeRule=(runs+2)%3;s.idle.challengeRuns=runs;
  s.towers=[{slot:2,kind:'heavy',tier:3,branch:null,priority:'first'},{slot:5,kind:'air',tier:3,branch:null,priority:'first'}];
  const before=JSON.stringify(s),preview=operationReadiness(s);assert.equal(JSON.stringify(s),before,'preview must be pure');
  const live=G.gameReducer(s,{type:'start'});let expected=G.heroPower(s);
  for(const tower of s.towers){
   let covered=0;for(let i=1;i<=40;i++)if(G.distance(G.SLOTS[tower.slot],G.positionAt(preview.cutoff*i/40,s.layout))<=G.getRange(live,tower))covered++;
   expected+=G.towerDps(s,tower)*covered/40;
  }
  assert.ok(Math.abs(preview.coveredPower-expected)<1e-8,`${mode}: preview=${preview.coveredPower}, actual range coverage=${expected}`);
 }
});
console.log(`${checks} integrity checks passed`);
