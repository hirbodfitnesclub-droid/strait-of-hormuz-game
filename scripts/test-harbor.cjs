const assert = require("node:assert/strict");
const fs = require("node:fs");
const { load } = require("./load-game.cjs");
const {
  act,
  advance,
  clearedThrough,
  entryReason,
  newHarbor,
  stationPrice,
  contractQuote,
} = load("src/harbor/session.ts");
const { openingCapacity } = load("src/lib/opening-industry.ts");
const { initialGame, getStats } = load("src/lib/game.ts");
const { encode, decode, loadHarbor, saveHarbor, resume, LIVE, BACKUP } = load(
  "src/harbor/storage.ts",
);
const { LEGACY_SAVE_KEY } = load("src/lib/save-storage.ts");
const { operations, works, contracts } = load("src/harbor/catalog.ts");
const { openingFocus } = load("src/lib/opening-attention.ts");
const clock = { boot: "test", ms: 100, wall: 1800000000000 };
const evidence = {
  fixtures: [],
  campaign: [],
  dispatches: [],
  savingsSeconds: 0,
};
const ok = (title) => evidence.fixtures.push(title);
function start(h, mode, op = 1, role = "steady", week = 100) {
  return act(h, { type: "launch", mode, op, role, week, spaced: true });
}
function done(h) {
  assert.ok(h.result);
  return act(h, { type: "close-report", id: h.result.id });
}
function buy(h, id) {
  return act(h, {
    type: "upgrade",
    id,
    level: h.port.buildings[id],
    guided: false,
  });
}
function bank(h) {
  return act(h, { type: "collect" });
}
function play(h, useRadio = true, collect = false) {
  assert.ok(h.voyage, "normal launch accepted");
  for (let i = 0; h.voyage && i < 1200; i++) {
    const v = h.voyage;
    const target = v.active.find(
      (s) => (v.time - s.at) / (s.until - s.at) >= 0.3,
    );
    if (useRadio && target && v.time >= v.chargeAt)
      h = act(h, { type: "tap", id: target.id });
    if (collect && i % 80 === 0) h = bank(h);
    h = advance(h, 0.25, 0.25);
  }
  assert.ok(h.result, "encounter settles");
  return h;
}
function focus(h) {
  const p = h.port;
  return openingFocus({
    ...p.opening,
    cash: p.cash,
    bank: p.idle.bank,
    bankCapacity: getStats(p).bankCapacity,
    upgradeCost: 90,
    battle: false,
    abilityReady: false,
  });
}
let h = newHarbor();
assert.equal(h.port.oil, 400);
assert.equal(openingCapacity(h.port), 500);
assert.equal(h.port.idle.port.tanker.load, 625);
assert.equal(start(h, "campaign").voyage, null);
h = advance(h, 12, 0);
assert.equal(h.port.opening.firstTollAt, 12);
h = bank(h);
const firstCash = h.port.cash;
h = advance(h, 58, 0);
assert.equal(h.port.opening.stallStartedAt, 70);
assert.equal(focus(h), "tank");
const poor = structuredClone(h);
poor.port.cash = 20;
poor.port.idle.bank = 260;
assert.equal(focus(poor), "treasury_to_tank");
assert.equal(focus(bank(poor)), "tank");
poor.port.idle.bank = 0;
assert.equal(focus(poor), null);
const bought = advance(buy(h, "tank"), 1, 0);
assert.equal(bought.port.cash, firstCash - 90);
assert.equal(bought.port.opening.mastery, true);
assert.equal(buy(h, "tank").port.buildings.tank, 2);
assert.equal(h.port.buildings.tank, 1);
h = advance(h, 50, 0);
assert.equal(h.port.opening.manualWaveAt, null);
assert.equal(entryReason(h, 1), null);
const natural = advance(h, 18, 0);
assert.equal(
  natural.port.opening.events.find((e) => e.kind === "natural_recovery").at,
  138,
);
assert.equal(natural.port.opening.mastery, false);
ok("Opening at 0, 12, 70, 120 and 138 seconds, all three attention branches");
const training = play(start(h, "practice"));
assert.deepEqual(training.stars, {});
assert.equal(training.port.opening.manualWaveAt, null);
ok("Practice is reachable immediately and never clears a campaign stage");
let branch = play(start(h, "campaign"));
assert.equal(branch.result.win, true);
assert.equal(branch.result.hp, 20);
assert.equal(branch.result.cash, 90);
branch = play(start(done(branch), "campaign", 2));
assert.equal(branch.result.win, true);
branch = play(start(done(branch), "campaign", 3), false);
assert.equal(branch.result.win, false);
assert.ok(branch.result.wear.length > 0);
const worn = branch.port.opening.wear.dock,
  level = branch.port.buildings.dock;
