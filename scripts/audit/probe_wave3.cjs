/* Fresh-player wave-3 gate — fix program 2, D-024 (team BALANCE).
 *
 * Run: node scripts/audit/probe_wave3.cjs   (wrapped by probe_wave3.py)
 *
 * TWO scripted fresh players, both following the game's own guidance —
 * the mission chain in src/lib/progression.ts (currentMission, in
 * order: claims fund the chain; building targets upgraded in chain
 * order; first manager hired; cheapest research bought) — through
 * waves 1-3. They differ ONLY in tower purchases:
 *
 * A. opening-line — team 5's documented natural start: cannon @ slot 2
 *    + heavy @ slot 5 (the only pair the 1200 starting cash + 150 steel
 *    affords) and NO further towers. This is the player audit-2 team 5
 *    proved hits a wall: wave 3 = 2 speed + 6 air, objective airdef,
 *    defeat at the 2nd air leak (airLeaked > max(1, floor(6*0.2)) = 1).
 *    Steel income is exactly 0 until the steel factory exists and the
 *    chain only sends the player there in chapter 2 — AFTER third-wave;
 *    the opening pair leaves 75 steel, so one AA tower (500 cash + 50
 *    steel) is just affordable in isolation, but NOTHING in the game's
 *    guidance directs that purchase before wave 3 (the four-towers
 *    mission names no kinds; the wave-3 tip to deploy AA is shown only
 *    in the wave briefing itself), and the single tier-1 autocannon —
 *    which DOES engage air, pace team 5's text — cannot hold 6 air
 *    alone. GATE: this player must SURVIVE wave 3 after BALANCE's work
 *    (D-024's listed levers are numeric: wave-3 air count / leak
 *    threshold / AA cost; the warning/HUD/chain items are checked by
 *    BALANCE's own QA). Today it MUST FAIL. (Team 5's single run showed
 *    airLeaked=2/6, hearts 18/20; a repeat roll showed 1/6 and survival
 *    — the line sits exactly on the threshold, which is why the gate
 *    fights wave 3 seven times from one snapshot and requires 7/7.)
 *
 * B. mission-line — the same player, except the four-towers mission is
 *    allowed to drive purchases 3-4 down the strait-line priority.
 *    Measured boundary (2026-11-08, this harness): without steel income
 *    the mission can only be completed with a SECOND autocannon in the
 *    line (the cheapest tower pairs sum 30+30 / 30+40 / 30+45 steel and
 *    all include the 30-steel cannon), and two autocannons clear wave 3
 *    at 20 hearts with airLeaked 0/6 (wave-3 fireStats: autocannon 108
 *    shots / 86 hits; the EW contributed 1 shot / 0 hits; tier-1 cannon
 *    DOES engage air — team 5's wall is a one-autocannon wall). This
 *    assertion passes today and guards the strong line against a future
 *    over-tuning in the other direction.
 *
 * Both players: no spells, no contracts, no chests, no island buys —
 * nothing the guidance does not point at before wave 3. Before a wave
 * start, a short grid is topped up with a power-plant upgrade (the HUD
 * shows the shortfall). The reducer CLONES on every action — always
 * read the RETURNED state.
 */
const { load } = require('../load-game.cjs');
const G = load('src/lib/game.ts');
const P = load('src/lib/progression.ts');
const { initialGame, gameReducer, BUILDINGS, TOWERS, RESEARCH, getStats } = G;
const { currentMission, missionProgress, MANAGERS, managerCost } = P;

const DT = 0.125;
const ELAPSED_CAP = 7200; // game-seconds per run; guided runs need far less
// Strait-line purchase priority (seedlib HOME_SLOT positions).
const LINE = [['cannon', 2], ['heavy', 5], ['ew', 8], ['air', 12],
              ['missile', 9], ['boat', 4], ['cannon', 0], ['heavy', 7],
              ['cannon', 3], ['ew', 13]];

