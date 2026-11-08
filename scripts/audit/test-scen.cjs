/* SCEN acceptance probes (fix program) — run: node scripts/audit/test-scen.cjs
 *
 * 1) Composition: every campaign operation's spawn queue comes from its
 *    scenario data — air-defense ≥60% air, drone-wave ≥40% air, operation 3
 *    introduces air with NO submarine, operation 1 is light pirate fare,
 *    boss is always the final unit, siege operations spawn reversed units,
 *    and the war-room preview (waveComposition) equals the actual queue.
 * 2) Generator memory: 30 sequential endless runs — no repeated operation
 *    name (and none from the campaign blacklist), objectives rotate (never
 *    twice in a row outside the forced slots), every 5th run is the forced
 *    escort/rescue event, bodies/headlines vary with no back-to-back repeat.
 * 3) Generator gating: zones limited to unlocked islands; platform/port
 *    objectives excluded without a platform / a loading tanker.
 * 4) Condition weights: شب outweighs مه, drone outweighs storm (spec §۳),
 *    tier-1 never rolls drone/mining, tier-1 no-condition ≈ 45%.
 * 5) Diary: retry dedupe on pre-battle entries; day/zone/result recorded.
 * 6) Mechanics integration through the real reducer: startWave rolls the
 *    scenario context; fog −30% and night −20% range; dawn +15% speed for
 *    30s only; intercept line = defeat; escort ship sails, takes fire and
 *    its sinking = defeat; structure HP absorbs leaks and its destruction
 *    = defeat; air-defense leak threshold = defeat; enemy mines spawn on
 *    the trade lane, sink a merchant and are swept by a boat tower.
 * 7) Save integrity: mid-battle saves keep their context; a battle save
 *    WITHOUT a context downgrades to peace instead of crashing; a frozen
 *    battle state (mines + escort live) ticks without mutation.
 * 8) QA round-2 regressions: the generator is stable across processes /
 *    reloads (wave 30 identical, peeks register no phantom run, a battle
 *    start records exactly one run and a retry none); startWave records
 *    generated runs through the reducer; fog keeps its ×0.7 under a storm
 *    event and coinciding storms stay a single ×0.8; a merchant crossing
 *    a mine during the bulletin freeze still detonates it; hydrate
 *    re-applies the mine cap and objective-ship HP clamps; the news
 *    library carries ≥10 headline + body templates per type.
 */
const assert = require('node:assert/strict');

// In-memory localStorage so the news diary/history paths run under node.
const store = new Map();
global.window = { localStorage: {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
} };

const { load } = require('../load-game.cjs');
const G = load('src/lib/game.ts');
const N = load('src/lib/news.ts');
const M = load('src/lib/scenario-mechanics.ts');
const { initialGame, gameReducer, getRange, waveComposition, enemyPosition, positionAt, enemyMinePosition, objectiveShipPosition, distance, SLOTS, hydrateGame } = G;
const tick = (s, n = 1, dt = 0.125) => { for (let i = 0; i < n; i++) s = gameReducer(s, { type: 'tick', dt }); return s; };
function startAt(wave, mode = 'campaign') {
  const g = initialGame();
  g.wave = wave; g.mode = mode; g.phase = 'peace'; g.hearts = 20;
  return gameReducer(g, { type: 'start' });
}
const counts = queue => { const c = {}; for (const u of queue) c[u.kind] = (c[u.kind] ?? 0) + 1; return c; };

