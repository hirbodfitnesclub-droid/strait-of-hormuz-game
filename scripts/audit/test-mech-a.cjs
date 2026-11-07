/* MECH-A acceptance probes (fix program, wave 1) — run: node scripts/audit/test-mech-a.cjs
 *
 * 1) EMP pulse: every 2s — spec damage to all in range, 60% slow, and 4s
 *    of weaponDownUntil / radarDownUntil (the MECH-B contract fields);
 *    the EMP tower emits NO ordinary shots, only pulse records.
 * 2) Sonar hack: after 8s the nearest air enemy in range is hacked for
 *    10s — it stops advancing, is not targeted, and damages its former
 *    fleet; on expiry it reverts and advances again.
 * 3) Sub detection: a healthy sonar hub reveals subs map-wide (a boat
 *    tower out of its own range can engage through it); a STUNNED sonar
 *    hub reveals nothing (audit team-3b fix in canSeeSub).
 * 4) Garrison boats: 3 real entities deploy at the lane station, their
 *    shots originate at the boats (boatId + boat position, never the
 *    tower), a surface enemy is physically BLOCKED at the station, boats
 *    take return fire, die, and redeploy after the respawn delay.
 * 5) Torpedo squadron: 5 boats; a heavy ship inside the engagement radius
 *    is pinned 100% (a light ship is not); torpedoes never target subs.
 * 6) Mine branch: automatic minefield fills to the 10-mine cap on the
 *    lane inside tower range (spec ammo per mine), a mine detonates on
 *    contact for spec blast damage and is replanted; the Ghadir hunter
 *    sub fires the branch's shots with submarine priority.
 * 7) Tick immutability with the new entities deployed (deep-freeze).
 */
const assert = require('node:assert/strict');
const { load } = require('../load-game.cjs');
const G = load('src/lib/game.ts');
const W = load('src/lib/weapons-spec.ts');
const { initialGame, gameReducer, distance, positionAt, enemyPosition, getRange, laneStationProgress, boatPosition, SLOTS } = G;

function battleBase() {
  const g = initialGame();
  Object.assign(g, { cash: 100000, ammo: 5000, phase: 'battle', wave: 3, speed: 1, spawnRemaining: 0, spawnClock: 0, hearts: 20 });
  g.buildings.power = 50; // grid = 1
  g.hero = { x: 2, y: 95, active: 0 }; // parked far away: no aura, no hero fire
  return g;
}
const tick = (s, n = 1, dt = 0.125) => { for (let i = 0; i < n; i++) s = gameReducer(s, { type: 'tick', dt }); return s; };
const foe = (id, kind, progress, extra = {}) => ({ id, kind, boss: 0, hp: 100000, maxHp: 100000, progress, stun: 0, specialClock: 0, ...extra });
function progressNear(slotIdx, maxDist) {
  const slot = SLOTS[slotIdx];
  for (let p = 0; p <= 1; p += 0.002) if (distance(slot, positionAt(p)) <= maxDist) return p;
  throw new Error('no lane point near slot ' + slotIdx);
}
function deepFreeze(o, seen = new Set()) {
  if (o && typeof o === 'object' && !seen.has(o)) { seen.add(o); for (const v of Object.values(o)) deepFreeze(v, seen); Object.freeze(o); }
  return o;
}

