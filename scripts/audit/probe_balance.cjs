/* Team BALANCE probe — fix program 2, D-024.
 *
 * Run: node scripts/audit/probe_balance.cjs
 *
 * Sections:
 *  A) boss-5 tuning: the tier-1 five-tower line (cannon/heavy/ew/air/
 *     missile down the strait-line priority, default hero — the line
 *     audit-2 team 5 measured) must NOT full-clear wave 5 with 11+
 *     hearts left; the same line at tier 3 must still clear it.
 *  B) defeat reasons (D-024 item 1): lastBattle.reason is set from the
 *     actual defeat path — line-broken (hearts), air-leak (airdef
 *     objective), boss-breakthrough (fatal boss leak).
 *  C) spiral warnings (D-024 item 6): state.warnings.fuel / .power fire
 *     only after ~10 s of SUSTAINED low fuel (< 60, declining) / low
 *     grid (< 0.9) — before the choke, never at a healthy start, and
 *     not on a stable low-fuel equilibrium.
 *  D) full-run sanity: a guided fresh player (mission chain, incl. the
 *     new steel-factory + AA steps) fights waves 1-5 with no wall.
 *
 * The reducer CLONES on every action — always read the RETURNED state.
 */
const { load } = require('../load-game.cjs');
const G = load('src/lib/game.ts');
const P = load('src/lib/progression.ts');
const SM = load('src/lib/scenario-mechanics.ts');
const N = load('src/lib/news.ts');
const { initialGame, gameReducer, BUILDINGS, TOWERS, RESEARCH, getStats } = G;
const { currentMission, missionProgress, MANAGERS, managerCost } = P;