/* ---- 1) composition from scenario data, all 25 operations ---- */
{
  for (let stage = 1; stage <= 25; stage++) {
    const sc = N.scenarioForWave(stage, 'campaign');
    assert.equal(sc.authored, true, `stage ${stage} authored`);
    const queue = M.buildSpawnQueue(stage, sc);
    assert.equal(queue.length, M.waveTotal(stage), `stage ${stage} total = §۳ formula`);
    const c = counts(queue), nonBoss = queue.length - (stage % 5 === 0 ? 1 : 0);
    if (stage % 5 === 0) assert.equal(queue[queue.length - 1].kind, 'boss', `stage ${stage} boss last`);
    else assert.equal(c.boss ?? 0, 0, `stage ${stage} no boss`);
    const objective = M.objectiveTypeOf(sc.objective);
    if (objective === 'airdef') assert.ok((c.air ?? 0) / nonBoss >= 0.6, `stage ${stage} airdef ≥60% air (got ${c.air}/${nonBoss})`);
    if (sc.specialCondition === 'موج پهپاد') assert.ok((c.air ?? 0) / nonBoss >= 0.4, `stage ${stage} drone wave ≥40% air`);
    if (objective === 'siege') { const rev = queue.filter(u => u.rev).length; assert.ok(rev >= 1 && rev < queue.length, `stage ${stage} siege two-front (${rev} rev)`); }
    // preview == actual
    const preview = waveComposition(stage, sc);
    const pc = {}; for (const u of preview) pc[u.kind] = u.count;
    assert.deepEqual(pc, c, `stage ${stage} preview counts == queue counts`);
  }
  const q1 = counts(M.buildSpawnQueue(1, N.scenarioForWave(1, 'campaign')));
  assert.ok(Object.keys(q1).every(k => k === 'speed' || k === 'corvette'), 'op 1: pirates only (speed/corvette classes, nothing heavier)');
  const q3 = counts(M.buildSpawnQueue(3, N.scenarioForWave(3, 'campaign')));
  assert.ok((q3.air ?? 0) > 0 && !q3.sub && !q3.destroyer, 'op 3: first air threat is AIR (no sub, no destroyer)');
  console.log('1) composition ×25 ops: PASS (airdef ≥60%, drone ≥40%, op3 air-first, boss last, siege two-front, preview==queue)');
}

/* ---- 2) generator memory & rotation (sequential endless runs 1..30) ---- */
{
  // Generation itself is side-effect-free (group 8 proves it); a run enters
  // the memory when its battle starts — commitScenarioForWave is exactly
  // what startWave calls, so this loop models 30 real battle starts.
  const runs = [];
  for (let w = 1; w <= 30; w++) { runs.push(N.scenarioForWave(w, 'endless')); N.commitScenarioForWave(w, 'endless'); }
  const names = runs.map(r => r.operationName);
  assert.equal(new Set(names).size, 30, 'no operation name repeats inside the 30-run window');
  const campaignNames = new Set(load('src/data/scenarios.ts').CAMPAIGN_SCENARIOS.map(s => s.operationName));
  for (const n of names) assert.ok(!campaignNames.has(n), `generated name "${n}" not a campaign name`);
  for (let w = 2; w <= 30; w++) if (w % 5 !== 0) assert.notEqual(runs[w - 1].objective, runs[w - 2].objective, `run ${w}: objective rotates`);
  assert.equal(runs[4].objective, 'اسکورت کاروان', 'run 5 = forced escort');
  assert.equal(runs[9].objective, 'نجات کشتی آسیب‌دیده', 'run 10 = forced rescue');
  assert.equal(runs[14].objective, 'اسکورت کاروان', 'run 15 = forced escort again');
  const bodies = runs.map(r => r.newsBefore.body), headlines = runs.map(r => r.newsBefore.headline);
  assert.ok(new Set(bodies).size >= 6, `endless bodies vary (${new Set(bodies).size} distinct in 20+ runs)`);
  assert.ok(new Set(headlines).size >= 6, 'endless headlines vary');
  for (let i = 1; i < bodies.length; i++) assert.notEqual(bodies[i], bodies[i - 1], 'no back-to-back body repeat');
  const again = N.scenarioForWave(17, 'endless');
  assert.equal(again.operationName, runs[16].operationName, 'same wave+mode → same scenario (memoized)');
  console.log('2) generator memory: PASS (30 unique names, rotation, forced 5th-run events, varied non-repeating news)');
}