/* ---- 1) EMP pulse ---- */
{
  const tower = { slot: 9, kind: 'ew', tier: 4, branch: 0, priority: 'first' };
  const prog = progressNear(9, 12);
  let s = battleBase();
  s.towers = [tower];
  s.enemies = [foe(1, 'speed', prog), foe(2, 'corvette', prog)];
  s = tick(s, 8); // 1s: charge not ready
  assert.equal(s.enemies[0].hp, 100000, 'no pulse before 2s');
  assert.equal(s.shots.filter(sh => sh.slot === 9).length, 0, 'EMP tower must emit no shots before the first pulse');
  s = tick(s, 8); // 2s: first pulse
  const pulses = s.shots.filter(sh => sh.slot === 9);
  assert.equal(pulses.length, 1, 'exactly one pulse at t=2s');
  assert.equal(pulses[0].targetId, -1, 'pulse record is an area record (targetId -1)');
  assert.equal(pulses[0].interval, 2, 'pulse period = spec interval 2s');
  assert.equal(s.battleTime, 2, 'the shared battle clock must read 2.0 after 16 ticks at speed 1');
  for (const e of s.enemies) {
    assert.equal(e.hp, 100000 - 40, `pulse must deal exactly the spec 40 damage, enemy at ${e.hp}`);
    // contract stamps are ABSOLUTE battleTime values: down while battleTime < stamp
    assert.ok(Math.abs((e.weaponDownUntil ?? 0) - (s.battleTime + 4)) < 0.01, `weaponDownUntil must be battleTime+4 (${s.battleTime + 4}), got ${e.weaponDownUntil}`);
    assert.ok(Math.abs((e.radarDownUntil ?? 0) - (s.battleTime + 4)) < 0.01, `radarDownUntil must be battleTime+4 (${s.battleTime + 4}), got ${e.radarDownUntil}`);
    assert.ok((e.empSlow ?? 0) > 3.5, `empSlow must be running, got ${e.empSlow}`);
  }
  // slow measurement: 15 ticks of movement under the pulse vs an untouched control
  const slowedFrom = s.enemies[0].progress;
  s = tick(s, 15);
  const slowedDelta = s.enemies[0].progress - slowedFrom;
  let c = battleBase();
  c.enemies = [foe(1, 'speed', prog)];
  c = tick(c, 15);
  assert.equal(c.enemies[0].weaponDownUntil, undefined, 'an enemy never pulsed carries NO stamp — absent stamp = weapon up (MECH-B gate)');
  assert.equal(c.enemies[0].radarDownUntil, undefined, 'an enemy never pulsed carries NO radar stamp');
  const controlDelta = c.enemies[0].progress - prog;
  const ratio = slowedDelta / controlDelta;
  assert.ok(Math.abs(ratio - 0.4) < 0.06, `EMP slow must be ×0.4 movement, measured ratio ${ratio.toFixed(3)}`);
  s = tick(s, 1); // t=4s: second pulse
  assert.equal(s.enemies[0].hp, 100000 - 80, 'second pulse at t=4s deals another 40');
  // no pulse without targets in range: charge holds at the period (a far
  // enemy keeps the battle running but stays outside the pulse radius)
  let idle = battleBase();
  idle.towers = [tower];
  let farProg = -1;
  for (let p = 0; p <= 1; p += 0.002) if (distance(SLOTS[9], positionAt(p)) > 30) { farProg = p; break; }
  assert.ok(farProg >= 0, 'need a lane point far from the EMP tower');
  idle.enemies = [foe(1, 'speed', farProg, { stun: 9999 })];
  idle = tick(idle, 40);
  assert.equal(idle.phase, 'battle');
  assert.equal(idle.shots.filter(sh => sh.slot === 9).length, 0, 'no pulses with nothing in range');
  assert.equal(idle.towers[0].abilityClock, 2, 'pulse charge holds at the 2s threshold');
  console.log(`1) EMP pulse: PASS (40 dmg @2s cadence, weapon/radar down ~4s, movement ×${ratio.toFixed(2)}, no ordinary shots, charge holds empty)`);
}