branch = done(branch);
const repair = { type: "repair", id: "dock", damage: worn, method: "paid" };
const repaired = act(branch, repair);
assert.equal(repaired.port.opening.wear.dock, worn - 1);
assert.equal(branch.port.cash - repaired.port.cash, 24 + 4 * (level - 1));
assert.equal(act(repaired, repair).port.cash, repaired.port.cash);
const bankrupt = structuredClone(branch);
bankrupt.port.cash = 0;
bankrupt.port.steel = 0;
bankrupt.port.idle.bank = 0;
assert.equal(
  advance(act(bankrupt, { ...repair, method: "service" }), 30, 0).port.opening
    .wear.dock,
  worn - 1,
);
ok(
  "Clean stage 1, escorted stage 2, actual damage on stage 3, paid and free repair",
);
const live = advance(start(h, "campaign"), 8, 8);
const reload = decode(encode(live, clock)).harbor;
assert.deepEqual(reload.voyage, live.voyage);
assert.deepEqual(play(reload).result, play(live).result);
const map = new Map(),
  storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
const old = initialGame();
old.highestWave = 4;
old.idle.modeBest.campaign = 4;
old.cash = 4321;
storage.setItem(LEGACY_SAVE_KEY, JSON.stringify(old));
const { readPortable } = load("src/harbor/storage.ts");
const directExport = JSON.stringify({
  format: "hormuz-save",
  version: 2,
  state: old,
});
const recoveryExport = JSON.stringify({
  [LEGACY_SAVE_KEY]: JSON.stringify(old),
});
for (const input of [directExport, recoveryExport]) {
  const recovered = readPortable(input, clock.wall);
  assert.equal(recovered.port.cash, 4321);
  assert.equal(clearedThrough(recovered), 4);
}
assert.throws(() => readPortable(JSON.stringify({ "hormuz-game-v3": "{}" })));
assert.throws(() => readPortable('{"version":1,"body":"{}","checksum":"0"}'));
const legacyBytes = storage.getItem(LEGACY_SAVE_KEY);
const migrated = loadHarbor(storage, clock).harbor;
assert.equal(migrated.port.cash, 4321);
assert.equal(clearedThrough(migrated), 4);
saveHarbor(storage, migrated, clock);
saveHarbor(storage, migrated, clock);
storage.setItem(LIVE, "{");
assert.equal(loadHarbor(storage, clock).recovered, true);
assert.equal(storage.getItem(LEGACY_SAVE_KEY), legacyBytes);
ok(
  "Live voyage restoration, legacy migration and intact source bytes, backup recovery",
);
h = bank(advance(newHarbor(), 120, 0));
h = buy(h, "refinery");
h = buy(h, "tank");
function waitFor(h, eligible) {
  for (let i = 0; i < 2000 && !eligible(h); i++) {
    h = bank(advance(h, 60, 0));
    evidence.savingsSeconds += 60;
  }
  assert.ok(eligible(h), "free economy can fund the order");
  return h;
}
for (const op of operations) {
  if (op.id === 2)
    h = buy(
      waitFor(h, (x) => x.port.cash >= 500),
      "steel",
    );
  if (op.id === 5)
    h = buy(
      waitFor(h, (x) => x.port.cash >= 730),
      "power",
    );
  if ([1, 10, 20].includes(op.id)) {
    const q = stationPrice(h, "steady");
    h = waitFor(h, (x) => x.port.cash >= q.cash && x.port.steel >= q.steel);
    h = act(h, { type: "station", role: "steady", level: h.roles.steady });
  }
  for (const id of op.projects)
    if (!h.port.opening.works?.includes(id)) {
      const w = works.find((x) => x.id === id);
      h = waitFor(h, (x) => x.port.cash >= w.cash && x.port.steel >= w.steel);
      h = act(h, { type: "works", id });
    }
  assert.equal(entryReason(h, op.id), null);
  h = play(start(h, "campaign", op.id), true, true);
  assert.equal(h.result.win, true, "stage " + op.id);
  assert.equal(h.result.cash, op.firstCash);
  evidence.campaign.push({
    op: op.id,
    hp: h.result.hp,
    stars: h.result.stars,
    seconds: h.result.seconds,
    cash: h.result.cash,
  });
  h = done(h);
}
assert.equal(clearedThrough(h), 45);
assert.equal(h.port.opening.works.length, 4);
ok(
  "Fresh free port to all 45 authored goals, four regional projects purchased from earned industry",
);
const high = structuredClone(h),
  repeat = play(start(h, "campaign", 45));
