// Scenario mechanics layer (fix program, team SCEN — audit بحرانی-۱۴/۱۵/۱۶,
// checklist §۴). The authored/generated scenario TEXT lives in
// src/data/scenarios.ts + src/lib/news.ts and was already complete; what was
// missing is everything in this file: wave composition derived from the
// scenario, real win/lose rules per objective, and mechanical effects for
// the special conditions. game.ts consumes these tables — no scenario rule
// is hard-coded in the tick.
import { CAMPAIGN_SCENARIOS } from "@/data/scenarios";
import type { Scenario, ScenarioContext } from "./news";
import type { GameState } from "./game";

export type EnemyClass = "speed" | "corvette" | "air" | "sub" | "destroyer" | "boss";
export type ObjectiveType = "repel" | "escort" | "airdef" | "intercept" | "structure" | "siege" | "rescue";

/** Objective text (as authored in scenarios.ts) → mechanical rule type.
 *  «دفاع از سکو» and «دفاع از بندر هنگام بارگیری» share the structure-HP
 *  rule (checklist ۴٫۰: the platform / the berthed tanker has its own HP). */
export const OBJECTIVE_TYPE_BY_TEXT: Record<string, ObjectiveType> = {
  "دفع حمله": "repel",
  "اسکورت کاروان": "escort",
  "دفاع هوایی": "airdef",
  "رهگیری ناوگان": "intercept",
  "دفاع از سکو": "structure",
  "دفاع از بندر هنگام بارگیری": "structure",
  "شکستن محاصره": "siege",
  "نجات کشتی آسیب‌دیده": "rescue",
};
export function objectiveTypeOf(objectiveText: string): ObjectiveType {
  return OBJECTIVE_TYPE_BY_TEXT[objectiveText] ?? "repel";
}

/** Class-weight table for the 25 authored operations, extracted from each
 *  operation's objective + enemy flavour + special condition (deliverable:
 *  the mapping is data, not code paths). Weights are relative shares of the
 *  non-boss units; the boss (waves 5/10/15/20/25) is appended separately.
 *  Guarantees enforced again in buildSpawnQueue: air-defense ≥ 60% air,
 *  drone-wave ≥ 40% air, operation 3 introduces air with NO submarine. */
export const CAMPAIGN_COMPOSITION: Record<number, Partial<Record<EnemyClass, number>>> = {
  1: { speed: 0.70, corvette: 0.30 },                                        // سپر ساحل — دزدان دریایی، ترکیب سبک (بازنویسی دزدان در buildSpawnQueue همین سهم واقعی را می‌سازد؛ QA دور ۲: جدول قبلی ۰٫۷۵/۰٫۲۵ با صف واقعی نمی‌خواند)
  2: { speed: 0.625, corvette: 0.375 },                                      // گذرگاه امن — اسکورت در مه (زیردریایی از موج ۳ وارد می‌شود؛ در موج ۲ گیت کلاس سهم‌ها را دقیقاً به همین نسبت واقعی بازتوزیع می‌کند — QA دور ۲)
  3: { air: 0.62, speed: 0.38 },                                             // چشم بیدار — دفاع هوایی، اولین تهدید هوایی
  4: { speed: 0.40, corvette: 0.35, destroyer: 0.25 },                       // تور صیاد — رهگیری ناوگان سنگین
  5: { air: 0.45, speed: 0.20, corvette: 0.15, destroyer: 0.20 },            // دیوار آتش — موج پهپاد + باس ۱ (D-024: سهم ناوشکن دوبرابر شد — سرعت‌ها خوراک توپ‌اند و نشتشان ۱ قلب است؛ ناوشکن هم HP و موشکِ ازکارانداز دارد هم نشتش ۳ قلب. خط tier-1 پنج‌برجکه دیگر نباید باس ۱ را با ۱۱ قلب کامل پاک کند؛ خطوط ارتقایافته همچنان راحت می‌برند — probe_balance.cjs)
  6: { speed: 0.70, corvette: 0.30 },                                        // بارگیری زیر آتش — شب (طعم «دزدان دریایی» عملیات ۶ هم مثل عملیات ۱ زیر بازنویسی دزدان است؛ سهم واقعی صف همین است — هم‌ترازی هم‌کلاس با ردیف ۱)
  7: { speed: 0.35, corvette: 0.30, air: 0.20, sub: 0.15 },                  // حلقه‌شکن — محاصره + طوفان
  8: { air: 0.65, speed: 0.20, corvette: 0.15 },                             // چتر فولادی — دفاع هوایی
  9: { speed: 0.45, corvette: 0.30, sub: 0.15, air: 0.10 },                  // کاروان طلایی — اسکورت
  10: { speed: 0.30, sub: 0.30, corvette: 0.20, destroyer: 0.20 },           // نگهبان شعله — سکو + مین‌گذاری + باس ۲
  11: { speed: 0.40, corvette: 0.30, sub: 0.30 },                            // شکارچیان شب — رهگیری شبانه
  12: { air: 0.35, speed: 0.35, corvette: 0.30 },                            // سپیده‌دم سرخ — بارگیری + سحرگاه
  13: { speed: 0.45, corvette: 0.30, destroyer: 0.25 },                      // مشت آهنین — جبهه شرقی
  14: { speed: 0.40, corvette: 0.30, air: 0.30 },                            // ستون‌های دریا — سکو + طوفان
  15: { air: 0.45, speed: 0.25, corvette: 0.20, destroyer: 0.10 },           // سد گلوگاه — محاصره + موج پهپاد + باس ۳
  16: { speed: 0.55, corvette: 0.25, air: 0.20 },                            // فانوس نجات — نجات در مه
  17: { air: 0.65, speed: 0.20, corvette: 0.15 },                            // سقف آهنین — دفاع هوایی شبانه
  18: { speed: 0.40, corvette: 0.30, sub: 0.15, destroyer: 0.15 },           // عبور بزرگ — اسکورت سنگین
  19: { sub: 0.30, speed: 0.35, corvette: 0.20, destroyer: 0.15 },           // خنثی‌ساز — مین‌گذاری
  20: { speed: 0.35, corvette: 0.30, air: 0.20, destroyer: 0.15 },           // طلوع خونین — رهگیری + سحرگاه + باس ۴
  21: { speed: 0.35, corvette: 0.30, sub: 0.20, destroyer: 0.15 },           // سنگر سکو — دفاع از سکو
  22: { speed: 0.35, corvette: 0.30, air: 0.20, sub: 0.15 },                 // دیوار طوفان — محاصره + طوفان
  23: { air: 0.50, speed: 0.30, corvette: 0.20 },                            // آخرین بارگیری — موج پهپاد
  24: { speed: 0.50, sub: 0.20, corvette: 0.30 },                            // نجات در تاریکی — نجات شبانه
  25: { air: 0.30, speed: 0.25, corvette: 0.20, sub: 0.10, destroyer: 0.15 },// تاج هرمز — سحرگاه + باس ۵
};

