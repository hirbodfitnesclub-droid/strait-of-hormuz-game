/* ECO acceptance probes (fix program, wave 1) — run: node scripts/audit/test-economy.cjs
 *
 * Numeric rules delivered by team ECO (fix-program ECO spec + rulings
 * R5/R6/R7/R9/R10/R11):
 *  1) Oil valve α drives the REAL tanker loading flow (PRD §3); getStats
 *     exposes realExportRate (0 with no berthed tanker) and the theoretical
 *     dollarRate no longer feeds bank capacity or offline income — both use
 *     the realized export rate (lifetime exported $ / game time, floored by
 *     the currently-loading real rate for capacity).
 *  2) Refinery burns no oil while the fuel tank is full.
 *  3) Building upgrade cost applies 1.15^(current level) — the first build
 *     costs exactly the PRD base cost (refinery 300, not 261).
 *  4) Prestige (R7): planted towers reset, research kept, harbor bank does
 *     NOT refill to the 260 new-game gift; offline timers (contract/boost)
 *     advance even when the offline cash reward is 0; hero power is in the
 *     R_Def numerator (no flat +30).
 *  5) Early wave call (R10): exactly one +25% — on the wave-end reward;
 *     per-kill bounty carries no early multiplier.
 *  6) Contraband (R5): the optical outpost building reveals/inspects;
 *     smart-customs research raises the inspection reward.
 *  7) VIP (R6): a real golden supertanker on the trade lane with HP;
 *     pirates engage it; success pays the old reward, destruction fines.
 *  8) Micro-fixes: chest second card = next family in the cycle; pirate
 *     bounty routes to the harbor bank and never touches the battle kill
 *     counter; event type comes from an event counter, not elapsed time;
 *     oil-tank capacity has no step-doubling; the "new island" mission
 *     text/target agree; offshore platforms take the grid multiplier and
 *     require their field's island unlocked; hero type swap is locked
 *     during battle (R9 guard in the actions).
 *  9) Regression probe: 400 peace ticks on a fixed economy seed — digest
 *     printed for before/after comparison (only ECO-intended flows may
 *     move: α-capped exports and their downstream bank/lifetime numbers).
 */
const assert = require('node:assert/strict');
const { load } = require('../load-game.cjs');
const G = load('src/lib/game.ts');
const P = load('src/lib/progression.ts');
const { initialGame, gameReducer, getStats, upgradeCost, getOfflineReward, hydrateGame, heroPower, vipPosition } = G;

const tick = (s, dt = 0.125, n = 1) => { let g = s; for (let i = 0; i < n; i++) g = gameReducer(g, { type: 'tick', dt }); return g; };
const near = (a, b, eps = 0.51) => Math.abs(a - b) <= eps;

/** Economy-rich peace state used by several probes. */
function ecoBase() {
  const g = initialGame();
  Object.assign(g, { cash: 5000, oil: 800, fuel: 200, steel: 150, ammo: 300, oilSplit: 40 });
  Object.assign(g.buildings, { oil: 3, tank: 2, dock: 2, refinery: 1, steel: 1, arms: 1, power: 2, water: 1, city: 1 });
  return g;
}

// — 3) Upgrade cost: exponent on the destination step (PRD §3.3 base costs) —
assert.equal(upgradeCost('refinery', 0), 300, 'first refinery build = base cost 300');
assert.equal(upgradeCost('oil', 0), 100);
assert.equal(upgradeCost('arms', 0), 1000);
assert.equal(upgradeCost('refinery', 1), Math.ceil(300 * 1.15), 'second step = 300×1.15');
assert.equal(upgradeCost('oil', 9), Math.ceil(100 * Math.pow(1.15, 9)));

// — 8d) Oil-tank capacity: level × 500, no 2^floor(L/10) step-doubling —
{
  const g = ecoBase(); g.buildings.tank = 10;
  assert.equal(getStats(g).oilCapacity, 5000, 'tank L10 capacity = 5000 (not doubled)');
  g.research.push('tanktech');
  assert.equal(getStats(g).oilCapacity, 6000, 'tanktech ×1.2 still applies');
}

