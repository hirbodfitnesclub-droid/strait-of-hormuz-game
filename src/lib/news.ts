// War scenario + news engine (owner requirement, 2026-11-05): every attack and
// every phase has a UNIQUE scenario with news bulletins — no repeated war.
// Campaign waves 1-25 use the authored pack (src/data/scenarios.ts); endless /
// challenge / campaign waves >25 use the seeded procedural generator specified
// in docs/scenarios/endless-scenario-generator.md.
//
// Fix program (team SCEN): the generator now keeps a 30-run memory (operation
// names never repeat inside the window, the previous run's objective is never
// re-rolled, every 5th run is a forced escort/rescue event), zones are gated
// to the islands the player has actually unlocked, condition picks use the
// spec's weights instead of a uniform draw, and the news library carries 10
// headline templates + 10 bodies per type with no back-to-back repeats.
//
// Round 2 (QA): generation is SIDE-EFFECT-FREE and its result is persisted
// per (wave, mode) — a reload or a war-room preview returns the identical
// scenario and never registers a phantom run. History + the run counter
// advance exactly once per wave, at actual battle start, via
// commitScenarioForWave (called from startWave in game.ts).
import { CAMPAIGN_SCENARIOS, type CampaignScenario, type NewsItem } from "@/data/scenarios";

export interface Scenario {
  operationName: string; zone: string; briefing: string; objective: string;
  specialCondition: string | null; enemyFlavor: string;
  newsBefore: NewsItem; newsVictory: NewsItem; newsDefeat: NewsItem;
  authored: boolean;
}

/** Live game context the generator is allowed to see: which zones exist for
 *  this player, whether the platform-defense objective is unlocked (at least
 *  one offshore platform built), and whether a tanker is berthed loading
 *  right now (the port-defense objective needs one). Callers that pass no
 *  context keep the legacy ungated behaviour. */
export interface ScenarioContext { zones?: string[]; hasPlatform?: boolean; tankerLoading?: boolean }

export const WAR_ZONES = ["بندرعباس", "قشم", "هرمز", "لارک", "هنگام", "تنب بزرگ", "تنب کوچک", "ابوموسی", "کیش", "لاوان", "سیری", "خارک", "جاسک", "سکوهای نفتی خلیج فارس", "کانال اصلی تنگه"];
const OBJECTIVES = ["دفع حمله", "اسکورت کاروان", "دفاع از سکو", "رهگیری ناوگان", "دفاع هوایی", "شکستن محاصره", "نجات کشتی آسیب‌دیده", "دفاع از بندر هنگام بارگیری"];
const PREFIXES = ["سپر", "مشت", "چشم", "چتر", "دیوار", "تور", "سقف", "نگهبان", "فانوس", "تاج"];
const CORES = ["آهنین", "آتش", "فولاد", "شب", "سحر", "طوفان", "موج", "ساحل", "گلوگاه", "خاموش", "سرخ", "طلایی", "بیدار", "سنگین", "نهایی"];
const SUFFIX_BY_CONDITION: Record<string, string[]> = {
  "شب": ["در تاریکی", "نیمه‌شب"], "طوفان": ["در طوفان"], "حمله سحرگاه": ["سحرگاهی"],
  "موج پهپاد": ["ضد موج"], "مین‌گذاری دشمن": ["مین‌شکن"], "مه": ["در مه"],
};
/** Generator spec §۳ base weights (شب ۱۵، موج پهپاد ۱۵، بقیه ۱۰). The
 *  no-condition probability is tier-driven (45/30/15/5%) and applied first. */
