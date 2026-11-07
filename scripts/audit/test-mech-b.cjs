/* MECH-B acceptance probes (fix program, wave 1) —
 * run: node scripts/audit/test-mech-b.cjs
 *
 * 1) MLRS salvo cycle (checklist ۱٫۲): 12 rockets at the 1/9s salvo gap,
 *    then a 3.2s reload silence — counted from shot records over 13s,
 *    plus the tower's cycle state (salvoLeft/cooldown) and cycle-average
 *    towerDps.
 * 2) Swarm multi-lock (checklist ۱٫۳): one cycle = 4 missiles distributed
 *    over distinct targets (wrap onto the same targets when fewer), one
 *    cadence record per volley, and NO leftover +70% splash at impact.
 * 3) Bavar holds fire against sea-only targets (checklist ۱٫۴ air-only;
 *    the live multi-lock case is ROOT probe 8a).
 * 4) Enemy missiles + CIWS (checklist ۲٫۶ / ۱٫۱): a destroyer launches a
 *    real state-tracked missile at a tower; a CIWS intercepts it (tower
 *    never stunned); with 4 simultaneous missiles the CIWS budget stops
 *    at exactly 3 intercepts per 5s and the 4th disables its tower.
 *    Controls: no CIWS → the missile lands and stuns for 4s; an EMP
 *    weapon-down stamp (MECH-A contract) and plain stun both silence the
 *    destroyer.
 * 5) Boss 2 (checklist ۲٫۲): the tower stun arrives BY MISSILE — no
 *    towerStuns before the missile lands, 4s stun after.
 * 6) Boss ability clock runs on effective time (audit جدید-۱۵): frozen
 *    under stun, quarter-rate under a tier-4 boat slow aura.
 * 7) Boss reinforcements (studio ruling; audit جدید-۱۶/۱۷): capped at 40
 *    per boss, spawned fanned out (not stacked), worth 25% bounty and
 *    no combo; a normal kill still pays full bounty + combo.
 * 8) Boss ability events (MECH-B): boss-spawn and Titan shield-up/down
 *    transitions are emitted as BattleEvent records.
 */
const assert = require('node:assert/strict');
const { load } = require('../load-game.cjs');
const G = load('src/lib/game.ts');
const W = load('src/lib/weapons-spec.ts');
const { initialGame, gameReducer, towerDps, positionAt, enemyPosition, distance, SLOTS, getRange, applyDamage } = G;

function battleBase() {
  const g = initialGame();
  Object.assign(g, { cash: 100000, ammo: 5000, phase: 'battle', wave: 3, speed: 1, spawnRemaining: 0, spawnClock: 0, hearts: 20 });
  g.buildings.power = 50; // grid = 1
  g.hero = { x: 2, y: 95, active: 0 }; // parked far away: no aura, no hero fire
  return g;
}
const tick = (s, n = 1, dt = 0.125) => { for (let i = 0; i < n; i++) s = gameReducer(s, { type: 'tick', dt }); return s; };
function parkHeroFar(s, ...points) {
  for (const c of [{ x: 1, y: 1 }, { x: 99, y: 1 }, { x: 1, y: 99 }, { x: 99, y: 99 }, { x: 50, y: 1 }, { x: 50, y: 99 }]) {
    if (points.every(p => distance(c, p) > 42)) { s.hero = { x: c.x, y: c.y, active: 0 }; return; }
  }
  throw new Error('hero park failed');
}
function spotFor(tower, maxFrac = 0.8) {
  for (let si = 0; si < SLOTS.length; si++) {
    const t = { ...tower, slot: si };
    const range = getRange(battleBase(), t);
    for (let p = 0.02; p <= 0.98; p += 0.004) {
      const d = distance(SLOTS[si], positionAt(p));
      if (d <= range * maxFrac && distance(SLOTS[si], { x: 2, y: 95 }) > 18) return { slot: si, progress: p };
    }
  }
  throw new Error('no spot for ' + tower.kind);
}
const foe = (id, kind, progress, extra = {}) => ({ id, kind, boss: 0, hp: 1e12, maxHp: 1e12, progress, stun: 1e7, specialClock: 0, ...extra });

