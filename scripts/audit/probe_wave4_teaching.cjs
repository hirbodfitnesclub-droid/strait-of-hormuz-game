/* Intercept briefing and fresh-player choice gate. The defense line at 85%
 * gives shore towers an engagement window; spells remain an optional aid. */
const { load } = require('../load-game.cjs');
const G = load('src/lib/game.ts');
const P = load('src/lib/progression.ts');
const SM = load('src/lib/scenario-mechanics.ts');
const N = load('src/lib/news.ts');
const { initialGame, gameReducer, BUILDINGS, TOWERS, RESEARCH, getStats, interceptWarning } = G;
const { currentMission, missionProgress, MANAGERS, managerCost } = P;

const DT = 0.125;
const results = [];
function check(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${detail}`);
}

/* ---------------- W) the warning ---------------- */
{
  const at = (wave) => { const s = initialGame(); s.wave = wave; s.highestWave = wave - 1; return s; };

  const w4 = interceptWarning(at(4));
  const queueLen = SM.buildSpawnQueue(4, N.scenarioForWave(4, 'campaign', SM.scenarioContextFor(at(4)))).length;
  check('teach.fires_wave4_prestart', !!w4 && w4.units === queueLen && w4.heroReady === false,
    `wave 4 pre-start: ${JSON.stringify(w4)} (want units=${queueLen}, heroReady=false)`);

  let b = at(4);
  b = gameReducer(b, { type: 'start' });
  const w4b = interceptWarning(b);
  check('teach.fires_wave4_rolled', b.phase === 'battle' && !!w4b,
    `wave 4 with battle rolled (objective=${b.battle?.objective}): ${JSON.stringify(w4b)}`);

  // Silence ⟺ objective for every authored campaign wave.
  const mismatches = [], intercepts = [];
  for (let w = 1; w <= 25; w++) {
    const s = at(w);
    const obj = SM.objectiveTypeOf(N.scenarioForWave(w, 'campaign', SM.scenarioContextFor(s)).objective);
    if (obj === 'intercept') intercepts.push(w);
    if ((interceptWarning(s) !== null) !== (obj === 'intercept')) mismatches.push(w);
  }
  check('teach.silent_unless_intercept', mismatches.length === 0 && intercepts.includes(4),
    `intercept waves in campaign: [${intercepts.join(',')}]; warning/objective mismatches: [${mismatches.join(',')}] (want none)`);

  const s2 = at(4); s2.hero.active = 2;
  const w4h = interceptWarning(s2);
  check('teach.hero_ready_flag', !!w4h && w4h.heroReady === true,
    `hero already type 2: heroReady=${w4h && w4h.heroReady} (want true)`);

  const sp = at(4);
  const before = JSON.stringify(sp);
  interceptWarning(sp); interceptWarning(sp);
  check('teach.pure_peek', JSON.stringify(sp) === before,
    'state JSON byte-identical across two warning calls (D-024 purity precedent)');
}

/* ---------------- G) guided arrival -> doorstep -> fork ---------------- */
function arriveAtWave4() {
  // The probe_balance section-D guided harness, verbatim in behaviour —
  // including the full intermission preparation before each wave
  // (claims, mission steps, tower buys, power prep). The ONLY change:
  // startBattle refuses to open wave 4 and raises the doorstop flag
  // instead, so the snapshot is the exact state QA's kit matrix fought
  // from — a guided player who has done everything the game asks and
  // is one click from starting the intercept wave.
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
        blockedSlots.add(slot);
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
  let doorstop = false;
  function startBattle() {
    if (s.wave === 4) { doorstop = true; return; }
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
        if (s.ammo < 200 && s.buildings.arms === 0) {
          const q = G.buildingUpgradeQuote(s, 'arms', 1);
          if (q.affordable) { act({ type: 'upgrade-building', id: 'arms' }); return true; }
        }
        if (s.ammo < 200 && s.buildings.arms > 0) return false;
        if (gridRatio() < 0.9) { powerPrep(); if (gridRatio() < 0.9) return false; }
        powerPrep(); startBattle(); return true; }
      default: return false;
    }
  }
  let guard = 0, defeated = null;
  while (!doorstop && !defeated && s.elapsed < 14400 && guard++ < 600000) {
    if (s.phase === 'battle') {
      const w = s.wave;
      let n = 0;
      while (s.phase === 'battle' && n++ < 30000) {
        act({ type: 'tick', dt: DT });
        const top = s.enemies.slice().sort((a, b) => b.progress - a.progress)[0];
        if (top && top.progress >= 0.93 && (s.cooldowns.strike ?? 0) <= 0) {
          const p = G.enemyPosition(top, s.layout);
          act({ type: 'spell', spell: 'strike', x: p.x, y: p.y });
        }
      }
      if (s.phase === 'defeat') defeated = { wave: w, reason: s.idle.lastBattle?.reason };
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
      else if (s.ammo < 200) { tickN(4); continue; }
      else if (gridRatio() < 0.9) { powerPrep(); if (gridRatio() < 0.9) { tickN(4); continue; } acted = true; }
      if (!acted) { powerPrep(); startBattle(); if (s.phase !== 'battle') tickN(4); continue; }
    }
    if (!acted) tickN(4);
  }
  return { s, defeated, doorstop };
}

{
  const { s: doorstep, defeated, doorstop } = arriveAtWave4();
  check('gate.arrival', !defeated && doorstop && doorstep.highestWave >= 3 && doorstep.wave === 4 && doorstep.phase !== 'battle',
    `doorstep: highestWave=${doorstep.highestWave} wave=${doorstep.wave} phase=${doorstep.phase} doorstop=${doorstop} defeated=${JSON.stringify(defeated)} ` +
    `towers=[${doorstep.towers.map(t => `${t.kind}@${t.slot}t${t.tier}`).join(', ')}] hero=${doorstep.hero.active}`);

  const warn = interceptWarning(doorstep);
  check('gate.warning_at_doorstep', !!warn,
    `the briefing guidance at the doorstep: ${JSON.stringify(warn)} (want non-null)`);

  // GUIDED: only what the briefing teaches — hero 2 before the start,
  // EMP on the lead element, Strike on the follow-up group.
  let g = doorstep;
  const gact = (a) => { g = gameReducer(g, a); };
  if (g.idle.lastBattle && !g.idle.lastBattle.claimed) gact({ type: 'claim-battle' });
  if (warn && g.hero.active !== 2) gact({ type: 'hero-select', hero: 2 });
  gact({ type: 'start' });
  let n = 0, empDone = false, strikeDone = false;
  while (g.phase === 'battle' && n++ < 30000) {
    gact({ type: 'tick', dt: DT });
    const top = g.enemies.slice().sort((a, b) => b.progress - a.progress)[0];
    if (!top) continue;
    if (!empDone && top.progress >= 0.28 && (g.cooldowns.emp ?? 0) <= 0) {
      gact({ type: 'spell', spell: 'emp' }); empDone = true; continue;
    }
    if (!strikeDone && (g.cooldowns.strike ?? 0) <= 0 && top.progress >= 0.40) {
      const p = G.enemyPosition(top, g.layout);
      gact({ type: 'spell', spell: 'strike', x: p.x, y: p.y }); strikeDone = true;
    }
  }
  check('gate.guided_clears_wave4', g.phase !== 'defeat' && g.highestWave >= 4 && empDone && strikeDone,
    `guided: phase=${g.phase} highestWave=${g.highestWave} hearts=${g.hearts} emp=${empDone} strike=${strikeDone}`);

  // Alternate strategy: identical invested shore defense, no swap or spells.
  let u = doorstep;
  const uact = (a) => { u = gameReducer(u, a); };
  if (u.idle.lastBattle && !u.idle.lastBattle.claimed) uact({ type: 'claim-battle' });
  uact({ type: 'start' });
  let m = 0;
  while (u.phase === 'battle' && m++ < 30000) uact({ type: 'tick', dt: DT });
  check('gate.shore_defense_clears_wave4', u.highestWave >= 4,
    `unguided: phase=${u.phase} reason=${u.idle.lastBattle?.reason} hearts=${u.hearts} (want victory from shore defense without a mandatory spell combo)`);
}

const failed = results.filter(r => !r.ok);
console.log(`\nprobe_wave4_teaching: ${results.length - failed.length}/${results.length} pass`);
process.exitCode = failed.length ? 1 : 0;