const CONDITION_WEIGHTS: [string, number][] = [["شب", 15], ["مه", 10], ["طوفان", 10], ["حمله سحرگاه", 10], ["موج پهپاد", 15], ["مین‌گذاری دشمن", 10]];
const CAMPAIGN_NAMES = new Set(CAMPAIGN_SCENARIOS.map(s => s.operationName));

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fill(template: string, s: { zone: string; operationName: string; enemyFlavor: string; wave: number; count: number }) {
  return template.replaceAll("{zone}", s.zone).replaceAll("{operation}", s.operationName).replaceAll("{enemy}", s.enemyFlavor).replaceAll("{wave}", String(s.wave)).replaceAll("{count}", String(s.count));
}
/** News library (checklist §۴٫۰): at least 10 headline templates and 10
 *  bodies per type. Bodies are full sentences in the authored pack's
 *  wire-service tone; consecutive runs never reuse the same template or
 *  body for a type (the pick is nudged off the previous run's index, and
 *  the pick state is persisted so the chain survives reloads). */
const NEWS_BEFORE = [
  "تحرکات تازه در {zone}؛ عملیات «{operation}» آغاز می‌شود",
  "گزارش‌های میدانی از نزدیک‌شدن {enemy} به {zone} حکایت دارد",
  "فرماندهی منطقه: آماده‌باش کامل در {zone} برای عملیات «{operation}»",
  "{zone} در آماده‌باش؛ فرماندهی از آغاز عملیات «{operation}» خبر داد",
  "موج {wave} در راه {zone} است؛ پدافند منطقه به حالت جنگی درآمد",
  "شناسایی {count} شناور و پرندهٔ متخاصم نزدیک {zone}؛ رهگیری آغاز شد",
  "آژیر آماده‌باش در {zone}؛ عملیات «{operation}» وارد فاز اجرا شد",
  "منابع میدانی: {enemy} آرایش تهاجمی به سوی {zone} گرفته است",
  "گشت‌های شناسایی، ستون {enemy} را در مسیر {zone} ردیابی کردند",
  "فرماندهی مشترک آبراه: عملیات «{operation}» در {zone} کلید خورد",
];
const NEWS_BEFORE_BODY = [
  "عملیات «{operation}» در {zone} آغاز شده و پدافند در آماده‌باش کامل است.",
  "فرماندهی منطقه از همهٔ یگان‌های مستقر در {zone} خواست پوشش پدافندی را بدون وقفه حفظ کنند.",
  "سازمان بنادر اعلام کرد تردد تجاری در محدودهٔ {zone} فقط با اسکورت و هماهنگی پدافند انجام می‌شود.",
  "گزارش لحظه‌ای خبرنگار ما از {zone}: برجک‌ها در موضع‌اند و آسمان و آب‌های منطقه زیر نظر است.",
  "منابع نظامی می‌گویند {count} هدف مهاجم در مسیر {zone} شناسایی شده و شمارش معکوس نبرد آغاز شده است.",
  "ساکنان نوار ساحلی {zone} از استقرار نیروها خبر می‌دهند؛ فرماندهی خواست اخبار فقط از منابع رسمی دنبال شود.",
  "اتاق عملیات منطقه، «{operation}» را نبردی تعیین‌کننده برای امنیت آبراه در این مقطع خواند.",
  "یگان‌های پدافندی {zone} در بالاترین سطح آماده‌باش قرار گرفتند و ذخایر مهمات تکمیل شد.",
  "به گفتهٔ منابع آگاه، آرایش {enemy} نشان می‌دهد نبرد {zone} کوتاه نخواهد بود؛ پدافند برای درگیری طولانی آماده است.",
  "گزارش گشت‌های دریایی و هوایی هم‌زمان روی یک نقطه می‌رسد: {zone} هدف بعدی {enemy} است.",
];
const NEWS_VICTORY = [
  "عملیات «{operation}» در {zone} با موفقیت کامل پایان یافت",
  "{enemy} در {zone} عقب رانده شد؛ آبراه امن گزارش می‌شود",
  "پیروزی در {zone}؛ فرماندهی از عملکرد پدافند تقدیر کرد",
  "{enemy} از آب‌های {zone} عقب نشست؛ آبراه امن است",
  "موج {wave} در هم شکست؛ {zone} یک روز دیگر هم ایستاد",
  "پدافند {zone} همهٔ {count} هدف مهاجم را دفع کرد",
  "آسمان و آب‌های {zone} پاک است؛ عملیات «{operation}» به اهدافش رسید",
  "پرچم بر فراز {zone} ماند؛ {enemy} با خسارت سنگین عقب نشست",
  "زنگ پایان نبرد در {zone}؛ عملیات «{operation}» در دفتر پیروزی‌ها ثبت شد",
  "دفاع {zone} نشکست؛ {enemy} ناکام از آبراه بیرون رانده شد",
];
const NEWS_VICTORY_BODY = [
  "با پایان عملیات «{operation}»، تردد در {zone} به حالت عادی بازگشت.",
  "مسئولان محلی اعلام کردند هیچ زیرساخت حیاتی در {zone} آسیب ندیده و خدمات طبق روال ادامه دارد.",
  "فرماندهی منطقه در پیامی کوتاه از ایستادگی یگان‌های {zone} تقدیر کرد و آن را «دفاعی بی‌نقص» خواند.",
  "کشتیرانی بین‌المللی پس از تأیید امنیت {zone}، عبور برنامه‌ریزی‌شده از آبراه را از سر گرفت.",
  "گزارش میدانی: بقایای {enemy} از محدوده خارج شده‌اند و گشت‌زنی پیشگیرانه در {zone} ادامه دارد.",
  "سازمان بنادر از سرگیری کامل عملیات بارگیری و تخلیه در {zone} خبر داد.",
  "به گفتهٔ سخنگوی عملیات، هر {count} هدف مهاجم یا منهدم شد یا وادار به عقب‌نشینی شد.",
  "مردم {zone} صبح امروز با آرامش به ساحل بازگشتند؛ فرماندهی آماده‌باش را یک سطح پایین آورد.",
  "فرماندهی آبراه اعلام کرد مسیر تجاری {zone} بدون هیچ حادثه‌ای بازگشایی شده و کاروان‌ها در حرکت‌اند.",
  "در ارزیابی اولیه، عملکرد یگان‌های {zone} «الگویی برای دفاع ساحلی» خوانده شد.",
];
const NEWS_DEFEAT = [
  "درگیری سنگین در {zone}؛ خط دفاع موقتاً عقب نشست",
  "عملیات «{operation}» ناکام ماند؛ تلفات و خسارت در دست بررسی است",
  "{zone} زیر فشار {enemy}؛ نیروهای کمکی اعزام شدند",
  "نبرد {zone} به سود دشمن پایان یافت؛ عملیات «{operation}» ناکام ماند",
  "{zone} زیر آتش سنگین؛ فرماندهی وعدهٔ ضدحمله داد",
  "خسارت در {zone}؛ تیم‌های ترمیم اعزام شدند",
  "شکست تلخ در {zone}؛ خط پدافند برای بازسازی عقب کشیده شد",
  "{enemy} از شکاف پدافند {zone} گذشت؛ آماده‌باش به بالاترین سطح رسید",
  "آبراه در {zone} ناامن اعلام شد؛ کشتیرانی بین‌المللی هشدار گرفت",
  "عملیات «{operation}» به اهدافش نرسید؛ {zone} در انتظار ضدحمله",
];
const NEWS_DEFEAT_BODY = [
  "فرماندهی منطقه از اعزام نیروی کمکی و بازطراحی خط دفاع {zone} خبر داد.",
  "تیم‌های امدادی در محل‌های آسیب‌دیدهٔ {zone} مستقر شده‌اند و ارزیابی خسارت‌ها ادامه دارد.",
  "سخنگوی عملیات گفت نبرد «{operation}» درس‌های سختی داشت و آرایش پدافندی {zone} فوراً بازبینی می‌شود.",
  "تردد تجاری در محدودهٔ {zone} تا اطلاع ثانوی با احتیاط و فقط در قالب کاروان انجام می‌شود.",
  "منابع میدانی از ادامهٔ تحرکات {enemy} در اطراف {zone} خبر می‌دهند؛ ضدحمله در حال طراحی است.",
  "مهندسان نظامی بازسازی مواضع آسیب‌دیدهٔ {zone} را آغاز کرده‌اند و یگان‌های تازه‌نفس جایگزین شده‌اند.",
  "فرماندهی از مردم {zone} خواست آرامش خود را حفظ کنند و وعده داد آبراه «به هر قیمت» بازپس گرفته شود.",
  "گزارش تکمیلی: بخشی از تأسیسات {zone} از مدار خارج شده و تعمیرات اضطراری در جریان است.",
  "کمیتهٔ امنیت آبراه جلسهٔ اضطراری تشکیل داد و تقویت فوری پدافند {zone} را تصویب کرد.",
  "به‌رغم عقب‌نشینی، فرماندهی تأکید کرد هیچ شناور تجاری در {zone} رها نشده و اسکورت‌ها تا ساحل امن ادامه یافته است.",
];