// — 1) α on the real flow + realExportRate —
{
  // No tanker berthed: real export rate is exactly 0, theoretical is not.
  const g = ecoBase(); g.idle.port.tanker = null; g.idle.port.nextIn = 9999;
  const st = getStats(g);
  assert.ok(st.dollarRate > 0, 'theoretical rate exists');
  assert.equal(st.realExportRate, 0, 'no tanker → realExportRate 0');

  // Tanker loading: real rate = α-capped export flow × $2 (no trade research).
  const g2 = ecoBase();
  g2.idle.port.tanker = { stage: 'loading', progress: 1, load: 0 };
  const st2 = getStats(g2);
  assert.ok(near(st2.realExportRate, st2.exportRate * 2, 0.01), 'loading → realExportRate = exportRate×2');

  // α = 0: the berthed tanker loads nothing over 200 ticks; α share rules.
  const g3 = ecoBase(); g3.oilSplit = 0; g3.oil = 5000; g3.buildings.tank = 20; g3.merchants = []; // isolate exports: no toll income in the window
  g3.idle.port.tanker = { stage: 'loading', progress: 1, load: 0 };
  const bankBefore = g3.idle.bank, lifeBefore = g3.idle.lifetimeIncome;
  const after = tick(g3, 0.125, 200);
  assert.equal(after.idle.port.tanker.load, 0, 'α=0 → tanker load stays 0');
  assert.equal(after.idle.bank, bankBefore, 'α=0 → no export income');
  assert.equal(after.idle.lifetimeIncome, lifeBefore, 'α=0 → lifetime income unchanged by exports');

  // α caps the loading rate itself: load after 8s ≈ exportRate × 8, far
  // below the raw dock rate the old code used.
  const g4 = ecoBase(); g4.oil = 5000; g4.buildings.tank = 20;
  g4.idle.port.tanker = { stage: 'loading', progress: 1, load: 0 };
  const st4 = getStats(g4);
  const after4 = tick(g4, 0.125, 64); // 8 s of loading
  assert.ok(near(after4.idle.port.tanker.load, st4.exportRate * 8, 1.5), `α-capped load ≈ exportRate×8 (got ${after4.idle.port.tanker.load}, want ≈${st4.exportRate * 8})`);
  assert.ok((g4.idle.port.exportedDollars ?? 0) === 0 && after4.idle.port.exportedDollars > 0, 'exported $ accumulate for the realized rate');

  // Bank capacity: a state that never exported has only the 10,000 floor,
  // however large its theoretical dollarRate is.
  const g5 = ecoBase(); g5.buildings.dock = 30; g5.buildings.oil = 30;
  assert.ok(getStats(g5).dollarRate > 50, 'theoretical rate is large');
  assert.equal(getStats(g5).bankCapacity, 10000, 'bank capacity ignores the theoretical rate');

  // Offline income: zero realized exports → zero offline cash, even with a
  // fat theoretical rate and a long absence.
  const g6 = ecoBase(); g6.lastSavedAt = Date.now() - 3600e3;
  assert.equal(getOfflineReward(g6, Date.now()).amount, 0, 'offline pays the realized rate only');
  const g7 = ecoBase(); g7.idle.port.exportedDollars = 36000; g7.elapsed = 3600; g7.lastSavedAt = Date.now() - 3600e3;
  const off7 = getOfflineReward(g7, Date.now());
  assert.ok(off7.amount > 0, 'realized exports earn offline income');
  assert.ok(near(off7.amount, 10 * 3600 * 0.5 * off7.ratio * 1, 60), 'offline = avgRealRate × s × 0.5 × R_Def');
}

