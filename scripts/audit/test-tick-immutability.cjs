/* ROOT acceptance probes (fix program) — run: node scripts/audit/test-tick-immutability.cjs
 *
 * 1) Tick immutability: deep-freeze a battle state, run many ticks through
 *    gameReducer, prove the frozen input is byte-identical afterwards and
 *    that tick copied only the subtrees it writes (research stays shared —
 *    no structuredClone on the tick path), while the result still advanced.
 * 2) Discrete fire: an autocannon (spec: 12 dmg, 0.25s interval, 1 ammo)
 *    fires individual shots at the spec cadence; damage lands only at
 *    impact and equals the rolled per-shot damage exactly.
 * 3) Destroyer point-defense nullifies the first missile shot at impact.
 * 4) Boss-3 (Titan) shield now applies to burn damage (audit متوسط-۸).
 * 5) Weapons-spec spot checks (R1 resolutions) + towerDps derivation.
 * 6) FULL cadence matrix (QA round-2, بحرانی-۱): every shot-mode config ×
 *    speeds 1/2/3 must land within ±10% of its spec rate — the cumulative
 *    cooldown with remainder carry replaced the one-shot-per-tick loop
 *    that quantized fast weapons to the tick grid (CIWS was 8/s at 1×).
 * 7) Ammo ruling (QA متوسط-۱): a shot the stock cannot pay for does NOT
 *    fire and consumes nothing; the tower retries after 3× interval.
 * 8) Destroyer point-defense is keyed on modelKind (QA متوسط-۲); Swarm
 *    is NOT intercepted (checklist ۲٫۵). Bavar's key stays in applyDamage
 *    defensively, but per checklist ۱٫۴ Bavar is AIR-ONLY (MECH-B target
 *    filter), so it never engages a destroyer — probe 8 now verifies the
 *    air-only multi-lock instead of the old sea duel.
 * 9) pendingImpacts is cleared the moment a battle ends (QA جزئی-۱).
 * 10) fireStats live in the logic state (QA جزئی-۲): shots counted at fire
 *     time, hits/fizzled at impact resolution; pirate records never count.
 */
const assert = require('node:assert/strict');
const { load } = require('../load-game.cjs');
const G = load('src/lib/game.ts');
const W = load('src/lib/weapons-spec.ts');
const { initialGame, gameReducer, towerDps, positionAt, distance, SLOTS } = G;

function deepFreeze(o, seen = new Set()) {
  if (o && typeof o === 'object' && !seen.has(o)) {
    seen.add(o);
    for (const v of Object.values(o)) deepFreeze(v, seen);
    Object.freeze(o);
  }
  return o;
}
function progressNear(slotIdx, maxDist) {
  const slot = SLOTS[slotIdx];
  for (let p = 0; p <= 1; p += 0.005) if (distance(slot, positionAt(p)) <= maxDist) return p;
  throw new Error('no lane point near slot ' + slotIdx);
}
function battleBase() {
  const g = initialGame();
  Object.assign(g, { cash: 100000, ammo: 5000, phase: 'battle', wave: 3, speed: 1, spawnRemaining: 0, spawnClock: 0, hearts: 20 });
  g.buildings.power = 50; // grid = 1
  g.hero = { x: 2, y: 95, active: 0 }; // parked far away: no aura, no hero fire
  return g;
}
const tick = (s, n = 1, dt = 0.125) => { for (let i = 0; i < n; i++) s = gameReducer(s, { type: 'tick', dt }); return s; };