/* ---- 1) MLRS salvo cycle ---- */
{
  const spot = spotFor({ kind: 'heavy', tier: 4, branch: 0 });
  let s = battleBase();
  s.towers = [{ slot: spot.slot, kind: 'heavy', tier: 4, branch: 0, priority: 'first' }];
  s.enemies = [foe(1, 'speed', spot.progress)];
  parkHeroFar(s, SLOTS[spot.slot], positionAt(spot.progress));
  const times = [];
  let sawReloadState = false;
  for (let i = 1; i <= 104; i++) { // 13 battle-seconds
    s = gameReducer(s, { type: 'tick', dt: 0.125 });
    for (const sh of s.shots) if (sh.modelKind === 'mlrs') times.push(i * 0.125);
    const tw = s.towers[0];
    if (tw.salvoLeft === 12 && (tw.cooldown ?? 0) > 2.5) sawReloadState = true;
  }
  assert.ok(times.length >= 34 && times.length <= 38, `expected 36 rockets (3 salvos) in 13s, got ${times.length}`);
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  assert.equal(gaps.filter(g => g >= 3.0).length, 2, 'exactly two reload silences (after salvo 1 and 2) of >= 3s');
  assert.ok(gaps.every(g => g >= 3.0 || g <= 0.26), `inside a salvo rockets must be <= 0.26s apart (tick-quantized 1/9s), gaps: ${gaps.map(g => g.toFixed(2)).join(',')}`);
  assert.equal(times.filter(t => t >= 2.0 && t <= 4.0).length, 0, 'the reload window [2s, 4s] must be completely silent');
  assert.equal(s.ammo, 5000 - times.length, 'ammo must be consumed per rocket (1/rocket)');
  assert.ok(sawReloadState, 'tower must expose its reload state (salvoLeft back to 12 with cooldown > 2.5s)');
  const dps = towerDps(battleBase(), { slot: 0, kind: 'heavy', tier: 4, branch: 0, priority: 'first' });
  const expectedDps = 60 * 1.16 * 12 / W.salvoCycleSeconds(W.weaponSpec('heavy', 4, 0));
  assert.ok(Math.abs(dps - expectedDps) < 0.5, `MLRS towerDps must be the cycle average ${expectedDps.toFixed(1)}, got ${dps.toFixed(1)}`);
  console.log(`1) MLRS salvo: PASS (${times.length} rockets in 13s = 3 salvos of 12, 2 reload silences >= 3s, in-salvo gap <= 0.26s, reload state visible, towerDps ${dps.toFixed(1)})`);
}