/* ---- 2) sonar hack ---- */
{
  const sonarTower = { slot: 0, kind: 'ew', tier: 4, branch: 1, priority: 'air' };
  const range = getRange(battleBase(), sonarTower);
  // find: an air position in sonar range + a sea position within hack-engage
  // of it but OUTSIDE sonar range (so only the hacked drone can hurt it)
  let setup = null;
  for (let si = 0; si < SLOTS.length && !setup; si++) {
    const t = { ...sonarTower, slot: si };
    const r = getRange(battleBase(), t);
    for (let pa = 0.05; pa <= 0.95 && !setup; pa += 0.01) {
      const airPos = enemyPosition(foe(1, 'air', pa), 'landscape');
      if (distance(SLOTS[si], airPos) > r * 0.8) continue;
      for (let ps = 0.02; ps <= 0.98; ps += 0.004) {
        const seaPos = positionAt(ps);
        const dAir = distance(airPos, seaPos);
        if (dAir >= 4 && dAir <= 10 && distance(SLOTS[si], seaPos) > r) { setup = { slot: si, pa, ps }; break; }
      }
    }
  }
  assert.ok(setup, 'geometry for the hack test not found');
  let s = battleBase();
  s.towers = [{ ...sonarTower, slot: setup.slot }];
  s.enemies = [foe(1, 'air', setup.pa)];
  let hackTick = -1;
  for (let i = 1; i <= 80 && hackTick < 0; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); if ((s.enemies[0].hackTimer ?? 0) > 0) hackTick = i; }
  assert.ok(hackTick >= 60 && hackTick <= 68, `hack must land at ~8s (tick 64), landed at tick ${hackTick}`);
  // segment A (hub still active): the hacked drone freezes and no tower
  // may target it — its HP must not move while it sits inside sonar range
  const frozenProgress = s.enemies[0].progress, frozenHp = s.enemies[0].hp;
  s = tick(s, 16); // 2s of hacked service under an active hub
  assert.equal(s.enemies[0].progress, frozenProgress, 'hacked drone must not advance');
  assert.equal(s.enemies[0].hp, frozenHp, 'hacked drone must not be targeted while hacked');
  assert.equal(s.hearts, 20, 'hacked drone never leaks');
  // segment B: knock the hub out (no re-hack, no tower fire to confuse the
  // measurement) and bring a victim ship alongside the stationary drone —
  // only the drone's own fire can hurt it now
  s = { ...s, towerStuns: { [setup.slot]: 9999 } };
  const airPos = enemyPosition(s.enemies[0], 'landscape');
  let seaProg = -1;
  for (let p = 0.02; p <= 0.98; p += 0.002) { const d = distance(airPos, positionAt(p)); if (d >= 4 && d <= 8) { seaProg = p; break; } }
  assert.ok(seaProg >= 0, 'no lane point alongside the hacked drone');
  s.enemies = [...s.enemies, foe(2, 'speed', seaProg, { stun: 9999 })];
  s = tick(s, 16);
  const seaLoss = 100000 - s.enemies[1].hp;
  assert.ok(seaLoss > 30 && seaLoss < 80, `hacked drone must deal ~25 dps to its former fleet (lost ${seaLoss.toFixed(1)} in 2s)`);
  // expiry: with the hub out, the 10s term runs down and the drone reverts
  let guard = 0;
  while ((s.enemies[0].hackTimer ?? 0) > 0 && guard++ < 200) s = gameReducer(s, { type: 'tick', dt: 0.125 });
  const reverted = s.enemies[0].progress;
  s = tick(s, 16);
  assert.ok(s.enemies[0].progress > reverted, 'after the hack expires the drone advances again');
  console.log(`2) sonar hack: PASS (hacked at tick ${hackTick}, frozen + untargetable for 10s, dealt ${seaLoss.toFixed(0)} dmg to its fleet in 2s, reverts cleanly)`);
}