/* ---- 1) deep-freeze immutability ---- */
{
  const g = battleBase();
  g.towers = [
    { slot: 0, kind: 'cannon', tier: 1, branch: null, priority: 'first' },
    { slot: 9, kind: 'missile', tier: 3, branch: null, priority: 'strongest' },
    { slot: 5, kind: 'air', tier: 4, branch: 1, priority: 'air' },
    { slot: 4, kind: 'heavy', tier: 4, branch: 0, priority: 'first' },
  ];
  g.enemies = [
    { id: 1, kind: 'speed', boss: 0, hp: 9000, maxHp: 9000, progress: progressNear(0, 12), stun: 999, specialClock: 0 },
    { id: 2, kind: 'destroyer', boss: 0, hp: 9000, maxHp: 9000, progress: progressNear(9, 15), stun: 999, specialClock: 0 },
    { id: 3, kind: 'boss', boss: 3, hp: 60000, maxHp: 60000, progress: 0.4, stun: 0, specialClock: 0, burn: 5, burnDamage: 40 },
    { id: 4, kind: 'air', boss: 0, hp: 9000, maxHp: 9000, progress: 0.5, stun: 0, specialClock: 0 },
    { id: 5, kind: 'corvette', boss: 0, hp: 9000, maxHp: 9000, progress: 0.3, stun: 0, specialClock: 0 },
  ];
  g.pirates = [{ id: 50, progress: 0.3, hp: 500 }];
  const frozen = deepFreeze(g);
  const snapshot = JSON.stringify(frozen);
  let s = frozen;
  for (let i = 0; i < 48; i++) s = gameReducer(s, { type: 'tick', dt: 0.125 }); // must not throw on frozen input
  assert.equal(JSON.stringify(frozen), snapshot, 'frozen input state was mutated');
  assert.notEqual(s.towers, frozen.towers); assert.notEqual(s.enemies, frozen.enemies);
  assert.equal(s.research, frozen.research, 'research must stay shared (no full clone on tick path)');
  assert.equal(s.cards, frozen.cards, 'cards must stay shared (no full clone on tick path)');
  assert.ok(s.elapsed > frozen.elapsed, 'result state did not advance');
  console.log('1) deep-freeze immutability: PASS (48 ticks, input untouched, tick-subtrees copied, research/cards shared)');
}

/* ---- 2) discrete cadence + per-shot damage + per-shot ammo ---- */
{
  let s = battleBase();
  s.towers = [{ slot: 0, kind: 'cannon', tier: 1, branch: null, priority: 'first' }];
  const prog = progressNear(0, 12);
  s.enemies = [{ id: 1, kind: 'speed', boss: 0, hp: 100000, maxHp: 100000, progress: prog, stun: 9999, specialClock: 0 }];
  const shots = [];
  for (let i = 0; i < 16; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); shots.push(...s.shots); }
  assert.ok(shots.length >= 7 && shots.length <= 9, `expected ~8 shots in 2s at 0.25s interval, got ${shots.length}`);
  for (const sh of shots) {
    assert.equal(sh.modelKind, 'autocannon'); assert.equal(sh.slot, 0); assert.equal(sh.targetId, 1);
    assert.equal(sh.interval, 0.25, 'shot record interval must be the spec interval');
    assert.ok(sh.damage === 12 || sh.damage === 24, `per-shot damage must be 12 (or 24 crit), got ${sh.damage}`);
    assert.equal(sh.crit, sh.damage === 24, 'crit flag must match the ×2 roll');
    assert.ok(sh.flightDur > 0, 'projectile must have a flight time');
  }
  assert.equal(s.ammo, 5000 - shots.length, 'ammo must be consumed per shot (1/shot), not per tick');
  s = tick({ ...s, towers: [] }, 8); // drain in-flight shots with the tower gone (no new fire)
  const dealt = 100000 - s.enemies[0].hp;
  assert.equal(dealt, shots.reduce((a, sh) => a + sh.damage, 0), 'enemy must lose exactly the sum of landed per-shot damage');
  assert.equal(s.pendingImpacts.length, 0, 'impact queue must drain');
  console.log(`2) discrete fire: PASS (${shots.length} shots in 2s, total impact damage ${dealt} = sum of shot records, ammo -${shots.length})`);
}