/* ---- 2) Swarm multi-lock ---- */
{
  const spot = spotFor({ kind: 'missile', tier: 4, branch: 1 });
  const mk = () => {
    const s = battleBase();
    s.towers = [{ slot: spot.slot, kind: 'missile', tier: 4, branch: 1, priority: 'first' }];
    parkHeroFar(s, SLOTS[spot.slot], positionAt(spot.progress));
    return s;
  };
  // three targets in range: 4 missiles over 3 distinct locks (2/1/1)
  {
    let s = mk();
    s.enemies = [foe(1, 'speed', spot.progress), foe(2, 'speed', spot.progress + 0.01), foe(3, 'speed', spot.progress + 0.02)];
    s = gameReducer(s, { type: 'tick', dt: 0.125 });
    const recs = s.shots.filter(sh => sh.modelKind === 'swarm');
    assert.equal(recs.length, 4, `one swarm cycle must launch 4 missiles, got ${recs.length}`);
    const counts = {};
    for (const r of recs) counts[r.targetId] = (counts[r.targetId] ?? 0) + 1;
    assert.deepEqual(Object.values(counts).sort(), [1, 1, 2], 'missiles must spread over distinct targets, wrapping onto the first');
    assert.equal(recs.filter(r => r.interval > 0).length, 1, 'exactly one cadence record per volley');
    assert.equal(s.pendingImpacts.length, 4, 'all 4 missiles must be independently in flight');
    assert.equal(s.fireStats.swarm?.shots, 1, 'fireStats counts the volley as one firing event');
    console.log('2a) swarm multi-lock: PASS (4 missiles over 3 targets as 2/1/1, 1 cadence record, 4 independent impacts queued)');
  }
  // one target: all 4 wrap onto it; impact damage is pure per-missile (no splash)
  {
    let s = mk();
    const pA = spot.progress, pB = spot.progress + 0.012; // ~1-2 units apart: inside the OLD 9-unit splash radius
    s.enemies = [foe(1, 'speed', pA), foe(2, 'speed', pB)];
    parkHeroFar(s, positionAt(pA), positionAt(pB));
    s = gameReducer(s, { type: 'tick', dt: 0.125 });
    const recs = s.shots.filter(sh => sh.modelKind === 'swarm');
    assert.equal(recs.length, 4);
    assert.deepEqual(recs.map(r => r.targetId).sort(), [1, 1, 2, 2], 'two targets split the volley 2/2');
    s = tick({ ...s, towers: [] }, 40); // drain flights with the tower gone
    assert.equal(s.pendingImpacts.length, 0, 'impact queue must drain');
    for (const e of s.enemies) {
      const loss = 1e12 - e.hp;
      assert.ok(loss >= 760 && loss % 380 === 0, `target ${e.id} must lose exact per-missile damage (380 x N, crits x2), lost ${loss} — any +70% splash (266) breaks this`);
    }
    console.log(`2b) swarm no-splash: PASS (each target lost exactly its own locked missiles: ${s.enemies.map(e => 1e12 - e.hp).join(' / ')})`);
  }
}

/* ---- 3) Bavar holds fire vs sea-only ---- */
{
  const spot = spotFor({ kind: 'air', tier: 4, branch: 0 });
  let s = battleBase();
  s.towers = [{ slot: spot.slot, kind: 'air', tier: 4, branch: 0, priority: 'air' }];
  s.enemies = [foe(1, 'speed', spot.progress)];
  parkHeroFar(s, SLOTS[spot.slot], positionAt(spot.progress));
  let recs = 0;
  for (let i = 0; i < 40; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); recs += s.shots.filter(sh => sh.slot === spot.slot).length; }
  assert.equal(recs, 0, 'Bavar must never fire at a sea target (air-only)');
  console.log('3) bavar air-only hold-fire: PASS (0 shots at a sea target in 5s)');
}