/* ---- 3) generator gating by player context ---- */
{
  const ctx = { zones: ['بندرعباس', 'کانال اصلی تنگه'], hasPlatform: false, tankerLoading: false };
  for (let w = 31; w <= 45; w++) {
    const sc = N.scenarioForWave(w, 'endless', ctx);
    assert.ok(ctx.zones.includes(sc.zone), `run ${w}: zone ${sc.zone} is unlocked`);
    assert.notEqual(sc.objective, 'دفاع از سکو', 'no platform objective without a platform');
    assert.notEqual(sc.objective, 'دفاع از بندر هنگام بارگیری', 'no port objective without a loading tanker');
  }
  const g0 = initialGame();
  const c0 = M.scenarioContextFor(g0);
  assert.ok(c0.zones.includes('بندرعباس') && c0.zones.includes('قشم') && c0.zones.includes('کانال اصلی تنگه'), 'start zones present');
  assert.ok(!c0.zones.includes('خارک') && c0.hasPlatform === false, 'locked island zone excluded, no platform yet');
  g0.idle.platforms = [2];
  const c1 = M.scenarioContextFor(g0);
  assert.ok(c1.hasPlatform === true && c1.zones.includes('سکوهای نفتی خلیج فارس'), 'platform unlocks the fields zone + objective gate');
  console.log('3) generator gating: PASS (zones/objectives follow islands, platforms, tanker state)');
}

/* ---- 4) condition weights (spec §۳) ---- */
{
  const tally = {};
  for (let salt = 100; salt < 500; salt++) { const sc = N.generatedScenario(3, salt); tally[sc.specialCondition ?? 'none'] = (tally[sc.specialCondition ?? 'none'] ?? 0) + 1; }
  assert.ok(!tally['موج پهپاد'] && !tally['مین‌گذاری دشمن'], 'tier 1 never rolls drone/mining conditions');
  const noneShare = (tally.none ?? 0) / 400;
  assert.ok(noneShare > 0.3 && noneShare < 0.6, `tier-1 no-condition ≈45% (got ${noneShare.toFixed(2)})`);
  const t2 = {};
  for (let salt = 100; salt < 700; salt++) { const sc = N.generatedScenario(30, salt); const c = sc.specialCondition ?? 'none'; t2[c] = (t2[c] ?? 0) + 1; }
  assert.ok((t2['شب'] ?? 0) > (t2['مه'] ?? 0), `شب (w15) outweighs مه (w10): ${t2['شب']} vs ${t2['مه']}`);
  assert.ok((t2['موج پهپاد'] ?? 0) > (t2['طوفان'] ?? 0), `موج پهپاد (w15) outweighs طوفان (w10): ${t2['موج پهپاد']} vs ${t2['طوفان']}`);
  console.log('4) condition weights: PASS (spec weights, tier gates, none-probability)');
}

/* ---- 5) diary records + retry dedupe ---- */
{
  let d = N.appendDiary({ at: 1700000000000, wave: 7, kind: 'before', headline: 'تیتر آزمون', body: 'بدنه', zone: 'قشم' });
  assert.equal(d.length, 1);
  assert.equal(typeof d[0].day, 'number', 'day recorded');
  assert.equal(d[0].result, 'before', 'result recorded');
  assert.equal(d[0].zone, 'قشم', 'zone recorded');
  d = N.appendDiary({ at: 1700000001000, wave: 7, kind: 'before', headline: 'تیتر آزمون', body: 'بدنه', zone: 'قشم' });
  assert.equal(d.length, 1, 'retry does NOT duplicate the pre-battle entry');
  d = N.appendDiary({ at: 1700003600000, wave: 7, kind: 'victory', headline: 'پیروزی آزمون', body: 'بدنه ۲', zone: 'قشم' });
  assert.equal(d.length, 2, 'victory entry appended');
  assert.equal(d[1].result, 'victory');
  console.log('5) diary: PASS (day/zone/result fields, pre-battle retry dedupe)');
}