/* ---- 3) destroyer intercept at impact, full-shot scale ---- */
{
  let s = battleBase();
  s.towers = [{ slot: 9, kind: 'missile', tier: 1, branch: null, priority: 'strongest' }];
  s.enemies = [{ id: 1, kind: 'destroyer', boss: 0, hp: 100000, maxHp: 100000, progress: progressNear(9, 15), stun: 9999, specialClock: 0 }];
  const shots = [];
  for (let i = 0; i < 24; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); shots.push(...s.shots); }
  assert.ok(shots.length >= 1, 'silo must have fired');
  assert.equal(s.enemies[0].hp, 100000, 'first missile shot must be nullified by point-defense at impact');
  assert.ok((s.enemies[0].intercept ?? 0) > 2, 'intercept window (5s) must be running after the nullified shot');
  console.log(`3) destroyer intercept: PASS (shot of ${shots[0].damage} dmg nullified at impact, intercept=${s.enemies[0].intercept.toFixed(2)}s left)`);
}

/* ---- 4) boss-3 shield applies to burn ---- */
{
  let s = battleBase();
  s.enemies = [{ id: 1, kind: 'boss', boss: 3, hp: 100000, maxHp: 100000, progress: 0.4, stun: 0, specialClock: 0, burn: 5, burnDamage: 100 }];
  s = tick(s, 8); // 1 second of burn at 100 dps, shield up (specialClock < 10) → ×0.35
  const loss = 100000 - s.enemies[0].hp;
  assert.ok(Math.abs(loss - 35) < 0.6, `burn through Titan shield must deal ~35 in 1s, dealt ${loss}`);
  console.log(`4) boss-3 shield vs burn: PASS (${loss.toFixed(1)} damage in 1s of 100-dps burn)`);
}

/* ---- 5) spec spot checks + derived display DPS ---- */
{
  const ciws = W.weaponSpec('cannon', 4, 0);
  assert.equal(ciws.damage, 9); assert.equal(W.specInterval(ciws), 1 / 14); // R1: real DPS 126, pack's 612 ignored
  const laser = W.weaponSpec('air', 4, 1);
  assert.equal(laser.mode, 'beam'); assert.equal(laser.damage, 90); assert.equal(laser.powerMW, 80);
  const gar = W.weaponSpec('boat', 1, null);
  assert.equal(gar.units, 3); assert.equal(W.specInterval(gar), 1 / (1.5 * 3)); // 3 boats from tier 1 (R1)
  assert.equal(W.weaponSpec('missile', 4, 0).critChance, 1); // hypersonic permanent crit
  assert.equal(W.weaponSpec('heavy', 4, 0).salvoSize, 12);
  assert.equal(W.flightTime('railgun', 10), 0); assert.equal(W.flightTime('laser', 10), 0); // hitscan
  assert.equal(W.flightTime('silo', 25), 2.2); // clamped FX duration
  const s = battleBase();
  const dps = towerDps(s, { slot: 0, kind: 'cannon', tier: 1, branch: null, priority: 'first' });
  assert.ok(Math.abs(dps - 12 * 1.08 / 0.25) < 0.01, `autocannon display DPS must be 51.84, got ${dps}`);
  console.log('5) weapons-spec + towerDps derivation: PASS');
}

