import type { BuildingId, GameState, Mode, TowerKind } from "./game";
import { scenarioForWave } from "./news";

export type ManagerId = "harbor" | "energy" | "supply";
export type ContractId = "coastal" | "regional" | "international";
export type UpgradeQuantity = 1 | 10 | "max";
export type Reward = {
  id: string; type: "mission" | "milestone" | "daily" | "chest" | "contract";
  title: string; subtitle: string; cash: number; xp: number;
  steel?: number; ammo?: number; chests?: number; boosts?: number;
  cards?: Partial<Record<TowerKind, number>>;
};
/** Why a battle was lost (D-024): set from the ACTUAL defeat path in
 *  game.ts — the air-defense leak threshold, an objective ship/structure
 *  loss, the fatal leak that zeroed the hearts (a boss leak is its own
 *  reason), or plain line collapse. The defeat banner and the battle
 *  report show defeatReasonText(reason) so the player learns what
 *  actually killed the operation (audit-2 C1: defeats arrived at 18/20
 *  hearts with no explanation at all). */
export type DefeatReason = "air-leak" | "escort-lost" | "rescue-lost" | "structure-lost" | "intercept-crossed" | "boss-breakthrough" | "line-broken" | "objective-failed";
export const DEFEAT_REASONS: readonly DefeatReason[] = ["air-leak", "escort-lost", "rescue-lost", "structure-lost", "intercept-crossed", "boss-breakthrough", "line-broken", "objective-failed"];
export function defeatReasonText(reason?: string | null): string {
  switch (reason) {
    case "air-leak": return "نشت هوایی از حد مجاز گذشت؛ پرنده‌های دشمن از پدافند رد شدند.";
    case "escort-lost": return "کاروان اسکورت زیر آتش دشمن نابود شد.";
    case "rescue-lost": return "کشتی آسیب‌دیده پیش از پایان عملیات غرق شد.";
    case "structure-lost": return "سازهٔ تحت حفاظت (سکو / نفت‌کش در حال بارگیری) نابود شد.";
    case "intercept-crossed": return "دشمن از خط رهگیری گذشت.";
    case "boss-breakthrough": return "غول‌آخر از خط دفاع گذشت و قلب‌ها به صفر رسید.";
    case "line-broken": return "قلب‌ها با نشت دشمن به صفر رسید.";
    case "objective-failed": return "هدف عملیات از دست رفت.";
    default: return "";
  }
}
export interface BattleReport {
  id: string; wave: number; title: string; victory: boolean; stars: number;
  cash: number; xp: number; chests: number; destroyed: number; seconds: number; hearts: number; claimed: boolean;
  /** Defeats only (D-024): the mechanical cause, from the defeat path. */
  reason?: DefeatReason;
}
export interface IdleState {
  revision: number;
  bank: number;
  collected: number;
  collections: number;
  collectionStreak: number;
  lastCollectionAt: number;
  lifetimeIncome: number;
  xp: number;
  upgradeCount: number;
  claimedMissions: string[];
  claimedMilestones: string[];
  managerLevels: Record<ManagerId, number>;
  managerClock: number;
  boostCharges: number;
  boostRemaining: number;
  boostRecharge: number;
  autoBattle: boolean;
  stars: Record<string, number>;
  lastBattle: BattleReport | null;
  waveStartedAt: number;
  waveStartKills: number;
  rewards: Reward[];
  lootSeed: number;
  openedChests: number;
  completedContracts: number;
  contract: { id: ContractId; elapsed: number } | null;
  offline: { cash: number; seconds: number; defense: number } | null;
  appliedDailyIds: string[];
  port: PortState;
  platforms: number[];
  challengeRuns: number;
  /** Rolling 6 h game-time export window: dollars actually banked from
   *  tanker exports inside the current window (avgExportRate numerator). */
  exportWindowDollars: number;
  /** Game-time seconds elapsed inside the current export window. The
   *  window restarts empty on expiry (6 h) and at prestige. */
  exportWindowTime: number;
}
export interface PortState { tanker: { stage: "approach" | "loading" | "depart"; progress: number; load: number } | null; nextIn: number; cycles: number; /** Lifetime realized export income in $ — the basis of the realized export rate (R11). */ exportedDollars: number; }
export function initialIdle(): IdleState {
  return {
    revision: 0, bank: 260, collected: 0, collections: 0, collectionStreak: 0, lastCollectionAt: -1000, lifetimeIncome: 0, xp: 0, upgradeCount: 0,
    claimedMissions: [], claimedMilestones: [], managerLevels: { harbor: 0, energy: 0, supply: 0 }, managerClock: 0,
    boostCharges: 2, boostRemaining: 0, boostRecharge: 0, autoBattle: false, stars: {}, lastBattle: null,
    waveStartedAt: 0, waveStartKills: 0, rewards: [], lootSeed: 17381, openedChests: 0, completedContracts: 0,
    contract: null, offline: null, appliedDailyIds: [],
    port: { tanker: { stage: "approach", progress: 0, load: 0 }, nextIn: 0, cycles: 0, exportedDollars: 0 }, platforms: [], challengeRuns: 0,
    exportWindowDollars: 0, exportWindowTime: 0,
  };
}