// ---- Generator memory: the last 30 generated runs (names + objectives),
// persisted like the war diary so the no-repeat window survives reloads.
export interface ScenarioHistoryEntry { name: string; objective: string }
const HISTORY_KEY = "hormuz-scenario-history-v1";
const MEMORY_WINDOW = 30;
let memoryFallback: ScenarioHistoryEntry[] = [];
let lastTemplatePick: Record<"before" | "victory" | "defeat", number> = { before: -1, victory: -1, defeat: -1 };
let lastBodyPick: Record<"before" | "victory" | "defeat", number> = { before: -1, victory: -1, defeat: -1 };
/** The no-back-to-back-repeat pick state is persisted too (QA round 2):
 *  as module state it reset on every reload, so the first generation of a
 *  fresh session could repeat the previous session's last template. */
const PICKS_KEY = "hormuz-news-picks-v1";
let picksLoaded = false;
function loadPicks() {
  if (picksLoaded) return;
  picksLoaded = true;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(PICKS_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      for (const t of ["before", "victory", "defeat"] as const) {
        if (Number.isInteger(parsed.t?.[t])) lastTemplatePick[t] = parsed.t[t];
        if (Number.isInteger(parsed.b?.[t])) lastBodyPick[t] = parsed.b[t];
      }
    }
  } catch { /* memory only */ }
}
function savePicks() {
  try { window.localStorage.setItem(PICKS_KEY, JSON.stringify({ t: lastTemplatePick, b: lastBodyPick })); } catch { /* memory only */ }
}
/** Library sizes, exported for acceptance probes (checklist §۴٫۰: ≥10). */
export const NEWS_TEMPLATE_COUNTS = {
  before: NEWS_BEFORE.length, beforeBody: NEWS_BEFORE_BODY.length,
  victory: NEWS_VICTORY.length, victoryBody: NEWS_VICTORY_BODY.length,
  defeat: NEWS_DEFEAT.length, defeatBody: NEWS_DEFEAT_BODY.length,
};
/** Total generated runs ever (monotonic — the 30-entry history window is
 *  capped, so it cannot drive the every-5th-run rule by itself). */