/* ---- 4) enemy missiles + CIWS interception ---- */
function findInterceptGeometry() {
  const base = battleBase();
  for (let bi = 0; bi < SLOTS.length; bi++) {
    const rangeB = getRange(base, { slot: bi, kind: 'cannon', tier: 4, branch: 0, priority: 'first' });
    for (let ai = 0; ai < SLOTS.length; ai++) {
      if (ai === bi || distance(SLOTS[ai], SLOTS[bi]) > 26) continue;
      for (let p = 0.02; p <= 0.9; p += 0.004) {
        const dPos = positionAt(Math.min(0.98, p + 0.09)); // destroyer position at first launch (t = 5s)
        const dA = distance(dPos, SLOTS[ai]), dB = distance(dPos, SLOTS[bi]);
        if (dA > 22 || dA >= dB) continue;
        let covered = true;
        for (const t of [0.3, 0.5, 0.7]) {
          const sample = { x: dPos.x + (SLOTS[ai].x - dPos.x) * t, y: dPos.y + (SLOTS[ai].y - dPos.y) * t };
          if (distance(SLOTS[bi], sample) > rangeB - 3) { covered = false; break; }
        }
        if (covered) return { targetSlot: ai, ciwsSlot: bi, progress: p };
      }
    }
  }
  throw new Error('no intercept geometry found');
}
{
  const geo = findInterceptGeometry();
  // 4a) one destroyer, one CIWS: the missile exists in state, is intercepted, tower never stunned
  {
    let s = battleBase();
    s.towers = [
      { slot: geo.targetSlot, kind: 'missile', tier: 1, branch: null, priority: 'first' },
      { slot: geo.ciwsSlot, kind: 'cannon', tier: 4, branch: 0, priority: 'first' },
    ];
    s.enemies = [{ id: 1, kind: 'destroyer', boss: 0, hp: 1e9, maxHp: 1e9, progress: geo.progress, stun: 0, specialClock: 0 }];
    parkHeroFar(s, SLOTS[geo.targetSlot], SLOTS[geo.ciwsSlot], positionAt(geo.progress));
    let launches = 0, intercepts = 0, sawMissile = false, everStunned = false;
    for (let i = 0; i < 72; i++) { // 9s: exactly one launch (t=5s)
      s = gameReducer(s, { type: 'tick', dt: 0.125 });
      launches += s.events.filter(e => e.type === 'enemy-missile').length;
      intercepts += s.events.filter(e => e.type === 'intercept').length;
      if (s.enemyMissiles.length > 0) sawMissile = true;
      if (Object.keys(s.towerStuns).length > 0) everStunned = true;
    }
    assert.equal(launches, 1, `destroyer must launch exactly 1 missile in 9s, got ${launches}`);
    assert.ok(sawMissile, 'the enemy missile must exist as a state entity in flight');
    assert.equal(intercepts, 1, 'CIWS must intercept the missile');
    assert.equal(everStunned, false, 'no tower may be stunned while the CIWS covers the path');
    console.log('4a) destroyer missile + CIWS intercept: PASS (1 launch at 5s, missile tracked in state, intercepted, zero tower stuns)');
  }
  // 4b) four destroyers at once: budget = exactly 3 intercepts, the 4th missile disables its tower
  {
    let s = battleBase();
    s.towers = [
      { slot: geo.targetSlot, kind: 'missile', tier: 1, branch: null, priority: 'first' },
      { slot: geo.ciwsSlot, kind: 'cannon', tier: 4, branch: 0, priority: 'first' },
    ];
    s.enemies = [0, 1, 2, 3].map(k => ({ id: 10 + k, kind: 'destroyer', boss: 0, hp: 1e9, maxHp: 1e9, progress: geo.progress + k * 0.006, stun: 0, specialClock: 0 }));
    parkHeroFar(s, SLOTS[geo.targetSlot], SLOTS[geo.ciwsSlot], positionAt(geo.progress));
    let launches = 0, intercepts = 0, disabled = 0, maxStun = 0;
    for (let i = 0; i < 76; i++) { // 9.5s: first volley resolved, second (t=10s) excluded
      s = gameReducer(s, { type: 'tick', dt: 0.125 });
      launches += s.events.filter(e => e.type === 'enemy-missile').length;
      intercepts += s.events.filter(e => e.type === 'intercept').length;
      disabled += s.events.filter(e => e.type === 'tower-disabled').length;
      for (const v of Object.values(s.towerStuns)) maxStun = Math.max(maxStun, v);
    }
    assert.equal(launches, 4, `all four destroyers must launch at t=5s, got ${launches}`);
    assert.equal(intercepts, 3, `CIWS budget is exactly 3 intercepts per 5s window, got ${intercepts}`);
    assert.equal(disabled, 1, 'the 4th (unintercepted) missile must disable its tower');
    assert.ok(maxStun >= 3.9, `the disabled tower must take the full 4s stun, max seen ${maxStun}`);
    console.log('4b) CIWS budget cap: PASS (4 launches → exactly 3 intercepts, 4th missile disabled its tower for 4s)');
  }
  // 4c) no CIWS: the missile lands and stuns the target tower for 4s
  {
    let s = battleBase();
    s.towers = [{ slot: geo.targetSlot, kind: 'missile', tier: 1, branch: null, priority: 'first' }];
    s.enemies = [{ id: 1, kind: 'destroyer', boss: 0, hp: 1e9, maxHp: 1e9, progress: geo.progress, stun: 0, specialClock: 0 }];
    parkHeroFar(s, SLOTS[geo.targetSlot], positionAt(geo.progress));
    let launches = 0, disabled = 0, maxStun = 0, sawMissile = false;
    for (let i = 0; i < 72; i++) {
      s = gameReducer(s, { type: 'tick', dt: 0.125 });
      launches += s.events.filter(e => e.type === 'enemy-missile').length;
      disabled += s.events.filter(e => e.type === 'tower-disabled' && e.slot === geo.targetSlot).length;
      if (s.enemyMissiles.length > 0) sawMissile = true;
      maxStun = Math.max(maxStun, s.towerStuns[geo.targetSlot] ?? 0);
    }
    assert.equal(launches, 1); assert.ok(sawMissile);
    assert.equal(disabled, 1, 'without a CIWS the missile must reach the tower');
    assert.ok(maxStun >= 3.9, `tower stun must be the full 4s, max seen ${maxStun}`);
    console.log('4c) unintercepted missile: PASS (lands on the target tower, 4.0s stun)');
  }
  // 4d) silenced destroyers never launch: EMP weapon-down stamp (MECH-A contract) and plain stun
  for (const [label, extra] of [['weapon-down stamp', { weaponDownUntil: 1e9 }], ['stun', { stun: 1e7 }]]) {
    let s = battleBase();
    s.towers = [{ slot: geo.targetSlot, kind: 'missile', tier: 1, branch: null, priority: 'first' }];
    s.enemies = [{ id: 1, kind: 'destroyer', boss: 0, hp: 1e9, maxHp: 1e9, progress: geo.progress, stun: 0, specialClock: 0, ...extra }];
    parkHeroFar(s, SLOTS[geo.targetSlot], positionAt(geo.progress));
    let launches = 0;
    for (let i = 0; i < 96; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); launches += s.events.filter(e => e.type === 'enemy-missile').length; }
    assert.equal(launches, 0, `destroyer under ${label} must not fire in 12s`);
    assert.equal(s.enemyMissiles.length, 0);
  }
  console.log('4d) silenced destroyer: PASS (weapon-down stamp and stun both → 0 launches in 12s)');
}