function runPlayer(name, allowMissionTowers) {
  const say = (m) => console.log(`[${name}] ${m}`);
  let s = initialGame();
  const act = (a) => { s = gameReducer(s, a); };
  const tick = (n = 1) => { for (let i = 0; i < n; i++) act({ type: 'tick', dt: DT }); };
  const gridRatio = () => { try { const st = getStats(s); return st.grid ?? st.gridRatio ?? 1; } catch { return 1; } };

  function buyTower(maxTotal) {
    if (s.towers.length >= maxTotal) return false;
    for (const [kind, slot] of LINE) {
      if (s.towers.some(t => t.slot === slot)) continue;
      const def = TOWERS[kind];
      if (s.cash >= def.cost && s.steel >= def.steel) {
        const before = s.towers.length;
        act({ type: 'build-tower', slot, kind });
        // BALANCE harness fix (assertions untouched): the reducer
        // refuses builds on locked islands (LINE slots 12/13 = Larak);
        // an unverified dispatch made `while (buyTower(cap))` spin
        // forever once the player could afford an unbuildable tower —
        // the baseline escaped only because steel stayed < 50. Verify
        // the build landed; if refused, try the next LINE entry.
        if (s.towers.length === before) continue;
        say(`t=${s.elapsed.toFixed(0)} build ${kind}@${slot} -> cash=${Math.floor(s.cash)} steel=${s.steel}`);
        return true;
      }
    }
    return false;
  }

  function powerPrep() {
    while (gridRatio() < 0.95) {
      const cost = Math.ceil(BUILDINGS.power.baseCost * Math.pow(1.15, s.buildings.power));
      if (s.cash < cost) break;
      act({ type: 'upgrade-building', id: 'power' });
      say(`t=${s.elapsed.toFixed(0)} power -> L${s.buildings.power} (grid=${gridRatio().toFixed(2)})`);
    }
  }

  const waveResults = [];
  let resolved = null;

  // Wave 3 is fought K times from the SAME pre-wave snapshot. The
  // scenario and spawn queue are deterministic (authored campaign wave,
  // mulberry32-seeded queue), but combat itself rolls Math.random crits
  // — and empirically the opening line sits exactly on the leak
  // threshold: identical runs produced airLeaked 2 (defeat) and 1
  // (survival). A one-roll gate would be a coin flip; the gate is that
  // the guided player survives EVERY roll (a first-time player gets
  // exactly one).
  const WAVE3_ATTEMPTS = 7;

  function fightOnce(fromState) {
    let st = structuredClone(fromState);
    const A = (a) => { st = gameReducer(st, a); };
    A({ type: 'start' });
    if (st.phase !== 'battle') return { victory: false, refused: true };
    let snap = null;
    let guard = 0;
    while (st.phase === 'battle' && guard++ < 30000) {
      st = gameReducer(st, { type: 'tick', dt: DT });
      if (st.battle) snap = { airLeaked: st.battle.airLeaked, airTotal: st.battle.airTotal,
                              objective: st.battle.objective, hearts: st.hearts };
    }
    return { victory: st.phase !== 'defeat', hearts: st.hearts,
             airLeaked: snap ? snap.airLeaked : null,
             airTotal: snap ? snap.airTotal : null,
             objective: snap ? snap.objective : null,
             fireStats: JSON.parse(JSON.stringify(st.fireStats || {})) };
  }

  function resolveWave3() {
    powerPrep();
    const info = { wave: 3, objective: null,
                   towers: s.towers.map(t => `${t.kind}@${t.slot}t${t.tier}`),
                   cash: Math.floor(s.cash), steel: s.steel, hearts: s.hearts,
                   grid: Number(gridRatio().toFixed(2)) };
    // Objective/queue from a throwaway start (identical every attempt).
    const probe = fightOnce(s);
    info.objective = probe.objective;
    const attempts = [probe];
    for (let i = 1; i < WAVE3_ATTEMPTS; i++) attempts.push(fightOnce(s));
    const survived = attempts.filter(a => a.victory).length;
    const leaks = attempts.map(a => a.airLeaked);
    say(`WAVE 3 x${WAVE3_ATTEMPTS}: survived ${survived}/${WAVE3_ATTEMPTS} ` +
        `leaks=[${leaks.join(', ')}] towers=[${info.towers.join(', ')}] ` +
        `steel=${info.steel} cash=${info.cash}`);
    const res = { wave: 3, victory: survived === WAVE3_ATTEMPTS,
                  attempts: attempts.map(a => ({ victory: a.victory, hearts: a.hearts,
                                                 airLeaked: a.airLeaked, airTotal: a.airTotal })),
                  hearts: attempts[0].hearts, airLeaked: attempts[0].airLeaked,
                  airTotal: attempts[0].airTotal, objective: info.objective,
                  fireStats: attempts[0].fireStats, start: info };
    waveResults.push(res);
    resolved = { outcome: res.victory ? 'victory' : 'defeat', ...res };
  }

  function startBattle() {
    if (s.wave === 3 && s.highestWave < 3) { resolveWave3(); return; }
    fightWave();
  }

  function fightWave() {
    const wave = s.wave;
    powerPrep();
    act({ type: 'start' });
    if (s.phase !== 'battle') { say(`!! start refused at wave ${wave} (phase=${s.phase})`); return; }
    const queue = (s.battle && s.battle.queue) || [];
    const comp = {};
    for (const u of queue) comp[u.kind] = (comp[u.kind] || 0) + 1;
    const info = {
      wave, objective: s.battle ? s.battle.objective : null, queue: comp,
      towers: s.towers.map(t => `${t.kind}@${t.slot}t${t.tier}`),
      cash: Math.floor(s.cash), steel: s.steel, hearts: s.hearts,
      grid: Number(gridRatio().toFixed(2)),
    };
    say(`WAVE ${wave} start: objective=${info.objective} queue=${JSON.stringify(comp)} ` +
        `towers=[${info.towers.join(', ')}] cash=${info.cash} steel=${info.steel} grid=${info.grid}`);
    let snap = null;
    let guard = 0;
    while (s.phase === 'battle' && guard++ < 30000) {
      tick(1);
      if (s.battle) snap = { airLeaked: s.battle.airLeaked, airTotal: s.battle.airTotal,
                             objective: s.battle.objective, hearts: s.hearts };
    }
    const victory = s.phase !== 'defeat';
    const res = { wave, victory, hearts: s.hearts,
                  airLeaked: snap ? snap.airLeaked : null,
                  airTotal: snap ? snap.airTotal : null,
                  objective: snap ? snap.objective : info.objective,
                  fireStats: JSON.parse(JSON.stringify(s.fireStats || {})),
                  start: info };
    waveResults.push(res);
    say(`WAVE ${wave} ${victory ? 'VICTORY' : 'DEFEAT'}: hearts=${res.hearts} ` +
        `airLeaked=${res.airLeaked}/${res.airTotal} objective=${res.objective}`);
    if (wave === 3 || !victory) resolved = { outcome: victory ? 'victory' : 'defeat', ...res };
  }

  function missionStep(m) {
    switch (m.metric) {
      case 'collected':
        if (s.idle.bank > 0) { act({ type: 'collect-income' }); return true; }
        return false;
      case 'building': {
        const q = G.buildingUpgradeQuote(s, m.metricId, 1);
        if (q.affordable) {
          act({ type: 'upgrade-building', id: m.metricId });
          say(`t=${s.elapsed.toFixed(0)} upgrade ${m.metricId} -> L${s.buildings[m.metricId]} (mission ${m.id})`);
          return true;
        }
        return false;
      }
      case 'managers':
        for (const id of Object.keys(MANAGERS)) {
          if (s.idle.managerLevels[id] === 0 && s.cash >= managerCost(id, 0) &&
              s.idle.xp >= MANAGERS[id].unlockXp) {
            act({ type: 'hire-manager', id });
            say(`t=${s.elapsed.toFixed(0)} hire manager ${id} (mission ${m.id})`);
            return true;
          }
        }
        return false;
      case 'research': {
        const next = RESEARCH.filter(r => !s.research.includes(r.id))
          .sort((a, b) => a.cost - b.cost)[0];
        if (next && s.cash >= next.cost) {
          act({ type: 'research', id: next.id });
          say(`t=${s.elapsed.toFixed(0)} research ${next.id} (mission ${m.id})`);
          return true;
        }
        return false;
      }
      case 'towers': {
        if (!allowMissionTowers) return false;
        let acted = false;
        while (buyTower(m.target)) acted = true;
        return acted;
      }
      case 'towerTier': {
        const t = s.towers.slice().sort((a, b) => a.tier - b.tier)[0];
        if (t) {
          const c = G.towerUpgradeCost(t);
          if (s.cash >= c.cash && s.steel >= c.steel) {
            act({ type: 'upgrade-tower', slot: t.slot });
            return true;
          }
        }
        return false;
      }
      case 'wave': {
        let acted = false;
        const cap = s.highestWave === 0 ? 2 : (allowMissionTowers ? Infinity : 2);
        while (buyTower(cap)) acted = true;
        if (acted) return true;
        startBattle();
        return true;
      }
      default:
        return false; // chests/contracts/islands/journal: not pre-wave-3 guidance
    }
  }

  say(`fresh player: cash=${s.cash} steel=${s.steel}`);
  let guard = 0;
  while (!resolved && s.elapsed < ELAPSED_CAP && guard++ < 400000) {
    if (s.phase === 'battle') { fightWave(); continue; }
    if (s.phase === 'defeat') { resolved = { outcome: 'defeat', wave: s.wave, start: null }; break; }
    if (s.idle.lastBattle && !s.idle.lastBattle.claimed) {
      act({ type: 'claim-battle' });
      say(`t=${s.elapsed.toFixed(0)} claim battle reward: cash=${Math.floor(s.cash)}`);
      continue;
    }
    const m = currentMission(s);
    if (m && missionProgress(s, m).complete) {
      act({ type: 'claim-mission', id: m.id });
      say(`t=${s.elapsed.toFixed(0)} claim mission ${m.id}: cash=${Math.floor(s.cash)} xp=${s.idle.xp}`);
      continue;
    }
    let acted = false;
    if (m) acted = missionStep(m);
    if (!acted && s.wave <= 3 && s.highestWave < 3 &&
        (s.phase === 'peace' || s.phase === 'intermission')) {
      // No affordable mission step: fight the next wave rather than idle
      // (waves 2-3 interleave with the chapter-1 chain in a real session).
      const cap = s.highestWave === 0 ? 2 : (allowMissionTowers ? Infinity : 2);
      let bought = false;
      while (buyTower(cap)) bought = true;
      if (!bought) { startBattle(); continue; }
      acted = true;
    }
    if (!acted) tick(4); // 0.5 game-s of production/traffic
  }
  return { resolved, waveResults,
           final: { cash: Math.floor(s.cash), steel: s.steel,
                    highestWave: s.highestWave, phase: s.phase,
                    elapsed: Math.round(s.elapsed) } };
}

