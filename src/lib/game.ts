import { initialIdle, MISSIONS, MANAGERS, CONTRACTS, currentMission, missionProgress, managerCost, operationInfo, previewChest, advanceLootSeed, type IdleState, type ManagerId, type ContractId, type UpgradeQuantity, type Reward } from "./progression";
import { findWaterRoute, getLane, nearestWater, sampleLane, type MapLayout, type Point } from "./navigation";
import { weaponSpec, modelKindFor, specInterval, flightTime, type ModelKind } from "./weapons-spec";

export type BuildingId = "oil" | "tank" | "dock" | "refinery" | "steel" | "arms" | "power" | "water" | "city" | "welfare" | "optical";
export type TowerKind = "cannon" | "heavy" | "missile" | "air" | "ew" | "boat";
export type Mode = "campaign" | "endless" | "challenge";
export type Phase = "peace" | "battle" | "intermission" | "defeat" | "victory";
export type Priority = "first" | "strongest" | "weakest" | "air";
export type Spell = "strike" | "emp" | "overdrive";

export interface Tower {
  slot: number;
  kind: TowerKind;
  tier: number;
  branch: number | null;
  priority: Priority;
  focusId?: number;
  focusTime?: number;
  lastPopup?: number;
  /** Battle-seconds until this tower may fire again (discrete-fire core).
   *  Absent/0 = ready. Decremented by battle time only while in battle. */
  cooldown?: number;
}
export interface Enemy {
  id: number;
  kind: "speed" | "corvette" | "air" | "sub" | "destroyer" | "boss";
  boss: number;
  hp: number;
  maxHp: number;
  progress: number;
  stun: number;
  specialClock: number;
  burn?: number;
  burnDamage?: number;
  intercept?: number;
  armorBreak?: number;
  hitFlash?: number;
}
export interface Pirate { id: number; progress: number; hp: number; }
export interface Contraband { id: number; progress: number; }
export interface Merchant { id: number; progress: number; kind: "barge" | "bulk" | "container" | "tanker"; reward: number; paid: boolean; }
/** One discrete shot event, emitted the moment a tower (or hero) fires.
 *  Damage is NOT applied here — it lands when the matching PendingImpact
 *  resolves after flightDur battle-seconds. Renderers (gamesync/FX) consume
 *  these records; `interval` is the firing interval that produced the shot
 *  and is the source for the tower's animation charge period. */
export interface Shot {
  slot: number;              // owning tower slot; -1 = hero shot
  kind: TowerKind;           // FX family (hero shots carry their FX family kind)
  modelKind: ModelKind | "hero";
  targetId: number;
  flightDur: number;         // battle-seconds until impact (0 = hitscan)
  damage: number;            // rolled per-shot damage, before target-side modifiers
  crit: boolean;
  interval: number;          // seconds between this tower's shots (0 = beam/pirate)
  x1: number; y1: number; x2: number; y2: number;
}
/** A projectile in flight. eta counts down in battle time; on arrival the
 *  shot's damage resolves through applyDamage — or fizzles if the target is
 *  dead, has leaked, or (for tower shots) has left the tower's range. */
export interface PendingImpact {
  targetId: number;
  eta: number;
  damage: number;
  crit: boolean;
  slot: number;              // tower slot; -1 = hero shot
  kind: TowerKind | "hero";
  modelKind: ModelKind | "hero";
  branch: number | null;
  heroType?: number;         // hero shots only (type 2 breaks armor on impact)
}
export interface Popup { id: number; x: number; y: number; text: string; life: number; }
/** Cumulative combat counters kept in the logic state (QA جزئی-۲): shots are
 *  counted at the moment of fire, hits/fizzled when the impact resolves —
 *  the renderer only reads these, it never reconstructs them. Keyed by
 *  modelKind ("hero" for hero shots). Pirate-engagement FX records are
 *  visual only and are deliberately NOT counted here. */
export interface FireStat { shots: number; hits: number; fizzled: number; }
export interface GameState {
  version: number;
  idle: IdleState;
  cash: number; oil: number; fuel: number; steel: number; ammo: number;
  oilSplit: number;
  buildings: Record<BuildingId, number>;
  towers: Tower[];
  research: string[];
  cards: Record<TowerKind, { count: number; level: number }>;
  islands: string[];
  security: number; hearts: number; wave: number; highestWave: number;
  phase: Phase; mode: Mode; speed: 1 | 2 | 3; layout: MapLayout;
  enemies: Enemy[]; pirates: Pirate[]; contraband: Contraband[]; merchants: Merchant[]; shots: Shot[]; popups: Popup[];
  pendingImpacts: PendingImpact[];
  fireStats: Record<string, FireStat>;
  spawnRemaining: number; spawnClock: number; spawnIndex: number; nextId: number; earlyBonus: boolean;
  countdown: number; trafficClock: number; trafficCount: number; destroyed: number;
  elapsed: number; cooldowns: Record<Spell, number>; overdrive: number;
  hero: { x: number; y: number; active: number; attackClock?: number; route?: Point[]; routeIndex?: number };
  hero2: { x: number; y: number; active: number; attackClock?: number; route?: Point[]; routeIndex?: number } | null;
  towerStuns: Record<number, number>;
  challengeRule: number;
  chests: number; prestige: number; event: "spill" | "storm" | "vip" | null;
  eventClock: number; manualNight: boolean; lastSavedAt: number;
  combo: number; comboTimer: number; maxCombo: number; waveLeaked: boolean; slowmo: number;
}

export const BUILDINGS: Record<BuildingId, { name: string; short: string; baseCost: number; baseOutput: number; unit: string; power: number; category: "economy" | "city"; description: string }> = {
  oil: { name: "سکوی نفتی دریایی", short: "سکوی نفتی", baseCost: 100, baseOutput: 10, unit: "بشکه/ث", power: 5, category: "economy", description: "استخراج نفت خام از آب‌های تنگه" },
  tank: { name: "مخزن ذخیره نفت", short: "مخزن نفت", baseCost: 80, baseOutput: 500, unit: "بشکه ظرفیت", power: 1, category: "economy", description: "افزایش ظرفیت نگهداری نفت خام" },
  dock: { name: "اسکله صادرات نفت", short: "اسکله صادرات", baseCost: 150, baseOutput: 15, unit: "بشکه/ث", power: 3, category: "economy", description: "بارگیری و فروش نفت به بازار جهانی" },
  refinery: { name: "پالایشگاه میعانات", short: "پالایشگاه", baseCost: 300, baseOutput: 10, unit: "بشکه/ث", power: 15, category: "economy", description: "تبدیل هر ۱۰ نفت خام به ۵ سوخت" },
  steel: { name: "مجتمع فولاد ساحلی", short: "مجتمع فولاد", baseCost: 500, baseOutput: 3, unit: "فولاد/ث", power: 25, category: "economy", description: "تبدیل نفت و سوخت به مصالح دفاعی" },
  arms: { name: "کارخانه صنایع دفاعی", short: "صنایع دفاعی", baseCost: 1000, baseOutput: 5, unit: "مهمات/ث", power: 30, category: "economy", description: "تولید مهمات برای شبکه برجک‌ها" },
  power: { name: "نیروگاه برق ساحلی", short: "نیروگاه برق", baseCost: 650, baseOutput: 60, unit: "MW", power: 0, category: "city", description: "تأمین برق صنعت و شبکه پدافند" },
  water: { name: "آب‌شیرین‌کن ساحلی", short: "آب‌شیرین‌کن", baseCost: 450, baseOutput: 30, unit: "آب", power: 6, category: "city", description: "تأمین آب شیرین شهرها و پالایشگاه" },
  city: { name: "شهرک ساحلی", short: "شهرک ساحلی", baseCost: 550, baseOutput: 50, unit: "نفر", power: 4, category: "city", description: "افزایش رفاه و پایداری ملی" },
  welfare: { name: "رفاه و خدمات شهری", short: "رفاه شهری", baseCost: 220, baseOutput: 0, unit: "پایداری", power: 2, category: "city", description: "هر سطح +۴ پایداری شهر و بندر" },
  optical: { name: "پاسگاه دیده‌بانی اپتیکی", short: "دیده‌بانی اپتیکی", baseCost: 260, baseOutput: 0, unit: "برد", power: 4, category: "economy", description: "هر سطح +۳٪ برد همهٔ برجک‌ها" },
};