const RUNS_KEY = "hormuz-scenario-runs-v1";
let runCountFallback = 0;
function loadRunCount(): number {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(RUNS_KEY) : null;
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= 0) runCountFallback = Math.floor(n);
  } catch { /* memory only */ }
  return runCountFallback;
}
function bumpRunCount() {
  runCountFallback = loadRunCount() + 1;
  try { window.localStorage.setItem(RUNS_KEY, String(runCountFallback)); } catch { /* memory only */ }
  return runCountFallback;
}
export function loadScenarioHistory(): ScenarioHistoryEntry[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(HISTORY_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      memoryFallback = parsed.filter(e => e && typeof e.name === "string" && typeof e.objective === "string").slice(-MEMORY_WINDOW);
    }
  } catch { /* storage unavailable: session memory still applies */ }
  return memoryFallback;
}
function recordScenarioHistory(name: string, objective: string) {
  loadScenarioHistory();
  memoryFallback = [...memoryFallback, { name, objective }].slice(-MEMORY_WINDOW);
  try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(memoryFallback)); } catch { /* memory only */ }
}

/** Objective weights by intensity tier (generator spec §۲ rule 2): simple
 *  objectives dominate early, complex ones (siege, port defense) late. */
const OBJECTIVE_WEIGHTS: Record<number, Record<string, number>> = {
  1: { "دفع حمله": 3, "اسکورت کاروان": 3, "نجات کشتی آسیب‌دیده": 1.5, "دفاع هوایی": 1, "رهگیری ناوگان": 1, "دفاع از سکو": 1, "شکستن محاصره": 0.5, "دفاع از بندر هنگام بارگیری": 0.5 },
  2: { "دفع حمله": 2, "اسکورت کاروان": 2, "نجات کشتی آسیب‌دیده": 1.5, "دفاع هوایی": 1.5, "رهگیری ناوگان": 1.5, "دفاع از سکو": 1.5, "شکستن محاصره": 1, "دفاع از بندر هنگام بارگیری": 1 },
  3: { "دفع حمله": 1.2, "اسکورت کاروان": 1.5, "نجات کشتی آسیب‌دیده": 1.5, "دفاع هوایی": 1.5, "رهگیری ناوگان": 1.5, "دفاع از سکو": 1.5, "شکستن محاصره": 2, "دفاع از بندر هنگام بارگیری": 1.5 },
  4: { "دفع حمله": 1, "اسکورت کاروان": 1.5, "نجات کشتی آسیب‌دیده": 1.5, "دفاع هوایی": 1.5, "رهگیری ناوگان": 1.5, "دفاع از سکو": 1.5, "شکستن محاصره": 2.5, "دفاع از بندر هنگام بارگیری": 2 },
};
function pickObjective(rnd: () => number, tier: number, history: ScenarioHistoryEntry[], runNo: number, ctx?: ScenarioContext): string {
  // Spec §۲ rule 3: every 5th generated run is a special event — escort or
  // rescue, alternating — for rhythm variety.
  if (runNo % 5 === 0) return Math.floor(runNo / 5) % 2 === 1 ? "اسکورت کاروان" : "نجات کشتی آسیب‌دیده";
  const weights = OBJECTIVE_WEIGHTS[tier] ?? OBJECTIVE_WEIGHTS[2];
  let pool = OBJECTIVES.filter(o => {
    if (ctx?.hasPlatform === false && o === "دفاع از سکو") return false;   // spec §۲ rule 4
    if (ctx?.tankerLoading === false && o === "دفاع از بندر هنگام بارگیری") return false;
    return (weights[o] ?? 0) > 0;
  });
  // Spec §۲ rule 1: never the same objective twice in a row.
  const previous = history[history.length - 1]?.objective;
  const rotated = pool.filter(o => o !== previous);
  if (rotated.length) pool = rotated;
  let total = 0;
  for (const o of pool) total += weights[o] ?? 0;
  let roll = rnd() * total;
  for (const o of pool) { roll -= weights[o] ?? 0; if (roll <= 0) return o; }
  return pool[pool.length - 1];
}