export const MANAGERS: Record<ManagerId, { name: string; role: string; description: string; effect: string; image: string; price: number; unlockXp: number; color: string }> = {
  harbor: { name: "ناخدا مهران", role: "مدیر بندر", description: "سود بندر را هر ۱۰ ثانیه خودکار به حساب شما می‌ریزد.", effect: "+۱۰٪ درآمد ترانزیت در هر سطح", image: "/assets/managers/harbor.jpg", price: 750, unlockXp: 0, color: "gold" },
  energy: { name: "مهندس رها", role: "مدیر انرژی", description: "تولید سکوها و پالایشگاه‌ها را بهینه می‌کند.", effect: "+۱۵٪ تولید نفت و سوخت در هر سطح", image: "/assets/managers/energy.jpg", price: 1100, unlockXp: 150, color: "teal" },
  supply: { name: "سرگرد سامان", role: "مدیر تدارکات", description: "شبکهٔ مهمات را برای نبردهای طولانی آماده نگه می‌دارد.", effect: "+۲۵٪ تولید مهمات در هر سطح", image: "/assets/managers/supply.jpg", price: 1400, unlockXp: 300, color: "blue" },
};
export function managerCost(id: ManagerId, level: number) { return Math.round(MANAGERS[id].price * Math.pow(2, level)); }
export function rankInfo(xp: number) {
  const thresholds = [0, 150, 400, 800, 1400, 2200, 3400, 5000, 7500, 11000, 16000];
  let index = thresholds.findIndex((value, i) => i > 0 && value > xp) - 1;
  if (index < 0) index = thresholds.length - 1;
  const current = thresholds[index], next = thresholds[index + 1] ?? current + 5000;
  const titles = ["فرمانده نوپا", "نگهبان بندر", "ناخدای تنگه", "فرمانده ساحل", "سالار دریا", "دریادار", "فرمانروای آب‌ها"];
  return { level: index + 1, title: titles[Math.min(titles.length - 1, Math.floor(index * .65))], current, next, progress: Math.min(1, (xp - current) / (next - current)) };
}