export const TOWERS: Record<TowerKind, { name: string; short: string; description: string; cost: number; steel: number; damage: number; rate: number; range: number; power: number; targets: string[]; branches: [string, string] }> = {
  cannon: { name: "برجک توپخانه سریع", short: "توپخانه سریع", description: "شلیک رگباری علیه قایق‌ها و پهپادها", cost: 250, steel: 30, damage: 22, rate: 1.4, range: 17, power: 3, targets: ["sea", "air"], branches: ["فالانکس گاتلینگ", "توپ ریلی الکترومغناطیسی"] },
  heavy: { name: "برجک توپخانه سنگین", short: "توپخانه سنگین", description: "آسیب انفجاری به دسته‌های دشمن", cost: 380, steel: 45, damage: 65, rate: 0.55, range: 19, power: 3, targets: ["sea"], branches: ["آتش‌بار راکتی فجر", "توپ گرمافشاری"] },
  missile: { name: "سیلوی موشک کروز", short: "سیلوی موشکی", description: "برد بلند و قدرت بالا علیه ناوهای سنگین", cost: 600, steel: 65, damage: 110, rate: 0.4, range: 25, power: 5, targets: ["sea"], branches: ["سیلوی هایپرسونیک", "لانچر موشک‌های چندگانه"] },
  air: { name: "برجک پدافند و لیزر", short: "پدافند هوایی", description: "دفاع هوایی و پرتو متمرکز دریایی", cost: 500, steel: 50, damage: 33, rate: 1, range: 20, power: 12, targets: ["sea", "air"], branches: ["پدافند برد بلند", "برجک لیزر حرارتی"] },
  ew: { name: "برجک جنگ الکترونیک", short: "جنگ الکترونیک", description: "کند کردن دشمن و آشکارسازی زیردریایی", cost: 420, steel: 40, damage: 12, rate: 0.8, range: 19, power: 10, targets: ["sea", "air", "sub"], branches: ["دکل پالس EMP", "مرکز سایبری و سونار"] },
  boat: { name: "آشیانه قایق‌های رهگیر", short: "قایق رهگیر", description: "سد کردن مسیر ناوها و شکار زیرسطحی‌ها", cost: 450, steel: 55, damage: 24, rate: 0.85, range: 17, power: 3, targets: ["sea", "sub"], branches: ["اسکادران اژدرانداز", "پایگاه زیردریایی و مین"] },
};
export const TOWER_KINDS = Object.keys(TOWERS) as TowerKind[];
export const PRIORITY_LABELS: Record<Priority, string> = { first: "اولین دشمن", strongest: "قوی‌ترین", weakest: "ضعیف‌ترین", air: "اولویت هوایی" };
export const SLOTS = [
  { id: 0, x: 61.9, y: 36.2, island: "main", label: "بندرعباس" },
  { id: 1, x: 59.8, y: 35.5, island: "main", label: "بندرعباس" },
  { id: 2, x: 64.3, y: 35, island: "main", label: "بندرعباس" },
  { id: 3, x: 57.6, y: 36.2, island: "main", label: "بندرعباس" },
  { id: 4, x: 57.4, y: 44.2, island: "qeshm", label: "قشم" },
  { id: 5, x: 60.7, y: 40, island: "qeshm", label: "قشم" },
  { id: 6, x: 54.3, y: 43.1, island: "qeshm", label: "قشم" },
  { id: 7, x: 58.5, y: 37.8, island: "qeshm", label: "قشم" },
  { id: 8, x: 51.3, y: 46.2, island: "qeshm", label: "قشم" },
  { id: 9, x: 63.7, y: 36.5, island: "hormuz", label: "هرمز" },
  { id: 10, x: 64, y: 39.4, island: "hormuz", label: "هرمز" },
  { id: 11, x: 63.2, y: 34.2, island: "hormuz", label: "هرمز" },
  { id: 12, x: 62.3, y: 38.8, island: "larak", label: "لارک" },
  { id: 13, x: 62.1, y: 40.9, island: "larak", label: "لارک" },
  { id: 14, x: 59.3, y: 44.6, island: "hengam", label: "هنگام" },
  { id: 15, x: 53.3, y: 47.8, island: "tombs", label: "تنب" },
  { id: 16, x: 52, y: 48.5, island: "tombs", label: "تنب" },
  { id: 17, x: 50.7, y: 47.2, island: "abumusa", label: "ابوموسی" },
  { id: 18, x: 49.9, y: 46, island: "abumusa", label: "ابوموسی" },
  { id: 19, x: 41.3, y: 44.1, island: "kish", label: "کیش" },
  { id: 20, x: 40.4, y: 42.9, island: "kish", label: "کیش" },
  { id: 21, x: 46.3, y: 51.8, island: "siri", label: "سیری" },
  { id: 22, x: 45.7, y: 49.7, island: "farur", label: "فارور" },
  { id: 23, x: 35.6, y: 40.2, island: "lavan", label: "لاوان" },
  { id: 24, x: 8.3, y: 5.8, island: "kharg", label: "خارک" },
  { id: 25, x: 8.8, y: 8.1, island: "kharg", label: "خارک" },
  { id: 26, x: 75.5, y: 56.5, island: "jask", label: "جاسک" },
  { id: 27, x: 73.4, y: 58.6, island: "jask", label: "جاسک" },
  { id: 28, x: 6.9, y: 23.5, island: "farsi", label: "فارسی" },
] as const;
export function getSlots(layout: MapLayout = "landscape") { return SLOTS; }
export const ISLANDS: { id: string; name: string; cost: number }[] = [
  { id: "main", name: "بندرعباس", cost: 0 }, { id: "qeshm", name: "جزیره قشم", cost: 0 },
  { id: "hormuz", name: "جزیره هرمز", cost: 1500 }, { id: "larak", name: "جزیره لارک", cost: 2500 },
  { id: "hengam", name: "جزیره هنگام", cost: 3000 }, { id: "tombs", name: "جزایر تنب", cost: 5000 },
  { id: "abumusa", name: "جزیره ابوموسی", cost: 6500 }, { id: "kish", name: "جزیره کیش", cost: 8000 },
  { id: "siri", name: "جزیره سیری", cost: 10000 }, { id: "farur", name: "جزیره فارور", cost: 11000 },
  { id: "lavan", name: "جزیره لاوان", cost: 14000 }, { id: "jask", name: "ساحل جاسک", cost: 15000 },
  { id: "farsi", name: "جزیره فارسی", cost: 16000 }, { id: "kharg", name: "جزیره خارک", cost: 18000 },
];
export const PLATFORM_SLOTS = [
  { id: 0, x: 47.5, y: 54.3, name: "میدان نفتی سیری" },
  { id: 1, x: 65.4, y: 45, name: "میدان نفتی لارک" },
  { id: 2, x: 11.3, y: 9.2, name: "میدان نفتی خارک" },
  { id: 3, x: 77.5, y: 53.1, name: "میدان نفتی جاسک" },
  { id: 4, x: 48.5, y: 50.4, name: "میدان نفتی ابوموسی" },
] as const;
export function platformCost(builtCount: number) { return 2500 * (builtCount + 1); }
export const CHALLENGE_RULES = [
  { name: "طوفان شبانه", description: "برد برجک‌ها نصف می‌شود؛ مراقب نفوذ سریع باشید." },
  { name: "ناوگان زرهی", description: "جان دشمنان +۳۵٪، اما پاداش نبرد +۵۰٪ است." },
  { name: "موج شتابان", description: "سرعت دشمنان +۳۰٪، اما تجربهٔ نبرد +۵۰٪ است." },
];
export const SEA_PATH = getLane("landscape", "enemy");
export const RESEARCH: { id: string; branch: "energy" | "defense" | "city"; name: string; description: string; cost: number }[] = [
  ...[
    ["drill", "حفاری جهت‌دار پیشرفته", "+۲۵٪ تولید سکوهای نفتی"], ["pipe", "لوله‌کشی فشار قوی", "+۵۰٪ انتقال نفت"],
    ["refine", "پالایش کاتالیستی", "+۲۰٪ تولید سوخت"], ["ammo", "خط تولید خودکار مهمات", "+۴۰٪ تولید مهمات"],
    ["dockauto", "اتوماسیون اسکله‌ها", "+۲۵٪ ظرفیت بارگیری"], ["tanktech", "مخازن مقاوم", "+۲۰٪ ظرفیت مخازن"],
    ["seabed", "اکتشاف بستر دریا", "+۱۰٪ استخراج نفت"], ["industrial", "فولاد سبز ساحلی", "+۱۵٪ تولید فولاد"],
    ["reserve", "ذخیره راهبردی سوخت", "+۲۰٪ ظرفیت سوخت"], ["oilmaster", "دکترین انرژی ملی", "+۱۵٪ تولید انرژی"],
  ].map(([id, name, description], i) => ({ id, branch: "energy" as const, name, description, cost: 450 + i * 350 })),
  ...[
    ["titanium", "لوله‌های آلیاژ تیتانیوم", "+۲۵٪ قدرت توپخانه"], ["radar", "رادار آرایه فازی", "+۲۰٪ برد تمام برجک‌ها"],
    ["recycle", "مهندسی معکوس و بازیافت", "بازگشت ۸۰٪ هزینه فروش برجک"], ["capacitors", "خازن‌های فوق‌رسانا", "−۳۵٪ مصرف برق برجک‌های ویژه"],
    ["special", "مهندسی برجک‌های ویژه", "باز شدن ۱۲ انشعاب سطح چهار"], ["targeting", "سامانه هدف‌گیری هوشمند", "+۱۰٪ قدرت برجک‌ها"],
    ["gunpowder", "پیشران پیشرفته", "+۱۰٪ قدرت موشک‌ها"], ["sonar", "شبکه سونار یکپارچه", "+۱۰٪ برد برجک‌های پشتیبان"],
    ["electronics", "مقاومت الکترونیک", "+۱۰٪ قدرت پدافند"], ["doctrine", "دکترین دفاع چندلایه", "+۱۵٪ قدرت تمام برجک‌ها"],
  ].map(([id, name, description], i) => ({ id, branch: "defense" as const, name, description, cost: 550 + i * 400 })),
  ...[
    ["gas", "توربین سیکل ترکیبی", "−۳۰٪ مصرف سوخت نیروگاه"], ["watertech", "اسمز معکوس پیشرفته", "دو برابر شدن تولید آب"],
    ["smart", "گمرک هوشمند الکترونیکی", "+۲۵٪ عوارض و کشف قاچاق"], ["repair", "پهپاد مهندسی و تعمیرکار", "بهبود پایداری پس از نبرد"],
    ["trade", "پیمان تجارت آزاد", "+۵۰٪ قیمت فروش نفت"], ["housing", "شهرهای سبز ساحلی", "+۵٪ پایداری ملی"],
    ["coastguard", "گارد ساحلی یکپارچه", "+۵ امتیاز امنیت"], ["logistics", "لجستیک هوشمند", "+۱۰٪ درآمد ترانزیت"],
    ["stability", "رفاه ملی", "+۵٪ پایداری ملی"], ["diplomacy", "دیپلماسی دریایی", "+۱۵٪ درآمد ترانزیت"],
  ].map(([id, name, description], i) => ({ id, branch: "city" as const, name, description, cost: 400 + i * 350 })),
];

export function initialGame(): GameState {
  return {
    version: 1, idle: initialIdle(), cash: 1200, oil: 300, fuel: 200, steel: 150, ammo: 300, oilSplit: 40,
    combo: 0, comboTimer: 0, maxCombo: 0, waveLeaked: false, slowmo: 0,
    buildings: { oil: 1, tank: 1, dock: 1, refinery: 0, steel: 0, arms: 0, power: 1, water: 1, city: 1, welfare: 0, optical: 0 },
    towers: [],
    research: [],
    cards: { cannon: { count: 0, level: 1 }, heavy: { count: 0, level: 1 }, missile: { count: 0, level: 1 }, air: { count: 0, level: 1 }, ew: { count: 0, level: 1 }, boat: { count: 0, level: 1 } },
    islands: ["main", "qeshm"], security: 70, hearts: 20, wave: 1, highestWave: 0,
    phase: "peace", mode: "campaign", speed: 1, layout: "landscape", enemies: [], pirates: [], contraband: [], merchants: [{ id: 1, progress: .24, kind: "bulk", reward: 120, paid: false }, { id: 2, progress: .63, kind: "container", reward: 500, paid: false }], shots: [], popups: [], pendingImpacts: [], fireStats: {},
    spawnRemaining: 0, spawnClock: 0, spawnIndex: 0, nextId: 3, earlyBonus: false, countdown: 15, trafficClock: 0, trafficCount: 0,
    destroyed: 0, elapsed: 0, cooldowns: { strike: 0, emp: 0, overdrive: 0 }, overdrive: 0,
    hero: { ...sampleLane(getLane("landscape", "enemy"), .45), active: 0 }, hero2: null, towerStuns: {}, challengeRule: 0, chests: 0, prestige: 0, event: null, eventClock: 0,
    manualNight: false, lastSavedAt: Date.now(),
  };
}

export function upgradeCost(id: BuildingId, level: number) { return Math.ceil(BUILDINGS[id].baseCost * Math.pow(1.15, level - 1)); }
export function towerUpgradeCost(tower: Tower) {
  const def = TOWERS[tower.kind];
  return { cash: Math.ceil(def.cost * Math.pow(1.55, tower.tier)), steel: Math.ceil(def.steel * (1 + tower.tier * 0.6)) };
}
export function positionAt(progress: number, layout: MapLayout = "landscape") { return sampleLane(getLane(layout, "enemy"), progress); }
export function enemyPosition(enemy: Enemy, layout: MapLayout = "landscape") {
  if (enemy.kind === "air") { const path = getLane(layout, "enemy"), start = path[0], end = path[path.length - 1]; return { x: start.x + (end.x - start.x) * enemy.progress, y: start.y + (end.y - start.y) * enemy.progress }; }
  return positionAt(enemy.progress, layout);
}
/** Tower power draw in MW, read from the canonical weapons spec (R1) —
 *  replaces the old flat TOWERS.power × tier-growth formula. The tier-4
 *  "capacitors" research discount (−35%) is unchanged. */