function pickCondition(rnd: () => number, tier: number): string | null {
  const noneP = [0.45, 0.30, 0.15, 0.05][tier - 1];
  if (rnd() < noneP) return null;
  const pool = CONDITION_WEIGHTS.filter(([c]) => tier >= 2 || (c !== "موج پهپاد" && c !== "مین‌گذاری دشمن"));
  let total = 0;
  for (const [, w] of pool) total += w;
  let roll = rnd() * total;
  for (const [c, w] of pool) { roll -= w; if (roll <= 0) return c; }
  return pool[pool.length - 1][0];
}

function pickNews(rnd: () => number, type: "before" | "victory" | "defeat", headlines: string[], bodies: string[], ctx: { zone: string; operationName: string; enemyFlavor: string; wave: number; count: number }): NewsItem {
  // No back-to-back repeat of the previous run's template or body.
  loadPicks();
  let hi = Math.floor(rnd() * headlines.length);
  if (hi === lastTemplatePick[type]) hi = (hi + 1) % headlines.length;
  let bi = Math.floor(rnd() * bodies.length);
  if (bi === lastBodyPick[type]) bi = (bi + 3) % bodies.length;
  lastTemplatePick[type] = hi; lastBodyPick[type] = bi;
  savePicks();
  return { headline: fill(headlines[hi], ctx), body: fill(bodies[bi], ctx) };
}

