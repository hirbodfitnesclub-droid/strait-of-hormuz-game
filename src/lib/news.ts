// War scenario + news engine (owner requirement, 2026-11-05): every attack and
// every phase has a UNIQUE scenario with news bulletins — no repeated war.
// Campaign waves 1-25 use the authored pack (src/data/scenarios.ts); endless /
// challenge / campaign waves >25 use the seeded procedural generator specified
// in docs/scenarios/endless-scenario-generator.md.
import { CAMPAIGN_SCENARIOS, type CampaignScenario, type NewsItem } from "@/data/scenarios";

export interface Scenario {
  operationName: string; zone: string; briefing: string; objective: string;
  specialCondition: string | null; enemyFlavor: string;
  newsBefore: NewsItem; newsVictory: NewsItem; newsDefeat: NewsItem;
  authored: boolean;
}

export const WAR_ZONES = ["بندرعباس", "قشم", "هرمز", "لارک", "هنگام", "تنب بزرگ", "تنب کوچک", "ابوموسی", "کیش", "لاوان", "سیری", "خارک", "جاسک", "سکوهای نفتی خلیج فارس", "کانال اصلی تنگه"];
const OBJECTIVES = ["دفع حمله", "اسکورت کاروان", "دفاع از سکو", "رهگیری ناوگان", "دفاع هوایی", "شکستن محاصره", "نجات کشتی آسیب‌دیده", "دفاع از بندر هنگام بارگیری"];
const PREFIXES = ["سپر", "مشت", "چشم", "چتر", "دیوار", "تور", "سقف", "نگهبان", "فانوس", "تاج"];
const CORES = ["آهنین", "آتش", "فولاد", "شب", "سحر", "طوفان", "موج", "ساحل", "گلوگاه", "خاموش", "سرخ", "طلایی", "بیدار", "سنگین", "نهایی"];
const SUFFIX_BY_CONDITION: Record<string, string[]> = {
  "شب": ["در تاریکی", "نیمه‌شب"], "طوفان": ["در طوفان"], "حمله سحرگاه": ["سحرگاهی"],
  "موج پهپاد": ["ضد موج"], "مین‌گذاری دشمن": ["مین‌شکن"], "مه": ["در مه"],
};
const CONDITIONS: (string | null)[] = [null, "شب", "مه", "طوفان", "حمله سحرگاه", "موج پهپاد", "مین‌گذاری دشمن"];
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

function fill(template: string, s: { zone: string; operationName: string; enemyFlavor: string; wave: number }) {
  return template.replaceAll("{zone}", s.zone).replaceAll("{operation}", s.operationName).replaceAll("{enemy}", s.enemyFlavor).replaceAll("{wave}", String(s.wave));
}
const NEWS_BEFORE = [
  "تحرکات تازه در {zone}؛ عملیات «{operation}» آغاز می‌شود",
  "گزارش‌های میدانی از نزدیک‌شدن {enemy} به {zone} حکایت دارد",
  "فرماندهی منطقه: آماده‌باش کامل در {zone} برای عملیات «{operation}»",
];
const NEWS_VICTORY = [
  "عملیات «{operation}» در {zone} با موفقیت کامل پایان یافت",
  "{enemy} در {zone} عقب رانده شد؛ آبراه امن گزارش می‌شود",
  "پیروزی در {zone}؛ فرماندهی از عملکرد پدافند تقدیر کرد",
];
const NEWS_DEFEAT = [
  "درگیری سنگین در {zone}؛ خط دفاع موقتاً عقب نشست",
  "عملیات «{operation}» ناکام ماند؛ تلفات و خسارت در دست بررسی است",
  "{zone} زیر فشار {enemy}؛ نیروهای کمکی اعزام شدند",
];