export function towerPowerMw(s: GameState, t: Tower) {
  return weaponSpec(t.kind, t.tier, t.branch).powerMW * (t.tier === 4 && s.research.includes("capacitors") ? 0.65 : 1);
}
export function powerBreakdown(s: GameState) {
  const b = s.buildings;
  const rates: [BuildingId, number][] = [["oil", 5], ["tank", 1], ["dock", 3], ["refinery", 15], ["steel", 25], ["arms", 30], ["water", 6], ["city", 4], ["welfare", 2], ["optical", 4]];
  const consumers = rates.filter(([id]) => b[id] > 0).map(([id, rate]) => ({ id: id as string, name: BUILDINGS[id].name, mw: b[id] * rate }));
  const towersMw = s.towers.reduce((sum, t) => sum + towerPowerMw(s, t), 0);
  if (towersMw > 0.5) consumers.push({ id: "towers", name: "شبکهٔ برجک‌های دفاعی", mw: Math.round(towersMw) });
  consumers.sort((a, c) => c.mw - a.mw);
  const stats = getStats(s);
  return { produced: Math.round(stats.powerProduced), used: Math.round(stats.powerUsed), consumers, grid: stats.grid };
}

export function piratePosition(pirate: Pirate, layout: MapLayout = "landscape") { return sampleLane(getLane(layout, "pirate"), pirate.progress); }
export function contrabandPosition(ship: Contraband, layout: MapLayout = "landscape") { return sampleLane(getLane(layout, "trade"), ship.progress); }
export function merchantPosition(ship: Merchant, layout: MapLayout = "landscape") { return sampleLane(getLane(layout, "trade"), ship.progress); }
export function tankerCapacityFor(dockLevel: number) { return 500 + dockLevel * 500; }
export function portTankerPosition(progress: number, layout: MapLayout = "landscape") { return sampleLane(getLane(layout, "port"), progress); }
export function distance(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.hypot(a.x - b.x, (a.y - b.y) * 0.72); }

export function getStats(s: GameState) {
  const b = s.buildings;
  const powerProduced = b.power * 60 * (s.fuel > 0.01 ? 1 : 0.2) * (s.research.includes("oilmaster") ? 1.15 : 1);
  const towerPower = s.towers.reduce((sum, t) => sum + towerPowerMw(s, t), 0);
  const powerUsed = b.oil * 5 + b.tank + b.dock * 3 + b.refinery * 15 + b.steel * 25 + b.arms * 30 + b.water * 6 + b.city * 4 + (b.welfare ?? 0) * 2 + (b.optical ?? 0) * 4 + towerPower;
  const waterProduced = b.water * 30 * (s.research.includes("watertech") ? 2 : 1);
  const waterUsed = b.city * 14 + b.refinery * 5;
  const grid = Math.max(0.2, Math.min(1, powerProduced / Math.max(1, powerUsed)));
  const stability = Math.min(100, 40 * Math.min(1, powerProduced / Math.max(1, powerUsed), waterProduced / Math.max(1, waterUsed)) + 30 * Math.min(1, b.city / 2) + Math.min(20, (b.welfare ?? 0) * 4) + 30 * s.security / 100 + (s.research.includes("housing") ? 5 : 0) + (s.research.includes("stability") ? 5 : 0));
  const stabilityMult = 0.5 + stability / 100;
  const multi = grid * stabilityMult * (1 + s.prestige * 0.1);
  const productionBoost = s.idle.boostRemaining > 0 ? 2 : 1;
  const output = (id: BuildingId) => BUILDINGS[id].baseOutput * b[id] * Math.pow(2, Math.floor(b[id] / 10)) * multi * productionBoost * ((id === "oil" || id === "refinery") ? 1 + .15 * s.idle.managerLevels.energy : id === "arms" ? 1 + .25 * s.idle.managerLevels.supply : 1);
  const oilRate = output("oil") * (s.research.includes("drill") ? 1.25 : 1) * (s.research.includes("seabed") ? 1.1 : 1) + (s.idle.platforms?.length ?? 0) * 8;
  const dockRate = output("dock") * (s.research.includes("dockauto") ? 1.25 : 1) * (s.research.includes("pipe") ? 1.5 : 1);
  const exportRate = Math.min(oilRate * s.oilSplit / 100, dockRate);
  const dollarRate = exportRate * 2 * (s.research.includes("trade") ? 1.5 : 1) * (1 + .1 * s.idle.managerLevels.harbor);
  const oilCapacity = b.tank * 500 * Math.pow(2, Math.floor(b.tank / 10)) * (s.research.includes("tanktech") ? 1.2 : 1);
  return { powerProduced, powerUsed, waterProduced, waterUsed, grid, stability, multi, productionBoost, output, oilRate, exportRate, dollarRate, oilCapacity };
}
/** Shooter-side damage multipliers shared by per-shot damage and display DPS:
 *  prestige, family card level and the research tree. (The old flat
 *  1.8^(tier-1) growth and the tier-4 branch bonus are gone — per-tier and
 *  per-branch strength now lives in the weapons spec itself, per R1.) */
export function damageTech(s: GameState, tower: Tower) {
  let tech = 1 + s.prestige * 0.1 + (s.cards[tower.kind].level - 1) * 0.1;
  if (s.research.includes("titanium") && (tower.kind === "cannon" || tower.kind === "heavy")) tech *= 1.25;
  if (s.research.includes("targeting")) tech *= 1.1;
  if (s.research.includes("gunpowder") && tower.kind === "missile") tech *= 1.1;
  if (s.research.includes("electronics") && (tower.kind === "air" || tower.kind === "ew")) tech *= 1.1;
  if (s.research.includes("doctrine")) tech *= 1.15;
  return tech;
}
/** Expected damage per second, derived from the weapons spec so the UI and
 *  offline rewards track the real discrete-fire numbers: per-shot damage
 *  (with crit expectation) ÷ firing interval × tech × grid. For the laser,
 *  spec damage already IS its base DPS (beam ramp not included). */
export function towerDps(s: GameState, tower: Tower) {
  const spec = weaponSpec(tower.kind, tower.tier, tower.branch);
  const base = spec.mode === "beam" ? spec.damage : (spec.damage * (1 + spec.critChance)) / specInterval(spec);
  return base * damageTech(s, tower) * getStats(s).grid;
}
export function getRange(s: GameState, tower: Tower) {
  const base = tower.kind === "air" && tower.tier === 4 && tower.branch === 0 ? 65 : TOWERS[tower.kind].range;
  return base * (1 + (tower.tier - 1) * 0.06) * (1 + 0.03 * (s.buildings.optical ?? 0)) * (s.research.includes("radar") ? 1.2 : 1) * (s.research.includes("sonar") && (tower.kind === "ew" || tower.kind === "boat") ? 1.1 : 1) * (s.mode === "challenge" && s.challengeRule === 0 && s.phase === "battle" ? 0.5 : 1) * (s.event === "storm" ? 0.8 : 1);
}
export function getOfflineReward(s: GameState, now: number) {
  const seconds = Math.max(0, Math.min(12 * 3600, (now - (s.lastSavedAt || now)) / 1000));
  const defense = s.towers.reduce((sum, t) => sum + towerDps(s, t), 30);
  const ratio = Math.min(1, defense / (100 + s.wave * 25));
  const idleState = { ...s, idle: { ...s.idle, boostRemaining: 0 } };
  const rate = getStats(idleState).dollarRate;
  const managerBonus = s.idle.managerLevels.harbor > 0 ? 1.2 : 1;
  return { seconds, ratio, amount: seconds > 30 ? rate * seconds * .5 * ratio * managerBonus : 0 };
}
function advanceOfflineTimers(s: GameState, seconds: number) {
  s.idle.boostRemaining = Math.max(0, s.idle.boostRemaining - seconds);
  if(s.idle.contract)s.idle.contract.elapsed=Math.min(CONTRACTS[s.idle.contract.id].duration,s.idle.contract.elapsed+seconds);
  if(s.idle.boostCharges<3){const total=s.idle.boostRecharge+seconds;s.idle.boostCharges=Math.min(3,s.idle.boostCharges+Math.floor(total/300));s.idle.boostRecharge=s.idle.boostCharges>=3?0:total%300;}
}
export function hydrateGame(raw: unknown): { game: GameState; offline: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const saved = raw as GameState;
  if (saved.version !== 1 || !saved.buildings || !Array.isArray(saved.towers) || !saved.cards) return null;
  const base = initialGame();
  const game: GameState = { ...base, ...saved, buildings: { ...base.buildings, ...saved.buildings }, cards: { ...base.cards, ...saved.cards }, cooldowns: { ...base.cooldowns, ...saved.cooldowns }, idle: { ...base.idle, ...saved.idle, managerLevels: { ...base.idle.managerLevels, ...saved.idle?.managerLevels } }, shots: [], popups: [], pendingImpacts: [] };
  // Tamper hardening: a corrupted or hand-edited save must never crash the game.
  const num = (v: unknown, fb: number) => typeof v === "number" && Number.isFinite(v) ? v : fb;
  game.cash = num(game.cash, base.cash); game.oil = num(game.oil, base.oil); game.fuel = num(game.fuel, base.fuel); game.steel = num(game.steel, base.steel); game.ammo = num(game.ammo, base.ammo);
  game.hearts = Math.max(0, Math.min(20, num(game.hearts, 20))); game.wave = Math.max(1, Math.floor(num(game.wave, 1))); game.highestWave = Math.max(0, Math.floor(num(game.highestWave, 0)));
  game.security = Math.max(0, Math.min(100, num(game.security, 70))); game.prestige = Math.max(0, Math.floor(num(game.prestige, 0))); game.oilSplit = Math.max(0, Math.min(100, num(game.oilSplit, 40)));
  game.idle.bank = num(game.idle.bank, 0);
  (Object.keys(game.buildings) as BuildingId[]).forEach(k => { game.buildings[k] = Math.max(0, Math.floor(num(game.buildings[k], base.buildings[k]))); });
  game.towers = (Array.isArray(game.towers) ? game.towers : []).filter(t => t && typeof t === "object" && (TOWER_KINDS as string[]).includes(t.kind) && Number.isInteger(t.slot) && t.slot >= 0 && t.slot < SLOTS.length).map(t => ({ ...t, tier: Math.max(1, Math.min(4, Math.floor(num(t.tier, 1)))), cooldown: Math.max(0, num((t as Tower).cooldown, 0)) }));
  game.islands = (Array.isArray(game.islands) ? game.islands : base.islands).filter(id => ISLANDS.some(i => i.id === id));
  if (!game.islands.includes("main")) game.islands.push("main");
  game.research = (Array.isArray(game.research) ? game.research : []).filter(r => typeof r === "string");
  game.hero = { x: num(game.hero?.x, base.hero.x), y: num(game.hero?.y, base.hero.y), active: [0, 1, 2].includes(game.hero?.active) ? game.hero.active : 0 };
  game.hero2 = game.hero2 && typeof game.hero2 === "object" ? { x: num(game.hero2.x, 50), y: num(game.hero2.y, 50), active: [0, 1, 2].includes(game.hero2.active) ? game.hero2.active : 1 } : null;
  game.towerStuns = game.towerStuns && typeof game.towerStuns === "object" ? game.towerStuns : {};
  // Telemetry counters: keep only well-formed non-negative entries; a save
  // predating fireStats (or a tampered one) falls back to an empty map.
  game.fireStats = {};
  if (saved.fireStats && typeof saved.fireStats === "object") for (const k of Object.keys(saved.fireStats)) {
    const v = saved.fireStats[k] as Partial<FireStat> | null;
    if (v && typeof v === "object") game.fireStats[k] = { shots: Math.max(0, Math.floor(num(v.shots, 0))), hits: Math.max(0, Math.floor(num(v.hits, 0))), fizzled: Math.max(0, Math.floor(num(v.fizzled, 0))) };
  }
  game.challengeRule = [0, 1, 2].includes(game.challengeRule) ? game.challengeRule : 0;
  game.combo = saved.combo ?? 0; game.comboTimer = saved.comboTimer ?? 0; game.maxCombo = saved.maxCombo ?? 0; game.waveLeaked = saved.waveLeaked ?? false; game.slowmo = 0;
  const safeHero = nearestWater(game.hero, game.layout);
  game.hero = { ...game.hero, ...safeHero, route: undefined, routeIndex: undefined };
  const reward = getOfflineReward(game, Date.now());
  if (reward.amount > 0) {
    game.idle.offline = { cash: (game.idle.offline?.cash ?? 0) + reward.amount, seconds: reward.seconds, defense: reward.ratio };
    advanceOfflineTimers(game,reward.seconds);
  }
  game.lastSavedAt = Date.now();
  return { game, offline: reward.amount };
}