/* ---- 5) Boss 2: stun arrives by missile ---- */
{
  let s = battleBase();
  s.wave = 10;
  s.towers = [{ slot: 0, kind: 'missile', tier: 1, branch: null, priority: 'first' }];
  s.enemies = [{ id: 1, kind: 'boss', boss: 2, hp: 1e9, maxHp: 1e9, progress: 0.3, stun: 0, specialClock: 0 }];
  parkHeroFar(s, enemyPosition(s.enemies[0]));
  let sawLaunchEvent = false, sawMissile = false, stunnedBeforeLanding = false, maxStun = 0, landed = false;
  for (let i = 0; i < 160; i++) { // 20s: ability at 15s + flight <= 1.8s
    s = gameReducer(s, { type: 'tick', dt: 0.125 });
    if (s.events.some(e => e.type === 'boss-stun')) sawLaunchEvent = true;
    if (s.enemyMissiles.some(m => m.source === 'boss')) sawMissile = true;
    if (s.events.some(e => e.type === 'tower-disabled')) landed = true;
    if (!landed && Object.keys(s.towerStuns).length > 0) stunnedBeforeLanding = true;
    maxStun = Math.max(maxStun, s.towerStuns[0] ?? 0);
  }
  assert.ok(sawLaunchEvent, 'boss 2 must emit its boss-stun launch event');
  assert.ok(sawMissile, 'boss 2 must launch a real missile entity (source=boss)');
  assert.equal(stunnedBeforeLanding, false, 'NO direct stun: towerStuns must stay empty until the missile lands');
  assert.ok(landed && maxStun >= 3.9, `the missile must land and stun for 4s (landed=${landed}, maxStun=${maxStun})`);
  console.log('5) boss-2 missile stun: PASS (launch event + missile entity, stun only on impact, 4.0s)');
}