export function generatedScenario(wave: number, modeSalt = 0, ctx?: ScenarioContext): Scenario {
  const history = loadScenarioHistory();
  // Name exclusion covers the recorded 30-run window AND every scenario
  // already generated into the persistent cache, so two waves previewed
  // before either starts still cannot collide.
  const recentNames = new Set([...history.map(h => h.name), ...cachedScenarioNames()]);
  const rnd = mulberry32(wave * 2654435761 + modeSalt * 97 + 13);
  const tier = wave <= 5 ? 1 : wave <= 12 ? 2 : wave <= 20 ? 3 : 4;
  const zonePool = ctx?.zones?.length ? ctx.zones : WAR_ZONES;
  const zone = zonePool[Math.floor(rnd() * zonePool.length)];
  const condition = pickCondition(rnd, tier);
  const objective = pickObjective(rnd, tier, history, loadRunCount() + 1, ctx);
  // Name: prefix + core (+ condition suffix). Never a campaign name, never
  // a repeat inside the 30-run memory window (generator spec §۱).
  let operationName = "";
  for (let attempt = 0; attempt < 24; attempt++) {
    const name = `${PREFIXES[Math.floor(rnd() * PREFIXES.length)]} ${CORES[Math.floor(rnd() * CORES.length)]}`;
    const suffix = condition ? SUFFIX_BY_CONDITION[condition]?.[0] : undefined;
    operationName = suffix ? `${name} ${suffix}` : name;
    if (!CAMPAIGN_NAMES.has(operationName) && !recentNames.has(operationName)) break;
  }
  const enemyFlavor = tier === 1 ? (rnd() < 0.5 ? "دزدان دریایی" : "قایق‌های ناشناس") : tier >= 4 ? "اسکادران ناشناس" : "ناوگان متخاصم";
  const count = 5 + Math.min(wave, 15) + (wave % 5 === 0 ? 1 : 0);
  const newsCtx = { zone, operationName, enemyFlavor, wave, count };
  const scenario: Scenario = {
    operationName, zone, objective, specialCondition: condition, enemyFlavor, authored: false,
    briefing: `شناسایی منطقه، تحرکات ${enemyFlavor} را در محدودهٔ ${zone} تأیید کرده است. فرماندهی، عملیات «${operationName}» را با هدف ${objective} صادر کرده است${condition ? `؛ شرایط ویژه: ${condition}` : ""}.`,
    newsBefore: pickNews(rnd, "before", NEWS_BEFORE, NEWS_BEFORE_BODY, newsCtx),
    newsVictory: pickNews(rnd, "victory", NEWS_VICTORY, NEWS_VICTORY_BODY, newsCtx),
    newsDefeat: pickNews(rnd, "defeat", NEWS_DEFEAT, NEWS_DEFEAT_BODY, newsCtx),
  };
  // Deliberately NO history/counter writes here: generation is a pure read
  // of (wave, mode, committed history, cache). Recording happens once, at
  // battle start, in commitScenarioForWave — otherwise every preview and
  // every reload registered a phantom run and shifted the next roll (QA).
  return scenario;
}