export const CHAPTERS = [
  { title: "بندر نوپا", description: "اولین سود، اولین تصمیم‌های بزرگ", icon: "anchor" },
  { title: "قدرت صنعتی", description: "اقتصادی که از تنگه پشتیبانی می‌کند", icon: "factory" },
  { title: "دفاع چندلایه", description: "پیشروی در برابر ناوگان‌های سنگین", icon: "shield" },
  { title: "فرمانروایی آب‌ها", description: "گسترش قلمرو و برتری راهبردی", icon: "crown" },
];
export type MissionTarget = { kind: "collect" | "building" | "manager" | "tower" | "battle" | "research" | "chest" | "contract" | "island" | "journal"; id?: string };
export type Mission = {
  id: string; chapter: number; title: string; description: string; target: number;
  metric: "collected" | "building" | "managers" | "towers" | "wave" | "research" | "chests" | "contracts" | "islands" | "towerTier";
  metricId?: string; navigate: MissionTarget; cash: number; xp: number; chests?: number; boosts?: number;
};
export const MISSIONS: Mission[] = [
  { id:"first-profit", chapter:0, title:"اولین سود بندر", description:"۱۰۰ دلار درآمد بندر را جمع‌آوری کنید.", target:100, metric:"collected", navigate:{kind:"collect"}, cash:300, xp:50 },
  { id:"oil-five", chapter:0, title:"چرخ تولید را بچرخان", description:"سکوی نفتی را به سطح ۵ برسانید.", target:5, metric:"building", metricId:"oil", navigate:{kind:"building",id:"oil"}, cash:500, xp:75 },
  { id:"busy-port", chapter:0, title:"بندر پررفت‌وآمد", description:"اسکلهٔ صادرات را به سطح ۳ ارتقا دهید.", target:3, metric:"building", metricId:"dock", navigate:{kind:"building",id:"dock"}, cash:400, xp:60, chests:1 },
  { id:"first-manager", chapter:0, title:"بندر خودکار", description:"اولین مدیر را استخدام کنید.", target:1, metric:"managers", navigate:{kind:"manager"}, cash:600, xp:100 },
  { id:"first-defense", chapter:0, title:"یک پیروزی برای شروع", description:"موج اول را با موفقیت پشت سر بگذارید.", target:1, metric:"wave", navigate:{kind:"battle"}, cash:750, xp:120, chests:1 },
  { id:"four-towers", chapter:1, title:"خط دفاع میانی", description:"۴ برجک در جزایر مستقر کنید.", target:4, metric:"towers", navigate:{kind:"tower"}, cash:800, xp:100 },
  { id:"refinery-five", chapter:1, title:"پالایش بیشتر، قدرت بیشتر", description:"پالایشگاه را به سطح ۵ برسانید.", target:5, metric:"building", metricId:"refinery", navigate:{kind:"building",id:"refinery"}, cash:1000, xp:120 },
  { id:"first-tech", chapter:1, title:"یک قدم جلوتر", description:"اولین فناوری را پژوهش کنید.", target:1, metric:"research", navigate:{kind:"research"}, cash:900, xp:125, boosts:1 },
  { id:"oil-ten", chapter:1, title:"جهش صنعتی", description:"سکوی نفتی را به سطح ۱۰ برسانید و تولید را دو برابر کنید.", target:10, metric:"building", metricId:"oil", navigate:{kind:"building",id:"oil"}, cash:1500, xp:180, chests:1 },
  { id:"steel-first", chapter:1, title:"فولاد، پیش از نبرد هوایی", description:"مجتمع فولاد را بسازید تا درآمد فولاد شروع شود؛ فولاد خودبه‌خود تولید نمی‌شود و برجک‌های تازه — از جمله پدافند هوایی — فولاد می‌خواهند.", target:1, metric:"building", metricId:"steel", navigate:{kind:"building",id:"steel"}, cash:600, xp:80 },
  { id:"first-aa", chapter:1, title:"آسمان را پوشش بده", description:"یک برجک پدافند هوایی مستقر کنید؛ موج سوم نخستین حملهٔ هوایی دشمن است و توپخانهٔ زمینی به‌تنهایی کافی نیست.", target:1, metric:"towers", metricId:"air", navigate:{kind:"tower"}, cash:700, xp:100 },
  { id:"third-wave", chapter:1, title:"آبراه تحت حفاظت", description:"موج سوم را پاکسازی کنید.", target:3, metric:"wave", navigate:{kind:"battle"}, cash:1800, xp:200 },
  { id:"first-contract", chapter:2, title:"تجارت فراتر از ساحل", description:"یک قرارداد حمل‌ونقل را تکمیل و تسویه کنید.", target:1, metric:"contracts", navigate:{kind:"contract"}, cash:1400, xp:150 },
  { id:"two-managers", chapter:2, title:"تیم حرفه‌ای", description:"دو مدیر متخصص استخدام کنید.", target:2, metric:"managers", navigate:{kind:"manager"}, cash:1800, xp:160 },
  { id:"tier-three", chapter:2, title:"آتش برتر", description:"یک برجک را به سطح ۳ برسانید.", target:3, metric:"towerTier", navigate:{kind:"tower"}, cash:1800, xp:180, boosts:1 },
  { id:"steel-five", chapter:2, title:"فولاد برای فردا", description:"مجتمع فولاد را به سطح ۵ ارتقا دهید.", target:5, metric:"building", metricId:"steel", navigate:{kind:"building",id:"steel"}, cash:2200, xp:180 },
  { id:"first-boss", chapter:2, title:"شکست ناو سنگین", description:"غول‌آخر موج ۵ را شکست دهید.", target:5, metric:"wave", navigate:{kind:"battle"}, cash:3000, xp:300, chests:2 },
  { id:"new-island", chapter:3, title:"افق‌های تازه", description:"یک جزیرهٔ جدید آزاد کنید.", target:3, metric:"islands", navigate:{kind:"island"}, cash:3000, xp:250 },
  { id:"five-tech", chapter:3, title:"برتری فناوری", description:"۵ فناوری را پژوهش کنید.", target:5, metric:"research", navigate:{kind:"research"}, cash:3200, xp:250, chests:1 },
  { id:"oil-twenty-five", chapter:3, title:"مجتمع مدرن نفت", description:"سکوی نفتی را به سطح ۲۵ برسانید.", target:25, metric:"building", metricId:"oil", navigate:{kind:"building",id:"oil"}, cash:5000, xp:400, chests:2 },
  { id:"all-managers", chapter:3, title:"کشوری که خودکار کار می‌کند", description:"هر سه مدیر متخصص را استخدام کنید.", target:3, metric:"managers", navigate:{kind:"manager"}, cash:4000, xp:300, boosts:2 },
  { id:"tenth-wave", chapter:3, title:"فرمانروای تنگه", description:"موج ۱۰ و زیردریایی عظیم آن را پشت سر بگذارید.", target:10, metric:"wave", navigate:{kind:"battle"}, cash:8000, xp:600, chests:3 },
];
export function missionProgress(state: GameState, mission: Mission) {
  const idle = state.idle;
  let value = 0;
  if (mission.metric === "collected") value = idle.collected;
  if (mission.metric === "building") value = state.buildings[mission.metricId as BuildingId] ?? 0;
  if (mission.metric === "managers") value = Object.values(idle.managerLevels).filter(level => level > 0).length;
  if (mission.metric === "towers") value = mission.metricId ? state.towers.filter(t => t.kind === (mission.metricId as TowerKind)).length : state.towers.length;
  if (mission.metric === "towerTier") value = Math.max(0, ...state.towers.map(t => t.tier));
  if (mission.metric === "wave") value = state.highestWave;
  if (mission.metric === "research") value = state.research.length;
  if (mission.metric === "chests") value = idle.openedChests;
  if (mission.metric === "contracts") value = idle.completedContracts;
  if (mission.metric === "islands") value = state.islands.length;
  return { value: Math.min(mission.target, value), target: mission.target, complete: value >= mission.target, fraction: Math.min(1, value / mission.target) };
}
export function currentMission(state: GameState) { return MISSIONS.find(mission => !state.idle.claimedMissions.includes(mission.id)) ?? null; }
export function currentChapter(state: GameState) {
  const mission = currentMission(state), chapter = mission?.chapter ?? 3;
  const items = MISSIONS.filter(m => m.chapter === chapter);
  return { ...CHAPTERS[chapter], index: chapter, completed: items.filter(m => state.idle.claimedMissions.includes(m.id)).length, total: items.length };
}