/** Composition for generated (endless/challenge) scenarios, by objective. */
export const GENERATED_COMPOSITION: Record<ObjectiveType, Partial<Record<EnemyClass, number>>> = {
  repel: { speed: 0.45, corvette: 0.25, air: 0.15, sub: 0.15 },
  escort: { speed: 0.45, corvette: 0.30, sub: 0.15, air: 0.10 },
  airdef: { air: 0.65, speed: 0.20, corvette: 0.15 },
  intercept: { speed: 0.40, corvette: 0.35, destroyer: 0.25 },
  structure: { speed: 0.40, corvette: 0.30, sub: 0.15, air: 0.15 },
  siege: { speed: 0.35, corvette: 0.30, air: 0.20, sub: 0.15 },
  rescue: { speed: 0.50, corvette: 0.30, air: 0.20 },
};

/** Checklist §۳ count formula — the scenario decides the CLASSES, this
 *  formula still decides how many units a wave has in total. */
export function waveTotal(wave: number) {
  return 5 + Math.min(wave, 15) + (wave % 5 === 0 ? 1 : 0);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Class-availability gates inherited from the old fixed formula: air joins
 *  from wave 2, submarines from wave 3, destroyers from wave 4. A scenario
 *  may demand a class earlier only when it is the operation's signature
 *  (operation 3 is wave 3 and air-focused — air is legal there by wave ≥ 2).
 *  Gated-out weight redistributes proportionally over the legal classes. */
function applyClassGates(weights: Partial<Record<EnemyClass, number>>, wave: number) {
  const legal = (k: EnemyClass) => k === "speed" || k === "corvette" || (k === "air" && wave >= 2) || (k === "sub" && wave >= 3) || (k === "destroyer" && wave >= 4);
  const out: Partial<Record<EnemyClass, number>> = {};
  let sum = 0;
  for (const k of Object.keys(weights) as EnemyClass[]) if (legal(k) && (weights[k] ?? 0) > 0) { out[k] = weights[k]; sum += weights[k] ?? 0; }
  if (sum <= 0) return { speed: 1 };
  for (const k of Object.keys(out) as EnemyClass[]) out[k] = (out[k] ?? 0) / sum;
  return out;
}

export interface SpawnUnit { kind: EnemyClass; rev: boolean }

/** Build the deterministic spawn queue for a wave from its scenario.
 *  Deterministic in (wave, authored-ness) so the war-room preview
 *  (waveComposition) and the actual spawner always agree. Boss waves keep
 *  the boss as the final unit; siege operations send ~40% of the force
 *  down the lane from the opposite end (دوجبهه‌ای, checklist ۴٫۰). */
export function buildSpawnQueue(wave: number, scenario: Scenario): SpawnUnit[] {
  const total = waveTotal(wave);
  const bossWave = wave % 5 === 0;
  const nonBoss = bossWave ? total - 1 : total;
  const objective = objectiveTypeOf(scenario.objective);
  let weights: Partial<Record<EnemyClass, number>> = scenario.authored
    ? { ...(CAMPAIGN_COMPOSITION[wave] ?? GENERATED_COMPOSITION[objective]) }
    : { ...GENERATED_COMPOSITION[objective] };
  if (scenario.enemyFlavor === "دزدان دریایی") weights = { speed: 0.7, corvette: 0.3 };
  weights = applyClassGates(weights, wave);
  // Hard class-share floors from checklist §۴٫۰ — applied AFTER weighting so
  // they hold exactly, not just on average.
  const floors: Partial<Record<EnemyClass, number>> = {};
  if (objective === "airdef") floors.air = 0.6;
  if (scenario.specialCondition === "موج پهپاد") floors.air = Math.max(floors.air ?? 0, 0.4);
  const rnd = mulberry32(wave * 2654435761 + (scenario.authored ? 101 : 7));
  const kinds: EnemyClass[] = [];
  for (let i = 0; i < nonBoss; i++) {
    let roll = rnd();
    let picked: EnemyClass = "speed";
    for (const k of Object.keys(weights) as EnemyClass[]) { picked = k; roll -= weights[k] ?? 0; if (roll <= 0) break; }
    kinds.push(picked);
  }
  for (const k of Object.keys(floors) as EnemyClass[]) {
    const need = Math.ceil((floors[k] ?? 0) * nonBoss);
    let have = kinds.filter(x => x === k).length;
    // Convert the most numerous other class first (keeps the mix widest).
    while (have < need) {
      const counts = new Map<EnemyClass, number>();
      for (const x of kinds) if (x !== k) counts.set(x, (counts.get(x) ?? 0) + 1);
      const donor = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!donor) break;
      kinds[kinds.indexOf(donor)] = k; have++;
    }
  }
  // Deterministic interleave so classes arrive mixed, not in blocks.
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const queue: SpawnUnit[] = kinds.map(kind => ({ kind, rev: false }));
  if (objective === "siege") for (const u of queue) if (rnd() < 0.4) u.rev = true;
  if (bossWave) queue.push({ kind: "boss", rev: false });
  return queue;
}