/* ---- 6) boss ability clock = effective time ---- */
{
  // stunned solid: clock frozen, no adds
  let s = battleBase();
  s.enemies = [{ id: 1, kind: 'boss', boss: 1, hp: 1e9, maxHp: 1e9, progress: 0.35, stun: 1e7, specialClock: 0 }];
  parkHeroFar(s, positionAt(0.35));
  s = tick(s, 24); // 3s
  assert.equal(s.enemies[0].specialClock, 0, 'a fully stunned boss must not advance its ability clock');
  assert.equal(s.enemies.length, 1, 'a stunned boss spawns nothing');
  // slowed to 0.25 by a tier-4 boat aura: clock advances at quarter rate, like movement
  const spot = spotFor({ kind: 'boat', tier: 4, branch: 0 });
  let s2 = battleBase();
  s2.towers = [{ slot: spot.slot, kind: 'boat', tier: 4, branch: 0, priority: 'first' }];
  s2.enemies = [{ id: 1, kind: 'boss', boss: 1, hp: 1e12, maxHp: 1e12, progress: spot.progress, stun: 0, specialClock: 0 }];
  parkHeroFar(s2, SLOTS[spot.slot], positionAt(spot.progress));
  const p0 = s2.enemies[0].progress;
  s2 = tick(s2, 32); // 4s
  const boss = s2.enemies.find(e => e.kind === 'boss');
  assert.ok(Math.abs(boss.specialClock - 1.0) < 0.14, `under a 0.25 slow the ability clock must advance ~1.0s in 4s, got ${boss.specialClock.toFixed(2)}`);
  assert.ok(Math.abs((boss.progress - p0) - 0.011) < 0.004, `movement and clock share the effective time: progress +${(boss.progress - p0).toFixed(3)} in 4s`);
  console.log(`6) boss clock = effective time: PASS (stunned → 0.00 in 3s; slowed x0.25 → clock ${boss.specialClock.toFixed(2)}s / progress +${(boss.progress - p0).toFixed(3)} in 4s)`);
}

