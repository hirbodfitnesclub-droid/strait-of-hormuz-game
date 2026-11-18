/* UI round-2 acceptance probes (QA-UI fixes) — run: node scripts/audit/test-ui-round2.cjs
 *
 * 1) Stability popover cap row (QA-UI متوسط): at max state the five raw
 *    rows sum to 130 while stats.stability is capped at 100 — a "سقف
 *    پایداری" row must carry exactly −30 so the rows sum to the displayed
 *    100. At the QA-verified 76 state there must be NO cap row and the
 *    rows still sum to 76.
 * 2) Effective-number paths the sheet/branch/choice now share: the tier-4
 *    capacitor discount flows through towerPowerMw (branch buttons) and
 *    getRange applies research modifiers (selection cards) — both differ
 *    from the raw spec/table values in the states QA flagged.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const cache = new Map();
function load(source) {
  const file = path.resolve(source);
  if (file.endsWith('.json')) return require(file);
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports: {} }; cache.set(file, loadedModule);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.React },
  }).outputText;
  const localRequire = id => {
    if (id.startsWith('./') || id.startsWith('../') || id.startsWith('@/')) {
      const resolved = id.startsWith('@/') ? path.resolve('src', id.slice(2)) : path.resolve(path.dirname(file), id);
      if (fs.existsSync(resolved + '.tsx')) return load(resolved + '.tsx');
      return load(path.extname(resolved) ? resolved : resolved + '.ts');
    }
    return require(id);
  };
  new Function('exports', 'module', 'require', code)(loadedModule.exports, loadedModule, localRequire);
  return loadedModule.exports;
}

const G = load('src/lib/game.ts');
const UI = load('src/components/game-ui.tsx');
const W = load('src/lib/weapons-spec.ts');
const { initialGame, getStats, towerPowerMw, getRange, TOWERS } = G;
const { stabilityBreakdown } = UI;

const clone = () => initialGame(); // initialGame() returns a fresh state
const sum = rows => rows.reduce((s, r) => s + r.value, 0);

/* ---- 1a) Max state: raw 130 → cap row −30 → rows sum to displayed 100 ---- */
{
  const s = clone();
  s.buildings.city = 5; s.buildings.welfare = 6; s.buildings.water = 3;
  s.security = 100;
  s.research = [...s.research, 'housing', 'stability'];
  const stats = getStats(s);
  assert.equal(stats.stability, 100, 'max state: stats.stability capped at 100');
  const rows = stabilityBreakdown(s, stats);
  assert.equal(rows.length, 6, 'max state: five raw rows + cap row');
  assert.deepEqual(rows.slice(0, 5).map(r => r.value), [40, 30, 20, 30, 10], 'raw rows unchanged (sum 130)');
  assert.equal(rows[5].label, 'سقف پایداری');
  assert.ok(Math.abs(rows[5].value - -30) < 1e-9, `cap row carries the difference (got ${rows[5].value})`);
  assert.ok(Math.abs(sum(rows) - stats.stability) < 1e-9, `rows sum ${sum(rows)} === displayed ${stats.stability}`);
  console.log(`1a) max state OK: rows [40,30,20,30,10,−30] sum = ${sum(rows)} = stats.stability`);
}

/* ---- 1b) 76 state (QA live-verified composition): no cap row, sum 76 ---- */
{
  const s = clone();
  s.buildings.city = 1; s.buildings.water = 2; // infra full, city 15
  s.security = 70; // → 21
  const stats = getStats(s);
  assert.equal(Math.round(stats.stability), 76, '76 state: stats.stability is 76');
  const rows = stabilityBreakdown(s, stats);
  assert.equal(rows.length, 5, 'under the cap: no extra row');
  assert.deepEqual(rows.map(r => r.value), [40, 15, 0, 21, 0], 'rows match QA composition +40/+15/+0/+21/+0');
  assert.ok(Math.abs(sum(rows) - stats.stability) < 1e-9, 'rows sum to 76');
  console.log('1b) 76 state OK: 5 rows, no cap row, sum = 76');
}

/* ---- 1c) Just above the cap: small negative cap row, still exact ---- */
{
  const s = clone();
  s.buildings.city = 2; s.buildings.water = 2; s.buildings.welfare = 5;
  s.security = 100; s.research = [...s.research, 'housing'];
  const stats = getStats(s); // 40 + 30 + 20 + 30 + 5 = 125 raw → capped 100
  const rows = stabilityBreakdown(s, stats);
  assert.equal(rows.length, 6);
  assert.ok(Math.abs(sum(rows) - 100) < 1e-9, `rows sum ${sum(rows)} === 100`);
  console.log(`1c) over-cap state OK: raw 125, cap row ${rows[5].value}, sum = ${sum(rows)}`);
}

/* ---- 2a) Branch power path: capacitor discount via towerPowerMw ---- */
{
  const s = clone();
  s.research = [...s.research, 'capacitors'];
  const branchTower = { slot: 0, kind: 'air', tier: 4, branch: 1, priority: 'first' };
  const rawMw = W.weaponSpec('air', 4, 1).powerMW; // laser 80 MW raw
  const effMw = towerPowerMw(s, branchTower);
  assert.equal(rawMw, 80);
  assert.ok(Math.abs(effMw - 80 * 0.65) < 1e-9, `effective MW ${effMw} = raw × 0.65 (capacitors)`);
  console.log(`2a) branch power OK: raw ${rawMw} MW → effective ${effMw} MW with capacitors`);
}

/* ---- 2b) Choice-card range path: getRange applies research modifiers ---- */
{
  const s = clone();
  s.research = [...s.research, 'radar'];
  const preview = { slot: 0, kind: 'cannon', tier: 1, branch: null, priority: 'first' };
  const effRange = getRange(s, preview);
  assert.ok(Math.abs(effRange - TOWERS.cannon.range * 1.2) < 1e-9, `effective range ${effRange} = raw × 1.2 (radar)`);
  assert.notEqual(effRange, TOWERS.cannon.range, 'differs from the raw table value QA flagged');
  console.log(`2b) choice range OK: raw ${TOWERS.cannon.range} → effective ${effRange} with radar`);
}

console.log('ALL UI ROUND-2 PROBES PASSED');