/* ---- 6) mechanics through the real reducer ---- */
{
  // startWave rolls the scenario into the battle context
  let s = startAt(3);
  assert.equal(s.battle.condition, 'حمله سحرگاه', 'op 3 condition rolled');
  assert.equal(s.battle.objective, 'airdef', 'op 3 objective rolled');
  assert.ok(s.battle.airTotal >= Math.ceil(0.6 * (s.battle.queue.length)), 'op 3 airTotal ≥60%');
  assert.equal(s.spawnRemaining, s.battle.queue.length, 'spawn count = queue length');

  // fog −30% / night −20% effective range
  const tower = { slot: 0, kind: 'cannon', tier: 1, branch: null, priority: 'first' };
  const g0 = initialGame(); const r0 = getRange(g0, tower);
  const fog = startAt(2); assert.equal(fog.battle.condition, 'مه');
  assert.ok(Math.abs(getRange(fog, tower) - r0 * 0.7) < 1e-6, `fog range ×0.7 (${getRange(fog, tower)} vs ${r0 * 0.7})`);
  const night = startAt(6); assert.equal(night.battle.condition, 'شب');
  assert.ok(Math.abs(getRange(night, tower) - r0 * 0.8) < 1e-6, 'night range ×0.8');

  // dawn: +15% speed for the first 30 battle-seconds only
  let d = startAt(3); d = tick(d, 1);
  const e0 = d.enemies[0]; const vel = { speed: 0.033, corvette: 0.024, air: 0.045, sub: 0.024, destroyer: 0.018, boss: 0.011 }[e0.kind];
  const p1 = d.enemies.find(e => e.id === e0.id).progress;
  d = tick(d, 8); const p2 = d.enemies.find(e => e.id === e0.id).progress;
  const ratio1 = (p2 - p1) / vel;
  assert.ok(ratio1 > 1.1 && ratio1 < 1.2, `dawn window speed ×1.15 (got ×${ratio1.toFixed(3)})`);
  d.battle.elapsed = 31;
  const p3 = d.enemies.find(e => e.id === e0.id).progress;
  d = tick(d, 8); const p4 = d.enemies.find(e => e.id === e0.id).progress;
  const ratio2 = (p4 - p3) / vel;
  assert.ok(ratio2 > 0.95 && ratio2 < 1.05, `after 30s speed back to ×1 (got ×${ratio2.toFixed(3)})`);

  // intercept: crossing the mid-channel line loses the operation
  let i4 = startAt(4); assert.equal(i4.battle.objective, 'intercept');
  i4 = tick(i4, 1); i4.enemies[0].progress = 0.499;
  i4 = tick(i4, 1);
  assert.equal(i4.phase, 'defeat', 'intercept line crossed → defeat');
  assert.equal(i4.idle.lastBattle.victory, false);

  // escort: the caravan sails the trade lane, and its sinking = defeat
  let e2 = startAt(2);
  assert.ok(e2.battle.escort && e2.battle.escort.maxHp === 350, 'op 2 escort ship with HP');
  e2.battle.escort.progress = 0.999; e2 = tick(e2, 4);
  assert.equal(e2.battle.escort, null, 'caravan arrived → objective ship leaves');
  assert.equal(e2.phase, 'battle', 'battle continues after the caravan is safe');
  let e2b = startAt(2); e2b = tick(e2b, 1);
  e2b.battle.escort.progress = 0.9; // deep in the channel, where the lanes converge
  const shipPos = objectiveShipPosition(e2b.battle.escort);
  let near = 0; for (let p = 0; p <= 1; p += 0.002) if (distance(positionAt(p), shipPos) <= 8) { near = p; break; }
  assert.ok(near > 0, 'found an enemy-lane point near the caravan');
  e2b.enemies[0].progress = near; e2b.battle.escort.hp = 3;
  e2b = tick(e2b, 8);
  assert.equal(e2b.phase, 'defeat', 'caravan sunk by close enemy fire → defeat despite full hearts');
  assert.equal(e2b.hearts, 20, 'hearts untouched — the OBJECTIVE was lost');

  // structure: leaks pound the platform; its destruction = defeat
  let s10 = startAt(10);
  assert.equal(s10.battle.objective, 'structure');
  assert.equal(s10.battle.structureMaxHp, 1100, 'op 10 structure HP = 500 + 60×wave');
  s10 = tick(s10, 1);
  const first = s10.enemies[0]; const leakDmg = first.kind === 'boss' ? 20 : first.kind === 'destroyer' ? 3 : 1;
  first.progress = 0.9995; s10 = tick(s10, 1);
  assert.equal(s10.battle.structureHp, 1100 - leakDmg * 30, `leak pounds structure (${leakDmg}×30)`);
  assert.equal(s10.hearts, 20 - leakDmg, 'hearts still charged as usual');
  s10.battle.structureHp = 20;
  s10 = tick(s10, 12);
  assert.ok(s10.enemies.length >= 1, 'next unit spawned');
  s10.enemies[0].progress = 0.9995; s10 = tick(s10, 1);
  assert.equal(s10.phase, 'defeat', 'structure destroyed → defeat');

  // air defense: leak threshold (20% of the air arm, min 1)
  let a8 = startAt(8);
  const allowance = Math.max(1, Math.floor(a8.battle.airTotal * 0.2));
  a8.battle.airLeaked = allowance;
  a8 = tick(a8, 4);
  assert.equal(a8.phase, 'battle', 'at the threshold the operation still stands');
  a8.enemies[0].kind = 'air'; a8.enemies[0].progress = 0.9995;
  a8 = tick(a8, 1);
  assert.equal(a8.phase, 'defeat', 'one more air leak past the threshold → defeat');

  // enemy mines: spawn on the trade lane, sink traffic, swept by boat towers
  let m19 = startAt(19);
  assert.equal(m19.battle.condition, 'مین‌گذاری دشمن');
  let maxMines = 0;
  for (let i = 0; i < 160; i++) { m19 = tick(m19, 1); maxMines = Math.max(maxMines, m19.battle?.mines.length ?? 0); if ((m19.battle?.mines.length ?? 0) >= 1 && i > 60) break; }
  assert.ok(maxMines >= 1 && m19.battle.mines.length >= 1, 'enemy mines were laid during the battle');
  for (const m of m19.battle.mines) assert.ok(m.progress >= 0.15 && m.progress <= 0.85, 'mine sits on the trade lane span');
  // a merchant blundering into a mine sinks, and the mine is spent
  const mine = m19.battle.mines[0];
  const victim = m19.merchants[0];
  victim.progress = mine.progress - 0.005;
  const minesBefore = m19.battle.mines.length, merchantsBefore = m19.merchants.length;
  m19 = tick(m19, 2);
  assert.ok(!m19.battle.mines.some(m => m.id === mine.id), 'mine detonated on the merchant');
  assert.ok(m19.merchants.length < merchantsBefore || !m19.merchants.some(x => x.id === victim.id), 'merchant sunk by the mine');
  assert.ok(m19.battle.mines.length <= minesBefore, 'mine count did not grow from the detonation');
  // a boat tower sweeps a mine inside its range
  let swept = startAt(19);
  swept.cash = 100000; swept.steel = 5000;
  swept = tick(swept, 40);
  assert.ok(swept.battle.mines.length >= 1, 'mine present for the sweep test');
  let placed = null;
  for (const slot of SLOTS.filter(x => ['main', 'qeshm'].includes(x.island))) {
    for (let p = 0.05; p < 0.95; p += 0.01) {
      const pos = enemyMinePosition({ id: 0, progress: p });
      if (distance(slot, pos) <= 14) { placed = { slot: slot.id, progress: p }; break; }
    }
    if (placed) break;
  }
  assert.ok(placed, 'found a boat slot covering a trade-lane point');
  swept.battle.mines[0].progress = placed.progress;
  const sweptId = swept.battle.mines[0].id;
  swept = gameReducer(swept, { type: 'build-tower', slot: placed.slot, kind: 'boat' });
  assert.ok(swept.towers.some(t => t.slot === placed.slot && t.kind === 'boat'), 'boat tower built');
  swept = tick(swept, 24);
  assert.ok(!swept.battle.mines.some(m => m.id === sweptId), 'boat tower swept the mine');
  console.log('6) mechanics integration: PASS (ctx roll, fog/night range, dawn window, intercept, escort, structure, airdef threshold, mines + sweep)');
}