/** Checklist ۴٫۰ condition → effective-range multiplier for towers.
 *  مه: برد مؤثر −۳۰٪ (دشمن دیرتر دیده می‌شود — همان کاهش برد، چون درگیری از
 *  برد شروع می‌شود)؛ شب: برد اپتیکی −۲۰٪؛ طوفان: برد ×۰٫۸. */
export function conditionRangeFactor(condition: string | null | undefined): number {
  if (condition === "مه") return 0.7;
  if (condition === "شب") return 0.8;
  if (condition === "طوفان") return 0.8;
  return 1;
}

/** Island id → war-zone names for the generator's zone gating (generator
 *  spec §۶: only unlocked zones enter the cycle; the main channel always
 *  does; the offshore-fields zone needs at least one built platform).
 *  فارور/فارسی have no zone in the 15-zone cycle and contribute none. */
const ISLAND_ZONES: Record<string, string[]> = {
  main: ["بندرعباس"], qeshm: ["قشم"], hormuz: ["هرمز"], larak: ["لارک"], hengam: ["هنگام"],
  tombs: ["تنب بزرگ", "تنب کوچک"], abumusa: ["ابوموسی"], kish: ["کیش"], siri: ["سیری"],
  lavan: ["لاوان"], kharg: ["خارک"], jask: ["جاسک"],
};
export function zonesForIslands(islands: string[], platformCount: number): string[] {
  const zones = new Set<string>(["کانال اصلی تنگه"]);
  for (const id of islands) for (const z of ISLAND_ZONES[id] ?? []) zones.add(z);
  if (platformCount > 0) zones.add("سکوهای نفتی خلیج فارس");
  return [...zones];
}

/** The full generator context for a game state — shared by game.ts
 *  (startWave) and Game.tsx (bulletins/preview) so every consumer generates
 *  the identical scenario for a wave. */
export function scenarioContextFor(s: GameState): ScenarioContext {
  const platforms = s.idle.platforms?.length ?? 0;
  return {
    zones: zonesForIslands(s.islands, platforms),
    hasPlatform: platforms > 0,
    tankerLoading: s.idle.port?.tanker?.stage === "loading",
  };
}

/** Authored scenario lookup for tests/tools (campaign stage → scenario). */
export function authoredScenario(stage: number) {
  return CAMPAIGN_SCENARIOS[stage - 1] ?? null;
}
