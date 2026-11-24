import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { attachWebView, until } from "./harbor-webview.mjs";

const [apk, directory] = process.argv.slice(2);
if (!apk || !directory)
  throw new Error(
    "Usage: node scripts/test-harbor-android.mjs candidate.apk evidence-directory",
  );
mkdirSync(directory, { recursive: true });
const bin = process.env.ADB || "adb",
  serial = process.env.ANDROID_SERIAL;
function device(...args) {
  return execFileSync(bin, [...(serial ? ["-s", serial] : []), ...args], {
    timeout: 150000,
    maxBuffer: 24 * 1024 * 1024,
  });
}
const adb = (...args) =>
  device(...args)
    .toString()
    .trim();
const app = "ir.hormuz.sovereign",
  receipts = [];
const write = (name, data) =>
  writeFileSync(
    path.join(directory, name + ".json"),
    JSON.stringify(data, null, 2),
  );
const key = "hormuz-lantern-1";
const expression =
  "JSON.parse(JSON.parse(localStorage.getItem(" +
  JSON.stringify(key) +
  ")).body).harbor";
const state = () => page.evaluate(expression);
async function capture(label) {
  const h = await state(),
    o = h.port.opening;
  receipts.push({
    label,
    at: o.activeSeconds,
    seed: o.seed,
    bank: h.port.idle.bank,
    cash: h.port.cash,
    oil: h.port.oil,
    tanker: h.port.idle.port.tanker,
    events: o.events,
    ledger: o.ledger,
    mastery: o.mastery,
    voyage: h.voyage?.id ?? null,
    result: h.result?.id ?? null,
  });
  write("android-trace", receipts);
  writeFileSync(
    path.join(directory, label + ".png"),
    device("exec-out", "screencap", "-p"),
  );
  console.log(label, "active seconds", o.activeSeconds);
}
async function confirm(test) {
  return until(async () => test(await state()), 280000);
}
const at = (second) => confirm((h) => h.port.opening.activeSeconds >= second);
async function tap(label, prefix = false) {
  const point = await until(
    () =>
      page.evaluate(`(() => {
 const needle=${JSON.stringify(label)};
 const el=[...document.querySelectorAll("button")].find(el=>{
  const title=(el.getAttribute("aria-label")||el.innerText).trim();
  return !el.disabled&&el.getClientRects().length&&(${prefix} ? title.startsWith(needle):title===needle);
 });if(!el)return null;
 el.scrollIntoView({block:"center",behavior:"instant"});const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
 if(!el.contains(document.elementFromPoint(x,y)))return null;
 const ratio=(window.visualViewport?.scale||1)*devicePixelRatio;
 return [Math.round(x*ratio),Math.round(y*ratio)];
 })()`),
    90000,
  );
  adb("shell", "input", "tap", ...point.map(String));
}
assert.equal(
  adb("shell", "getprop", "ro.kernel.qemu"),
  "1",
  "The fresh-install suite only clears its own emulator",
);
console.log(adb("install", "--no-streaming", "-r", apk));
assert.equal(adb("shell", "pm", "clear", app), "Success");
adb(
  "shell",
  "settings",
  "put",
  "secure",
  "immersive_mode_confirmations",
  "confirmed",
);
adb("shell", "wm", "dismiss-keyguard");
adb("shell", "am", "start", "-n", app + "/.MainActivity");
let page = await attachWebView(adb, app);
try {
  await until(() =>
    page.evaluate('!!document.querySelector("[data-testid=harbor]")'),
  );
  write("device", {
    model: adb("shell", "getprop", "ro.product.model"),
    api: adb("shell", "getprop", "ro.build.version.sdk"),
    abi: adb("shell", "getprop", "ro.product.cpu.abi"),
    webview: await page.evaluate("navigator.userAgent"),
    screen: await page.evaluate(
      "({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})",
    ),
  });
  await capture("01-harbor");
  await at(12);
  await tap("خزانه بندر");
  await tap("برداشت ", true);
  await confirm((h) => h.port.opening.collectedFirstToll);
  await at(70);
  await capture("02-tank");
  let h = await state();
  assert.equal(h.port.opening.stallStartedAt, 70);
  assert.equal(h.port.opening.firstTollAt, 12);
  await at(138);
  h = await state();
  assert.equal(h.port.opening.manualWaveAt, null);
  assert.equal(
    h.port.opening.events.find((e) => e.kind === "natural_recovery").at,
    138,
  );
  await capture("03-resumed");
  await tap("آماده‌سازی عملیات");
  await tap("آغاز عملیات ۱");
  await confirm((h) => h.voyage !== null);
  await capture("04-sailing");
  adb("shell", "input", "keyevent", "KEYCODE_HOME");
  await delay(2400);
  adb("shell", "am", "start", "-n", app + "/.MainActivity");
  await tap("ادامهٔ گذر");
  await confirm((h) => h.result?.op === 1);
  await capture("05-report");
  h = await state();
  assert.equal(h.result.win, true);
  assert.equal(h.result.hp, 20);
  await tap("بازگشت به بندر");
  await at(180);
  await capture("06-complete");
  const oldCash = (await state()).port.cash;
  page.close();
  page = null;
  adb("shell", "am", "force-stop", app);
  adb("shell", "am", "start", "-n", app + "/.MainActivity");
  page = await attachWebView(adb, app);
  await until(() =>
    page.evaluate('!!document.querySelector("[data-testid=harbor]")'),
  );
  h = await state();
  assert.equal(h.port.cash, oldCash);
  assert.equal(h.result, null);
  assert.equal(h.stars[1], 3);
  assert.equal(h.port.opening.mastery, false);
  await capture("07-relaunch");
  console.log(
    "PASS native touch, 180 active seconds, first receipt, stall at 70, natural recovery at 138, voluntary wave, background, relaunch, single payout",
  );
} finally {
  page?.close();
}