export function buildingUpgradeQuote(s: GameState, id: BuildingId, quantity: UpgradeQuantity = 1) {
  const limit = quantity === "max" ? 100 - s.buildings[id] : Math.min(quantity, 100 - s.buildings[id]);
  let levels = 0, cost = 0;
  for (let index = 0; index < limit; index++) {
    const next = upgradeCost(id, s.buildings[id] + index);
    if (quantity === "max" && cost + next > s.cash) break;
    cost += next; levels++;
  }
  return { levels, cost, nextLevel: s.buildings[id] + levels, affordable: levels > 0 && s.cash >= cost };
}
function collectRevenue(s: GameState, manual = false) {
  const base = Math.floor(s.idle.bank);
  if (base <= 0) return;
  if (manual) {
    s.idle.collectionStreak = s.elapsed - s.idle.lastCollectionAt <= 50 ? Math.min(5, s.idle.collectionStreak + 1) : 1;
    s.idle.lastCollectionAt = s.elapsed;
  }
  const bonus = manual ? Math.floor(base * Math.min(.2, s.idle.collectionStreak * .04)) : 0;
  const payout = base + bonus;
  s.cash += payout; s.idle.bank = Math.max(0, s.idle.bank - base); s.idle.collected += payout; s.idle.collections++;
  s.idle.xp += Math.min(25, 4 + Math.floor(payout / 250));
}
function addRevenue(s: GameState, cash: number) {
  const capacity = Math.max(10000, getStats(s).dollarRate * 6 * 3600);
  s.idle.bank = Math.min(capacity, s.idle.bank + cash);
  s.idle.lifetimeIncome += cash;
}
function grantReward(s: GameState, reward: Reward, reveal = true) {
  s.cash += reward.cash; s.idle.xp += reward.xp;
  s.steel = Math.min(2000, s.steel + (reward.steel ?? 0));
  s.ammo = Math.min(5000, s.ammo + (reward.ammo ?? 0));
  s.chests += reward.chests ?? 0;
  s.idle.boostCharges = Math.min(9, s.idle.boostCharges + (reward.boosts ?? 0));
  if (reward.cards) for (const kind of TOWER_KINDS) s.cards[kind].count += reward.cards[kind] ?? 0;
  if (reveal) s.idle.rewards.push(reward);
}

export type Action =
  | { type: "hydrate"; game: GameState }
  | { type: "tick"; dt: number; battlePaused?: boolean }
  | { type: "layout"; layout: MapLayout }
  | { type: "split"; value: number }
  | { type: "upgrade-building"; id: BuildingId; quantity?: UpgradeQuantity }
  | { type: "collect-income" }
  | { type: "claim-mission"; id: string }
  | { type: "hire-manager"; id: ManagerId }
  | { type: "activate-production-boost" }
  | { type: "dismiss-reward"; id: string }
  | { type: "claim-battle" }
  | { type: "toggle-auto-battle" }
  | { type: "start-contract"; id: ContractId }
  | { type: "claim-contract" }
  | { type: "claim-offline" }
  | { type: "offline-elapsed"; seconds: number; now: number }
  | { type: "apply-daily"; reward: Reward }
  | { type: "build-tower"; slot: number; kind: TowerKind }
  | { type: "upgrade-tower"; slot: number; branch?: number }
  | { type: "sell-tower"; slot: number }
  | { type: "priority"; slot: number }
  | { type: "research"; id: string }
  | { type: "speed" }
  | { type: "start"; early?: boolean }
  | { type: "mode"; mode: Mode }
  | { type: "select-operation"; wave: number }
  | { type: "spell"; spell: Spell; x?: number; y?: number }
  | { type: "hero"; x: number; y: number }
  | { type: "hero-select"; hero: number }
  | { type: "hero2"; x: number; y: number }
  | { type: "hero2-select"; hero: number }
  | { type: "deploy-hero2"; hero: number }
  | { type: "recall-hero2" }
  | { type: "unlock"; island: string }
  | { type: "build-platform"; id: number }
  | { type: "open-chest" }
  | { type: "inspect"; id: number }
  | { type: "upgrade-card"; kind: TowerKind }
  | { type: "resolve-event" }
  | { type: "night" }
  | { type: "prestige" }
  | { type: "reset" };

function startWave(s: GameState, early: boolean) {
  if (s.phase === "battle") return;
  if (s.idle.lastBattle && !s.idle.lastBattle.claimed) return;
  if (s.phase === "defeat") { if (s.mode === "endless") s.wave = 1; s.hearts = 20; s.enemies = []; }
  if (s.phase === "victory") { s.wave = 1; s.hearts = 20; s.enemies = []; }
  s.earlyBonus = early && s.phase === "intermission";
  if (s.earlyBonus) s.ammo = Math.min(5000, s.ammo + 25);
  if (s.mode === "challenge") { s.challengeRule = (s.idle.challengeRuns ?? 0) % 3; s.idle.challengeRuns = (s.idle.challengeRuns ?? 0) + 1; }
  s.phase = "battle";
  s.pendingImpacts = []; // no projectiles carry over between waves
  for (const t of s.towers) t.cooldown = 0; // every tower opens fire ready
  s.idle.waveStartedAt = s.elapsed; s.idle.waveStartKills = s.destroyed; s.idle.lastBattle = null;
  s.combo = 0; s.comboTimer = 0; s.waveLeaked = false; s.slowmo = 0;
  s.spawnRemaining = 5 + Math.min(s.wave, 15) + (s.wave % 5 === 0 ? 1 : 0);
  s.spawnIndex = 0; s.spawnClock = 0; s.countdown = 15;
}
function makeEnemy(s: GameState, kind: Enemy["kind"], progress = 0): Enemy {
  const boss = kind === "boss" ? Math.min(5, Math.ceil(s.wave / 5)) : 0;
  const base = kind === "speed" ? 95 : kind === "corvette" ? 240 : kind === "air" ? 80 : kind === "sub" ? 190 : kind === "destroyer" ? 430 : 1200 + boss * 600;
  let maxHp = base * Math.pow(1.22, s.wave);
  if (s.mode === "challenge" && s.challengeRule === 1) { maxHp = Math.round(maxHp * 1.35); }
  return { id: s.nextId++, kind, boss, hp: maxHp, maxHp, progress, stun: 0, specialClock: 0 };
}
function enemyTarget(e: Enemy) { return e.kind === "air" ? "air" : e.kind === "sub" || (e.kind === "boss" && e.boss === 2 && e.progress < 0.5) ? "sub" : "sea"; }
function canSeeSub(s: GameState, pos: { x: number; y: number }) {
  return s.towers.some(t => (t.kind === "ew" || t.kind === "boat") && distance(getSlots(s.layout)[t.slot], pos) <= getRange(s, t));
}
function bounty(s: GameState, enemy: Enemy) {
  const base = enemy.kind === "boss" ? 700 : enemy.kind === "destroyer" ? 120 : enemy.kind === "corvette" ? 65 : 35;
  return Math.round(base * Math.pow(1.1, s.wave) * (s.earlyBonus ? 1.25 : 1));
}

export interface DamageSource {
  kind: TowerKind | "hero" | "burn" | "aura";
  modelKind?: ModelKind | "hero";
  slot?: number;           // firing tower's slot (jammer context); omit for non-tower sources
  branch?: number | null;
  direct?: boolean;        // the shot's primary hit — eligible for destroyer interception
}

/** The single damage path for the whole game (audit متوسط-۸). Every damage
 *  source — tower shots at impact, heroes, burn-over-time, auras — passes
 *  through here, so target-side defenses apply uniformly:
 *  - corvette composite armor halves cannon-family fire (railgun pierces);
 *  - the Titan (boss 3) shield cuts ALL sources to 35% while its cycle is up
 *    (first 10s of every 15s) — heroes and burn no longer bypass it;
 *  - the Supercarrier (boss 4) jammer weakens towers firing from inside 26;
 *  - destroyer point-defense nullifies the first direct silo-family or
 *    Bavar shot to land in each 5-second window, at the moment of impact
 *    (checklist ۲٫۵, keyed on modelKind — QA متوسط-۲) — hypersonic is
 *    immune, Swarm missiles are not intercepted, and an EMP-branch tower
 *    in range disables the defense.
 *  Returns the damage actually dealt (0 when intercepted). */
export function applyDamage(s: GameState, target: Enemy, raw: number, source: DamageSource): number {
  if (raw <= 0 || target.hp <= 0) return 0;
  let damage = raw;
  if (target.kind === "corvette" && source.kind === "cannon" && source.branch !== 1 && !(target.armorBreak ?? 0)) damage *= 0.5;
  if (target.kind === "boss" && target.boss === 3 && target.specialClock < 10 && !(target.armorBreak ?? 0)) damage *= 0.35;
  if (source.slot !== undefined && source.slot >= 0) {
    const slotPos = getSlots(s.layout)[source.slot];
    const jammer = s.enemies.find(e => e.kind === "boss" && e.boss === 4 && e.hp > 0);
    if (slotPos && jammer && distance(slotPos, enemyPosition(jammer, s.layout)) < 26) damage *= 0.6;
  }
  if (source.direct && (source.modelKind === "silo" || source.modelKind === "bavar") && target.kind === "destroyer" && (target.intercept ?? 0) <= 0) {
    const targetPos = enemyPosition(target, s.layout);
    const defenseDisabled = s.towers.some(t => t.kind === "ew" && t.tier === 4 && t.branch === 0 && distance(getSlots(s.layout)[t.slot], targetPos) < getRange(s, t));
    if (!defenseDisabled) { target.intercept = 5; return 0; }
  }
  target.hp -= damage;
  if (damage > 0) target.hitFlash = 1;
  return damage;
}

/** Enemies a tower may engage right now, in its priority order. Shared by
 *  the firing pass and by impact-time multi-target branch effects. */
