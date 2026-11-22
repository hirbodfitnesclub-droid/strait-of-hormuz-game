// Advance real reducer actions from a new port. The APK probe reuses these legal saves.
const assert = require('node:assert/strict');
const {load} = require('./load-game.cjs');
const campaign = require('../src/data/reopening/campaign.json');
const {freshPortGame, initialGame, gameReducer:run, hydrateGame, powerBreakdown} = load('src/lib/game.ts');
const {combatTowers, openingRepairQuote, openingDockEfficiency, openingSchedule} = load('src/lib/opening-operations.ts');
const tick = state => run(state,{type:'tick',dt:0.125});
const seconds = (state,duration) => {
  for(let i=0;i<duration*8;i++) state=tick(state);
  return state;
};
const restore = state => hydrateGame(JSON.parse(JSON.stringify({...state,lastSavedAt:Date.now()}))).game;
const start = state => run(state,{type:'start',source:'player'});
const claim = state => run(state,{type:'claim-battle'});

function complete(state) {
  const spawns=[], times=openingSchedule(state);
  for(let i=0;i<180*8;i++){
    const prev=state; state=tick(state);
    if(state.spawnIndex!==prev.spawnIndex) spawns.push(state.battle.elapsed);
    if(state.phase !== 'battle') {
      assert.deepEqual(spawns, times.slice(0,spawns.length).map(unit=>unit.at));
      assert.ok(state.idle.lastBattle.openingReceipt);
      return state;
    }
  }
  assert.fail('Operation did not reach a terminal result');
}

function campaignSaves() {
  let port=run(freshPortGame(),{type:'layout',layout:'portrait'});
  // The ordinary opening session is paused at a genuine, unspent, manual start offer.
  port=seconds(port,120);
  const one=start(port);
  assert.equal(one.battle.trainingLoan.tier,1);
  assert.deepEqual(one.towers,[]);
  assert.equal(combatTowers(one).length,1);
  assert.deepEqual(powerBreakdown(one),powerBreakdown(port));
  const sell=run(one,{type:'sell-tower',slot:one.battle.trainingLoan.slot});
  assert.equal(sell.cash,one.cash); assert.deepEqual(combatTowers(sell),combatTowers(one));
  const bought=run(one,{type:'build-tower',slot:one.battle.trainingLoan.slot,kind:'cannon'});
  assert.equal(bought.cash,one.cash-250); assert.equal(bought.steel,one.steel-30);
  assert.equal(bought.battle.trainingLoan,undefined); assert.equal(combatTowers(bought).length,1);
  const unstaffed=run(one,{type:'hero',x:0,y:0});
  assert.ok(complete(unstaffed).fireStats.autocannon.hits>0);
  const full=structuredClone(port);
  full.ammo=0;
  full.towers=load('src/lib/game.ts').SLOTS.filter(pad=>full.islands.includes(pad.island))
    .map(pad=>({slot:pad.id,kind:'air',tier:1,branch:null,priority:'first'}));
  const equipped=start(full);
  assert.equal(combatTowers(restore(equipped)).filter(t=>t.kind==='cannon').length,1);
  assert.deepEqual(equipped.towers,full.towers.map(t=>({...t,cooldown:0,salvoLeft:undefined})));
  const resumed=restore(seconds(one,10));
  assert.equal(resumed.battle.trainingLoan.slot,one.battle.trainingLoan.slot);
  const clearedOne=complete(one);
  assert.equal(clearedOne.ammo,port.ammo);
  assert.equal(clearedOne.battle.trainingLoan,undefined);
  const two=claim(clearedOne);
  const clearedTwo=complete(start(two));
  assert.equal(clearedTwo.battle.trainingLoan,undefined);
  assert.ok(clearedTwo.battle.deliveredEscortHP>0);
  const three=claim(clearedTwo);
  const clearedThree=complete(start(three));
  // A legal movement order changes actual combat, including the marked-group outcome.
  const alternate=run(two,{type:'hero',x:0,y:0});
  const alternateTwo=complete(start(alternate));
  assert.equal(alternateTwo.idle.lastBattle.victory,true);
  const damagedThree=claim(alternateTwo);
  const damaged=complete(start(damagedThree));
  for(const [i,end] of [clearedOne,clearedTwo,clearedThree].entries()) {
    const report=end.idle.lastBattle;
    assert.equal(report.title,campaign.operations[i].title_fa);
    assert.equal(report.victory,true); assert.equal(report.cash,90+10*i);
    assert.equal(report.openingReceipt.damage,0); assert.equal(report.openingReceipt.firstClear,true);
    assert.equal(claim(claim(end)).cash,end.cash);
  }
  assert.equal(damaged.idle.lastBattle.reason,'marked-quota'); assert.equal(damaged.idle.lastBattle.cash,0);
  assert.equal(damaged.idle.lastBattle.openingReceipt.damage,2); assert.equal(openingDockEfficiency(damaged),0.7);
  return {port,two,three,damagedThree,damaged,cleared:[clearedOne,clearedTwo,clearedThree]};
}