export function generatedScenario(wave: number, modeSalt = 0): Scenario {
  const rnd = mulberry32(wave * 2654435761 + modeSalt * 97 + 13);
  const tier = wave <= 5 ? 1 : wave <= 12 ? 2 : wave <= 20 ? 3 : 4;
  const zone = WAR_ZONES[Math.floor(rnd() * WAR_ZONES.length)];
  // condition: none-probability shrinks with tier (45/30/15/5 %)
  const noneP = [0.45, 0.30, 0.15, 0.05][tier - 1];
  let condition: string | null = null;
  if (rnd() >= noneP) {
    const pool = CONDITIONS.slice(1).filter(c => tier >= 2 || (c !== "موج پهپاد" && c !== "مین‌گذاری دشمن"));
    condition = pool[Math.floor(rnd() * pool.length)] ?? null;
  }
  let operationName = "";
  for (let attempt = 0; attempt < 12; attempt++) {
    const name = `${PREFIXES[Math.floor(rnd() * PREFIXES.length)]} ${CORES[Math.floor(rnd() * CORES.length)]}`;
    const suffix = condition ? SUFFIX_BY_CONDITION[condition]?.[0] : undefined;
    operationName = suffix ? `${name} ${suffix}` : name;
    if (!CAMPAIGN_NAMES.has(operationName)) break;
  }
  const objective = wave % 5 === 0 && (wave % 10 === 0)
    ? "نجات کشتی آسیب‌دیده"
    : OBJECTIVES[Math.floor(rnd() * OBJECTIVES.length)];
  const enemyFlavor = tier === 1 ? (rnd() < 0.5 ? "دزدان دریایی" : "قایق‌های ناشناس") : tier >= 4 ? "اسکادران ناشناس" : "ناوگان متخاصم";
  const ctx = { zone, operationName, enemyFlavor, wave };
  const pick = (arr: string[]) => fill(arr[Math.floor(rnd() * arr.length)], ctx);
  return {
    operationName, zone, objective, specialCondition: condition, enemyFlavor, authored: false,
    briefing: `شناسایی منطقه، تحرکات ${enemyFlavor} را در محدودهٔ ${zone} تأیید کرده است. فرماندهی، عملیات «${operationName}» را با هدف ${objective} صادر کرده است${condition ? `؛ شرایط ویژه: ${condition}` : ""}.`,
    newsBefore: { headline: pick(NEWS_BEFORE), body: `عملیات «${operationName}» با هدف ${objective} در ${zone} آغاز شده و پدافند در آماده‌باش کامل است.` },
    newsVictory: { headline: pick(NEWS_VICTORY), body: `با پایان عملیات «${operationName}»، تردد در ${zone} به حالت عادی بازگشت.` },
    newsDefeat: { headline: pick(NEWS_DEFEAT), body: `فرماندهی منطقه از اعزام نیروی کمکی و بازطراحی خط دفاع ${zone} خبر داد.` },
  };
}

export function scenarioForWave(wave: number, mode: "campaign" | "endless" | "challenge"): Scenario {
  if (mode === "campaign" && wave >= 1 && wave <= CAMPAIGN_SCENARIOS.length) {
    const s: CampaignScenario = CAMPAIGN_SCENARIOS[wave - 1];
    return { ...s, authored: true };
  }
  return generatedScenario(wave, mode === "endless" ? 1 : mode === "challenge" ? 2 : 3);
}

// ---- War diary (دفترچه جنگ) — persisted separately from the core game save.
export interface DiaryEntry { at: number; wave: number; kind: "before" | "victory" | "defeat"; headline: string; body: string }
const DIARY_KEY = "hormuz-war-diary-v1";
export function loadDiary(): DiaryEntry[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(DIARY_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.headline === "string") : [];
  } catch { return []; }
}
export function appendDiary(entry: DiaryEntry): DiaryEntry[] {
  const diary = [...loadDiary(), entry].slice(-120);
  try { window.localStorage.setItem(DIARY_KEY, JSON.stringify(diary)); } catch { /* storage unavailable */ }
  return diary;
}
