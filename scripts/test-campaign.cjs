// Solvability gate: all authored objectives, legitimate maximum-tier equipment,
// no HP editing, no killed-enemy shortcuts. This is not a pacing/retention test.
const assert=require('node:assert/strict');
const {load}=require('./load-game.cjs');const G=load('src/lib/game.ts');
const rows=[];
for(let wave=1;wave<=25;wave++) {
 let s=G.initialGame();s.wave=wave;s.cash=100000;s.fuel=2500;s.ammo=5000;s.steel=2000;
 s.research=G.RESEARCH.map(r=>r.id);s.islands=G.ISLANDS.map(i=>i.id);
 Object.assign(s.buildings,{oil:20,tank:30,dock:10,refinery:20,steel:10,arms:20,power:30,water:20,city:2,optical:3});
 const kinds=['missile','boat','cannon','air','ew','heavy'];
 s.towers=G.SLOTS.map((slot,i)=>({slot:i,kind:kinds[i%6],tier:4,branch:i%2,priority:'first'}));
 s.hero.active=2;s.hero2={...G.positionAt(.4),active:0};s=G.gameReducer(s,{type:'start'});
 for(let n=0;n<2400&&s.phase==='battle';n++){
  const enemy=s.enemies.filter(e=>e.hp>0).sort((a,b)=>b.progress-a.progress)[0];
  if(enemy){const p=G.enemyPosition(enemy,s.layout);if(n%8===0)s=G.gameReducer(s,{type:'hero',...p});
   if(enemy.progress>.3&&s.cooldowns.emp===0)s=G.gameReducer(s,{type:'spell',spell:'emp'});
   if(enemy.progress>.3&&s.cooldowns.strike===0)s=G.gameReducer(s,{type:'spell',spell:'strike',...p});
   if(enemy.progress>.25&&s.cooldowns.overdrive===0)s=G.gameReducer(s,{type:'spell',spell:'overdrive'});
  }
  s=G.gameReducer(s,{type:'tick',dt:.125});
  for(const key of ['cash','oil','fuel','steel','ammo'])assert.ok(Number.isFinite(s[key])&&s[key]>=0,`${wave}: ${key}`);
 }
 assert.ok(s.idle.lastBattle?.victory,`operation ${wave} failed: ${s.idle.lastBattle?.reason ?? 'timeout'}`);
 rows.push({wave,hearts:s.hearts,seconds:s.battle.elapsed,objective:s.battle.objective});
}
console.log(JSON.stringify({gate:'25 authored operations; fully equipped fixture; not fresh-player pacing',rows},null,2));
