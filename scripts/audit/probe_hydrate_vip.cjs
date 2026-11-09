/* Team WAVE2-FIX probe — hydrate VIP-escort persistence (QA-SHIPS
 * advisory, Wave-2 follow-up to D-022/R6).
 *
 * Run: node scripts/audit/probe_hydrate_vip.cjs
 *
 * The bug: hydrateGame's traffic sanitizers rebuilt pirates / merchants
 * / contraband from fixed field sets, silently dropping the pirates'
 * `vipEscort` flag and every hull's D-022 ease-in `age`. A save reloaded
 * mid-VIP-event resurrected the escorts as ordinary traffic pirates —
 * the R6 coast-guard erosion exemption was lost for the rest of the
 * crossing — and every ship's ease-in ramp reset.
 *
 * Sections:
 *  H1) round-trip: a mid-event state (VIP ship + flagged escorts +
 *      aged traffic) survives JSON persist -> hydrateGame with the
 *      flag and ages intact.
 *  H2) exemption after reload: in the RELOADED state, a flagged escort
 *      beside a plain pirate at the same progress (identical hero fire)
 *      loses exactly the erosion less — and loses that protection the
 *      moment the VIP ship is gone (exemption keys on flag && ship).
 *  H3) tamper: garbage values (vipEscort: "<script>", age: "x") are
 *      dropped/clamped by validation, never trusted raw, never crash.
 *
 * The reducer CLONES on every action — always read the RETURNED state.
 */
const { load } = require('../load-game.cjs');
const G = load('src/lib/game.ts');
const { initialGame, gameReducer, hydrateGame } = G;

const DT = 0.125;
const results = [];
function check(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id} — ${detail}`);
}
const persist = (s) => JSON.parse(JSON.stringify(s)); // what localStorage holds

function midEventState() {
  const s = initialGame();
  s.event = 'vip'; s.eventClock = 10;
  s.vipShip = { progress: 0.1, hp: 300, maxHp: 300, age: 10 };
  s.pirates = [
    { id: 901, progress: 0.5, hp: 100, vipEscort: true, age: 10 },
    { id: 902, progress: 0.44, hp: 100, vipEscort: true, age: 10 },
    { id: 903, progress: 0.5, hp: 100, age: 4 }, // plain traffic pirate, same spot as 901
  ];
  s.merchants = [{ id: 904, progress: 0.5, kind: 'tanker', reward: 300, paid: false, age: 7 }];
  s.contraband = [{ id: 905, progress: 0.3, age: 2 }];
  return s;
}

/* ---------------- H1) round-trip ---------------- */
{
  const out = hydrateGame(persist(midEventState()));
  check('hydrate.loads', !!out, 'mid-event save hydrates at all');
  const g = out.game;
  const esc = g.pirates.find(p => p.id === 901);
  const esc2 = g.pirates.find(p => p.id === 902);
  const plain = g.pirates.find(p => p.id === 903);
  check('hydrate.escort_flag_survives', !!esc && esc.vipEscort === true && !!esc2 && esc2.vipEscort === true,
    `escort 901 vipEscort=${esc && esc.vipEscort}, 902 vipEscort=${esc2 && esc2.vipEscort} (want true/true)`);
  check('hydrate.ages_survive',
    !!esc && esc.age === 10 && !!plain && plain.age === 4 && plain.vipEscort === undefined &&
    g.merchants[0]?.age === 7 && g.contraband[0]?.age === 2,
    `pirate ages 901=${esc && esc.age} 903=${plain && plain.age} (want 10/4), plain flag=${plain && plain.vipEscort} (want undefined), merchant age=${g.merchants[0]?.age} (want 7), contraband age=${g.contraband[0]?.age} (want 2)`);
  check('hydrate.vip_ship_survives', !!g.vipShip && g.event === 'vip' && g.vipShip.hp === 300,
    `vipShip=${JSON.stringify(g.vipShip)} event=${g.event}`);
}

/* ---------------- H2) erosion exemption after reload ---------------- */
function erosionRun(withShip) {
  const out = hydrateGame(persist(midEventState()));
  let g = out.game;
  if (!withShip) { g.event = null; g.vipShip = null; }
  for (let i = 0; i < 8; i++) g = gameReducer(g, { type: 'tick', dt: DT }); // 1 s at speed 1
  const esc = g.pirates.find(p => p.id === 901);
  const plain = g.pirates.find(p => p.id === 903);
  return { escHp: esc ? esc.hp : null, plainHp: plain ? plain.hp : null };
}
{
  // Both pirates sit at progress 0.5: same position, same hero fire —
  // the ONLY difference is the erosion the escort is exempt from
  // (4/s, no coastguard research): over 1 s the gap must be ~4.
  const a = erosionRun(true);
  check('hydrate.exemption_active_after_reload',
    a.escHp !== null && a.plainHp !== null && Math.abs((a.escHp - a.plainHp) - 4) < 0.6,
    `with live VIP: escort hp=${a.escHp?.toFixed(2)} plain hp=${a.plainHp?.toFixed(2)} gap=${(a.escHp - a.plainHp)?.toFixed(2)} (want ~4 = 4/s erosion x 1 s)`);
  const b = erosionRun(false);
  check('hydrate.exemption_needs_live_ship',
    b.escHp !== null && b.plainHp !== null && Math.abs(b.escHp - b.plainHp) < 0.6,
    `ship gone: escort hp=${b.escHp?.toFixed(2)} plain hp=${b.plainHp?.toFixed(2)} gap=${(b.escHp - b.plainHp)?.toFixed(2)} (want ~0 — flag alone exempts nothing)`);
}

/* ---------------- H3) tampered values sanitize safely ---------------- */
{
  const raw = persist(midEventState());
  raw.pirates[0].vipEscort = '<script>';
  raw.pirates[0].age = 'x';
  raw.pirates[1].vipEscort = 1;          // truthy, but not the literal true
  raw.pirates[1].age = -5;               // negative age clamps to 0 (house style)
  raw.merchants[0].age = '7';            // numeric string is not a number
  raw.contraband[0].age = Number.NaN;    // JSON turns NaN into null anyway; belt and braces
  let out = null, threw = null;
  try { out = hydrateGame(raw); } catch (e) { threw = e; }
  check('hydrate.tamper_no_crash', !threw && !!out, threw ? `threw: ${threw.message}` : 'hydrates');
  const g = out.game;
  const p0 = g.pirates.find(p => p.id === 901);
  const p1 = g.pirates.find(p => p.id === 902);
  check('hydrate.tamper_flag_dropped',
    !!p0 && p0.vipEscort === undefined && !!p1 && p1.vipEscort === undefined,
    `vipEscort "<script>" -> ${p0 && JSON.stringify(p0.vipEscort)}, 1 -> ${p1 && JSON.stringify(p1.vipEscort)} (want undefined/undefined)`);
  check('hydrate.tamper_age_sanitized',
    !!p0 && p0.age === undefined && !!p1 && p1.age === 0 &&
    g.merchants[0]?.age === undefined && g.contraband[0]?.age === undefined,
    `ages: pirate "x" -> ${p0 && p0.age} (want undefined), -5 -> ${p1 && p1.age} (want 0), merchant "7" -> ${g.merchants[0]?.age} (want undefined), contraband NaN -> ${g.contraband[0]?.age} (want undefined)`);
}

const failed = results.filter(r => !r.ok);
console.log(`\nprobe_hydrate_vip: ${results.length - failed.length}/${results.length} pass`);
process.exitCode = failed.length ? 1 : 0;
