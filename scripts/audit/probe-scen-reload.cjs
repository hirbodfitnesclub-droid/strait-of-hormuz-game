/* Cross-process generator-stability probe (QA round 2 reproduction).
 *
 * Each invocation is a FRESH process (fresh module state) sharing one
 * file-backed localStorage — the closest node analogue of a page reload.
 *   node scripts/audit/probe-scen-reload.cjs <storeFile> <wave> [commit]
 * Without "commit" it only peeks (scenarioForWave, as previews/bulletins
 * do); with "commit" it also records the run (commitScenarioForWave, as
 * startWave does). Prints one JSON line: the scenario identity plus the
 * persisted run counter and history length AFTER the call, so the caller
 * can prove peeks move neither and reloads return the same scenario. */
const fs = require('node:fs');
const file = process.argv[2];
const wave = Number(process.argv[3]);
const commit = process.argv[4] === 'commit';
let data = {};
try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
global.window = { localStorage: {
  getItem: k => (k in data ? data[k] : null),
  setItem: (k, v) => { data[k] = String(v); },
  removeItem: k => { delete data[k]; },
} };
const { load } = require('../load-game.cjs');
const N = load('src/lib/news.ts');
const sc = N.scenarioForWave(wave, 'endless');
if (commit) N.commitScenarioForWave(wave, 'endless');
fs.writeFileSync(file, JSON.stringify(data));
let histLen = 0;
try { histLen = JSON.parse(data['hormuz-scenario-history-v1'] ?? '[]').length; } catch { /* none */ }
console.log(JSON.stringify({
  name: sc.operationName, objective: sc.objective, zone: sc.zone,
  condition: sc.specialCondition, headline: sc.newsBefore.headline,
  runs: Number(data['hormuz-scenario-runs-v1'] ?? 0), histLen,
}));