/* ---- 6) full cadence matrix: all shot-mode configs × speeds 1/2/3 ---- */
{
  const { enemyPosition, getRange } = G;
  function matrixBase(tower) {
    const g = initialGame();
    Object.assign(g, { cash: 1e9, ammo: 1e9, fuel: 1e9, phase: 'battle', wave: 3, speed: 1, spawnRemaining: 0, spawnClock: 0, hearts: 20 });
    g.buildings.power = 10;
    g.towers = [tower];
    return g;
  }
  function findProgress(slotIdx, tower, enemyKind, frac = 0.75) {
    const slot = SLOTS[slotIdx];
    const range = getRange(matrixBase(tower), tower);
    const mk = p => enemyKind === 'air'
      ? enemyPosition({ id: 1, kind: 'air', boss: 0, hp: 1, maxHp: 1, progress: p, stun: 0, specialClock: 0 }, 'landscape')
      : positionAt(p);
    for (let p = 0; p <= 1; p += 0.002) if (distance(slot, mk(p)) <= range * frac) return p;
    return -1;
  }
  function heroPark(g, slotIdx, ePos) {
    const slot = SLOTS[slotIdx];
    const corners = [{ x: 1, y: 1 }, { x: 99, y: 1 }, { x: 1, y: 99 }, { x: 99, y: 99 }, { x: 50, y: 1 }, { x: 50, y: 99 }];
    for (const c of corners) if (distance(c, slot) > 20 && distance(c, ePos) > 40) { g.hero = { x: c.x, y: c.y, active: 0 }; return; }
    throw new Error('hero park failed');
  }
  const rows = [];
  for (const kind of ['cannon', 'heavy', 'missile', 'air', 'ew', 'boat']) {
    for (const [tier, branch] of [[1, null], [2, null], [3, null], [4, 0], [4, 1]]) {
      const spec = W.weaponSpec(kind, tier, branch);
      if (spec.mode === 'beam') continue;
      // MECH-B: a salvo weapon's cadence expectation is its cycle-average
      // rocket rate (salvoSize per salvoCycleSeconds), not the flat interval.
      const specRate = spec.salvoSize ? spec.salvoSize / W.salvoCycleSeconds(spec) : 1 / W.specInterval(spec);
      const ek = kind === 'air' && tier === 4 && branch === 0 ? 'air' : 'speed';
      let chosen = -1, prog = -1;
      for (let si = 0; si < SLOTS.length && chosen < 0; si++) {
        const p = findProgress(si, { slot: si, kind, tier, branch, priority: 'first' }, ek);
        if (p >= 0) { chosen = si; prog = p; }
      }
      assert.ok(chosen >= 0, `${spec.modelKind}: no slot/progress found for cadence matrix`);
      const rates = [];
      for (const speed of [1, 2, 3]) {
        let s = matrixBase({ slot: chosen, kind, tier, branch, priority: kind === 'air' ? 'air' : 'first' });
        s.speed = speed;
        const ePos = ek === 'air' ? enemyPosition({ id: 1, kind: 'air', boss: 0, hp: 1, maxHp: 1, progress: prog, stun: 0, specialClock: 0 }, 'landscape') : positionAt(prog);
        heroPark(s, chosen, ePos);
        s.enemies = [{ id: 1, kind: ek, boss: 0, hp: 1e12, maxHp: 1e12, progress: prog, stun: 1e7, specialClock: 0 }];
        let shots = 0; const TICKS = 480;
        for (let i = 0; i < TICKS; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); shots += s.shots.filter(sh => sh.slot === chosen && sh.interval > 0).length; }
        rates.push(shots / (TICKS * 0.125 * speed));
      }
      const devs = rates.map(r => (r / specRate - 1) * 100);
      rows.push(`   ${spec.modelKind.padEnd(11)} T${tier} spec ${specRate.toFixed(2)}/s → 1× ${rates[0].toFixed(2)} (${devs[0].toFixed(1)}%) · 2× ${rates[1].toFixed(2)} (${devs[1].toFixed(1)}%) · 3× ${rates[2].toFixed(2)} (${devs[2].toFixed(1)}%)`);
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(devs[i]) <= 10, `${spec.modelKind} T${tier} @${i + 1}×: rate ${rates[i].toFixed(2)}/s deviates ${devs[i].toFixed(1)}% from spec ${specRate.toFixed(2)}/s (tolerance ±10%)`);
      if (spec.modelKind === 'ciws') assert.ok(rates[0] >= 12.6, `CIWS @1× must be ≥ 12.6/s (QA gate), got ${rates[0].toFixed(2)}/s`);
    }
  }
  console.log(`6) cadence matrix: PASS (29 configs × 3 speeds, all within ±10% of spec)`);
  for (const r of rows) console.log(r);
}

