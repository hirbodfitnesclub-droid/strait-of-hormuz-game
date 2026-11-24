const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load-game.cjs");
const { newHarbor, advance } = load("src/harbor/session.ts");
const { encode, LIVE } = load("src/harbor/storage.ts");
const url = process.env.TEST_URL || "http://127.0.0.1:4173";
const evidence = process.env.HARBOR_UI_EVIDENCE;
const epoch = Date.UTC(2026, 10, 23, 12);
const snapshots = [];
async function run() {
  if (evidence) fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.AUDIT_CHROMIUM || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const errors = [];
  async function open(width, height, state) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      isMobile: width < 700,
      deviceScaleFactor: 1,
    });
    if (process.env.HARBOR_SINGLE_FILE) {
      await context.route(/^https?:/, async (route) => {
        if (
          route.request().isNavigationRequest() &&
          route.request().url() === url
        )
          return route.continue();
        errors.push(
          "Unexpected network request from standalone game: " +
            route.request().url(),
        );
        return route.abort();
      });
    }
    if (state) {
      state.port.lastSavedAt = epoch;
      const raw = encode(state, { boot: "", ms: 0, wall: epoch });
      await context.addInitScript(
        ({ raw, key }) => {
          if (!sessionStorage.getItem("fixture.loaded")) {
            localStorage.setItem(key, raw);
            sessionStorage.setItem("fixture.loaded", "1");
          }
        },
        { raw, key: LIVE },
      );
    }
    const page = await context.newPage();
    await page.clock.install({ time: new Date(epoch) });
    await page.clock.pauseAt(new Date(epoch + 1000));
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400)
        errors.push(r.status() + " " + new URL(r.url()).pathname);
    });
    await page.goto(url);
    await page.getByTestId("harbor").waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    return { context, page };
  }
  const read = (page) =>
    page.evaluate(
      (key) => JSON.parse(JSON.parse(localStorage.getItem(key)).body).harbor,
      LIVE,
    );
  const button = (p, name) => p.getByRole("button", { name, exact: true });
  async function shot(p, id) {
    if (evidence)
      await p.screenshot({ path: path.join(evidence, id + ".png") });
  }
  async function mark(p, id) {
    const h = await read(p),
      o = h.port.opening;
    snapshots.push({
      id,
      at: o.activeSeconds,
      oil: h.port.oil,
      cash: h.port.cash,
      bank: h.port.idle.bank,
      stalled: o.stalled,
      manual: o.manualWaveAt,
      events: o.events,
      ledger: o.ledger,
    });
  }
  async function close(p) {
    await button(p, "بستن").click();
  }
  async function next(p) {
    await button(p, "آماده‌سازی عملیات").click();
    await p.getByRole("button", { name: /^آغاز عملیات/ }).click();
  }
  async function fight(p, manual = true) {
    for (let i = 0; i < 300; i++) {
      if (await p.getByRole("dialog", { name: "گزارش گذر" }).count()) break;
      await p.clock.runFor(650);
      const fire = button(p, "تاباندن نور");
      if (manual && (await fire.count()) && (await fire.isEnabled()))
        await fire.click();
    }
    await p.getByRole("dialog", { name: "گزارش گذر" }).waitFor();
    return (await read(p)).result;
  }
  try {
    const { context, page: p } = await open(393, 852);
    await shot(p, "fresh");
    await mark(p, "initial");
    assert.equal((await read(p)).port.oil, 400);
    await p.clock.fastForward(12000);
    await button(p, "خزانه بندر").click();
    await p.getByRole("button", { name: /^برداشت .+ ریال$/ }).click();
    await p.clock.fastForward(58000);
    let h = await read(p);
    assert.equal(h.port.opening.stallStartedAt, 70);
    await shot(p, "stall");
    await mark(p, "stall");
    await p.clock.fastForward(50000);
    h = await read(p);
    assert.equal(h.port.opening.manualWaveAt, null);
    await p.clock.fastForward(18000);
    h = await read(p);
    assert.equal(
      h.port.opening.events.find((e) => e.kind === "natural_recovery").at,
      138,
    );
    await mark(p, "natural");
    await next(p);
    h = await read(p);
    assert.ok(h.port.opening.manualWaveAt >= 120);
    await mark(p, "manual");
    await p.clock.runFor(7300);
    await shot(p, "first-wave");
    await p.reload();
    await p.getByTestId("harbor").waitFor();
    await button(p, "ادامهٔ گذر").click();
    let r = await fight(p);
    assert.equal(r.win, true);
    assert.equal(r.hp, 20);
    await shot(p, "result");
    await button(p, "بازگشت به بندر").click();
    await next(p);
    r = await fight(p);
    assert.equal(r.win, true);
    await button(p, "بازگشت به بندر").click();
    await next(p);
    r = await fight(p, false);
    assert.equal(r.win, false);
    assert.ok(r.wear.length > 0);
    await button(p, "دیدن برگ تعمیر").click();
    await p.getByRole("button", { name: /^تعمیر ·/ }).click();
    await close(p);
    assert.equal((await read(p)).port.opening.wear.dock, 1);
    await button(p, "کارگاه").click();
    await shot(p, "workshop");
    await button(p, "عملیات").click();
    await shot(p, "chart");
    await button(p, "فصل بعدی").click();
    await button(p, "دفتر").click();
    await button(p, "پرچم‌ها").click();
    await p.getByRole("button", { name: /مرجان/ }).click();
    assert.equal((await read(p)).pennant, 1);
    await context.close();
    console.log(
      "PASS fresh touch route through the first three operations, natural restart, pause/restore and actual repair",
    );
    for (const [cash, bank, label] of [
      [1200, 260, "wallet"],
      [20, 260, "treasury"],
      [20, 0, "poor"],
    ]) {
      const seeded = advance(newHarbor(), 70, 0);
      seeded.port.cash = cash;
      seeded.port.idle.bank = bank;
      const { context, page } = await open(360, 640, seeded);
      if (label === "treasury") {
        await button(page, "خزانه بندر").click();
        await page.getByRole("button", { name: /^برداشت .+ ریال$/ }).click();
      }
      await button(page, "مخزن نفت").click();
      const upgrade = page.getByRole("button", { name: /^ارتقا · ۹۰ ریال$/ });
      if (label === "poor") {
        assert.equal(await upgrade.isDisabled(), true);
        await close(page);
        await page.clock.fastForward(68000);
        assert.equal((await read(page)).port.opening.mastery, false);
      } else {
        await upgrade.click();
        await page.clock.fastForward(4000);
        const state = await read(page);
        assert.equal(state.port.opening.mastery, true);
        assert.equal(state.port.buildings.tank, 2);
        assert.equal(await button(page, "زیرساخت ساخته‌شده مخزن").count(), 1);
      }
      await context.close();
    }
    console.log(
      "PASS cash, treasury and poor paths through the upgrade card at 360×640",
    );
    {
      const { context, page } = await open(393, 852);
      const legacy = load("src/lib/game.ts").initialGame();
      legacy.cash = 4321;
      legacy.highestWave = 4;
      legacy.idle.modeBest.campaign = 4;
      legacy.lastSavedAt = epoch;
      const file = {
        name: "hormuz-save.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({ format: "hormuz-save", version: 2, state: legacy }),
        ),
      };
      await button(page, "تنظیمات").click();
      const picker = page.locator('input[type="file"]');
      await picker.setInputFiles(file);
      await button(page, "انصراف").click();
      assert.equal((await read(page)).port.cash, 1200);
      await picker.setInputFiles(file);
      await button(page, "تأیید جایگزینی").click();
      assert.equal((await read(page)).port.cash, 4321);
      assert.equal((await read(page)).stars[4], 1);
      await context.close();
      console.log(
        "PASS legacy JSON through the file picker, cancel and confirm",
      );
    }
    for (const [w, h] of [
      [320, 568],
      [844, 390],
      [1280, 800],
    ]) {
      const { context, page } = await open(w, h);
      await button(page, "تنظیمات").click();
      const s = page.getByRole("switch", { name: "راهنمای ناخدا نوا" });
      await s.click();
      await close(page);
      await button(page, "تمرین فانوس").click();
      await page.clock.runFor(4500);
      const aim = page.locator(".signal.sweet").first();
      await aim.click({ force: true });
      assert.ok((await read(page)).voyage.manual > 0);
      await button(page, "مکث").click();
      await button(page, "ادامهٔ گذر").click();
      await button(page, "پایان تمرین").click();
      assert.equal(await page.locator("dialog[open]").count(), 0);
      assert.equal((await read(page)).settings.hints, false);
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS practice, settings, Android-sized / short landscape / desktop layouts, zero page and asset errors",
    );
    if (evidence)
      fs.writeFileSync(
        path.join(evidence, "opening-trace.json"),
        JSON.stringify(snapshots, null, 2),
      );
  } finally {
    await browser.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
