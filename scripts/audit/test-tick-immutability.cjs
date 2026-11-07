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

console.log('\nALL ROOT PROBES PASSED');