/* ---- 3) sub detection: sonar global + stunned detector ---- */
{
  // geometry: a sub the boat tower cannot see by itself (outside its own
  // range) but its deployed boats can reach
  let setup = null;
  for (let si = 0; si < SLOTS.length && !setup; si++) {
    const t = { slot: si, kind: 'boat', tier: 1, branch: null, priority: 'first' };
    const r = getRange(battleBase(), t);
    const station = laneStationProgress(SLOTS[si], 'landscape');
    const boatPos = boatPosition({ progress: station, offset: 0 }, 'landscape');
    for (let p = 0.02; p <= 0.98; p += 0.002) {
      const pos = positionAt(p);
      if (distance(SLOTS[si], pos) > r + 1 && distance(boatPos, pos) <= r + 6) { setup = { slot: si, p }; break; }
    }
  }
  assert.ok(setup, 'geometry for the detection test not found');
  const mk = stunned => {
    let s = battleBase();
    s.towers = [
      { slot: setup.slot, kind: 'boat', tier: 1, branch: null, priority: 'first' },
      { slot: (setup.slot + 7) % SLOTS.length, kind: 'ew', tier: 4, branch: 1, priority: 'first' }, // sonar hub, anywhere — detection is global
    ];
    if (stunned) s.towerStuns = { [s.towers[1].slot]: 999 };
    s.enemies = [foe(1, 'sub', setup.p, { stun: 9999 })]; // held in place, in boat reach
    return tick(s, 24);
  };
  const seen = mk(false);
  assert.ok((seen.fireStats.garrison?.shots ?? 0) > 0, 'boats must engage the sub through the sonar hub’s global detection');
  assert.ok(seen.enemies[0].hp < 100000, 'sub must take boat fire when revealed globally');
  const blind = mk(true);
  assert.equal(blind.fireStats.garrison?.shots ?? 0, 0, 'a STUNNED sonar hub reveals nothing — boats must hold fire');
  assert.equal(blind.enemies[0].hp, 100000, 'sub stays untouched while the only detector is stunned');
  console.log('3) sub detection: PASS (healthy sonar = map-wide reveal; stunned sonar = no reveal — team-3b fix)');
}

/* ---- 4) garrison boats: deploy, block, return fire, respawn ---- */
{
  const slotIdx = 27; // Jask: mid-lane station (0.634), close to the lane
  const station = laneStationProgress(SLOTS[slotIdx], 'landscape');
  let s = battleBase();
  s.towers = [{ slot: slotIdx, kind: 'boat', tier: 1, branch: null, priority: 'first' }];
  s.enemies = [foe(1, 'speed', Math.max(0.01, station - 0.01))];
  s = tick(s, 1);
  assert.equal(s.boats.length, 3, 'garrison deploys exactly 3 boats at tier 1 (spec)');
  assert.ok(s.boats.every(b => b.role === 'garrison' && b.state === 'active' && b.hp === b.maxHp && b.maxHp === 140), 'boats start active at full HP (140)');
  assert.ok(s.boats.every(b => Math.abs(b.progress - station) < 1e-9), 'boats take station on the lane in front of the tower');
  assert.equal(new Set(s.boats.map(b => b.offset)).size, 3, 'boats spread on distinct perpendicular offsets');
  const shots = [];
  let sawRespawn = false;
  for (let i = 0; i < 400; i++) {
    s = gameReducer(s, { type: 'tick', dt: 0.125 });
    shots.push(...s.shots);
    if (s.boats.some(b => b.state === 'respawn')) sawRespawn = true;
  }
  const enemy = s.enemies[0];
  assert.ok(enemy, 'blocked enemy must still be alive (held, not leaked)');
  assert.ok(enemy.progress <= station + 0.006, `enemy must be BLOCKED at the boat line: progress ${enemy.progress.toFixed(4)} vs station ${station.toFixed(4)}`);
  assert.ok(enemy.progress >= station - 0.012, 'enemy must have advanced up to the boats (blocking is positional, not a freeze at spawn)');
  assert.equal(s.hearts, 20, 'a blocked enemy never leaks');
  assert.ok(sawRespawn, 'a boat must have been sunk under return fire and entered respawn');
  const boatShots = shots.filter(sh => sh.slot === slotIdx && sh.interval > 0);
  assert.ok(boatShots.length > 50, `boats must fire for themselves (${boatShots.length} shots in 50s)`);
  assert.ok(boatShots.every(sh => sh.boatId != null), 'every garrison shot record must carry its boatId');
  const sample = boatShots.find(sh => sh.boatId != null);
  const boat = s.boats.find(b => b.id === sample.boatId) ?? { progress: station, offset: 0 };
  const origin = boatPosition(boat, 'landscape');
  assert.ok(distance({ x: sample.x1, y: sample.y1 }, origin) < 0.6, 'shot origin must be the boat’s position');
  assert.ok(distance({ x: sample.x1, y: sample.y1 }, SLOTS[slotIdx]) > 1, 'shot origin must NOT be the tower model');
  console.log(`4) garrison boats: PASS (3 boats, blocked at station ${(enemy.progress).toFixed(3)}≈${station.toFixed(3)}, ${boatShots.length} boat-fired shots, sink + respawn observed)`);
}