/* ---- 7) ammo ruling: no free shots on insufficient stock ---- */
{
  const { getRange: rangeOf } = G;
  function spotFor(tower, minD = 0, maxFrac = 0.8) {
    for (let si = 0; si < SLOTS.length; si++) {
      const t = { ...tower, slot: si };
      const range = rangeOf(battleBase(), t);
      for (let p = 0.02; p <= 0.98; p += 0.004) {
        const d = distance(SLOTS[si], positionAt(p));
        if (d <= range * maxFrac && d >= minD && distance(SLOTS[si], { x: 2, y: 95 }) > 18) return { slot: si, progress: p };
      }
    }
    throw new Error('no spot');
  }
  const foeAt = p => ({ id: 1, kind: 'speed', boss: 0, hp: 1e12, maxHp: 1e12, progress: p, stun: 1e7, specialClock: 0 });
  // silo with ammo 2 < cost 5: first tick arms the 3× retry timer, never fires
  {
    const spot = spotFor({ kind: 'missile', tier: 1, branch: null });
    let s = battleBase(); s.ammo = 2;
    s.towers = [{ slot: spot.slot, kind: 'missile', tier: 1, branch: null, priority: 'first' }];
    s.enemies = [foeAt(spot.progress)];
    s = gameReducer(s, { type: 'tick', dt: 0.125 });
    assert.equal(s.shots.length, 0, 'silo with insufficient stock must not fire');
    assert.ok(Math.abs((s.towers[0].cooldown ?? 0) - 15) < 1e-9, `retry timer must be 3× interval (15s), got ${s.towers[0].cooldown}`);
    let total = 0;
    for (let i = 0; i < 480; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); total += s.shots.filter(sh => sh.slot === spot.slot && sh.interval > 0).length; }
    assert.equal(total, 0, 'starved silo must never fire a free shot');
    assert.equal(s.ammo, 2, 'no ammo may be consumed by a shot that never fired');
  }
  // zero stock behaves the same (no shots at all now, not free shots at ⅓ rate)
  {
    const spot = spotFor({ kind: 'missile', tier: 1, branch: null });
    let s = battleBase(); s.ammo = 0;
    s.towers = [{ slot: spot.slot, kind: 'missile', tier: 1, branch: null, priority: 'first' }];
    s.enemies = [foeAt(spot.progress)];
    let total = 0;
    for (let i = 0; i < 480; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); total += s.shots.filter(sh => sh.slot === spot.slot && sh.interval > 0).length; }
    assert.equal(total, 0, 'silo at zero ammo must hold fire entirely');
  }
  // zero-ammo weapon (EW, ammoPerShot 0) is unaffected by an empty stock
  {
    const spot = spotFor({ kind: 'ew', tier: 1, branch: null });
    let s = battleBase(); s.ammo = 0;
    s.towers = [{ slot: spot.slot, kind: 'ew', tier: 1, branch: null, priority: 'first' }];
    s.enemies = [foeAt(spot.progress)];
    let total = 0;
    for (let i = 0; i < 100; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); total += s.shots.filter(sh => sh.slot === spot.slot && sh.interval > 0).length; }
    assert.ok(total >= 10, `EW (ammo-free) must keep firing at empty stock, got ${total} shots in 12.5s`);
  }
  // overdrive still fires at zero stock with zero cost
  {
    const spot = spotFor({ kind: 'missile', tier: 1, branch: null });
    let s = battleBase(); s.ammo = 0; s.overdrive = 10000;
    s.towers = [{ slot: spot.slot, kind: 'missile', tier: 1, branch: null, priority: 'first' }];
    s.enemies = [foeAt(spot.progress)];
    let total = 0;
    for (let i = 0; i < 100; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); total += s.shots.filter(sh => sh.slot === spot.slot && sh.interval > 0).length; }
    assert.ok(total >= 4, `overdrive silo must fire at empty stock, got ${total}`);
    assert.equal(s.ammo, 0);
  }
  console.log('7) ammo ruling: PASS (insufficient stock → no shot, no consumption, 3× retry; zero-ammo weapons and overdrive unaffected)');
}