// — 4c) Hero power in R_Def (no flat +30) —
{
  const g = initialGame(); g.lastSavedAt = Date.now() - 3600e3;
  assert.equal(heroPower(g), 25, 'hero type 0 power = 75 dmg / 3 s');
  const r = getOfflineReward(g, Date.now());
  assert.ok(near(r.ratio, 25 / 125, 1e-9), `R_Def numerator uses hero power (ratio ${r.ratio})`);
  const g2 = initialGame(); g2.hero2 = { x: 50, y: 50, active: 2 };
  assert.ok(near(heroPower(g2), 25 + 145 / 4, 1e-9), 'deployed hero 2 adds its power');
}

// — 4b) Offline timers advance even when the cash reward is 0 —
{
  const raw = initialGame();
  raw.idle.contract = { id: 'coastal', elapsed: 0 };
  raw.idle.boostCharges = 0; raw.idle.boostRecharge = 0;
  raw.lastSavedAt = Date.now() - 2 * 3600e3; // 2 h away, zero exports → $0 reward
  const { game, offline } = hydrateGame(JSON.parse(JSON.stringify(raw)));
  assert.equal(offline, 0, 'no realized exports → no offline cash');
  assert.equal(game.idle.contract.elapsed, 60, 'contract timer advanced offline to its duration');
  assert.equal(game.idle.boostCharges, 3, 'boost charges refilled offline (2 h / 300 s, capped at 3)');
}

// — 2) Refinery leak: full fuel tank → no oil burned —
{
  const g = ecoBase(); g.fuel = 2499; g.oil = 500; g.oilSplit = 0; g.buildings.steel = 0; g.buildings.arms = 0;
  const after = tick(g, 0.125, 80); // 10 s
  assert.ok(after.fuel <= 2500, 'fuel never exceeds its cap');
  assert.ok(after.oil > 495, `refinery stopped at full tank (oil ${after.oil.toFixed(1)} of 500; only the power plant's share may leave via steel=0 → none)`);
  // And with room in the tank the refinery does run:
  const g2 = ecoBase(); g2.fuel = 100; g2.oil = 500; g2.oilSplit = 0; g2.buildings.steel = 0; g2.buildings.arms = 0;
  const after2 = tick(g2, 0.125, 40);
  assert.ok(after2.fuel > 105, `refinery converts when the tank has room (fuel ${after2.fuel.toFixed(1)})`);
}

// — 4a) Prestige (R7) —
{
  const g = ecoBase();
  Object.assign(g, { cash: 200000, highestWave: 12 });
  g.towers = [{ slot: 0, kind: 'cannon', tier: 2, branch: null, priority: 'first' }];
  g.research = ['drill']; g.idle.bank = 5000;
  const after = gameReducer(g, { type: 'prestige' });
  assert.equal(after.prestige, 1);
  assert.equal(after.towers.length, 0, 'planted towers reset at prestige (PRD)');
  assert.ok(after.research.includes('drill'), 'research is kept');
  assert.equal(after.idle.bank, 0, 'harbor bank does NOT refill to the 260 new-game gift');
}

// — 5) Early call (R10): one +25%, on the wave-end reward only —
{
  const g = initialGame();
  Object.assign(g, { phase: 'battle', wave: 1, spawnRemaining: 0, earlyBonus: true, hearts: 20 });
  g.enemies = [{ id: 99, kind: 'speed', boss: 0, hp: 0, maxHp: 95, progress: 0.5, stun: 0, specialClock: 0 }];
  const cashBefore = g.cash;
  const after = tick(g, 0.125, 1);
  // Per-kill bounty: round(35 × 1.1^1) = 39 — the old code paid 48 (×1.25 twice-counted path).
  assert.equal(after.cash - cashBefore, 39, `per-kill bounty has no early multiplier (delta ${after.cash - cashBefore})`);
  // Wave-end reward keeps the single +25%: round(430 × 1.25 × 1.24 × 1.25) = 833.
  assert.equal(after.idle.lastBattle.cash, 833, 'wave-end reward carries the one +25%');
}