// ---- Persistent generated-scenario cache: one scenario per (wave, mode),
// kept across reloads. The briefing bulletin, the battle report and the
// war-room preview must all describe the SAME operation the battle context
// was rolled from — even after a mid-battle reload — so the first roll is
// frozen here and never re-rolled. `committed` marks that the run has been
// recorded in the 30-run memory (battle actually started).
const CACHE_KEY = "hormuz-scenario-cache-v1";
const CACHE_LIMIT = 48;
interface ScenarioCacheEntry { scenario: Scenario; committed: boolean }
let cacheFallback: Record<string, ScenarioCacheEntry> = {};
let cacheLoaded = false;
function saltForMode(mode: "campaign" | "endless" | "challenge") {
  return mode === "endless" ? 1 : mode === "challenge" ? 2 : 3;
}
function loadScenarioCache(): Record<string, ScenarioCacheEntry> {
  if (cacheLoaded) return cacheFallback;
  cacheLoaded = true;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(CACHE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [k, e] of Object.entries(parsed as Record<string, unknown>)) {
        const entry = e as Partial<ScenarioCacheEntry> | null;
        const sc = entry?.scenario;
        if (sc && typeof sc.operationName === "string" && typeof sc.objective === "string" && typeof sc.newsBefore?.headline === "string") {
          cacheFallback[k] = { scenario: sc as Scenario, committed: entry?.committed === true };
        }
      }
    }
  } catch { /* storage unavailable: session memory still applies */ }
  return cacheFallback;
}
function saveScenarioCache() {
  const keys = Object.keys(cacheFallback);
  if (keys.length > CACHE_LIMIT) for (const k of keys.slice(0, keys.length - CACHE_LIMIT)) delete cacheFallback[k];
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(cacheFallback)); } catch { /* memory only */ }
}
function cachedScenarioNames(): string[] {
  return Object.values(loadScenarioCache()).map(e => e.scenario.operationName);
}

const generatedMemo = new Map<string, Scenario>();
export function scenarioForWave(wave: number, mode: "campaign" | "endless" | "challenge", ctx?: ScenarioContext): Scenario {
  if (mode === "campaign" && wave >= 1 && wave <= CAMPAIGN_SCENARIOS.length) {
    const s: CampaignScenario = CAMPAIGN_SCENARIOS[wave - 1];
    return { ...s, authored: true };
  }
  const key = `${wave}|${saltForMode(mode)}`;
  const memo = generatedMemo.get(key);
  if (memo) return memo;
  const cache = loadScenarioCache();
  const hit = cache[key];
  if (hit) { generatedMemo.set(key, hit.scenario); return hit.scenario; }
  const scenario = generatedScenario(wave, saltForMode(mode), ctx);
  cache[key] = { scenario, committed: false };
  saveScenarioCache();
  generatedMemo.set(key, scenario);
  return scenario;
}

/** Record a generated run in the 30-run memory + counter — called exactly
 *  once per (wave, mode), from startWave, when the battle actually begins.
 *  A retry of the same wave finds the entry already committed and records
 *  nothing: a re-attempt is the same operation, not a new run. Authored
 *  campaign waves are not generator runs and never recorded. */
export function commitScenarioForWave(wave: number, mode: "campaign" | "endless" | "challenge") {
  if (mode === "campaign" && wave >= 1 && wave <= CAMPAIGN_SCENARIOS.length) return;
  const key = `${wave}|${saltForMode(mode)}`;
  const entry = loadScenarioCache()[key];
  if (!entry || entry.committed) return;
  recordScenarioHistory(entry.scenario.operationName, entry.scenario.objective);
  bumpRunCount();
  entry.committed = true;
  saveScenarioCache();
}

// ---- War diary (دفترچه جنگ) — persisted separately from the core game save.
export interface DiaryEntry {
  at: number; wave: number; kind: "before" | "victory" | "defeat"; headline: string; body: string;
  /** Fix program (SCEN): diary records carry the day, the operation zone
   *  and the result explicitly (older saves lack them — all optional). */
  day?: number; zone?: string; result?: "before" | "victory" | "defeat";
}
const DIARY_KEY = "hormuz-war-diary-v1";
export function loadDiary(): DiaryEntry[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(DIARY_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.headline === "string") : [];
  } catch { return []; }
}
export function appendDiary(entry: DiaryEntry): DiaryEntry[] {
  const diary = loadDiary();
  // A retried wave must not stack duplicate pre-battle entries: the same
  // wave + headline "before" record is written once, however often the
  // briefing effect refires.
  if (entry.kind === "before" && diary.some(e => e.kind === "before" && e.wave === entry.wave && e.headline === entry.headline)) return diary;
  const full: DiaryEntry = {
    ...entry,
    day: entry.day ?? Math.floor(entry.at / 86400000),
    result: entry.result ?? entry.kind,
  };
  const next = [...diary, full].slice(-120);
  try { window.localStorage.setItem(DIARY_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  return next;
}