function towerCandidates(s: GameState, tower: Tower) {
  const slot = getSlots(s.layout)[tower.slot];
  const def = TOWERS[tower.kind], range = getRange(s, tower);
  const candidates = s.enemies.filter(e => {
    const pos = enemyPosition(e, s.layout), target = enemyTarget(e);
    return e.hp > 0 && e.progress < 1 && def.targets.includes(target) && distance(slot, pos) <= range && (target !== "sub" || canSeeSub(s, pos));
  });
  candidates.sort((a, b) => tower.priority === "strongest" ? b.hp - a.hp : tower.priority === "weakest" ? a.hp - b.hp : tower.priority === "air" ? Number(b.kind === "air") - Number(a.kind === "air") || b.progress - a.progress : b.progress - a.progress);
  return candidates;
}

/** Increment one logic-side combat counter (see FireStat). */
function bumpFireStat(s: GameState, modelKind: string, field: "shots" | "hits" | "fizzled") {
  const st = s.fireStats[modelKind] ?? (s.fireStats[modelKind] = { shots: 0, hits: 0, fizzled: 0 });
  st[field]++;
}

/** Resolve one projectile's arrival. Wave-1 MECH teams refine the branch
 *  effects below; ROOT keeps their current per-shot percentages, moved from
 *  per-tick application to the impact moment (checklist §۰٫۲/۰٫۳). */
function resolveImpact(s: GameState, p: PendingImpact) {
  const target = s.enemies.find(e => e.id === p.targetId);
  // Void shot: target destroyed or leaked while the projectile was in flight.
  if (!target || target.hp <= 0 || target.progress >= 1) { bumpFireStat(s, p.modelKind, "fizzled"); return; }
  const tower = p.slot >= 0 ? s.towers.find(t => t.slot === p.slot) : undefined;
  const targetPos = enemyPosition(target, s.layout);
  // Void shot: target left the firing tower's range before impact (hitscan
  // resolves in the same tick it fires, so it is naturally exempt).
  if (tower && distance(getSlots(s.layout)[tower.slot], targetPos) > getRange(s, tower)) { bumpFireStat(s, p.modelKind, "fizzled"); return; }
  const source: DamageSource = { kind: p.kind, modelKind: p.modelKind, slot: p.slot, branch: p.branch, direct: true };
  const dealt = applyDamage(s, target, p.damage, source);
  if (p.heroType === 2) target.armorBreak = 5; // hero type 2 cracks armor on impact
  if (dealt <= 0) { bumpFireStat(s, p.modelKind, "fizzled"); return; } // intercepted at the destroyer's point-defense: no effects ride along
  bumpFireStat(s, p.modelKind, "hits");
  if (p.crit) s.popups.push({ id: s.nextId++, x: targetPos.x, y: targetPos.y - 1.5, text: `✸−${Math.max(1, Math.round(dealt))}`, life: 1.2 });
  if (!tower) return;
  const splashSource: DamageSource = { ...source, direct: false };
  if (tower.kind === "heavy") {
    const nearby = towerCandidates(s, tower).filter(other => other.id !== target.id && distance(targetPos, enemyPosition(other, s.layout)) < 9).slice(0, 4);
    for (const other of nearby) applyDamage(s, other, p.damage * 0.35, splashSource);
    if (tower.tier === 4 && tower.branch === 0) for (const e of [target, ...nearby]) { e.burn = 3; e.burnDamage = Math.max(e.burnDamage ?? 0, 18); }
    if (tower.tier === 4 && tower.branch === 1) target.stun = Math.max(target.stun, 2);
  }
  if (tower.tier === 4 && tower.kind === "missile" && tower.branch === 1) {
    for (const other of towerCandidates(s, tower).filter(e => e.id !== target.id).slice(0, 3)) applyDamage(s, other, p.damage * 0.7, splashSource);
  }
  if (tower.tier === 4 && tower.kind === "cannon" && tower.branch === 1) {
    for (const other of towerCandidates(s, tower).filter(e => e.id !== target.id).slice(0, 4)) applyDamage(s, other, p.damage * 0.5, splashSource);
  }
}

export type WaveUnit = { kind: Enemy["kind"]; count: number; boss: number };
export function waveComposition(wave: number): WaveUnit[] {
  const total = 5 + Math.min(wave, 15) + (wave % 5 === 0 ? 1 : 0);
  const counts = new Map<string, WaveUnit>();
  for (let index = 0; index < total; index++) {
    let kind: Enemy["kind"] = "speed";
    const remaining = total - index;
    if (wave % 5 === 0 && remaining === 1) kind = "boss";
    else if (wave >= 4 && index % 6 === 5) kind = "destroyer";
    else if (wave >= 3 && index % 5 === 3) kind = "sub";
    else if (wave >= 2 && index % 4 === 2) kind = "air";
    else if (index % 3 === 1) kind = "corvette";
    const key = kind === "boss" ? `boss-${Math.min(5, Math.ceil(wave / 5))}` : kind;
    const cur = counts.get(key);
    if (cur) cur.count++;
    else counts.set(key, { kind, count: 1, boss: kind === "boss" ? Math.min(5, Math.ceil(wave / 5)) : 0 });
  }
  const order: Record<string, number> = { speed: 0, corvette: 1, air: 2, sub: 3, destroyer: 4 };
  return [...counts.values()].sort((a, b) => (a.kind === "boss" ? 9 : order[a.kind] ?? 5) - (b.kind === "boss" ? 9 : order[b.kind] ?? 5));
}

export function bossEnemy(s: GameState): Enemy | null {
  return s.enemies.find(e => e.kind === "boss" && e.hp > 0) ?? null;
}
/** Safety cap on shots one tower may fire inside a single tick. The
 *  legitimate worst case (CIWS at speed 3 with a hitched 0.25s frame) is
 *  ~11; 32 leaves generous headroom while bounding pathological bursts. */
const MAX_SHOTS_PER_TICK = 32;