// — 6) Contraband two-stage (R5) —
{
  const spawn = (mutate) => {
    const g = ecoBase(); mutate(g);
    g.trafficClock = 99; g.trafficCount = 3; // next traffic tick is the 4th ship
    return tick(g, 0.125, 1);
  };
  assert.equal(spawn(g => { g.buildings.optical = 1; }).contraband.length, 1, 'optical outpost reveals contraband');
  assert.equal(spawn(g => { g.research.push('smart'); }).contraband.length, 0, 'smart research alone reveals nothing');
  const inspect = (smart) => {
    const g = ecoBase(); g.steel = 0; if (smart) g.research.push('smart');
    g.contraband = [{ id: 7, progress: 0.5 }];
    return gameReducer(g, { type: 'inspect', id: 7 }).steel;
  };
  assert.equal(inspect(false), 50, 'base inspection reward = 50 steel');
  assert.equal(inspect(true), 75, 'smart customs raises the inspection reward to 75');
}

// — 7) VIP escort (R6) —
{
  const startVip = () => {
    const g = ecoBase(); g.eventCount = 2; g.eventClock = 180; // counter → third event type = vip
    return tick(g, 0.125, 1);
  };
  const g = startVip();
  assert.equal(g.event, 'vip');
  assert.ok(g.vipShip && g.vipShip.hp === 300, 'golden supertanker launched with HP');
  assert.ok(g.pirates.length >= 2, 'pirates sortied against the VIP');
  assert.ok(vipPosition(g.vipShip).x >= 0, 'VIP has a trade-lane position');

  // Pirates alongside damage the ship.
  const g2 = startVip(); g2.pirates = [{ id: 500, progress: g2.vipShip.progress, hp: 100 }];
  const hpBefore = g2.vipShip.hp;
  const after2 = tick(g2, 0.125, 1);
  assert.ok(after2.vipShip && after2.vipShip.hp < hpBefore, 'pirate alongside damages the VIP');

  // Successful crossing pays the old event reward.
  const g3 = startVip(); g3.pirates = []; g3.vipShip.progress = 0.999;
  const cashBefore = g3.cash, secBefore = g3.security;
  const after3 = tick(g3, 0.125, 4);
  assert.equal(after3.vipShip, null, 'VIP resolved after crossing');
  assert.equal(after3.cash - cashBefore, 1000, 'VIP success = +$1000');
  assert.equal(after3.security - secBefore, 3, 'VIP success = +3 security');
  assert.equal(after3.event, null);

  // Destruction fines security instead of paying.
  const g4 = startVip(); g4.vipShip.hp = 1; g4.pirates = [{ id: 501, progress: g4.vipShip.progress, hp: 100 }];
  const sec4 = g4.security, cash4 = g4.cash;
  const after4 = tick(g4, 0.125, 8);
  assert.equal(after4.vipShip, null, 'VIP destroyed');
  assert.equal(after4.security, sec4 - 10, 'VIP destruction = −10 security');
  assert.equal(after4.cash, cash4, 'no reward for a destroyed VIP');

  // The old instant resolve no longer pays for VIP.
  const g5 = startVip(); const cash5 = g5.cash;
  assert.equal(gameReducer(g5, { type: 'resolve-event' }).cash, cash5, 'resolve-event does not instantly pay VIP');
}

// — 8a) Chest: second card is the NEXT family in the cycle —
{
  const kinds = ['cannon', 'heavy', 'missile', 'air', 'ew', 'boat'];
  for (let seed = 1; seed <= 300; seed++) {
    const g = initialGame(); g.idle.lootSeed = seed; g.idle.openedChests = 0;
    const reward = P.previewChest(g);
    const entries = Object.entries(reward.cards).filter(([, n]) => n > 0);
    const first = entries.find(([, n]) => n === 3)[0], second = entries.find(([, n]) => n === 1)[0];
    assert.equal(second, kinds[(kinds.indexOf(first) + 1) % 6], `seed ${seed}: second card = next family`);
  }
}