const runs = {
  'opening-line': runPlayer('opening-line', false),
  'mission-line': runPlayer('mission-line', true),
};

function gateAssertion(id, name, run) {
  const r = run.resolved;
  const ok = !!r && r.outcome === 'victory' && r.wave === 3;
  const w3 = run.waveResults.find(w => w.wave === 3);
  const att = w3 && w3.attempts ? w3.attempts : null;
  const survived = att ? att.filter(a => a.victory).length : (ok ? 1 : 0);
  const leaks = att ? att.map(a => a.airLeaked).join(', ') : (w3 ? w3.airLeaked : '?');
  return {
    section: '§fresh-player gate (D-024)', id, name,
    status: ok ? 'pass' : 'fail',
    expected: 'wave 3 victory in all 7 combat-RNG attempts from the guided pre-wave state',
    actual: r ? `${r.outcome} at wave ${r.wave} (survived ${survived}/${att ? att.length : 1} attempts)` : 'unresolved',
    detail: ok
      ? `wave 3 cleared in all attempts: leaks=[${leaks}]/${w3.airTotal} ` +
        `towers=[${(w3.start.towers || []).join(', ')}]`
      : `wave 3 not reliably survivable: survived ${survived}/${att ? att.length : 1} attempts, ` +
        `leaks=[${leaks}]/${w3 ? w3.airTotal : '?'} objective=${w3 ? w3.objective : (r && r.objective)} ` +
        `towers=[${w3 && w3.start ? w3.start.towers.join(', ') : ''}] ` +
        `steelAtStart=${w3 && w3.start ? w3.start.steel : '?'} cashAtStart=${w3 && w3.start ? w3.start.cash : '?'} — ` +
        `one tier-1 autocannon holds 6 air only on lucky crit rolls; steel income is 0 until the ` +
        `steel factory and no guidance step directs an AA purchase before wave 3 (D-024 tuning target)`,
  };
}

const assertions = [
  gateAssertion('wave3.opening_line', 'guided fresh player, opening line only, survives wave 3',
                runs['opening-line']),
  gateAssertion('wave3.mission_line', 'guided fresh player, four-towers line, survives wave 3',
                runs['mission-line']),
];
const payload = {
  probe: 'probe_wave3', section: '§fresh-player gate (D-024)',
  assertions,
  meta: { runs: { 'opening-line': { waveResults: runs['opening-line'].waveResults,
                                    final: runs['opening-line'].final },
                  'mission-line': { waveResults: runs['mission-line'].waveResults,
                                    final: runs['mission-line'].final } } },
};
console.log('AUDIT_JSON_BEGIN');
console.log(JSON.stringify(payload, null, 1));
console.log('AUDIT_JSON_END');
for (const a of assertions) console.log(`[${a.status.toUpperCase()}] ${a.id} ${a.detail}`);
process.exitCode = assertions.every(a => a.status === 'pass') ? 0 : 1;