function tick(s: GameState, delta: number, battlePaused = false) {
  const dt = Math.max(0, Math.min(1, delta));
  s.elapsed += dt; s.eventClock += dt;
  s.idle.boostRemaining = Math.max(0, s.idle.boostRemaining - dt);
  if (s.idle.boostCharges < 3) { s.idle.boostRecharge += dt; if (s.idle.boostRecharge >= 300) { s.idle.boostCharges++; s.idle.boostRecharge = 0; } }
  if (s.idle.contract) s.idle.contract.elapsed = Math.min(CONTRACTS[s.idle.contract.id].duration, s.idle.contract.elapsed + dt);
  if (s.idle.managerLevels.harbor > 0) { s.idle.managerClock += dt; if (s.idle.managerClock >= 10) { collectRevenue(s); s.idle.managerClock = 0; } }
  const stats = getStats(s);
  const oilCapacity = stats.oilCapacity;
  const produced = s.oil < oilCapacity ? stats.oilRate * dt : 0;
  s.oil = Math.min(oilCapacity, s.oil + produced);
  // Port & tanker cycle: crude leaves only aboard a berthed tanker. With no
  // tanker at the pier, production accumulates in storage (the upgrade signal).
  const port = s.idle.port ?? (s.idle.port = { tanker: null, nextIn: 0, cycles: 0 });
  const tankerCapacity = 500 + s.buildings.dock * 500;
  let exported = 0;
  if (!port.tanker) {
    port.nextIn -= dt;
    if (port.nextIn <= 0) port.tanker = { stage: "approach", progress: 0, load: 0 };
  }
  if (port.tanker) {
    const tanker = port.tanker;
    if (tanker.stage === "approach") {
      tanker.progress = Math.min(1, tanker.progress + dt * 0.04);
      if (tanker.progress >= 1) tanker.stage = "loading";
    } else if (tanker.stage === "loading") {
      const dockRateNow = stats.output("dock") * (s.research.includes("dockauto") ? 1.25 : 1) * (s.research.includes("pipe") ? 1.5 : 1);
      const moved = Math.min(s.oil, dockRateNow * dt, tankerCapacity - tanker.load);
      s.oil -= moved; tanker.load += moved; exported = moved;
      if (tanker.load >= tankerCapacity - 0.001 || (s.oil <= 0.001 && tanker.load > 0)) tanker.stage = "depart";
    } else {
      tanker.progress = Math.max(0, tanker.progress - dt * 0.04);
      if (tanker.progress <= 0) { port.tanker = null; port.nextIn = 18; port.cycles++; }
    }
  }
  addRevenue(s, exported * 2 * (s.research.includes("trade") ? 1.5 : 1));
  const toRefinery = Math.min(s.oil, stats.oilRate * (1 - s.oilSplit / 100) * dt, stats.output("refinery") * (s.research.includes("pipe") ? 1.5 : 1) * dt);
  s.oil -= toRefinery;
  s.fuel = Math.min(s.research.includes("reserve") ? 3000 : 2500, s.fuel + toRefinery * 0.5 * (s.research.includes("refine") ? 1.2 : 1));
  s.fuel = Math.max(0, s.fuel - s.buildings.power * 0.5 * (s.research.includes("gas") ? 0.7 : 1) * dt);
  const steelBatches = Math.min(s.oil / 10, s.fuel / 2, stats.output("steel") / 3 * dt * (s.research.includes("industrial") ? 1.15 : 1), Math.max(0, 2000 - s.steel) / 3);
  s.oil -= steelBatches * 10; s.fuel -= steelBatches * 2; s.steel += steelBatches * 3;
  const ammoBatches = Math.min(s.fuel / 5, s.steel / 5, stats.output("arms") / 10 * dt * (s.research.includes("ammo") ? 1.4 : 1), Math.max(0, 5000 - s.ammo) / 10);
  s.fuel -= ammoBatches * 5; s.steel -= ammoBatches * 5; s.ammo += ammoBatches * 10;
  s.shots = [];
  s.popups = s.popups.map(p => ({ ...p, life: p.life - dt })).filter(p => p.life > 0);
  s.trafficClock += dt;
  const interval = 15 - 0.1 * s.security;
  if (s.trafficClock >= interval) {
    s.trafficClock -= interval; s.trafficCount++;
    const kind = s.security >= 80 && s.trafficCount % 7 === 0 ? "tanker" : s.security >= 50 && s.trafficCount % 4 === 0 ? "container" : s.security >= 20 && s.trafficCount % 2 === 0 ? "bulk" : "barge";
    const toll = kind === "tanker" ? 2500 : kind === "container" ? 500 : kind === "bulk" ? 120 : 25;
    s.merchants.push({ id: s.nextId++, progress: 0, kind, reward: toll, paid: false });
    if (s.trafficCount % 5 === 0 && !battlePaused) s.pirates.push({ id: s.nextId++, progress: 0, hp: 100 });
    if (s.research.includes("smart") && s.trafficCount % 4 === 0) s.contraband.push({ id: s.nextId++, progress: 0 });
  }
  for (const ship of s.merchants) {
    const oldProgress = ship.progress;
    ship.progress += dt / (ship.kind === "tanker" ? 45 : ship.kind === "barge" ? 25 : 34) * (s.event === "storm" ? .8 : 1);
    if (!ship.paid && oldProgress < .82 && ship.progress >= .82) {
      ship.paid = true;
      const toll = ship.reward * (s.research.includes("smart") ? 1.25 : 1) * (s.research.includes("logistics") ? 1.1 : 1) * (s.research.includes("diplomacy") ? 1.15 : 1);
      addRevenue(s, toll * (1 + .1 * s.idle.managerLevels.harbor));
      const position = merchantPosition(ship, s.layout);
      s.popups.push({ id: s.nextId++, ...position, text: `+${Math.round(toll)}`, life: 1.4 });
    }
  }
  s.merchants = s.merchants.filter(ship => ship.progress < 1);
  for (const ship of s.contraband) ship.progress += dt / 24;
  s.contraband = s.contraband.filter(ship => ship.progress < 1);
  // Coast guard and nearby towers automatically intercept pirates chasing merchant ships.
  // The pirate layer freezes with the battle pause (audit fix: it used to keep fighting and draining ammo).
  for (const pirate of battlePaused ? [] : s.pirates) {
    pirate.progress += dt * (s.event === "storm" ? 0.06 : 0.085);
    const pos = piratePosition(pirate, s.layout);
    pirate.hp -= (s.research.includes("coastguard") ? 12 : 4) * dt;
    if (distance(s.hero, pos) < 18) pirate.hp -= 22 * dt;
    for (const tower of s.towers) {
      const slot = getSlots(s.layout)[tower.slot];
      if (slot && TOWERS[tower.kind].targets.includes("sea") && distance(slot, pos) < getRange(s, tower)) {
        pirate.hp -= towerDps(s, tower) * dt * (s.ammo > 0 ? 1 : 1 / 3);
        s.ammo = Math.max(0, s.ammo - TOWERS[tower.kind].rate * dt);
        const mk = modelKindFor(tower.kind, tower.tier, tower.branch);
        s.shots.push({ slot: tower.slot, kind: tower.kind, modelKind: mk, targetId: pirate.id, flightDur: flightTime(mk, distance(slot, pos)), damage: 0, crit: false, interval: 0, x1: slot.x, y1: slot.y, x2: pos.x, y2: pos.y });
      }
    }
    if (pirate.hp <= 0) { s.cash += 50; s.security = Math.min(100, s.security + 2); s.destroyed++; s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: "+50", life: 1.4 }); }
    else if (pirate.progress >= 1) { s.security = Math.max(0, s.security - 15); s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: "−۱۵ امنیت", life: 1.4 }); }
  }
  s.pirates = s.pirates.filter(p => p.hp > 0 && p.progress < 1);
  if (!s.event && s.eventClock >= 180) { s.event = (["spill", "storm", "vip"] as const)[Math.max(0, Math.floor(s.elapsed / 180) - 1) % 3]; s.eventClock = 0; }
  if (s.event && s.eventClock >= 60) {
    if (s.event === "spill") s.security = Math.max(0, s.security - 10);
    if (s.event === "vip") s.security = Math.max(0, s.security - 5);
    s.event = null; s.eventClock = 0;
  }
  if (battlePaused) return;
  for (const hero of [s.hero, s.hero2]) {
    if (!hero) continue;
    let travel = dt * (s.phase === "battle" ? s.speed : 1) * 6;
    while (travel > 0 && hero.route && (hero.routeIndex ?? 1) < hero.route.length) {
      const index = hero.routeIndex ?? 1, target = hero.route[index];
      const remaining = Math.hypot(target.x - hero.x, target.y - hero.y);
      if (remaining <= travel) { hero.x = target.x; hero.y = target.y; hero.routeIndex = index + 1; travel -= remaining; }
      else { hero.x += (target.x - hero.x) / remaining * travel; hero.y += (target.y - hero.y) / remaining * travel; travel = 0; }
    }
    if (hero.route && (hero.routeIndex ?? 1) >= hero.route.length) { hero.route = undefined; hero.routeIndex = undefined; }
  }
  const battleDt = dt * s.speed;
  (Object.keys(s.cooldowns) as Spell[]).forEach(k => { s.cooldowns[k] = Math.max(0, s.cooldowns[k] - battleDt); });
  s.overdrive = Math.max(0, s.overdrive - battleDt);
  s.slowmo = Math.max(0, (s.slowmo ?? 0) - dt);
  if ((s.comboTimer ?? 0) > 0) {
    s.comboTimer = Math.max(0, s.comboTimer - battleDt);
    if (s.comboTimer <= 0) s.combo = 0;
  }
  if (s.phase === "intermission" && (!s.idle.lastBattle || s.idle.lastBattle.claimed)) {
    s.countdown = Math.max(0, s.countdown - battleDt);
    if (s.countdown <= 0 && s.idle.autoBattle) startWave(s, false);
  }
  if (s.phase !== "battle") return;
  s.spawnClock -= battleDt;
  while (s.spawnRemaining > 0 && s.spawnClock <= 0) {
    const index = s.spawnIndex++;
    let kind: Enemy["kind"] = "speed";
    if (s.wave % 5 === 0 && s.spawnRemaining === 1) kind = "boss";
    else if (s.wave >= 4 && index % 6 === 5) kind = "destroyer";
    else if (s.wave >= 3 && index % 5 === 3) kind = "sub";
    else if (s.wave >= 2 && index % 4 === 2) kind = "air";
    else if (index % 3 === 1) kind = "corvette";
    s.enemies.push(makeEnemy(s, kind)); s.spawnRemaining--; s.spawnClock += 1.35;
  }
  for (const key of Object.keys(s.towerStuns ?? {})) { const left = (s.towerStuns[Number(key)] ?? 0) - battleDt; if (left <= 0) delete s.towerStuns[Number(key)]; else s.towerStuns[Number(key)] = left; }
  const reinforcements: Enemy[] = [];
  for (const enemy of s.enemies) {
    const pos = enemyPosition(enemy, s.layout);
    if ((enemy.burn ?? 0) > 0) { applyDamage(s, enemy, (enemy.burnDamage ?? 0) * battleDt, { kind: "burn" }); enemy.burn = Math.max(0, (enemy.burn ?? 0) - battleDt); }
    enemy.intercept = Math.max(0, (enemy.intercept ?? 0) - battleDt);
    enemy.armorBreak = Math.max(0, (enemy.armorBreak ?? 0) - battleDt);
    enemy.hitFlash = Math.max(0, (enemy.hitFlash ?? 0) - battleDt * 3);
    let slow = 1;
    for (const t of s.towers) {
      if ((t.kind === "ew" || (t.kind === "boat" && enemy.kind !== "air")) && distance(getSlots(s.layout)[t.slot], pos) < getRange(s, t)) {
        slow = Math.min(slow, t.kind === "boat" ? (t.tier === 4 ? 0.25 : 0.48) : (t.tier === 4 ? 0.4 : 0.7));
        if (t.kind === "ew" && t.tier === 4 && t.branch === 1 && enemy.kind === "air") applyDamage(s, enemy, 20 * battleDt, { kind: "aura" });
      }
    }
    if (enemy.stun > 0) { enemy.stun = Math.max(0, enemy.stun - battleDt); slow = 0; }
    const velocity = enemy.kind === "speed" ? 0.033 : enemy.kind === "air" ? 0.045 : enemy.kind === "boss" ? 0.011 : enemy.kind === "destroyer" ? 0.018 : 0.024;
    enemy.progress += velocity * slow * battleDt * (s.mode === "challenge" && s.challengeRule === 2 ? 1.3 : 1);
    if (enemy.kind === "boss") {
      enemy.specialClock += battleDt;
      if (enemy.specialClock >= (enemy.boss === 1 ? 10 : 15)) {
        enemy.specialClock = 0;
        if (enemy.boss === 1) { for (let i = 0; i < 4; i++) reinforcements.push(makeEnemy(s, "speed", enemy.progress)); for (let i = 0; i < 2; i++) reinforcements.push(makeEnemy(s, "air", enemy.progress)); }
        if (enemy.boss === 2 && s.towers.length) { const victim = s.towers[Math.floor(Math.random() * s.towers.length)], vslot = getSlots(s.layout)[victim.slot]; s.towerStuns[victim.slot] = 4; if (vslot) s.popups.push({ id: s.nextId++, x: vslot.x, y: vslot.y, text: "برجک از کار افتاد!", life: 1.6 }); }
        if (enemy.boss === 4) { reinforcements.push(makeEnemy(s, "air", enemy.progress), makeEnemy(s, "air", enemy.progress)); }
        if (enemy.boss === 5) { reinforcements.push(makeEnemy(s, "speed", enemy.progress), makeEnemy(s, "speed", enemy.progress), makeEnemy(s, "corvette", enemy.progress), makeEnemy(s, "air", enemy.progress), makeEnemy(s, "air", enemy.progress)); }
      }
    }
  }
  s.enemies.push(...reinforcements);
  // Each hero has a distinct attack cadence in addition to the catamaran's tower aura.
  const heroAttack = (hero: NonNullable<GameState["hero2"]>) => {
    hero.attackClock = (hero.attackClock ?? 0) + battleDt;
    const heroInterval = hero.active === 1 ? 15 : hero.active === 2 ? 4 : 3;
    if (hero.attackClock >= heroInterval) {
      const heroTargets = s.enemies.filter(e => e.hp > 0 && distance(hero, enemyPosition(e, s.layout)) < (hero.active === 1 ? 35 : 23) && (enemyTarget(e) !== "sub" || hero.active === 2 || canSeeSub(s, enemyPosition(e, s.layout))));
      heroTargets.sort((a, b) => hero.active === 1 ? b.hp - a.hp : hero.active === 2 ? Number(b.kind === "boss") - Number(a.kind === "boss") || b.hp - a.hp : b.progress - a.progress);
      const heroTarget = heroTargets[0];
      if (heroTarget) {
        const pos = enemyPosition(heroTarget, s.layout);
        const damage = hero.active === 1 ? 260 : hero.active === 2 ? 145 : 75;
        const flightDur = flightTime(hero.active === 1 ? "bavar" : "silo", distance(hero, pos));
        // Hero damage lands at impact through the single damage path (applyDamage).
        bumpFireStat(s, "hero", "shots");
        s.pendingImpacts.push({ targetId: heroTarget.id, eta: flightDur, damage, crit: false, slot: -1, kind: "hero", modelKind: "hero", branch: null, heroType: hero.active });
        s.shots.push({ slot: -1, kind: hero.active === 1 ? "air" : "missile", modelKind: "hero", targetId: heroTarget.id, flightDur, damage, crit: false, interval: heroInterval, x1: hero.x, y1: hero.y, x2: pos.x, y2: pos.y });
        hero.attackClock = 0;
      }
    }
  };
  heroAttack(s.hero);
  if (s.hero2) heroAttack(s.hero2);
  // — Discrete fire (fix-program ROOT core; audit بحرانی-۱..۵) —
  // Each tower owns a cooldown timer counted in battle-seconds. The timer
  // is CUMULATIVE with remainder carry (QA بحرانی-۱): it is decremented by
  // the whole tick and the tower fires as many shots as the elapsed time
  // pays for, adding the spec interval back per shot — fast weapons are no
  // longer quantized to the 125ms tick grid (CIWS used to fire 8/s instead
  // of its 14/s spec at speed 1, and 2.67/s at speed 3). Each shot flies
  // for flightDur battle-seconds; only then does its damage land
  // (resolveImpact).
  for (const tower of s.towers) {
    const slot = getSlots(s.layout)[tower.slot];
    if (!slot) continue;
    if ((s.towerStuns?.[tower.slot] ?? 0) > 0) continue; // knocked out by Leviathan missiles
    const spec = weaponSpec(tower.kind, tower.tier, tower.branch);
    if (spec.mode === "beam") {
      // Thermal laser: a continuous hitscan beam — no projectile, no
      // cooldown, no ammo. Damage ramps +100%/s of focus on one target,
      // capped at ×5 (spec damage 90 is the base DPS, per R1).
      const beamTarget = towerCandidates(s, tower)[0];
      if (!beamTarget) { tower.focusId = undefined; tower.focusTime = 0; continue; }
      const beamPos = enemyPosition(beamTarget, s.layout);
      tower.focusTime = tower.focusId === beamTarget.id ? (tower.focusTime ?? 0) + battleDt : 0;
      tower.focusId = beamTarget.id;
      const dealt = applyDamage(s, beamTarget, spec.damage * Math.min(5, 1 + tower.focusTime) * damageTech(s, tower) * stats.grid * battleDt,
        { kind: tower.kind, modelKind: spec.modelKind, slot: tower.slot, branch: tower.branch });
      s.shots.push({ slot: tower.slot, kind: tower.kind, modelKind: spec.modelKind, targetId: beamTarget.id, flightDur: 0, damage: dealt, crit: false, interval: 0, x1: slot.x, y1: slot.y, x2: beamPos.x, y2: beamPos.y });
      continue;
    }
    tower.cooldown = (tower.cooldown ?? 0) - battleDt;
    let lastInterval = specInterval(spec);
    for (let shotNo = 0; tower.cooldown <= 0; shotNo++) {
      if (shotNo >= MAX_SHOTS_PER_TICK) { tower.cooldown = lastInterval; break; } // safety cap: drop the remaining debt rather than burst forever
      const target = towerCandidates(s, tower)[0]; // target re-evaluated for every shot in the tick
      if (!target) { tower.focusId = undefined; tower.focusTime = 0; tower.cooldown = 0; break; } // no target: no cooldown debt accrues
      const targetPos = enemyPosition(target, s.layout);
      let interval = specInterval(spec);
      if (s.overdrive > 0) interval *= 0.5; // overdrive = fire rate ×2 at zero ammo cost (مهم-۳۰)
      if ((distance(slot, s.hero) < 18 && s.hero.active === 0) || (s.hero2 && distance(slot, s.hero2) < 18 && s.hero2.active === 0)) interval /= 1.2; // catamaran aura = nearby fire rate ×1.2 (متوسط-۱۵)
      lastInterval = interval;
      const ammoCost = s.overdrive > 0 ? 0 : spec.ammoPerShot;
      if (ammoCost > 0 && s.ammo < ammoCost) {
        // Studio ruling (QA متوسط-۱): a shot the stock cannot pay for does
        // NOT fire — no free shots, no ammo consumed. The tower retries
        // after 3× its interval, so a starved tower's rate caps at one
        // third instead of firing free forever. Zero-ammo weapons
        // (laser/EW/EMP/sonar) and overdrive are unaffected.
        tower.cooldown = interval * 3;
        break;
      }
      if (ammoCost > 0) s.ammo -= ammoCost;
      const crit = Math.random() < spec.critChance;
      let damage = spec.damage * damageTech(s, tower) * stats.grid;
      if (crit) damage *= 2;
      const flightDur = flightTime(spec.modelKind, distance(slot, targetPos));
      tower.cooldown += interval;
      bumpFireStat(s, spec.modelKind, "shots");
      s.pendingImpacts.push({ targetId: target.id, eta: flightDur, damage, crit, slot: tower.slot, kind: tower.kind, modelKind: spec.modelKind, branch: tower.branch });
      s.shots.push({ slot: tower.slot, kind: tower.kind, modelKind: spec.modelKind, targetId: target.id, flightDur, damage, crit, interval, x1: slot.x, y1: slot.y, x2: targetPos.x, y2: targetPos.y });
    }
  }
  // Projectiles land: advance every in-flight shot by this tick's battle
  // time and resolve the arrivals — damage exists only from this moment.
  if (s.pendingImpacts.length) {
    const stillFlying: PendingImpact[] = [];
    for (const p of s.pendingImpacts) {
      p.eta -= battleDt;
      if (p.eta <= 0) resolveImpact(s, p);
      else stillFlying.push(p);
    }
    s.pendingImpacts = stillFlying;
  }
  for (const enemy of s.enemies) {
    if (enemy.hp <= 0) {
      const cash = bounty(s, enemy);
      s.combo = (s.comboTimer ?? 0) > 0 ? (s.combo ?? 0) + 1 : 1;
      s.comboTimer = 3.5;
      s.maxCombo = Math.max(s.maxCombo ?? 0, s.combo);
      const comboBonus = Math.min(120, (s.combo - 1) * 6);
      const total = cash + comboBonus;
      s.cash += total; s.destroyed++;
      const pos = enemyPosition(enemy, s.layout);
      s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: `+${total}`, life: 1.4 });
      if (s.combo >= 5 && s.combo % 5 === 0) {
        s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y - 3, text: `🔥×${s.combo}`, life: 1.6 });
      }
      if (enemy.kind === "boss") {
        s.slowmo = 0.9;
        s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y - 5, text: `★ غول‌آخر منهدم شد!`, life: 2.2 });
      }
    } else if (enemy.progress >= 1) {
      s.waveLeaked = true;
      s.combo = 0; s.comboTimer = 0;
      s.hearts = Math.max(0, s.hearts - (enemy.kind === "boss" ? 20 : enemy.kind === "destroyer" ? 3 : 1));
      s.security = Math.max(0, s.security - 1);
    }
  }
  s.enemies = s.enemies.filter(e => e.hp > 0 && e.progress < 1);
  if (s.hearts <= 0) {
    s.idle.lastBattle = { id:`battle-${s.nextId++}`, wave:s.wave, title:operationInfo(s.wave).title, victory:false, stars:0, cash:0, xp:0, chests:0, destroyed:s.destroyed-s.idle.waveStartKills, seconds:s.elapsed-s.idle.waveStartedAt, hearts:0, claimed:false };
    s.idle.revision++; s.phase = "defeat"; s.enemies = []; s.spawnRemaining = 0; s.pendingImpacts = []; return;
  }
  if (s.spawnRemaining === 0 && s.enemies.length === 0) {
    s.pendingImpacts = []; // battle over (QA جزئی-۱): no orphan in-flight records freeze into the intermission
    const info = operationInfo(s.wave), stars = s.hearts >= 19 ? 3 : s.hearts >= 14 ? 2 : 1;
    s.idle.stars[String(s.wave)] = Math.max(s.idle.stars[String(s.wave)] ?? 0, stars);
    const perfect = !s.waveLeaked;
    const perfectBonus = perfect ? 1.25 : 1;
    s.idle.lastBattle = { id:`battle-${s.nextId++}`, wave:s.wave, title:info.title, victory:true, stars, cash:Math.round(info.cash*(s.earlyBonus?1.25:1)*(1+stars*.08)*perfectBonus*(s.mode==="challenge"&&s.challengeRule===1?1.5:1)), xp:Math.round((info.xp+stars*20+(perfect?40:0))*(s.mode==="challenge"&&s.challengeRule===2?1.5:1)), chests:s.wave%5===0?2:s.wave===1||s.mode==="challenge"?1:0, destroyed:s.destroyed-s.idle.waveStartKills, seconds:s.elapsed-s.idle.waveStartedAt, hearts:s.hearts, claimed:false };
    s.idle.revision++; s.highestWave = Math.max(s.highestWave, s.wave);
    s.security = Math.min(100, s.security + (s.research.includes("repair") ? 2 : 1));
    if (s.mode === "campaign" && s.wave >= 25) { s.phase = "victory"; return; }
    s.wave++; s.phase = "intermission"; s.countdown = 15;
  }
}