/* ---- 5) torpedo squadron: pin + no sub targeting ---- */
{
  const slotIdx = 27;
  const station = laneStationProgress(SLOTS[slotIdx], 'landscape');
  let s = battleBase();
  s.towers = [
    { slot: slotIdx, kind: 'boat', tier: 4, branch: 0, priority: 'first' },
    { slot: 26, kind: 'ew', tier: 1, branch: null, priority: 'first' }, // detector so the sub is visible — torpedoes must still refuse it
  ];
  const subProg = progressNear(slotIdx, 14);
  s.enemies = [foe(1, 'destroyer', station), foe(2, 'speed', station), foe(3, 'sub', subProg, { stun: 9999 })];
  s = tick(s, 1);
  assert.equal(s.boats.filter(b => b.role === 'torpedo').length, 5, 'torpedo branch deploys exactly 5 boats (spec)');
  const d0 = s.enemies[0].progress, s0 = s.enemies[1].progress;
  const shots = [];
  for (let i = 0; i < 48; i++) { s = gameReducer(s, { type: 'tick', dt: 0.125 }); shots.push(...s.shots); }
  const destroyer = s.enemies.find(e => e.id === 1), speed = s.enemies.find(e => e.id === 2), sub = s.enemies.find(e => e.id === 3);
  assert.ok(Math.abs(destroyer.progress - d0) < 1e-9, `heavy ship must be pinned 100% while engaged (moved ${destroyer.progress - d0})`);
  assert.ok(speed.progress > s0 + 0.05, 'light ships are NOT pinned by the torpedo squadron');
  assert.ok(destroyer.hp < 100000, 'torpedo boats must be hitting the pinned destroyer');
  assert.ok(!shots.some(sh => sh.modelKind === 'torpedo' && sh.targetId === 3), 'torpedo boats must never target submarines');
  console.log('5) torpedo squadron: PASS (5 boats, destroyer pinned at 0 movement in 6s, speed boat passes, subs refused)');
}

