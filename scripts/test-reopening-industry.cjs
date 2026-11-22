const assert = require("node:assert/strict");
const { load } = require("./load-game.cjs");
const fixture = require("./fixtures/reopening/opening-validation.json");
const { freshPortGame, initialGame, gameReducer: act, hydrateGame, getStats, buildingUpgradeQuote } = load("src/lib/game.ts");
const { openingNextTollIn } = load("src/lib/opening-industry.ts");
const now = 1800000000000;
Date.now = () => now;
const tick = game => act(game, { type: "tick", dt: 1 });
const elapsed = (s, seconds, steps = 0) => act(s, {type:"advance", battlePaused:true, steps, openingElapsed:seconds});
const buy = game => act(game, {type:"upgrade-building", id:"tank", expectedLevel:1, guided:true});
const manual = game => act(game, {type:"start", source:"player"});
const claim = game => act(game, {type:"collect-income"});
const reload = game => hydrateGame(JSON.parse(JSON.stringify(game))).game;
function observed(s) {
  const tanker=s.idle.port.tanker;
  return {
    active_s:s.opening.activeSeconds, produced:s.opening.generated, stored:s.oil,
    cargo_total:tanker?.load ?? 0, tanker:({loading:"loading",approach:"arrival",depart:"departure"})[tanker?.stage] ?? "gap",
    bank:s.idle.bank
  };
}
function profile() { return freshPortGame(); }
function checkpoint(second) {
  let s=profile();
  for(let t=1; t<=second; t++) {
    s=tick(s);
    if(t===12) s=claim(s);
  }
  return s;
}
for (const control of [fixture.default, ...fixture.controls]) {
  let s=profile();
  s.oil=control.initial_oil;
  s.idle.port.tanker.load=control.initial_export_cargo;
  for(let t=1; t<=183; t++) {
    s=tick(s);
    if(t===12 && control.claim_t12) s=claim(s);
    const expected=control.samples.find(row=>row.active_s===t);
    if(expected) assert.deepEqual(observed(s),expected);
  }
  assert.equal(s.opening.events.find(e=>e.kind==="stall")?.at ?? s.opening.stallStartedAt,control.first_no_output_s);
  assert.equal(s.opening.events.find(e=>e.kind==="natural_recovery")?.at ?? null,control.natural_resume_s);
  assert.equal(s.opening.mastery,false);
}
const start=profile();
assert.deepEqual([start.oil,getStats(start).oilCapacity,start.idle.port.tanker.load,start.opening.ledger.exportIncome],[400,500,625,0]);
assert.deepEqual([start.cash,start.idle.bank,getStats(start).bankCapacity,buildingUpgradeQuote(start,"tank",1).cost],[1200,260,1600,90]);
assert.equal(openingNextTollIn(start),12);
const stalled=checkpoint(70);
assert.deepEqual([stalled.opening.ledger.exportedOil,stalled.opening.ledger.exportIncome],[375,93.75]);
assert.equal(stalled.opening.stallEpisode,1);
assert.equal(stalled.opening.stallStartedAt,70);
const inspected=act(act(stalled,{type:"opening-inspect-tank"}),{type:"opening-inspect-tank"});
assert.equal(inspected.opening.events.filter(e=>e.kind==="inspect_tank").length,1);
const order=buy(checkpoint(90));
assert.equal(order.cash,1398);
assert.equal(buy(order).cash,1398);
assert.equal(order.opening.mastery,false);
const restored=tick(reload(order));
assert.equal(restored.opening.generated,fixture.action_at_90.industrial_output_after);
assert.deepEqual(restored.opening.recoveryReceipt,{id:`opening:${restored.opening.seed}:tank:1`,episode:1,paidAt:90,positiveAt:91,guided:true,helpRequestedAt:null});
assert.deepEqual(reload(restored).opening.recoveryReceipt,restored.opening.recoveryReceipt);
assert.equal(restored.opening.mastery,true);
const coincident=tick(buy(checkpoint(137)));
assert.equal(coincident.buildings.tank,2);
assert.equal(coincident.opening.generated,9.24);
assert.equal(coincident.opening.mastery,false);
assert.equal(coincident.opening.recoveryReceipt,null);
const escrow=structuredClone(stalled);
escrow.cash=fixture.escrow_fixture.starting_cash;
escrow.idle.bank=fixture.escrow_fixture.starting_bank;
assert.equal(buy(escrow).buildings.tank,1);
const paid=tick(buy(claim(escrow)));
assert.deepEqual([paid.cash,paid.idle.bank,paid.buildings.tank,paid.opening.mastery],[190,0,2,true]);
const poor=structuredClone(stalled);
poor.cash=0;
poor.idle.bank=0;
assert.equal(buildingUpgradeQuote(poor,"tank").affordable,false);
assert.equal(manual(elapsed(poor,49)).phase,"peace");
const available=elapsed(poor,50);
assert.equal(available.opening.activeSeconds,fixture.underafforded_fixture.wave_offer_at_s);
assert.equal(available.phase,"peace");
assert.equal(act(available,{type:"start"}).phase,"peace");
assert.equal(manual(available).phase,"battle");
assert.equal(manual(available).opening.manualWaveAt,120);
for(const t of [11,69,137]){
  const before=checkpoint(t);
  const saved=reload(before);
  assert.deepEqual(observed(tick(saved)),observed(tick(before)));
  assert.deepEqual(tick(saved).opening.ledger,tick(before).opening.ledger);
}
const inset=elapsed(stalled,.75);
const after=elapsed(reload(inset),.25);
assert.equal(after.opening.activeSeconds,71);
assert.equal(after.opening.remainder,0);
assert.deepEqual(observed(elapsed(stalled,0,4)),observed(stalled));
assert.deepEqual(observed(elapsed(stalled,12.5)),observed(elapsed(stalled,12.5,4)));
const limit=elapsed(start,180);
const onEdge=manual(limit);
assert.equal(onEdge.opening.events.at(-1).kind,"wave_manual");
assert.equal(onEdge.opening.events.at(-1).at,180);
const pastEdge=manual(elapsed(limit,.1));
assert.equal(pastEdge.opening.manualWaveAt,180.1);
assert.equal(reload(pastEdge).opening.manualWaveAt,180.1);
assert.equal(pastEdge.opening.events.some(e=>e.kind==="wave_manual"),false);
assert.equal(act(elapsed(limit,.1),{type:"opening-help"}).opening.helpRequestedAt,180.1);
const legacy=initialGame();
legacy.oil=300;
assert.equal(reload(legacy).opening,undefined);
assert.equal(reload(legacy).oil,300);
// A real absence uses only industrial quanta. It must not sign online receipts, advance the
// observation clock, finish an active-time service order, or settle twice when loaded again.
const away=checkpoint(11);
away.lastSavedAt=now-300000;
away.openingOperations={lastSettled:1,firstTerminal:[],cleared:[],dockDamage:1,damageAttempt:1,serviceDue:13};
const returned=reload(away);
assert.equal(returned.opening.activeSeconds,11);
assert.equal(returned.opening.firstTollAt,null);
assert.equal(returned.openingOperations.serviceDue,13);
assert.equal(returned.openingOperations.dockDamage,1);
assert.notEqual(returned.opening.ledger.exportedOil,away.opening.ledger.exportedOil);
assert.deepEqual(observed(reload(returned)),observed(returned));
assert.equal(elapsed(returned,2).openingOperations.dockDamage,0);
away.openingOperations.dockDamage="invalid";
const sanitized=reload(away);
assert.equal(sanitized.openingOperations.dockDamage,0);
assert.equal(sanitized.openingOperations.serviceDue,null);
assert.ok(Number.isFinite(sanitized.idle.bank));
assert.ok(sanitized.opening.ledger.exportedOil>away.opening.ledger.exportedOil);
console.log("Opening industry PASS: 40 oracle checkpoints, ledgers, natural/paid/poor recovery, voluntary wave, fractional boundary, offline replay, save migration and pending repair");
