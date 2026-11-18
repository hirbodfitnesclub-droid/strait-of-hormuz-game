// Legal-action progression simulation. No state edits, injected currency or
// killed enemies. This is an expert policy, not a human usability study.
const assert=require('node:assert/strict');
const {load}=require('./load-game.cjs'),G=load('src/lib/game.ts'),P=load('src/lib/progression.ts');
let s=G.initialGame(), actions=0;
const act=a=>{s=G.gameReducer(s,a);actions++;};
act({type:'layout',layout:'portrait'});
const rows=[],failures=[],dt=.125;
function tick(seconds){for(let i=0;i<seconds/dt;i++)act({type:'tick',dt});}
function housekeeping(){
 if(s.idle.bank>0)act({type:'collect-income'});
 if(s.idle.lastBattle&&!s.idle.lastBattle.claimed)act({type:'claim-battle'});
 while(s.idle.rewards.length)act({type:'dismiss-reward',id:s.idle.rewards[0].id});
 let m=P.currentMission(s);
 while(m&&P.missionProgress(s,m).complete){act({type:'claim-mission',id:m.id});m=P.currentMission(s);}
 if(s.chests)act({type:'open-chest'});
 for(const kind of G.TOWER_KINDS)if(s.cards[kind].count>=3)act({type:'upgrade-card',kind});
 if(s.idle.contract&&s.idle.contract.elapsed>=P.CONTRACTS[s.idle.contract.id].duration)act({type:'claim-contract'});
 if(!s.idle.contract&&s.cash>=500)act({type:'start-contract',id:'coastal'});
}
function build(id,level){if(s.buildings[id]>=level)return true;const q=G.buildingUpgradeQuote(s,id,1);if(q.affordable)act({type:'upgrade-building',id});return s.buildings[id]>=level;}
function prepare(wave,retry){
 const scale=Math.floor((wave-1)/5)+retry;
 // Keep a balanced working supply chain before adding electricity demand.
 const goals={oil:Math.min(20,3+scale*3),refinery:Math.min(20,2+scale*3),power:Math.min(30,4+scale*4),water:Math.min(15,2+scale*2),steel:Math.min(12,2+scale*2),arms:Math.min(20,2+scale*3),tank:Math.min(25,3+scale*4),dock:Math.min(10,2+scale)};
 let ready=true;
 for(const [id,level] of Object.entries(goals))if(!build(id,level))ready=false;
 for(const id of Object.keys(P.MANAGERS))if(s.idle.managerLevels[id]<1&&s.idle.xp>=P.MANAGERS[id].unlockXp&&s.cash>=P.managerCost(id,0))act({type:'hire-manager',id});
 const researchCount=Math.min(30,Math.max(1,(wave-1)*2)+retry*3);
 if(s.research.length<researchCount){
  const eligible=G.RESEARCH.filter((r,i,list)=>!s.research.includes(r.id)&&(!list.slice(0,i).some(x=>x.branch===r.branch&&!s.research.includes(x.id)))).sort((a,b)=>a.cost-b.cost);
  if(eligible[0]&&s.cash>=eligible[0].cost)act({type:'research',id:eligible[0].id});
  if(s.research.length<researchCount)ready=false;
 }
 // Deliberately include early firing positions instead of filling remote pads.
 const line=[['cannon',4],['air',2],['heavy',5],['ew',8],['missile',3],['boat',6],['heavy',7],['missile',9],['air',10],['ew',11],['cannon',12],['missile',26],['boat',27]];
 const count=Math.min(line.length,3+wave);
 const tier=Math.min(4,1+Math.floor(wave/4)+retry);
 for(const [kind,slot] of line.slice(0,count)){
  const island=G.SLOTS[slot].island;
  if(!s.islands.includes(island)){const d=G.ISLANDS.find(i=>i.id===island);if(s.cash>=d.cost)act({type:'unlock',island});else{ready=false;continue;}}
  const t=s.towers.find(t=>t.slot===slot),def=G.TOWERS[kind];
  if(!t){if(s.cash>=def.cost&&s.steel>=def.steel)act({type:'build-tower',slot,kind});ready=false;}
  else if(t.tier<tier&&(t.tier<3||s.research.includes('special'))){const c=G.towerUpgradeCost(t);if(s.cash>=c.cash&&s.steel>=c.steel)act({type:'upgrade-tower',slot,branch:slot%2});ready=false;}
 }
 if(G.getStats(s).grid<.95){build('power',s.buildings.power+1);ready=false;}
 if(s.fuel<150||s.ammo<400)ready=false;
 if(s.hero.active!==2)act({type:'hero-select',hero:2});
 if(wave>5&&!s.hero2&&s.cash>=3000)act({type:'deploy-hero2',hero:0});
 return ready;
}
for(let wave=1;wave<=25;wave++){
 let won=false;
 for(let retry=0;retry<4&&!won;retry++){
  const began=s.elapsed;
  for(let n=0;n<14400;n++){
   housekeeping();if(prepare(wave,retry))break;tick(1);
   if(n===14399)throw new Error(`supply deadlock wave ${wave}: ${JSON.stringify({cash:s.cash,fuel:s.fuel,ammo:s.ammo,grid:G.getStats(s).grid,buildings:s.buildings})}`);
  }
  const prepared=s.elapsed;
  act({type:'start'});assert.equal(s.phase,'battle');
  for(let n=0;n<4800&&s.phase==='battle';n++){
   const top=s.enemies.filter(e=>e.hp>0&&(e.hackTimer??0)<=0).sort((a,b)=>b.progress-a.progress)[0];
   if(top){const point=G.enemyPosition(top,s.layout);
    if(n%8===0){act({type:'hero',...point});if(s.hero2)act({type:'hero2',...point});}
    if(top.progress>.35&&!s.cooldowns.emp)act({type:'spell',spell:'emp'});
    if(top.progress>.4&&!s.cooldowns.strike)act({type:'spell',spell:'strike',...point});
    if(top.progress>.35&&!s.cooldowns.overdrive)act({type:'spell',spell:'overdrive'});
   }
   act({type:'tick',dt});
  }
  won=s.idle.lastBattle?.victory===true;
  const row={wave,retry,won,reason:s.idle.lastBattle?.reason,prepareSeconds:prepared-began,battleSeconds:s.elapsed-prepared,elapsed:s.elapsed,cash:Math.round(s.cash),hearts:s.hearts,towers:s.towers.length,research:s.research.length};
  console.log(JSON.stringify(row));(won?rows:failures).push(row);
 }
 assert.ok(won,`cannot finish wave ${wave} after supply/defense upgrades`);
}
assert.equal(s.highestWave,25);
console.log(JSON.stringify({gate:'legal-action fresh campaign; expert policy; no human retention inference',actions,hours:s.elapsed/3600,failures,rows},null,2));