/** Targeted clone for the tick action (fix program; one of the audit's two
 *  heat roots was a full structuredClone of the entire state on every 125ms
 *  tick). tick() writes only to the subtrees copied below — verified by
 *  scripts/audit/test-tick-immutability.cjs, which deep-freezes the input
 *  state and ticks it. Everything else is shared by reference and is
 *  read-only for tick; all other actions still pay for a structuredClone. */
export function cloneForTick(state: GameState): GameState {
  const idle = state.idle;
  const fireStats: GameState["fireStats"] = {};
  for (const k of Object.keys(state.fireStats ?? {})) { const v = state.fireStats[k]; fireStats[k] = { shots: v?.shots ?? 0, hits: v?.hits ?? 0, fizzled: v?.fizzled ?? 0 }; }
  return {
    ...state,
    idle: {
      ...idle,
      port: idle.port ? { ...idle.port, tanker: idle.port.tanker ? { ...idle.port.tanker } : null } : idle.port,
      contract: idle.contract ? { ...idle.contract } : null,
      stars: { ...idle.stars },
      managerLevels: { ...idle.managerLevels },
    },
    buildings: { ...state.buildings },
    towers: state.towers.map(t => ({ ...t })),
    enemies: state.enemies.map(e => ({ ...e })),
    pirates: state.pirates.map(p => ({ ...p })),
    contraband: state.contraband.map(c => ({ ...c })),
    merchants: state.merchants.map(m => ({ ...m })),
    popups: state.popups.slice(),
    cooldowns: { ...state.cooldowns },
    hero: { ...state.hero, route: state.hero.route?.slice() },
    hero2: state.hero2 ? { ...state.hero2, route: state.hero2.route?.slice() } : null,
    towerStuns: { ...state.towerStuns },
    pendingImpacts: state.pendingImpacts.map(p => ({ ...p })),
    fireStats,
    // shared by reference — tick never writes these: research, cards,
    // islands, layout; shots is reassigned (s.shots = []) before any push.
  };
}