/* ---- 6) minefield + Ghadir ---- */
{
  const slotIdx = 9;
  const tower = { slot: slotIdx, kind: 'boat', tier: 4, branch: 1, priority: 'first' };
  const range = getRange(battleBase(), tower);
  let s = battleBase();
  s.towers = [tower];
  // a far stunned enemy keeps the battle running while the field is planted
  let farProg = -1;
  for (let p = 0; p <= 1; p += 0.002) if (distance(SLOTS[slotIdx], positionAt(p)) > 30) { farProg = p; break; }
  assert.ok(farProg >= 0);
  s.enemies = [foe(99, 'speed', farProg, { stun: 9999 })];
  s = tick(s, 280); // ~35s: planting runs at the spec interval (2.857s) to the cap
  assert.equal(s.mines.length, 10, `minefield must fill to the 10-mine cap, got ${s.mines.length}`);
  assert.equal(s.ammo, 5000 - 40, 'each mine costs the spec 4 ammo');
  for (const m of s.mines) {
    assert.ok(distance(SLOTS[slotIdx], m) <= range + 0.01, 'every mine sits inside tower range');
    let bd = Infinity; for (let p = 0; p <= 1; p += 0.002) bd = Math.min(bd, distance(m, positionAt(p)));
    assert.ok(bd <= 2.6, `every mine sits on the enemy lane (nearest lane point ${bd.toFixed(2)})`);
  }
  s = tick(s, 40);
  assert.equal(s.mines.length, 10, 'minefield holds at the cap (no over-planting)');
  // contact detonation + replanting
  const mine = s.mines[0];
  let mp = 0, bd = Infinity;
  for (let p = 0; p <= 1; p += 0.001) { const d = distance(mine, positionAt(p)); if (d < bd) { bd = d; mp = p; } }
  s.enemies = [foe(99, 'speed', farProg, { stun: 9999 }), foe(1, 'speed', mp, { hp: 100000, maxHp: 100000, stun: 9999 })]; // victim held on the mine so it cannot leak past the lane end
  const minesBefore = s.mines.length;
  s = tick(s, 2);
  assert.ok(s.mines.length < minesBefore || !s.mines.some(m => m.id === mine.id), 'the contacted mine must detonate and be removed');
  const victim = s.enemies.find(e => e.id === 1);
  assert.ok(victim && victim.hp <= 100000 - 300, `mine blast must deal at least the spec 300 damage (victim at ${victim?.hp})`);
  s.enemies = s.enemies.filter(e => e.id === 99); // clear the lane so no more mines trip during replanting
  s = tick(s, 40);
  assert.equal(s.mines.length, 10, 'exploded mines are replanted back to the cap');
  // Ghadir: sub priority over a lead surface ship
  let g = battleBase();
  g.towers = [tower];
  const pSub = progressNear(slotIdx, 10), pSea = progressNear(slotIdx, 16);
  g.enemies = [foe(1, 'sub', pSub, { stun: 9999 }), foe(2, 'speed', Math.min(0.99, pSea + 0.05))];
  g = tick(g, 1);
  const first = g.shots.find(sh => sh.slot === slotIdx && sh.interval > 0);
  assert.ok(first, 'ghadir must fire on the first tick');
  assert.equal(first.modelKind, 'mine');
  assert.ok(first.boatId != null, 'the shot must be attributed to the Ghadir entity');
  assert.equal(first.targetId, 1, 'Ghadir must prioritise the submarine over the lead surface ship');
  const ghadir = g.boats.find(b => b.role === 'ghadir');
  assert.ok(ghadir, 'the Ghadir entity must be deployed');
  assert.ok(distance({ x: first.x1, y: first.y1 }, boatPosition(ghadir, 'landscape')) < 0.6, 'the shot must originate at the Ghadir, not the base model');
  console.log('6) minefield + Ghadir: PASS (10-mine cap on-lane, 4 ammo/mine, 300 blast + replant, Ghadir fires with sub priority from its own position)');
}

/* ---- 7) deep-freeze with MECH-A entities ---- */
{
  const g = battleBase();
  g.towers = [
    { slot: 9, kind: 'boat', tier: 1, branch: null, priority: 'first' },
    { slot: 5, kind: 'boat', tier: 4, branch: 1, priority: 'first' },
    { slot: 0, kind: 'ew', tier: 4, branch: 0, priority: 'first' },
    { slot: 12, kind: 'ew', tier: 4, branch: 1, priority: 'air' },
  ];
  g.enemies = [foe(1, 'speed', progressNear(9, 10)), foe(2, 'air', 0.5), foe(3, 'sub', progressNear(5, 12), { stun: 9999 })];
  const frozen = deepFreeze(g);
  const snapshot = JSON.stringify(frozen);
  let s = frozen;
  for (let i = 0; i < 48; i++) s = gameReducer(s, { type: 'tick', dt: 0.125 });
  assert.equal(JSON.stringify(frozen), snapshot, 'frozen input must not be mutated by MECH-A phases');
  assert.equal(frozen.boats.length, 0, 'input boats array untouched');
  assert.ok(s.boats.length >= 4, `boats deployed in the tick copy (got ${s.boats.length})`);
  console.log(`7) immutability: PASS (48 frozen ticks, ${s.boats.length} boats + ${s.mines.length} mines live only in the copy)`);
}

console.log('\nALL MECH-A PROBES PASSED');