// — 8b) Pirate bounty → harbor bank; battle kill counter untouched —
{
  const g = ecoBase(); g.research.push('coastguard'); // 12 dps guard fire
  g.pirates = [{ id: 42, progress: 0.5, hp: 1 }];
  const bankBefore = g.idle.bank, cashBefore = g.cash, destroyedBefore = g.destroyed;
  const after = tick(g, 0.125, 2);
  assert.equal(after.idle.bank, bankBefore + 50, 'pirate bounty lands in the harbor bank');
  assert.equal(after.cash, cashBefore, 'pirate bounty is not direct cash');
  assert.equal(after.destroyed, destroyedBefore, 'pirate kill does not pollute the battle kill counter');
  assert.equal(after.piratesDestroyed, 1, 'pirates have their own counter');
}

// — 8c) Event type from the event counter, not elapsed —
{
  const g = ecoBase(); g.elapsed = 540; g.eventClock = 180; g.eventCount = 0;
  const after = tick(g, 0.125, 1);
  assert.equal(after.event, 'spill', 'first event by counter = spill (elapsed formula would have said vip)');
  assert.equal(after.eventCount, 1);
}

// — 8e) "New island" mission: text and target agree (one NEW island) —
{
  const mission = P.MISSIONS.find(m => m.id === 'new-island');
  const g = initialGame(); // starts with main + qeshm
  assert.equal(P.missionProgress(g, mission).complete, false, 'not complete at start');
  g.islands = ['main', 'qeshm', 'hormuz'];
  assert.equal(P.missionProgress(g, mission).complete, true, 'complete after unlocking one new island');
}

// — 8f) Offshore platforms: grid multiplier + island prerequisite —
{
  const g = ecoBase(); g.buildings.power = 1; g.buildings.steel = 10; // heavy deficit → grid floor 0.2
  const without = getStats(g).oilRate;
  g.idle.platforms = [0];
  const withPlatform = getStats(g).oilRate;
  assert.ok(near(withPlatform - without, 8 * 0.2, 0.05), `platform adds 8 × M_Grid (got ${(withPlatform - without).toFixed(2)})`);
  const locked = gameReducer(ecoBase(), { type: 'build-platform', id: 0 });
  assert.equal(locked.idle.platforms.length, 0, 'platform blocked while Siri island is locked');
  const g2 = ecoBase(); g2.islands.push('siri');
  assert.equal(gameReducer(g2, { type: 'build-platform', id: 0 }).idle.platforms.length, 1, 'platform builds once its island is open');
}

// — 8g) Hero type swap locked during battle (R9) —
{
  const g = initialGame(); g.phase = 'battle';
  assert.equal(gameReducer(g, { type: 'hero-select', hero: 1 }).hero.active, 0, 'swap blocked in battle');
  const g2 = initialGame();
  assert.equal(gameReducer(g2, { type: 'hero-select', hero: 1 }).hero.active, 1, 'swap allowed in peace');
}

// — 9) Regression probe: 400 peace ticks, fixed economy seed —
{
  const g = ecoBase();
  const after = tick(g, 0.125, 400);
  const digest = {
    cash: Math.round(after.cash * 100) / 100, oil: Math.round(after.oil * 100) / 100,
    fuel: Math.round(after.fuel * 100) / 100, steel: Math.round(after.steel * 100) / 100,
    ammo: Math.round(after.ammo * 100) / 100, bank: Math.round(after.idle.bank * 100) / 100,
    lifetimeIncome: Math.round(after.idle.lifetimeIncome * 100) / 100,
    exportedDollars: Math.round((after.idle.port.exportedDollars ?? 0) * 100) / 100,
    tankerStage: after.idle.port.tanker?.stage ?? null, tankerLoad: Math.round((after.idle.port.tanker?.load ?? 0) * 100) / 100,
    cycles: after.idle.port.cycles, merchants: after.merchants.length, security: after.security,
    destroyed: after.destroyed, piratesDestroyed: after.piratesDestroyed ?? 0,
  };
  console.log('ECONOMY PROBE DIGEST', JSON.stringify(digest));
}

console.log('test-economy: all ECO assertions passed');