const DT = 0.125;
const results = [];
function check(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${detail}`);
}
function fightToEnd(s, maxTicks = 30000) {
  let n = 0;
  while (s.phase === 'battle' && n++ < maxTicks) s = gameReducer(s, { type: 'tick', dt: DT });
  return s;
}
function richBase() {
  const s = initialGame();
  s.cash = 100000; s.steel = 10000; s.ammo = 5000; s.fuel = 100000; s.oil = 100000;
  s.buildings.power = 10; // grid ≈ 1 for any line below
  return s;
}
const LINE5 = [['cannon', 2], ['heavy', 5], ['ew', 8], ['air', 12], ['missile', 9]];
function lineState(tier) {
  const s = richBase();
  s.wave = 5; s.highestWave = 4;
  s.towers = LINE5.map(([kind, slot]) => ({ slot, kind, tier, branch: null, priority: 'first' }));
  return s;
}

/* ---------------- A) boss wave 5 ---------------- */
{
  const runs = [];
  for (let i = 0; i < 3; i++) {
    let s = lineState(1);
    s = gameReducer(s, { type: 'start' });
    const queue = (s.battle && s.battle.queue) || [];
    const comp = {}; for (const u of queue) comp[u.kind] = (comp[u.kind] || 0) + 1;
    s = fightToEnd(s);
    runs.push({ victory: s.phase !== 'defeat', hearts: s.hearts, comp });
  }
  const worst = runs.reduce((a, b) => (b.victory && b.hearts > (a ? a.hearts : -1) ? b : a), null);
  console.log('boss5 tier-1 runs:', JSON.stringify(runs));
  check('boss5.tier1_not_easy', !(worst && worst.hearts >= 11),
    worst ? `best tier-1 run: victory with ${worst.hearts} hearts (must be < 11 or a defeat); comp=${JSON.stringify(runs[0].comp)}`
          : 'tier-1 line defeated in all 3 runs');
  let s3 = lineState(3);
  s3 = gameReducer(s3, { type: 'start' });
  s3 = fightToEnd(s3);
  check('boss5.tier3_clears', s3.phase !== 'defeat',
    `tier-3 line: ${s3.phase} with ${s3.hearts} hearts`);
  let s2 = lineState(2);
  s2 = gameReducer(s2, { type: 'start' });
  s2 = fightToEnd(s2);
  console.log(`boss5 tier-2 line: ${s2.phase} with ${s2.hearts} hearts (informational)`);
}

/* ---------------- B) defeat reasons ---------------- */
{
  // B1: leaks zero the hearts -> line-broken. (A towerless wave 1 is
  // actually survivable — the hero holds it — so start at 1 heart: the
  // first leak is the fatal one and its kind is what is being tested.)
  let s = initialGame();
  s.hearts = 1;
  s = gameReducer(s, { type: 'start' });
  s = fightToEnd(s);
  check('reason.line_broken', s.phase === 'defeat' && s.idle.lastBattle?.reason === 'line-broken',
    `phase=${s.phase} reason=${s.idle.lastBattle?.reason} hearts=${s.hearts}`);

  // B2: heavy+missile (zero air capability) at wave 3 -> airdef objective
  // defeat while hearts remain -> air-leak.
  let a = initialGame();
  a.cash = 5000; a.wave = 3; a.highestWave = 2;
  a = gameReducer(a, { type: 'build-tower', slot: 5, kind: 'heavy' });
  a = gameReducer(a, { type: 'build-tower', slot: 9, kind: 'missile' });
  a = gameReducer(a, { type: 'start' });
  const airTotal = a.battle ? a.battle.airTotal : -1;
  a = fightToEnd(a);
  check('reason.air_leak', a.phase === 'defeat' && a.idle.lastBattle?.reason === 'air-leak' && a.hearts > 0,
    `phase=${a.phase} reason=${a.idle.lastBattle?.reason} hearts=${a.hearts} airTotal=${airTotal}`);

  // B3: isolate the boss at wave 5 with full hearts -> its leak is the
  // fatal one -> boss-breakthrough.
  let b = lineState(1);
  b.towers = [];
  b = gameReducer(b, { type: 'start' });
  let guard = 0, isolated = false;
  while (b.phase === 'battle' && guard++ < 30000) {
    b = gameReducer(b, { type: 'tick', dt: DT });
    const boss = b.enemies.find(e => e.kind === 'boss');
    if (!isolated && boss && b.spawnRemaining === 0) {
      // One-time isolation: only the boss remains, at the lane's edge,
      // with full hearts — its leak (20) is necessarily the fatal one.
      b.enemies = b.enemies.filter(e => e.kind === 'boss');
      boss.progress = 0.999; b.hearts = 20;
      isolated = true;
    }
    if (b.phase !== 'battle') break;
  }
  check('reason.boss_breakthrough', b.phase === 'defeat' && b.idle.lastBattle?.reason === 'boss-breakthrough',
    `phase=${b.phase} reason=${b.idle.lastBattle?.reason} hearts=${b.hearts}`);
}

/* ---------------- C) spiral warnings ---------------- */
{
  // C0: healthy fresh start — 30 s of ticks, no warning may fire.
  let h = initialGame();
  for (let i = 0; i < 240; i++) h = gameReducer(h, { type: 'tick', dt: DT });
  check('warn.healthy_start_quiet', !h.warnings.fuel && !h.warnings.power,
    `after 30s: fuel=${h.fuel.toFixed(1)} grid=${getStats(h).grid.toFixed(2)} warnings=${JSON.stringify(h.warnings)}`);

  // C1: fuel < 60 and declining (power burn, no refinery): quiet before
  // 10 s of sustain, firing after — while fuel is still > 0 (pre-choke).
  let f = initialGame();
  f.fuel = 55;
  for (let i = 0; i < 64; i++) f = gameReducer(f, { type: 'tick', dt: DT }); // 8 s
  const early = f.warnings.fuel;
  for (let i = 0; i < 32; i++) f = gameReducer(f, { type: 'tick', dt: DT }); // 12 s
  check('warn.fuel_sustained', !early && f.warnings.fuel && f.fuel > 0,
    `at 8s fuel-warn=${early} (want false); at 12s fuel-warn=${f.warnings.fuel} (want true), fuel=${f.fuel.toFixed(1)} (>0 = before choke)`);
  f.fuel = 500;
  f = gameReducer(f, { type: 'tick', dt: DT });
  check('warn.fuel_clears', !f.warnings.fuel, `after refill warnings=${JSON.stringify(f.warnings)}`);

  // C2: stable low-fuel equilibrium (no burn, no production): fuel sits
  // at 55 forever — NOT a spiral, no warning.
  let e = initialGame();
  e.buildings.power = 0; e.fuel = 55;
  for (let i = 0; i < 240; i++) e = gameReducer(e, { type: 'tick', dt: DT });
  check('warn.fuel_equilibrium_quiet', !e.warnings.fuel,
    `fuel=${e.fuel.toFixed(1)} after 30s, fuel-warn=${e.warnings.fuel} (want false)`);

  // C3: grid < 0.9 sustained (over-built consumers vs one power plant):
  // quiet before 10 s, firing after.
  let g = initialGame();
  g.buildings.steel = 3; g.buildings.arms = 2; // used = 19 + 75 + 60 = 154 vs produced 60
  for (let i = 0; i < 64; i++) g = gameReducer(g, { type: 'tick', dt: DT });
  const gEarly = g.warnings.power;
  for (let i = 0; i < 32; i++) g = gameReducer(g, { type: 'tick', dt: DT });
  check('warn.power_sustained', !gEarly && g.warnings.power,
    `grid=${getStats(g).grid.toFixed(2)}; at 8s power-warn=${gEarly} (want false), at 12s=${g.warnings.power} (want true)`);
}

/* ---------------- D) guided full run, waves 1-5 ---------------- */
{
  // Only slots a real fresh player can build on: the starting islands
  // are main + qeshm (slots 0-8) — build-tower refuses locked islands.
  const LINE = [['cannon', 2], ['heavy', 5], ['ew', 8], ['air', 7],
                ['missile', 0], ['boat', 4], ['cannon', 3], ['heavy', 6],
                ['cannon', 1]];
  let s = initialGame();
  const act = (a) => { s = gameReducer(s, a); };
  const tickN = (n) => { for (let i = 0; i < n; i++) act({ type: 'tick', dt: DT }); };
  const gridRatio = () => { try { return getStats(s).grid; } catch { return 1; } };
  const blockedSlots = new Set();
  function buyTower(maxTotal) {
    if (s.towers.length >= maxTotal) return false;
    for (const [kind, slot] of LINE) {
      if (blockedSlots.has(slot) || s.towers.some(t => t.slot === slot)) continue;
      const def = TOWERS[kind];
      if (s.cash >= def.cost && s.steel >= def.steel) {
        const before = s.towers.length;
        act({ type: 'build-tower', slot, kind });
        if (s.towers.length > before) return true;
        blockedSlots.add(slot); // reducer refused (e.g. water slot, no platform) — never retry it
      }
    }
    return false;
  }
  function powerPrep() {
    let guard = 0;
    while (gridRatio() < 0.95 && guard++ < 20) {
      const cost = Math.ceil(BUILDINGS.power.baseCost * Math.pow(1.15, s.buildings.power));
      if (s.cash < cost) break;
      act({ type: 'upgrade-building', id: 'power' });
    }
  }
  function startBattle() {
    const scen = N.scenarioForWave(s.wave, s.mode, SM.scenarioContextFor(s));
    if (SM.objectiveTypeOf(scen.objective) === 'intercept') {
      const w = s.wave;
      kitFight();
      if (s.phase === 'intermission') fought.push(w);
      return;
    }
    act({ type: 'start' });
  }
  function missionStep(m) {
    switch (m.metric) {
      case 'collected': if (s.idle.bank > 0) { act({ type: 'collect-income' }); return true; } return false;
      case 'building': {
        const q = G.buildingUpgradeQuote(s, m.metricId, 1);
        if (q.affordable) { act({ type: 'upgrade-building', id: m.metricId }); return true; }
        return false;
      }
      case 'managers':
        for (const id of Object.keys(MANAGERS)) {
          if (s.idle.managerLevels[id] === 0 && s.cash >= managerCost(id, 0) && s.idle.xp >= MANAGERS[id].unlockXp) {
            act({ type: 'hire-manager', id }); return true;
          }
        }
        return false;
      case 'research': {
        const next = RESEARCH.filter(r => !s.research.includes(r.id)).sort((a, b) => a.cost - b.cost)[0];
        if (next && s.cash >= next.cost) { act({ type: 'research', id: next.id }); return true; }
        return false;
      }
      case 'towers': { let acted = false; while (buyTower(m.metricId ? 99 : m.target)) {
          if (m.metricId && s.towers.some(t => t.kind === m.metricId)) break;
          acted = true; }
        return acted; }
      case 'towerTier': {
        const t = s.towers.slice().sort((a, b) => a.tier - b.tier)[0];
        if (t) { const c = G.towerUpgradeCost(t);
          if (s.cash >= c.cash && s.steel >= c.steel) { act({ type: 'upgrade-tower', slot: t.slot }); return true; } }
        return false;
      }
      case 'wave': { let acted = false; while (buyTower(Infinity)) acted = true; if (acted) return true;
        // The game's own context alert flags low ammo (< 100); a guided
        // player answers it before a new wave: build the arms factory
        // ONCE, then let production refill (the fallback waits).
        if (s.ammo < 200 && s.buildings.arms === 0) {
          const q = G.buildingUpgradeQuote(s, 'arms', 1);
          if (q.affordable) { act({ type: 'upgrade-building', id: 'arms' }); return true; }
        }
        if (s.ammo < 200 && s.buildings.arms > 0) return false; // refill in progress
        // A choked grid scales ALL damage down (audit-2 I2's spiral):
        // never start a wave on a sick grid — top power up first.
        if (gridRatio() < 0.9) { powerPrep(); if (gridRatio() < 0.9) return false; }
        powerPrep(); startBattle(); return true; }
      default: return false;
    }
  }
  const fought = [];
  let guard = 0, defeated = null;
  // Kit play (documented in the delivery): an INTERCEPT wave is decided
  // in the lane's first half, where no land slot can engage — only the
  // hero and the garrison fight there. Measured on this build: partial
  // kit (hero swap alone, EMP alone, strike alone, any composition
  // softening) loses 0/3; the full free kit — hero type 2 (strongest
  // anti-ship) + EMP on the lead element + a strike on the follow-up —
  // wins 3/3 at 20 hearts. All three are free, permanent unlocks, so the
  // guided player uses them; a strike also answers any leader about to
  // leak (progress >= 0.93) on other waves.
  const kitFight = () => {
    const scen = N.scenarioForWave(s.wave, s.mode, SM.scenarioContextFor(s));
    const intercept = SM.objectiveTypeOf(scen.objective) === 'intercept';
    if (intercept && s.hero.active !== 2) act({ type: 'hero-select', hero: 2 });
    act({ type: 'start' });
    let n = 0, empDone = false, strikeDone = false;
    while (s.phase === 'battle' && n++ < 30000) {
      act({ type: 'tick', dt: DT });
      const top = s.enemies.slice().sort((a, b) => b.progress - a.progress)[0];
      if (!top) continue;
      if (intercept && !empDone && top.progress >= 0.28 && (s.cooldowns.emp ?? 0) <= 0) {
        act({ type: 'spell', spell: 'emp' }); empDone = true; continue;
      }
      if (!strikeDone && (s.cooldowns.strike ?? 0) <= 0 && top.progress >= (intercept ? 0.40 : 0.93)) {
        const p = G.enemyPosition(top, s.layout);
        act({ type: 'spell', spell: 'strike', x: p.x, y: p.y }); strikeDone = true;
      }
    }
  };
  while (s.highestWave < 5 && !defeated && s.elapsed < 14400 && guard++ < 600000) {
    if (s.phase === 'battle') {
      const w = s.wave;
      // Reasonable play: a strike answers any leader about to leak.
      let n = 0;
      while (s.phase === 'battle' && n++ < 30000) {
        act({ type: 'tick', dt: DT });
        const top = s.enemies.slice().sort((a, b) => b.progress - a.progress)[0];
        if (top && top.progress >= 0.93 && (s.cooldowns.strike ?? 0) <= 0) {
          const p = G.enemyPosition(top, s.layout);
          act({ type: 'spell', spell: 'strike', x: p.x, y: p.y });
        }
      }
      if (s.phase === 'defeat') { defeated = { wave: w, reason: s.idle.lastBattle?.reason }; break; }
      fought.push(w);
      continue;
    }
    if (s.phase === 'defeat') { defeated = { wave: s.wave, reason: s.idle.lastBattle?.reason }; break; }
    if (s.idle.lastBattle && !s.idle.lastBattle.claimed) { act({ type: 'claim-battle' }); continue; }
    const m = currentMission(s);
    if (m && missionProgress(s, m).complete) { act({ type: 'claim-mission', id: m.id }); continue; }
    let acted = m ? missionStep(m) : false;
    if (!acted && (s.phase === 'peace' || s.phase === 'intermission')) {
      let bought = false; while (buyTower(Infinity)) bought = true;
      if (bought) acted = true;
      else if (s.ammo < 200 && s.buildings.arms === 0) {
        const q = G.buildingUpgradeQuote(s, 'arms', 1);
        if (q.affordable) { act({ type: 'upgrade-building', id: 'arms' }); acted = true; }
        else { tickN(4); continue; }
      }
      else if (s.ammo < 200) { tickN(4); continue; } // arms factory running: wait for the refill
      else if (gridRatio() < 0.9) { powerPrep(); if (gridRatio() < 0.9) { tickN(4); continue; } acted = true; }
      if (!acted) { powerPrep(); startBattle(); if (s.phase !== 'battle') tickN(4); continue; }
    }
    if (!acted) tickN(4);
  }
  check('fullrun.waves_1_to_5', !defeated && s.highestWave >= 5,
    `fought=[${fought.join(',')}] highestWave=${s.highestWave} defeated=${JSON.stringify(defeated)} ` +
    `towers=[${s.towers.map(t => `${t.kind}@${t.slot}t${t.tier}`).join(', ')}] steel=${Math.floor(s.steel)} elapsed=${Math.round(s.elapsed)}s`);
}

const failed = results.filter(r => !r.ok);
console.log(`\nprobe_balance: ${results.length - failed.length}/${results.length} pass`);
process.exitCode = failed.length ? 1 : 0;