/* ---- 7+8) boss adds: spread, cap, bounty/combo ruling, events ---- */
{
  let s = battleBase();
  s.wave = 5;
  s.enemies = [{ id: 1, kind: 'boss', boss: 1, hp: 1e9, maxHp: 1e9, progress: 0.35, stun: 0, specialClock: 0 }];
  parkHeroFar(s, positionAt(0.35));
  const events = [];
  let guard = 0;
  while (s.enemies.length < 7 && guard++ < 200) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); events.push(...s.events); }
  const boss = s.enemies.find(e => e.kind === 'boss');
  const adds = s.enemies.filter(e => e.isAdd);
  assert.equal(adds.length, 6, `boss 1 must spawn 4 speed + 2 air, got ${adds.length}`);
  assert.equal(boss.addsSpawned, 6);
  assert.ok(adds.every(a => a.isAdd === true), 'every reinforcement must carry the isAdd flag');
  const progs = adds.map(a => a.progress);
  assert.ok(Math.max(...progs) - Math.min(...progs) >= 0.05, `adds must fan out around the boss (span ${(Math.max(...progs) - Math.min(...progs)).toFixed(3)}), not stack on one point`);
  const spawnEvent = events.find(e => e.type === 'boss-spawn');
  assert.ok(spawnEvent && spawnEvent.count === 6 && spawnEvent.enemyId === 1, 'a boss-spawn battle event (count 6) must be emitted');
  // bounty/combo ruling: an add pays 25% and never touches the combo
  const speedAdd = adds.find(a => a.kind === 'speed');
  s.combo = 3; s.comboTimer = 3;
  const cashBefore = s.cash;
  applyDamage(s, speedAdd, 1e12, { kind: 'hero' });
  s = gameReducer(s, { type: 'tick', dt: 0.125 });
  const expectedAddPay = Math.round(Math.round(35 * Math.pow(1.1, 5)) * 0.25); // 56 -> 14
  assert.equal(s.cash - cashBefore, expectedAddPay, `add kill must pay exactly 25% bounty (${expectedAddPay}), got ${s.cash - cashBefore}`);
  assert.equal(s.combo, 3, 'an add kill must not increment the combo');
  // a normal kill still pays full bounty and feeds the combo
  let s2 = battleBase();
  s2.wave = 5;
  s2.enemies = [foe(1, 'speed', 0.3, { stun: 0 })];
  parkHeroFar(s2, positionAt(0.3));
  const cash2 = s2.cash;
  applyDamage(s2, s2.enemies[0], 1e12, { kind: 'hero' });
  s2 = gameReducer(s2, { type: 'tick', dt: 0.125 });
  assert.equal(s2.cash - cash2, Math.round(35 * Math.pow(1.1, 5)), 'a normal kill must pay the full class bounty');
  assert.equal(s2.combo, 1, 'a normal kill must start the combo');
  // cap: 39 already spawned -> only 1 more ever
  let s3 = battleBase();
  s3.enemies = [{ id: 1, kind: 'boss', boss: 1, hp: 1e9, maxHp: 1e9, progress: 0.35, stun: 0, specialClock: 9.9, addsSpawned: 39 }];
  parkHeroFar(s3, positionAt(0.35));
  s3 = tick(s3, 2); // first ability trigger: room for exactly 1
  assert.equal(s3.enemies.filter(e => e.isAdd).length, 1, 'only the 1 remaining add may spawn');
  s3 = tick(s3, 200); // 25s more: further ability cycles must spawn nothing
  assert.equal(s3.enemies.find(e => e.kind === 'boss').addsSpawned, 40, 'adds must stop at the 40 cap');
  console.log('7) boss adds ruling: PASS (6 fanned adds span >= 0.05, spawn event emitted, add pays 14 = 25% of 56 with combo untouched, normal kill pays 56 + combo, cap 40 enforced)');
}

/* ---- 8b) Titan shield events follow the effective-time clock ---- */
{
  let s = battleBase();
  s.enemies = [{ id: 1, kind: 'boss', boss: 3, hp: 1e9, maxHp: 1e9, progress: 0.35, stun: 0, specialClock: 0 }];
  parkHeroFar(s, positionAt(0.35));
  let downAt = -1, upAt = -1;
  for (let i = 1; i <= 128; i++) { // 16s: shield down at 10s, back up at the 15s wrap
    s = gameReducer(s, { type: 'tick', dt: 0.125 });
    for (const e of s.events) {
      if (e.type === 'shield-down' && downAt < 0) downAt = i * 0.125;
      if (e.type === 'shield-up' && downAt > 0 && upAt < 0) upAt = i * 0.125;
    }
  }
  assert.ok(downAt >= 9.8 && downAt <= 10.3, `shield-down event must fire at ~10s, got ${downAt}`);
  assert.ok(upAt >= 14.8 && upAt <= 15.3, `shield-up event must fire at the ~15s wrap, got ${upAt}`);
  assert.equal(s.enemies[0].shieldUp, true, 'shield state flag must track the cycle');
  console.log(`8) boss ability events: PASS (shield-down at ${downAt}s, shield-up at ${upAt}s, boss-spawn covered in probe 7)`);
}

console.log('\nALL MECH-B PROBES PASSED');