export function gameReducer(state: GameState, action: Action): GameState {
  if (action.type === "hydrate") return action.game;
  if (action.type === "reset") { const fresh = initialGame(); fresh.layout = state.layout; fresh.idle.appliedDailyIds = state.idle.appliedDailyIds; fresh.idle.revision = state.idle.revision + 1; return fresh; }
  if (action.type === "tick") { const s = cloneForTick(state); tick(s, action.dt, action.battlePaused); return s; }
  const s = structuredClone(state);
  // Shot records are one-render FX events: a non-tick action must not let
  // gamesync replay the previous tick's shots (and double-count telemetry).
  s.shots = [];
  switch (action.type) {
    case "layout": if (s.layout !== action.layout) { s.layout = action.layout; const point = nearestWater(s.hero, action.layout); s.hero.x = point.x; s.hero.y = point.y; s.hero.route = undefined; s.hero.routeIndex = undefined; } break;
    case "split": s.oilSplit = Math.max(0, Math.min(100, action.value)); break;
    case "upgrade-building": {
      const quote = buildingUpgradeQuote(s, action.id, action.quantity ?? 1), oldLevel = s.buildings[action.id];
      if (!quote.affordable) break;
      s.cash -= quote.cost; s.buildings[action.id] = quote.nextLevel; s.idle.upgradeCount += quote.levels; s.idle.xp += quote.levels * 8;
      for (const milestone of [10,25,50,100]) if (oldLevel < milestone && quote.nextLevel >= milestone && !s.idle.claimedMilestones.includes(`${action.id}-${milestone}`)) {
        s.idle.claimedMilestones.push(`${action.id}-${milestone}`);
        grantReward(s, { id:`milestone-${action.id}-${milestone}`, type:"milestone", title:`${BUILDINGS[action.id].short} متحول شد!`, subtitle:`سطح ${milestone}؛ یک جهش در قدرت تولید.`, cash:BUILDINGS[action.id].baseCost*3, xp:milestone*5, chests:1, boosts:1 });
      }
      break;
    }
    case "collect-income": collectRevenue(s,true); break;
    case "claim-mission": {
      const mission = currentMission(s);
      if (!mission || mission.id !== action.id || !missionProgress(s, mission).complete) break;
      s.idle.claimedMissions.push(mission.id);
      grantReward(s, { id:`mission-${mission.id}`,type:"mission",title:"مأموریت انجام شد!",subtitle:mission.title,cash:mission.cash,xp:mission.xp,chests:mission.chests,boosts:mission.boosts });
      break;
    }
    case "hire-manager": {
      const level=s.idle.managerLevels[action.id], definition=MANAGERS[action.id], cost=managerCost(action.id,level);
      if(level>=5||s.cash<cost||s.idle.xp<definition.unlockXp)break;
      s.cash-=cost;s.idle.managerLevels[action.id]++;s.idle.xp+=30;
      break;
    }
    case "activate-production-boost": if(s.idle.boostCharges>0&&s.idle.boostRemaining<=0){s.idle.boostCharges--;s.idle.boostRemaining=60;} break;
    case "dismiss-reward": if(s.idle.rewards[0]?.id===action.id)s.idle.rewards.shift(); break;
    case "claim-battle": {
      const report=s.idle.lastBattle;if(!report||report.claimed)break;
      report.claimed=true;
      grantReward(s,{id:report.id,type:"mission",title:report.title,subtitle:"غنائم عملیات",cash:report.cash,xp:report.xp,chests:report.chests},false);
      break;
    }
    case "toggle-auto-battle": s.idle.autoBattle=!s.idle.autoBattle;break;
    case "start-contract": {
      const contract=CONTRACTS[action.id];if(s.idle.contract||s.cash<contract.cost||s.highestWave<contract.unlock)break;
      s.cash-=contract.cost;s.idle.contract={id:action.id,elapsed:0};break;
    }
    case "claim-contract": {
      const active=s.idle.contract;if(!active)break;const contract=CONTRACTS[active.id];if(active.elapsed<contract.duration)break;
      s.idle.contract=null;s.idle.completedContracts++;
      grantReward(s,{id:`contract-${s.idle.completedContracts}`,type:"contract",title:"محموله به مقصد رسید",subtitle:contract.title,cash:contract.cash,xp:contract.xp});break;
    }
    case "claim-offline": {
      const offline=s.idle.offline;if(!offline)break;
      s.cash+=Math.floor(offline.cash);s.idle.collected+=Math.floor(offline.cash);s.idle.offline=null;break;
    }
    case "offline-elapsed": {
      const reward=getOfflineReward({...s,lastSavedAt:action.now-Math.max(0,action.seconds)*1000},action.now);
      if(reward.amount>0){s.idle.offline={cash:(s.idle.offline?.cash??0)+reward.amount,seconds:reward.seconds,defense:reward.ratio};advanceOfflineTimers(s,reward.seconds);}
      s.lastSavedAt=action.now;break;
    }
    case "apply-daily": {
      if(s.idle.appliedDailyIds.includes(action.reward.id))break;
      s.idle.appliedDailyIds.push(action.reward.id);s.idle.appliedDailyIds=s.idle.appliedDailyIds.slice(-64);grantReward(s,action.reward);break;
    }
    case "build-tower": {
      const def = TOWERS[action.kind], slot = getSlots(s.layout)[action.slot];
      if (slot && s.islands.includes(slot.island) && !s.towers.some(t => t.slot === action.slot) && s.cash >= def.cost && s.steel >= def.steel) {
        s.cash -= def.cost; s.steel -= def.steel;
        s.towers.push({ slot: action.slot, kind: action.kind, tier: 1, branch: null, priority: "first" });
      }
      break;
    }
    case "upgrade-tower": {
      const tower = s.towers.find(t => t.slot === action.slot);
      if (!tower || tower.tier >= 4) break;
      const cost = towerUpgradeCost(tower);
      if (s.cash < cost.cash || s.steel < cost.steel || (tower.tier === 3 && (!s.research.includes("special") || (action.branch !== 0 && action.branch !== 1)))) break;
      s.cash -= cost.cash; s.steel -= cost.steel; tower.tier++;
      if (tower.tier === 4) tower.branch = action.branch ?? 0;
      break;
    }
    case "sell-tower": {
      const tower = s.towers.find(t => t.slot === action.slot);
      if (tower) { const refund = s.research.includes("recycle") ? 0.8 : 0.5; s.cash += TOWERS[tower.kind].cost * refund; s.steel += TOWERS[tower.kind].steel * refund; s.towers = s.towers.filter(t => t.slot !== action.slot); }
      break;
    }
    case "priority": {
      const tower = s.towers.find(t => t.slot === action.slot), priorities: Priority[] = ["first", "strongest", "weakest", "air"];
      if (tower) tower.priority = priorities[(priorities.indexOf(tower.priority) + 1) % priorities.length];
      break;
    }
    case "research": {
      const tech = RESEARCH.find(t => t.id === action.id);
      if (!tech || s.research.includes(tech.id) || s.cash < tech.cost) break;
      const branch = RESEARCH.filter(t => t.branch === tech.branch), index = branch.findIndex(t => t.id === tech.id);
      if (index > 0 && !s.research.includes(branch[index - 1].id)) break;
      s.cash -= tech.cost; s.research.push(tech.id);
      if (tech.id === "coastguard") s.security = Math.min(100, s.security + 5);
      break;
    }
    case "speed": s.speed = (s.speed === 1 ? 2 : s.speed === 2 ? 3 : 1); break;
    case "start": startWave(s, !!action.early); break;
    case "select-operation": {
      if(!Number.isInteger(action.wave)||action.wave<1||action.wave>Math.min(25,s.highestWave+1))break;
      s.mode="campaign";s.wave=action.wave;s.hearts=20;s.phase="peace";s.enemies=[];s.spawnRemaining=0;s.idle.lastBattle=null;break;
    }
    case "mode": s.mode = action.mode; s.wave = action.mode === "campaign" ? Math.min(25,s.highestWave+1) : 1; s.hearts = 20; s.phase = "peace"; s.enemies = []; s.spawnRemaining = 0; s.idle.lastBattle=null; break;
    case "spell": {
      if (s.cooldowns[action.spell] > 0 || s.phase !== "battle") break;
      if (action.spell === "strike") {
        if (action.x === undefined || action.y === undefined) break;
        for (const e of s.enemies) if (distance(enemyPosition(e, s.layout), { x: action.x, y: action.y }) < 17) e.hp -= 450;
        s.popups.push({ id: s.nextId++, x: action.x, y: action.y, text: "💥", life: 1.2 }); s.cooldowns.strike = 60;
      } else if (action.spell === "emp") {
        for (const e of s.enemies) { e.stun = 6; e.hp -= 35; } s.cooldowns.emp = 90;
      } else { s.overdrive = 10; s.cooldowns.overdrive = 120; }
      break;
    }
    case "hero": { const route = findWaterRoute(s.hero, { x: action.x, y: action.y }, s.layout); s.hero.x = route[0].x; s.hero.y = route[0].y; s.hero.route = route; s.hero.routeIndex = 1; break; }
    case "hero2": { if (s.hero2) { const route = findWaterRoute(s.hero2, { x: action.x, y: action.y }, s.layout); s.hero2.x = route[0].x; s.hero2.y = route[0].y; s.hero2.route = route; s.hero2.routeIndex = 1; } break; }
    case "hero2-select": { if (s.hero2 && action.hero !== s.hero.active) s.hero2.active = action.hero; break; }
    case "deploy-hero2": { if (!s.hero2 && s.highestWave >= 5 && s.cash >= 3000 && action.hero !== s.hero.active) { s.cash -= 3000; s.hero2 = { ...sampleLane(getLane(s.layout, "enemy"), .3), active: action.hero }; } break; }
    case "recall-hero2": { s.hero2 = null; break; }
    case "hero-select": s.hero.active = action.hero; break;
    case "unlock": {
      const cost = ISLANDS.find(i => i.id === action.island)?.cost ?? 0;
      if (!s.islands.includes(action.island) && s.cash >= cost) { s.cash -= cost; s.islands.push(action.island); }
      break;
    }
    case "build-platform": {
      const built = s.idle.platforms ?? (s.idle.platforms = []);
      const cost = platformCost(built.length);
      if (!built.includes(action.id) && s.cash >= cost) { s.cash -= cost; built.push(action.id); }
      break;
    }
    case "open-chest": {
      if (s.chests > 0 && !s.idle.rewards.some(r=>r.type === "chest")) { const reward=previewChest(s);s.chests--;s.idle.openedChests++;s.idle.lootSeed=advanceLootSeed(s.idle.lootSeed);grantReward(s,reward); }
      break;
    }
    case "inspect": {
      const ship = s.contraband.find(item => item.id === action.id);
      if (ship) { const pos = contrabandPosition(ship, s.layout); s.steel = Math.min(2000, s.steel + 50); s.contraband = s.contraband.filter(item => item.id !== action.id); s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: "+۵۰ فولاد", life: 1.4 }); }
      break;
    }
    case "upgrade-card": if (s.cards[action.kind].count >= 3) { s.cards[action.kind].count -= 3; s.cards[action.kind].level++; } break;
    case "resolve-event": {
      if (s.event === "spill" && s.cash >= 300) { s.cash -= 300; s.security = Math.min(100, s.security + 2); s.event = null; s.eventClock = 0; }
      else if (s.event === "vip") { s.cash += 1000; s.security = Math.min(100, s.security + 3); s.event = null; s.eventClock = 0; }
      else if (s.event === "storm") { s.event = null; s.eventClock = 0; }
      break;
    }
    case "night": s.manualNight = !s.manualNight; break;
    case "prestige": {
      if (s.cash >= 100000 && s.highestWave >= 10) {
        const fresh=initialGame();s.cash=fresh.cash;s.oil=fresh.oil;s.fuel=fresh.fuel;s.steel=fresh.steel;s.ammo=fresh.ammo;s.buildings=fresh.buildings;s.idle.platforms=[];s.idle.port=fresh.idle.port;s.prestige++;s.phase="peace";s.wave=1;s.hearts=20;s.enemies=[];s.spawnRemaining=0;
        s.idle.bank=fresh.idle.bank;s.idle.collected=0;s.idle.collections=0;s.idle.claimedMissions=[];s.idle.claimedMilestones=[];s.idle.lastBattle=null;s.idle.contract=null;s.idle.offline=null;s.idle.rewards=[];
        grantReward(s,{id:`prestige-${s.prestige}`,type:"milestone",title:"فصل تازهٔ توسعه آغاز شد",subtitle:"تولید و قدرت برجک‌ها برای همیشه ۱۰٪ بیشتر شد. مدیرها، کارت‌ها و جزایر شما حفظ شدند.",cash:0,xp:200,chests:2,boosts:2});
      }
      break;
    }
  }
  s.idle.revision++; // tick returned early above; every other action bumps revision
  return s;
}