assert.equal(repeat.result.cash, operations[44].repeatCash);
assert.equal(repeat.result.bonds, 0);
assert.deepEqual(decode(encode(repeat, clock)).harbor.result, repeat.result);
const weeklyBefore = play(start(newHarbor(), "weekly")),
  weeklyAfter = play(start(high, "weekly"));
assert.equal(weeklyBefore.result.points, weeklyAfter.result.points);
ok(
  "Repeat receipts, local weekly normalization across poor and developed ports",
);
const endless = play(start(high, "endless"));
assert.equal(endless.depth, 2);
assert.equal(endless.result.cash, 8);
const reset = act(high, { type: "new-run", run: high.run });
assert.equal(clearedThrough(reset), 0);
assert.equal(reset.run, 2);
assert.equal(reset.port.opening.priceFactor, 2);
assert.equal(act(reset, { type: "new-run", run: 1 }).run, 2);
assert.deepEqual(reset.archive, h.archive);
ok("Endless depth, voluntary prestige, retained archive and replay protection");
for (const sheet of contracts)
  for (const option of sheet.options) {
    const stocked = structuredClone(high);
    for (const k of ["oil", "steel", "fuel", "ammo"]) stocked.port[k] = 1500;
    const q = contractQuote(stocked, sheet.id, option.id);
    const launchOrder = {
      type: "dispatch",
      sheet: sheet.id,
      option: option.id,
      serial: stocked.serial,
    };
    let x = act(stocked, launchOrder);
    assert.equal(x.jobs.length, 1);
    assert.equal(act(x, launchOrder).jobs.length, 1);
    const ticket = x.jobs[0].ticket;
    assert.deepEqual(x.jobs[0].goods, q.manifest);
    assert.equal(act(x, { type: "new-run", run: x.run }).run, x.run);
    const returned = act(x, { type: "shipment", ticket, how: "cancel" });
    for (const k of Object.keys(q.manifest))
      assert.equal(returned.port[k], stocked.port[k]);
    const noTime = resume(x, clock, {
      ...clock,
      wall: clock.wall + 86400000,
      ms: clock.ms,
    });
    assert.equal(noTime.wall, x.wall);
    x = resume(x, clock, {
      ...clock,
      ms: clock.ms + q.offer.service_wall_s * 1000,
      wall: clock.wall + q.offer.service_wall_s * 1000,
    });
    const final = act(x, { type: "shipment", ticket, how: "settle" });
    assert.equal(final.jobs.length, 0);
    assert.equal(final.port.cash - x.port.cash, q.cash);
    assert.equal(final.bonds - x.bonds, q.bonds);
    assert.equal(
      act(final, { type: "shipment", ticket, how: "settle" }).port.cash,
      final.port.cash,
    );
    evidence.dispatches.push(sheet.id + "/" + option.id);
  }
ok(
  "All 40 manifests, reserved goods, cancellation, real elapsed maturity, single settlement, rollback",
);
if (process.env.HARBOR_EVIDENCE)
  fs.writeFileSync(
    process.env.HARBOR_EVIDENCE,
    JSON.stringify(evidence, null, 2),
  );
for (const label of evidence.fixtures) console.log("PASS " + label);
console.log(
  "PASS " +
    evidence.campaign.length +
    " actual campaign clears and " +
    evidence.dispatches.length +
    " contract options",
);
