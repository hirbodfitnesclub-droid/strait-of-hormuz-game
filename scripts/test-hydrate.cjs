// Corrupt-save hardening tests for hydrateGame (team SAVE).
// Feeds deliberately broken saves through hydrate and proves the returned
// state is always well-formed enough for getStats / the reducer to consume.
// Run from the repo root: node scripts/test-hydrate.cjs
const assert = require('node:assert/strict');
const { load } = require('./load-game.cjs');
const { hydrateGame, initialGame, getStats, gameReducer } = load('src/lib/game.ts');
const { isNativeRuntime, serverApiEnabled } = load('src/lib/runtime.ts');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ok - ${name}`); };

const validSave = () => {
  const game = initialGame();
  game.cash = 5000; game.wave = 7; game.highestWave = 6;
  game.towers = [{ slot: 0, kind: 'cannon', tier: 3, branch: null, priority: 'first' }];
  game.idle.contract = { id: 'regional', elapsed: 30 };
  game.idle.rewards = [{ id: 'r1', type: 'daily', title: 't', subtitle: 's', cash: 100, xp: 10, cards: { cannon: 2 } }];
  game.enemies = [{ id: 1, kind: 'speed', boss: 0, hp: 50, maxHp: 95, progress: 0.4, stun: 0, specialClock: 0 }];
  return JSON.parse(JSON.stringify(game));
};
const corrupt = mutate => { const save = validSave(); mutate(save); return save; };
const mustHydrate = save => {
  const result = hydrateGame(save);
  assert.ok(result, 'hydrate must not reject the save');
  return result.game;
};

console.log('hydrateGame corrupt-save hardening');
ok('top-level garbage is rejected, not crashed on', () => {
  assert.equal(hydrateGame(null), null);
  assert.equal(hydrateGame('x'), null);
  assert.equal(hydrateGame(42), null);
  assert.equal(hydrateGame({ version: 2, buildings: {}, towers: [], cards: {} }), null);
});
ok('a valid save round-trips its key values', () => {
  const game = mustHydrate(validSave());
  assert.equal(game.cash, 5000);
  assert.equal(game.wave, 7);
  assert.equal(game.towers.length, 1);
  assert.deepEqual(game.idle.contract, { id: 'regional', elapsed: 30 });
  assert.equal(game.idle.rewards.length, 1);
  assert.equal(game.idle.rewards[0].cards.cannon, 2);
  assert.equal(game.enemies.length, 1);
});
ok('rewards as a non-array becomes an empty array', () => {
  const game = mustHydrate(corrupt(s => { s.idle.rewards = 'corrupt'; }));
  assert.deepEqual(game.idle.rewards, []);
});
ok('reward entries are filtered and field-sanitized', () => {
  const game = mustHydrate(corrupt(s => {
    s.idle.rewards = [null, 42, { id: 5, type: 'daily' }, { type: 'daily', title: 'no id' },
      { id: 'ok', type: 'chest', title: 't', subtitle: 's', cash: 'rich', xp: 5, steel: 7, cards: { cannon: 'x', ew: 3 } }];
  }));
  assert.equal(game.idle.rewards.length, 1);
  assert.equal(game.idle.rewards[0].cash, 0);
  assert.equal(game.idle.rewards[0].steel, 7);
  assert.deepEqual(game.idle.rewards[0].cards, { ew: 3 });
});
ok('port null falls back to the fresh port state', () => {
  const game = mustHydrate(corrupt(s => { s.idle.port = null; }));
  assert.equal(game.idle.port.tanker.stage, 'approach');
  assert.equal(game.idle.port.cycles, 0);
});
ok('port with a bogus tanker is rebuilt field by field', () => {
  const game = mustHydrate(corrupt(s => { s.idle.port = { tanker: { stage: 'warp', progress: 'x', load: -3 }, nextIn: 'a', cycles: 2.7 }; }));
  assert.equal(game.idle.port.tanker, null);
  assert.equal(game.idle.port.nextIn, 0);
  assert.equal(game.idle.port.cycles, 2);
});
ok('enemies as a non-array object becomes an empty array', () => {
  const game = mustHydrate(corrupt(s => { s.enemies = { boss: true }; }));
  assert.deepEqual(game.enemies, []);
});
ok('enemy entries: bad kinds dropped, numeric fields made finite', () => {
  const game = mustHydrate(corrupt(s => {
    s.enemies = [{ kind: 'ufo', hp: 10 }, { kind: 'speed', hp: 'abc', maxHp: null, progress: 2, stun: -1 }];
  }));
  assert.equal(game.enemies.length, 1);
  assert.equal(game.enemies[0].kind, 'speed');
  assert.ok(Number.isFinite(game.enemies[0].hp));
  assert.ok(game.enemies[0].progress <= 1 && game.enemies[0].stun >= 0);
});
ok('tampered phase / mode / speed / event fall back to safe enums', () => {
  const game = mustHydrate(corrupt(s => { s.phase = 'hacked'; s.mode = 42; s.speed = 9; s.event = 'meteor'; s.layout = 'sideways'; }));
  assert.equal(game.phase, 'peace');
  assert.equal(game.mode, 'campaign');
  assert.equal(game.speed, 1);
  assert.equal(game.event, null);
  assert.equal(game.layout, 'landscape');
});
ok('battle arrays with wrong container types become empty arrays', () => {
  const game = mustHydrate(corrupt(s => { s.merchants = 42; s.pirates = 'x'; s.contraband = null; }));
  assert.deepEqual(game.merchants, []);
  assert.deepEqual(game.pirates, []);
  assert.deepEqual(game.contraband, []);
});
ok('idle as a non-object restores the fresh idle state', () => {
  const game = mustHydrate(corrupt(s => { s.idle = 'corrupt'; }));
  const fresh = initialGame().idle;
  assert.deepEqual(game.idle.rewards, []);
  assert.equal(game.idle.port.tanker.stage, fresh.port.tanker.stage);
  assert.equal(game.idle.managerLevels.harbor, 0);
  assert.equal(game.idle.bank, fresh.bank);
});
ok('contract with an unknown id is dropped; elapsed clamps to its duration', () => {
  assert.equal(mustHydrate(corrupt(s => { s.idle.contract = { id: 'nope', elapsed: 5 }; })).idle.contract, null);
  const game = mustHydrate(corrupt(s => { s.idle.contract = { id: 'coastal', elapsed: 99999 }; }));
  assert.deepEqual(game.idle.contract, { id: 'coastal', elapsed: 60 });
});
ok('platforms keep only valid slot ids, deduplicated', () => {
  const game = mustHydrate(corrupt(s => { s.idle.platforms = [0, 2, 2, 99, -1, 'x']; }));
  assert.deepEqual(game.idle.platforms, [0, 2]);
});
ok('lastBattle as an array becomes null; a partial record is rebuilt', () => {
  assert.equal(mustHydrate(corrupt(s => { s.idle.lastBattle = []; })).idle.lastBattle, null);
  const game = mustHydrate(corrupt(s => { s.idle.lastBattle = { wave: 'x', victory: 'yes' }; }));
  assert.equal(typeof game.idle.lastBattle.wave, 'number');
  assert.equal(game.idle.lastBattle.victory, false);
});
ok('appliedDailyIds is string-filtered and capped at the last 64', () => {
  assert.deepEqual(mustHydrate(corrupt(s => { s.idle.appliedDailyIds = 'x'; })).idle.appliedDailyIds, []);
  const ids = Array.from({ length: 70 }, (_, i) => `daily-${i}`);
  const game = mustHydrate(corrupt(s => { s.idle.appliedDailyIds = ids; }));
  assert.equal(game.idle.appliedDailyIds.length, 64);
  assert.equal(game.idle.appliedDailyIds[0], 'daily-6');
});
ok('cards with corrupt per-kind entries fall back per kind', () => {
  const game = mustHydrate(corrupt(s => { s.cards = { cannon: 'x', heavy: { count: 'a', level: 3 } }; }));
  assert.deepEqual(game.cards.cannon, { count: 0, level: 1 });
  assert.deepEqual(game.cards.heavy, { count: 0, level: 3 });
});
ok('manager levels clamp to 0..5 and stars to 0..3', () => {
  const game = mustHydrate(corrupt(s => { s.idle.managerLevels = { harbor: 99, energy: -2, supply: 'x' }; s.idle.stars = { 5: 9, 6: 'x' }; }));
  assert.deepEqual(game.idle.managerLevels, { harbor: 5, energy: 0, supply: 0 });
  assert.deepEqual(game.idle.stars, { 5: 3 });
});
ok('scalar tampering: cooldowns, stuns, combo, counters stay numeric', () => {
  const game = mustHydrate(corrupt(s => {
    s.cooldowns = { strike: 'x', emp: -4 }; s.towerStuns = { 3: 'x', 4: 2 }; s.combo = 'lots'; s.nextId = 0; s.chests = 1.9;
  }));
  assert.equal(game.cooldowns.strike, 0);
  assert.equal(game.cooldowns.emp, 0);
  assert.deepEqual(game.towerStuns, { 4: 2 });
  assert.equal(game.combo, 0);
  assert.equal(game.nextId, 1);
  assert.equal(game.chests, 1);
});
ok('tower branch/priority are sanitized with the tier', () => {
  const game = mustHydrate(corrupt(s => {
    s.towers = [
      { slot: 0, kind: 'cannon', tier: 3, branch: 1, priority: 'bogus' },
      { slot: 1, kind: 'ew', tier: 4, branch: 7, priority: 'air' },
      { slot: 2, kind: 'air', tier: 4, branch: 1, priority: 'first' },
    ];
  }));
  assert.equal(game.towers[0].branch, null);
  assert.equal(game.towers[0].priority, 'first');
  assert.equal(game.towers[1].branch, null);
  assert.equal(game.towers[2].branch, 1);
});
ok('hydrated corrupt state survives getStats and reducer ticks', () => {
  const game = mustHydrate(corrupt(s => {
    s.idle.rewards = 'x'; s.idle.port = null; s.enemies = { nope: 1 }; s.phase = 'battle';
    s.idle.contract = { id: 'ghost', elapsed: 1 }; s.idle.platforms = 'all';
  }));
  const stats = getStats(game);
  assert.ok(Number.isFinite(stats.dollarRate));
  let state = game;
  for (let i = 0; i < 40; i++) state = gameReducer(state, { type: 'tick', dt: 0.125 });
  assert.ok(Number.isFinite(state.cash));
});

console.log('runtime detection');
ok('isNativeRuntime / serverApiEnabled classify window shapes', () => {
  assert.equal(isNativeRuntime({}), false);
  assert.equal(isNativeRuntime({ Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false } }), false);
  assert.equal(isNativeRuntime({ Capacitor: { isNativePlatform: () => true } }), true);
  assert.equal(isNativeRuntime({ Capacitor: { getPlatform: () => 'android' } }), true);
  assert.equal(isNativeRuntime({ Capacitor: { getPlatform: () => 'ios' } }), true);
  assert.equal(serverApiEnabled({ Capacitor: { isNativePlatform: () => true } }), false);
  assert.equal(serverApiEnabled({}), true);
});

console.log(`PASS: ${passed} hydrate/runtime checks`);