/* ---- 7) save integrity + frozen-state ticking ---- */
{
  const live = startAt(2);
  const revived = hydrateGame(JSON.parse(JSON.stringify(live)));
  assert.ok(revived, 'mid-battle save hydrates');
  assert.equal(revived.game.battle.condition, 'مه', 'battle context survives the save round-trip');
  assert.equal(revived.game.battle.queue.length, live.battle.queue.length, 'spawn queue survives');

  const stripped = JSON.parse(JSON.stringify(live)); stripped.battle = null;
  const downgraded = hydrateGame(stripped);
  assert.ok(downgraded, 'context-less battle save still hydrates');
  assert.equal(downgraded.game.phase, 'peace', 'context-less battle downgrades to peace (wave restarts cleanly)');
  const corrupt = JSON.parse(JSON.stringify(live)); corrupt.battle = { queue: 'not-an-array' };
  assert.equal(hydrateGame(corrupt).game.battle, null, 'corrupt context dropped');

  const deepFreeze = (o, seen = new Set()) => { if (o && typeof o === 'object' && !seen.has(o)) { seen.add(o); for (const v of Object.values(o)) deepFreeze(v, seen); Object.freeze(o); } return o; };
  let fz = startAt(19); fz = tick(fz, 40); // mines live
  const snapshot = JSON.stringify(fz);
  deepFreeze(fz);
  const after = tick(fz, 30);
  assert.equal(JSON.stringify(fz), snapshot, 'frozen input untouched by 30 ticks');
  assert.ok(after.battle.elapsed > 0, 'ticked copy advanced');
  let fz2 = startAt(2); fz2 = tick(fz2, 10); // escort live
  deepFreeze(fz2);
  tick(fz2, 30);
  console.log('7) save integrity: PASS (context round-trip, safe downgrade, frozen tick with mines/escort)');
}