function repairChecks(state) {
  const quote=openingRepairQuote(state);
  assert.equal(quote.cash,24); assert.equal(quote.steel,4);
  const pay={type:'repair-opening-dock',method:'paid',receipt:quote.key,allowCollection:false};
  const paid=run(state,pay);
  assert.equal(paid.cash,state.cash-24); assert.equal(paid.steel,state.steel-4);
  assert.equal(openingDockEfficiency(paid),0.85);
  const restored=restore(paid);
  assert.equal(run(restored,pay),restored);
  const bank=structuredClone(state); bank.cash=0; bank.idle.bank=24.5;
  assert.deepEqual(run(bank,pay),bank);
  const collected=run(bank,{...pay,allowCollection:true});
  assert.equal(collected.cash,0); assert.equal(collected.idle.bank,0.5);
  assert.equal(collected.idle.collected,bank.idle.collected+24);
  const poor=structuredClone(state); poor.cash=0; poor.idle.bank=0; poor.steel=0;
  assert.deepEqual(run(poor,pay),poor);
  let service=run(poor,{...pay,method:'service'});
  const due=service.openingOperations.serviceDue;
  assert.equal(due,poor.opening.activeSeconds+poor.opening.remainder+30);
  service=seconds(restore(service),29);
  assert.equal(service.openingOperations.dockDamage,2);
  service=seconds(service,1);
  assert.equal(service.openingOperations.dockDamage,1); assert.equal(service.openingOperations.serviceDue,null);
  assert.deepEqual(run(service,pay),service);
  const retry=complete(start(claim(restore(state))));
  assert.equal(retry.idle.lastBattle.openingReceipt.damage,0);
  assert.equal(retry.openingOperations.dockDamage,2);
}

if(require.main===module) {
  const {damaged,damagedThree,three,cleared}=campaignSaves();
  // Leave defense at 3× on both outcomes and restore a pre-fix intermission save.
  for (const [port, victory] of [[three,true],[damagedThree,false]]) {
    let fast=run(run(start(port),{type:'speed'}),{type:'speed'});
    assert.equal(fast.speed,3);
    assert.equal(restore(fast).speed,3);
    for(let i=0;i<1440 && fast.phase==='battle';i++) fast=tick(fast);
    assert.equal(fast.idle.lastBattle.victory,victory);
    assert.equal(fast.speed,1);
    assert.equal(restore({...fast,speed:3}).speed,1);
    assert.equal(run(fast,{type:'speed'}).speed,1);
  }
  repairChecks(damaged);
  const replay=run(claim(cleared[2]),{type:'select-operation',wave:3});
  const repeat=complete(start(replay));
  assert.equal(repeat.idle.lastBattle.cash,26); assert.equal(repeat.idle.lastBattle.openingReceipt.firstClear,false);
  assert.equal(openingSchedule(start(initialGame())),undefined);
  assert.equal(three.openingOperations.cleared.length,2);
  console.log('PASS: genuine opening loan, purchase replacement, scheduled operations 1–3, escort, clean/failed quota, single payouts and damage, restore, wallet/bank/active-service repairs, repeat and legacy.');
}
module.exports={campaignSaves};