export const CONTRACTS: Record<ContractId, { title: string; destination: string; duration: number; cost: number; cash: number; xp: number; unlock: number }> = {
  coastal: { title:"محمولهٔ ساحلی", destination:"بندرعباس ← قشم", duration:60, cost:250, cash:800, xp:50, unlock:0 },
  regional: { title:"کاروان منطقه‌ای", destination:"تنگه هرمز ← خلیج فارس", duration:180, cost:800, cash:2600, xp:150, unlock:1 },
  international: { title:"ترانزیت بین‌المللی", destination:"دریای عمان ← آب‌های آزاد", duration:420, cost:2500, cash:8500, xp:400, unlock:5 },
};

const operationNames = ["اولین نگهبانی","سپیده‌دم قشم","دفاع از لارک","مسیر امن","شکار ناو سنگین","سپر هرمز","تندر ساحلی","در سایهٔ آب","آتش میانی","اعماق خاموش","خط نقره‌ای","حفاظت از بندر","پاسگاه شرقی","آخرین تنگنا","شکستن تایتان","جبههٔ غربی","طلوع تنب","دیوار آبی","فولاد و آتش","سقوط ناو هواپیمابر","سه آبراه","دفاع نهایی","طوفان آهن","پیش از پیروزی","فرمانروایی آب‌ها"];
const bosses = ["ناو هلیکوپتربر","زیردریایی لویاتان","رزم‌ناو تایتان","ناو هواپیمابر","ابرناوگان فرماندهی"];
export function operationInfo(wave: number, mode: Mode = "campaign") {
  const boss = wave % 5 === 0;
  return { title: scenarioForWave(wave, mode).operationName, boss, bossName: boss ? bosses[Math.min(4, Math.ceil(wave / 5) - 1)] : null, cash: 250 + wave * 180, xp: 60 + wave * 15, recommendedPower: Math.round(80 * Math.pow(1.2, wave - 1)), tip: wave >= 3 ? "سونار و پدافند هوایی را کنار توپخانه مستقر کنید." : "توپخانهٔ سریع برای شروع انتخاب مناسبی است." };
}

export function previewChest(state: GameState): Reward {
  let seed = state.idle.lootSeed | 0;
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  const number = seed >>> 0;
  const kinds: TowerKind[] = ["cannon","heavy","missile","air","ew","boat"];
  // Checklist ۷٫۶: 3 cards for one family + 1 for the NEXT family in the
  // 6-family cycle (the old seeded jump picked an arbitrary other family).
  const first = kinds[number % 6], second = kinds[(number % 6 + 1) % 6];
  return { id:`chest-${state.idle.openedChests + 1}-${number}`, type:"chest", title:"نقشه‌های تازه رسیدند!", subtitle:"قدرتی که در تمام نبردها همراه شماست.", cash:150 + number % 351, xp:35, cards:{[first]:3,[second]:1}, boosts:state.idle.openedChests % 3 === 2 ? 1 : 0 };
}
export function advanceLootSeed(seed: number) { let x = seed | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0; }
