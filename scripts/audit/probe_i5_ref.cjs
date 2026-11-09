/* I5 reducer reference — the logic-side half of the retest.
 *
 * Loads the EXACT seed the browser half uses (seedlib.boss_seed(5),
 * written to a JSON file by probe_i5.py), hydrates it through the real
 * hydrateGame path (the same one the browser load takes), then ticks the
 * raw reducer at dt=0.125 and records when fire starts and what
 * fireStats holds at battle t=30 — team 5's p8 numbers, reproduced:
 * first shot at battle t=3.0, fireStats at t=30 =
 * {garrison: 96, aadefense: 24, hero: 10, silo: 8, autocannon: 6}.
 *
 * The reducer CLONES on every action — always read the RETURNED state.
 */
const fs = require('node:fs');
const { load } = require('../load-game.cjs');
const G = load('src/lib/game.ts');
const { gameReducer, hydrateGame } = G;

const seed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const hydrated = hydrateGame(seed);
if (!hydrated) { console.log(JSON.stringify({ error: 'hydrate returned null' })); process.exit(2); }
let s = hydrated.game;

const totalShots = (st) => Object.values(st.fireStats || {})
  .reduce((a, v) => a + (v.shots || 0), 0);

let battleStart = null;
let firstShotAt = null;
let at30 = null;
let peakEnemies = 0;
for (let i = 0; i < 8 * 60 && s.phase !== 'defeat'; i++) {
  s = gameReducer(s, { type: 'tick', dt: 0.125 });
  if (battleStart === null && s.phase === 'battle') battleStart = s.elapsed;
  if (battleStart === null) continue;
  const bt = s.elapsed - battleStart;
  peakEnemies = Math.max(peakEnemies, s.enemies.length);
  if (firstShotAt === null && totalShots(s) > 0) firstShotAt = Number(bt.toFixed(2));
  if (at30 === null && bt >= 30) {
    at30 = { fireStats: JSON.parse(JSON.stringify(s.fireStats)),
             totalShots: totalShots(s), destroyed: s.destroyed };
  }
  if (bt >= 40) break;
}
console.log('I5REF_JSON_BEGIN');
console.log(JSON.stringify({
  battleStartElapsed: battleStart, firstShotAtBattle: firstShotAt, at30,
  final: { fireStats: s.fireStats, totalShots: totalShots(s),
           destroyed: s.destroyed, phase: s.phase, peakEnemies },
}, null, 1));
console.log('I5REF_JSON_END');