/* ---- 8) point-defense keys + Bavar air-only multi-lock ---- */
{
  function duel(kind, tier, branch, ticks) {
    let slot = -1, prog = 0;
    for (let si = 0; si < SLOTS.length && slot < 0; si++) for (let p = 0; p <= 1; p += 0.005) {
      if (distance(SLOTS[si], positionAt(p)) <= 15) { slot = si; prog = p; break; }
    }
    let s = battleBase();
    s.towers = [{ slot, kind, tier, branch, priority: 'strongest' }];
    s.enemies = [{ id: 1, kind: 'destroyer', boss: 0, hp: 100000, maxHp: 100000, progress: prog, stun: 9999, specialClock: 0 }];
    const dPos = positionAt(prog);
    for (const c of [{ x: 1, y: 1 }, { x: 99, y: 1 }, { x: 1, y: 99 }, { x: 99, y: 99 }]) if (distance(c, SLOTS[slot]) > 20 && distance(c, dPos) > 40) { s.hero = { x: c.x, y: c.y, active: 0 }; break; }
    const shots = [];
    for (let i = 0; i < ticks; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); shots.push(...s.shots.filter(sh => sh.interval > 0)); }
    return { s, shots };
  }
  // MECH-B (checklist ۱٫۴): Bavar engages AIR ONLY — the old version of
  // this probe duelled a destroyer, which §۱٫۴'s target filter forbids.
  // Bavar must multi-lock the air target (3 missiles, 1 cadence record
  // per volley) and leave the destroyer completely untouched.
  {
    let s = battleBase();
    let slot = -1, prog = 0;
    for (let si = 0; si < SLOTS.length && slot < 0; si++) for (let p = 0; p <= 1; p += 0.005) {
      if (distance(SLOTS[si], positionAt(p)) <= 15) { slot = si; prog = p; break; }
    }
    s.towers = [{ slot, kind: 'air', tier: 4, branch: 0, priority: 'air' }];
    s.enemies = [
      { id: 1, kind: 'air', boss: 0, hp: 100000, maxHp: 100000, progress: 0.45, stun: 9999, specialClock: 0 },
      { id: 2, kind: 'destroyer', boss: 0, hp: 100000, maxHp: 100000, progress: prog, stun: 9999, specialClock: 0 },
    ];
    const dPos = positionAt(prog);
    for (const c of [{ x: 1, y: 1 }, { x: 99, y: 1 }, { x: 1, y: 99 }, { x: 99, y: 99 }]) if (distance(c, SLOTS[slot]) > 20 && distance(c, dPos) > 40) { s.hero = { x: c.x, y: c.y, active: 0 }; break; }
    const shots = [];
    for (let i = 0; i < 40; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); shots.push(...s.shots); }
    const bavarShots = shots.filter(sh => sh.modelKind === 'bavar');
    assert.ok(bavarShots.length >= 3, `bavar must have launched its volley, got ${bavarShots.length} records`);
    assert.ok(bavarShots.every(sh => sh.targetId === 1), 'every Bavar missile must lock an AIR target');
    assert.equal(bavarShots.filter(sh => sh.interval > 0).length * 3, bavarShots.length, 'exactly one cadence record per 3-missile volley');
    assert.equal(s.enemies[1].hp, 100000, 'destroyer must be untouched: Bavar never engages sea targets');
    assert.equal(s.enemies[1].intercept ?? 0, 0, 'no point-defense window may start from Bavar fire');
    assert.ok(s.enemies[0].hp < 100000, 'Bavar missiles must land on the air target');
    console.log(`8a) bavar air-only multi-lock: PASS (${bavarShots.length} missiles on the air target only, destroyer untouched)`);
  }
  const swarm = duel('missile', 4, 1, 40);
  assert.ok(swarm.shots.length >= 1, 'swarm must have fired');
  assert.ok(swarm.s.enemies[0].hp < 100000, 'Swarm missiles must NOT be intercepted — first impact deals full damage');
  assert.equal(swarm.s.enemies[0].intercept ?? 0, 0, 'no intercept window may start for Swarm');
  console.log(`8) point-defense keys: PASS (bavar air-only verified above; swarm landed for ${100000 - swarm.s.enemies[0].hp} dmg, no window)`);
}

