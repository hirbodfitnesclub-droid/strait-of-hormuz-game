const assert = require('node:assert/strict');
const {load} = require('./load-game.cjs');
const {openingFocus, emptyHintMemory, visitHint, dismissHint, visibleHint, ForegroundSeconds} = load('src/lib/opening-attention.ts');
const {results} = require('./fixtures/reopening/attention_qa.json');
const guide = require('../src/data/reopening/guide.json');

const base = {
  activeSeconds:120, manualWaveAt:null, firstTollAt:12, cash:1200, bank:260, bankCapacity:1600,
  upgradeCost:90, stalled:false, mastery:false, collectedFirstToll:true, battle:false, abilityReady:false,
};
const poorStall = {stalled:true, cash:20};
const scenes = {
  normal_cash_points_to_tank: {stalled:true},
  cash_in_bank_routes_to_bank: poorStall,
  post_claim_routes_to_tank: {stalled:true, cash:280, bank:0},
  fractional_treasury_cannot_fund_purchase: {...poorStall, bank:69.99},
  wait_before_first_wave: {...poorStall, bank:1, activeSeconds:75},
  enough_anyway_unforced_purchase: {},
  insolvent_during_battle: {...poorStall, bank:0, battle:true, abilityReady:true},
  no_ability_no_pulses: {battle:true},
  repeat_stall_static_controls: {stalled:true, mastery:true},
  eligible_cash_first: {activeSeconds:12, collectedFirstToll:false},
  wave_waits_for_true_first_receipt: {firstTollAt:null},
  exact_threshold: {bank:960},
  below_threshold: {bank:959},
  no_treasury_hint_on_opening_credit_before_first_toll: {activeSeconds:0, firstTollAt:null, collectedFirstToll:false},
  first_wave_hint_not_repeated_after_first_manual_start: {activeSeconds:180, manualWaveAt:120},
};
for (const [name, scene] of Object.entries(scenes)) {
  assert.equal(openingFocus({...base, ...scene}), results[name], name);
}
const first = visitHint(emptyHintMemory(), 'first_tank', 'tank', 70);
assert.equal(visibleHint(first, 70), results.focus_started[1]);
assert.equal(visibleHint(first, 73), results.timeout_at_3);
assert.equal(visibleHint(first, 81), results.cycle_reappears_with_same_reason[1]);
assert.equal(visibleHint(visitHint(first,'first_tank','tank',74),74), results.opening_panel_does_not_reset_quiet_cadence);
const quiet = dismissHint(first);
assert.equal(visibleHint(visitHint(quiet,"first_tank","tank",69.95),69.95),null,"restoring a slightly earlier autosave retains this episode’s dismissal");
assert.equal(visibleHint(quiet,81), results.dismiss_current_hint);
assert.equal(visibleHint(visitHint(quiet,'first_tank','tank',95),95), results.dismissed_hint_stays_quiet_after_resume);
assert.equal(visibleHint(visitHint(quiet,'second_tank','tank',96),96), results.new_stall_episode_permits_new_hint[1]);
assert.equal(visibleHint(visitHint(first, 'first_tank', 'treasury_to_tank', 76),76),'treasury_to_tank');
assert.equal(visibleHint(visitHint(first, 'wave-1', 'battle_ability', 87),87), results.wave_preempts_current_focus[1]);
assert.equal(visibleHint(visitHint(first, 'harbor', null, 82),82), results.stale_pulse_removed);
assert.equal(new Set(guide.sequence.map(step => step.terminal_metric)).size, results.guide_distinct_terminal_facts);
assert.equal(guide.sequence.every(step => step.copy_fa.split(/\s+/).length < 12), results.guide_lines_under_twelve_words);

const clock = new ForegroundSeconds();
clock.setActive(false, 0);
assert.equal(clock.take(3000),0,'loading does not count');
clock.setActive(true, 4000);
assert.equal(clock.take(11000),7,'foreground decision time survives a long rendering frame');
clock.setActive(false, 11500);
assert.equal(clock.take(511500),0.5,'background contributes no time');
clock.setActive(true, 511500);
assert.equal(clock.take(512500),1,'resume cannot replay time spent suspended');
// The UI flushes the pending foreground interval before dispatching a human action.
const {freshPortGame, gameReducer} = load('src/lib/game.ts');
for (const clickTime of [180, 180.1]) {
  const meter = new ForegroundSeconds();
  meter.setActive(true, 0);
  let port = freshPortGame();
  const flush = now => { port = gameReducer(port,{type:'advance',steps:0,battlePaused:false,openingElapsed:meter.take(now * 1000)}); };
  flush(179.975);
  flush(clickTime);
  port = gameReducer(port,{type:'start',source:'player'});
  assert.ok(Math.abs(port.opening.manualWaveAt - clickTime) < 1e-8, `manual tap at ${clickTime}`);
  assert.equal(port.opening.manualWaveAt <= 180, clickTime === 180, '180 inclusive, 180.1 excluded');
}
console.log('PASS opening attention priorities, fractional wallet gates, focus cadence, episode dismissal, guide data and foreground clock');