/* ---- 8) QA round-2 regressions ---- */
{
  // (a) Cross-process: fresh processes sharing one storage file = reloads.
  const { execFileSync } = require('node:child_process');
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const storeFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scen-reload-')), 'store.json');
  const probe = args => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'probe-scen-reload.cjs'), storeFile, ...args], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }).trim());
  const p1 = probe(['30']), p2 = probe(['30']), p3 = probe(['30']);
  assert.deepEqual([p2.name, p2.objective, p2.zone, p2.headline], [p1.name, p1.objective, p1.zone, p1.headline], 'wave 30 identical after a reload');
  assert.deepEqual([p3.name, p3.objective, p3.zone, p3.headline], [p1.name, p1.objective, p1.zone, p1.headline], 'wave 30 identical after a second reload');
  assert.equal(p3.runs, 0, 'previews/reloads never bump the run counter');
  assert.equal(p3.histLen, 0, 'previews/reloads never record history');
  const c1 = probe(['30', 'commit']);
  assert.equal(c1.runs, 1, 'battle start records exactly one run');
  assert.equal(c1.histLen, 1, 'battle start records one history entry');
  assert.equal(c1.name, p1.name, 'the committed scenario IS the previewed one');
  const c2 = probe(['30', 'commit']);
  assert.equal(c2.runs, 1, 'a retry of the same wave records no second run');
  assert.equal(probe(['30']).name, p1.name, 'post-commit peek still returns the same scenario');

  // (b) Through the real reducer: peeking records nothing, startWave does.
  // (The history window is capped at 30 entries, so this asserts on the
  // window's CONTENT — its newest record — not its length.)
  const lastBefore = N.loadScenarioHistory().at(-1);
  N.scenarioForWave(46, 'endless');
  assert.deepEqual(N.loadScenarioHistory().at(-1), lastBefore, 'in-process peek records nothing');
  const started = startAt(46, 'endless');
  assert.equal(started.phase, 'battle', 'endless wave 46 started');
  const lastAfter = N.loadScenarioHistory().at(-1);
  assert.notDeepEqual(lastAfter, lastBefore, 'startWave recorded a new run');
  assert.equal(lastAfter.name, N.scenarioForWave(46, 'endless').operationName, 'recorded run == the scenario the battle uses');

  // (c) Range factors: fog survives a storm event; storms never stack.
  const tower = { slot: 0, kind: 'cannon', tier: 1, branch: null, priority: 'first' };
  const r0 = getRange(initialGame(), tower);
  const fogStorm = startAt(2);
  assert.equal(fogStorm.battle.condition, 'مه');
  fogStorm.event = 'storm';
  assert.ok(Math.abs(getRange(fogStorm, tower) - r0 * 0.7) < 1e-6, `fog keeps ×0.7 under a storm event (got ×${(getRange(fogStorm, tower) / r0).toFixed(3)})`);
  const stormStorm = startAt(2);
  stormStorm.battle.condition = 'طوفان'; stormStorm.event = 'storm';
  assert.ok(Math.abs(getRange(stormStorm, tower) - r0 * 0.8) < 1e-6, 'scenario storm + storm event = a single ×0.8');
  const nightStorm = startAt(2);
  nightStorm.battle.condition = 'شب'; nightStorm.event = 'storm';
  assert.ok(Math.abs(getRange(nightStorm, tower) - r0 * 0.8) < 1e-6, 'night + storm event = ×0.8');

  // (d) Mine vs the bulletin freeze: merchants keep sailing while the
  // battle layer is frozen — the mine must still go off (QA exploit).
  let mz = startAt(19);
  for (let i = 0; i < 220 && !(mz.battle?.mines.length >= 1); i++) mz = tick(mz, 1);
  assert.ok(mz.battle.mines.length >= 1, 'mine laid for the freeze probe');
  const mineId = mz.battle.mines[0].id, mineAt = mz.battle.mines[0].progress;
  const victim = mz.merchants[0];
  victim.progress = mineAt - 0.03; // outside the ±0.02 window — for now
  mz.merchants = [victim]; // isolate: no other ship may reach the mine first
  const sec0 = mz.security, elapsed0 = mz.battle.elapsed;
  for (let i = 0; i < 30; i++) mz = gameReducer(mz, { type: 'tick', dt: 0.125, battlePaused: true });
  assert.equal(mz.battle.elapsed, elapsed0, 'battle layer really was frozen during the probe');
  assert.ok(!mz.battle.mines.some(m => m.id === mineId), 'mine detonated during the freeze');
  assert.ok(!mz.merchants.some(x => x.id === victim.id), 'merchant sunk by the mine during the freeze');
  assert.equal(mz.security, sec0 - 2, 'security penalty applied exactly once');

  // (e) Hydrate re-applies the caps a tampered save tries to break.
  const raw = JSON.parse(JSON.stringify(startAt(2)));
  raw.battle.escort.hp = 99999;
  raw.battle.structureHp = 5000; // op 2 has no structure: maxHp 0 clamps it away
  raw.battle.mines = Array.from({ length: 50 }, (_, i) => ({ id: 9000 + i, progress: i / 50 }));
  const clamped = hydrateGame(raw);
  assert.ok(clamped, 'tampered save still hydrates');
  assert.equal(clamped.game.battle.mines.length, 6, 'minefield re-capped at 6 on load');
  assert.equal(clamped.game.battle.escort.hp, clamped.game.battle.escort.maxHp, 'escort HP clamped to maxHp on load');
  assert.equal(clamped.game.battle.structureHp, 0, 'structure HP clamped to its maxHp on load');

  // (f) News library size (checklist §۴٫۰: ≥10 templates per type).
  for (const [k, v] of Object.entries(N.NEWS_TEMPLATE_COUNTS)) assert.ok(v >= 10, `news library ${k} has ≥10 templates (got ${v})`);
  console.log('8) QA round-2 regressions: PASS (cross-process generator stability, commit-at-start, fog×storm, mine freeze, hydrate clamps, library ≥10)');
}

console.log('\nALL SCEN PROBES PASSED');