/* ---- 9) pendingImpacts cleared when the battle ends ---- */
{
  let slot = -1;
  for (let si = 0; si < SLOTS.length; si++) { const d = distance(SLOTS[si], positionAt(0.98)); if (d >= 18 && d <= 25) { slot = si; break; } }
  assert.ok(slot >= 0, 'need a silo slot 18–25 units from the lane end');
  let s = battleBase();
  s.towers = [{ slot, kind: 'missile', tier: 1, branch: null, priority: 'first' }];
  s.enemies = [{ id: 1, kind: 'speed', boss: 0, hp: 100000, maxHp: 100000, progress: 0.98, stun: 0, specialClock: 0 }];
  let sawFlight = false;
  for (let i = 0; i < 30 && s.phase === 'battle'; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); if (s.pendingImpacts.length > 0) sawFlight = true; }
  assert.ok(sawFlight, 'a missile must have been in flight when the last enemy leaked');
  assert.notEqual(s.phase, 'battle', 'battle must have ended after the leak');
  assert.equal(s.pendingImpacts.length, 0, 'no orphan impact records may survive the end of the battle');
  console.log(`9) impact-queue hygiene: PASS (battle ended → phase ${s.phase}, queue empty)`);
}

/* ---- 10) fireStats: logic-side counters ---- */
{
  // shots counted at fire time; hits counted when the impacts resolve
  let s = battleBase();
  s.towers = [{ slot: 0, kind: 'cannon', tier: 1, branch: null, priority: 'first' }];
  s.enemies = [{ id: 1, kind: 'speed', boss: 0, hp: 100000, maxHp: 100000, progress: progressNear(0, 12), stun: 9999, specialClock: 0 }];
  let records = 0;
  for (let i = 0; i < 16; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); records += s.shots.filter(sh => sh.interval > 0).length; }
  assert.equal(s.fireStats.autocannon?.shots, records, 'fireStats shots must equal the emitted shot records');
  s = tick({ ...s, towers: [] }, 8); // drain in-flight shots
  assert.equal(s.fireStats.autocannon.hits, records, 'every landed shot must be counted as a hit at resolution');
  assert.equal(s.fireStats.autocannon.fizzled, 0);
  // fizzle: target teleports out of range mid-flight → counted as fizzled, not hit
  let s2 = battleBase();
  s2.towers = [{ slot: 9, kind: 'missile', tier: 1, branch: null, priority: 'first' }];
  s2.enemies = [{ id: 1, kind: 'speed', boss: 0, hp: 100000, maxHp: 100000, progress: progressNear(9, 15), stun: 9999, specialClock: 0 }];
  for (let i = 0; i < 10 && (s2.fireStats.silo?.shots ?? 0) === 0; i++) s2 = gameReducer(s2, { type: 'tick', dt: 0.125 });
  assert.equal(s2.fireStats.silo?.shots, 1);
  s2 = { ...s2, enemies: s2.enemies.map(e => ({ ...e, progress: 0.02 })) };
  s2 = tick(s2, 40);
  assert.equal(s2.fireStats.silo.fizzled, 1, 'out-of-range arrival must count as fizzled');
  assert.equal(s2.fireStats.silo.hits, 0);
  // pirate-engagement records are visual only: they must not inflate tower counters
  const { piratePosition } = G;
  let s3 = battleBase();
  let pSlot = -1, pProg = 0;
  for (let p = 0.02; p <= 0.98 && pSlot < 0; p += 0.01) for (let si = 0; si < SLOTS.length; si++) {
    if (distance(SLOTS[si], piratePosition({ id: 50, progress: p, hp: 500 })) < 17) { pSlot = si; pProg = p; break; }
  }
  assert.ok(pSlot >= 0, 'need a slot covering the pirate lane');
  s3.towers = [{ slot: pSlot, kind: 'cannon', tier: 1, branch: null, priority: 'first' }];
  s3.pirates = [{ id: 50, progress: pProg, hp: 5000 }];
  let pirateRecords = 0;
  for (let i = 0; i < 8; i++) { s3 = gameReducer(s3, { type: 'tick', dt: 0.125 }); pirateRecords += s3.shots.filter(sh => sh.damage === 0 && sh.interval === 0).length; }
  assert.ok(pirateRecords > 0, 'pirate engagement must still emit its FX records');
  assert.equal(s3.fireStats.autocannon?.shots ?? 0, 0, 'pirate records must not count as tower shots');
  console.log('10) fireStats: PASS (shots at fire time, hits/fizzled at resolution, pirate records excluded)');
}

console.log('\nALL ROOT PROBES PASSED');
