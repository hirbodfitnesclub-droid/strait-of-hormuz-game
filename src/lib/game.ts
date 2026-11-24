import { openingDockEfficiency, applyOpeningServiceIfDue, combatTowers, openingSchedule, openingMarkedQuota, operationForOpening, settleOpeningBattle, requestOpeningRepair, restoreOpeningOperations, type OpeningOperations } from "./opening-operations";
import slotData from "../three-map/slots-3d.json";
import { point3dToPct } from "../three-map/coords";
import { BALANCE } from "./balance";
import { advanceReopening, initializeReopening, openingCapacity, openingCollect, openingInputTime, openingPrice, openingStats, openingTankOrder,
  openingWaveAvailable, portEvent, restoreOpeningIndustry, settleReopeningAbsence, type OpeningIndustry } from "./opening-industry";
import { initialIdle, MISSIONS, MANAGERS, CONTRACTS, currentMission, missionProgress, managerCost, operationInfo, previewChest, advanceLootSeed, DEFEAT_REASONS, type IdleState, type ManagerId, type ContractId, type UpgradeQuantity, type Reward, type DefeatReason } from "./progression";
import { findWaterRoute, getLane, nearestWater, safeSegment, isWater, sampleLane, type MapLayout, type Point } from "./navigation";
import { weaponSpec, modelKindFor, specInterval, flightTime, salvoCycleSeconds, type ModelKind } from "./weapons-spec";
import { scenarioForWave, commitScenarioForWave, type Scenario } from "./news";
import { buildSpawnQueue, objectiveTypeOf, conditionRangeFactor, scenarioContextFor, type ObjectiveType, type SpawnUnit } from "./scenario-mechanics";

export type BuildingId = "oil" | "tank" | "dock" | "refinery" | "steel" | "arms" | "power" | "water" | "city" | "welfare" | "optical";
export type TowerKind = "cannon" | "heavy" | "missile" | "air" | "ew" | "boat";
export type Mode = "campaign" | "endless" | "challenge";
export type Phase = "peace" | "battle" | "intermission" | "defeat" | "victory";
export type Priority = "first" | "strongest" | "weakest" | "air";
export type Spell = "strike" | "emp" | "overdrive";
// The starting islands begin engaging near 0.68 of the shipping lane.
// Interception must leave a playable defensive approach before the boundary.
export const INTERCEPT_LINE = BALANCE.combat.interceptLine;

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
  /** MECH-A: battle-second accumulator for branch abilities that are not
   *  ordinary shots — EMP pulse period, sonar hack cycle, mine planting. */
  abilityClock?: number;

  /** MLRS salvo cycle state (MECH-B): rockets remaining in the current
   *  salvo, including the next one to fire. Absent = a full salvo is
   *  loaded. The renderer reads this + cooldown to show the reload. */
  salvoLeft?: number;
  /** CIWS point-defense budget (MECH-B; checklist ۱٫۱): recharge timers
   *  of the SPENT interception slots — one entry per interception used,
   *  each counting down from 5s in battle time. Per-slot recharge (QA
   *  round 2): a slot returns only once its own timer runs out, and the
   *  timer must cross below zero, so two uses of the same slot are
   *  always MORE than 5s apart — at most 3 interceptions land in ANY
   *  5-second span, under closed and half-open readings alike (the old
   *  shared window let a refill burst put 5–6 into one sliding span).
   *  Absent = all 3 slots ready. */
  interceptCharges?: number[];
}
export interface Enemy {
  openingMarked?: boolean;
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
  /** Siege operations (شکستن محاصره): this unit travels the enemy lane from
   *  the opposite end — position is sampled at 1 − progress. */
  rev?: boolean;
  /** MECH-A → MECH-B contract: EMP pulse shutdown stamps on the shared
   *  battle clock (GameState.battleTime). While
   *  `s.battleTime < (e.weaponDownUntil ?? 0)` the enemy's weapons are
   *  offline (no destroyer missiles, no boss-2 stun attack); while
   *  `s.battleTime < (e.radarDownUntil ?? 0)` its radar-driven systems are
   *  offline (boss-4 jammer, destroyer point-defense). An ABSENT stamp
   *  means the system is UP (MECH-B gates on exactly this). EMP pulses
   *  refresh both stamps to battleTime + 4. */
  weaponDownUntil?: number;
  radarDownUntil?: number;
  /** MECH-A: remaining battle-seconds of EMP-pulse slow (×0.4 movement). */
  empSlow?: number;
  /** MECH-A: remaining battle-seconds this air unit is hacked by a sonar
   *  hub and fights for the player (no advance, no leak, no bounty). */
  hackTimer?: number;
  /** Killed without bounty/combo/kill credit (hacked drone detonation). */
  noReward?: boolean;
  /** Destroyer offensive-fire clock (MECH-B; checklist ۲٫۶): battle-time
   *  accumulated at the enemy's effective rate (frozen by stun/slow). */
  fireClock?: number;
  /** Spawned by a boss ability (MECH-B): worth 25% of its class bounty
   *  and never feeds the combo — closing the infinite boss-add farm
   *  (audit جدید-۱۶). */
  isAdd?: boolean;
  /** Boss only: total reinforcements this boss has spawned (cap 40). */
  addsSpawned?: number;
  /** Boss 3 only: last observed Titan shield state, for up/down events. */
  shieldUp?: boolean;
}
/** An enemy sea mine laid on the trade lane during a «مین‌گذاری دشمن»
 *  battle (team SCEN). NOT the player mine branch of MECH-A: these hurt OUR
 *  ships. Static once laid; boat (garrison) towers sweep them. */
export interface EnemyMine { id: number; progress: number }
/** A friendly ship an objective rides on: the escort caravan (moves along
 *  the trade lane) or the stranded rescue ship (stationary in the channel). */
export interface ObjectiveShip { progress: number; hp: number; maxHp: number; slow: number }
/** Everything one battle inherits from its scenario (fix program SCEN;
 *  audit بحرانی-۱۴/۱۵/۱۶): the spawn queue built from the scenario's class
 *  mix, the special condition's mechanics, and the objective's win/lose
 *  state. Rolled once in startWave; null outside battle. */
export interface BattleContext {
  wave: number;
  condition: string | null;
  objective: ObjectiveType;
  queue: SpawnUnit[];
  elapsed: number;               // battle-seconds (drives the dawn window)
  escort: ObjectiveShip | null;
  stranded: ObjectiveShip | null;
  structureHp: number; structureMaxHp: number; // platform / loading tanker; 0 max = no structure objective
  openingAttempt?: number; trainingLoan?: Tower; markedEscaped?: number; deliveredEscortHP?: number;
  airTotal: number; airLeaked: number;         // air-defense leak threshold
  mines: EnemyMine[]; mineClock: number;
  sweep: Record<number, number>;               // boat-slot → minesweep cooldown
  failed: boolean;                             // objective lost → defeat at the resolution point
  failReason: DefeatReason | null;             // D-024: which objective path failed (set where failed is set)
  fatalLeak: Enemy["kind"] | null;            // D-024: kind of the leak that zeroed the hearts (boss = breakthrough)
}
export interface Pirate { id: number; progress: number; hp: number; /** VIP-event escorts (R6): a dedicated attack group, not traffic pirates — while the VIP ship lives they are exempt from the passive coast-guard erosion; hero/tower/boat fire still hits them in full. */ vipEscort?: boolean; /** D-022: ship-seconds since spawn, drives the ease-in ramp; absent = already underway (no ramp). */ age?: number; }
/** The VIP golden supertanker (R6): a real ship on the trade lane with HP.
 *  Pirates engage it while it crosses; a safe crossing pays the old event
 *  reward, destruction fines security instead. */
export interface VipShip { progress: number; hp: number; maxHp: number; /** Seconds since spawn (frozen while paused); pirates cannot damage the ship during its first 5 s. */ age: number; }
export interface Contraband { id: number; progress: number; /** D-022: ship-seconds since spawn (ease-in ramp); absent = underway. */ age?: number; }
export interface Merchant { inbound?: boolean; id: number; progress: number; kind: "barge" | "bulk" | "container" | "tanker"; reward: number; paid: boolean; /** D-022: ship-seconds since spawn (ease-in ramp); absent = underway. */ age?: number; }
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
  /** MECH-A: set when the shot was fired by a boat entity (garrison /
   *  torpedo boat, or the Ghadir hunter sub) — the render origin is the
   *  boat's position in x1/y1, NOT the tower model. -1 marks an
   *  entity-origin effect record (EMP pulse ring, mine explosion). */
  boatId?: number;
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
  boatId?: number;           // MECH-A: fired by a boat entity (see Shot.boatId)
}
/** MECH-A: one deployed boat of a boat-family tower — a real entity with
 *  its own HP, station on the enemy lane and fire cooldown. Garrison boats
 *  physically block surface enemies at their station; torpedo boats pin
 *  heavy ships they engage; the Ghadir is the mine branch's hunter sub and
 *  fires the branch's spec shots through the tower's discrete-fire loop. */
export interface BoatUnit {
  id: number;
  slot: number;              // owning tower slot
  role: "garrison" | "torpedo" | "ghadir";
  index: number;             // 0..count-1 within the tower's unit set
  hp: number;
  maxHp: number;
  progress: number;          // station: lane progress in front of the tower
  offset: number;            // perpendicular offset from the lane (% units)
  state: "active" | "respawn";
  respawnClock: number;      // battle-seconds until redeployment
  cooldown: number;          // battle-seconds until this boat may fire
}
/** MECH-A: one planted sea mine of a mine-branch tower. */
export interface MineUnit { id: number; slot: number; x: number; y: number; }
export interface Popup { id: number; x: number; y: number; text: string; life: number; merchantId?: number; }
/** An enemy projectile in flight (MECH-B; checklist ۲٫۶): launched by a
 *  destroyer or by the Leviathan (boss 2) at one of the player's towers.
 *  eta counts down in battle time; on arrival the target tower is disabled
 *  for ENEMY_MISSILE_STUN seconds — unless a CIWS intercepts it first.
 *  gamesync renders these from state (its own section); the launch /
 *  intercept / impact moments are reported through BattleEvent records. */
export interface EnemyMissile {
  id: number;
  sourceId: number;            // firing enemy (destroyer or boss 2)
  source: "destroyer" | "boss";
  targetSlot: number;
  eta: number;                 // battle-seconds until arrival
  total: number;               // flight time at launch (position interpolation)
  x1: number; y1: number;      // launch position (percent units)
  x2: number; y2: number;      // target tower slot position (percent units)
}
/** Current position of an enemy missile, interpolated in percent units. */
export function enemyMissilePosition(m: EnemyMissile): { x: number; y: number } {
  const t = m.total > 0 ? Math.max(0, Math.min(1, 1 - m.eta / m.total)) : 1;
  return { x: m.x1 + (m.x2 - m.x1) * t, y: m.y1 + (m.y2 - m.y1) * t };
}
/** One momentary battle event for the FX layer (MECH-B) — the enemy-side
 *  counterpart of Shot records: reset every tick, consumed by renderers.
 *  x/y is the primary position (percent units); x2/y2 an optional second
 *  point (e.g. the target of a boss's stun missile). */
export interface BattleEvent {
  type: "boss-spawn" | "boss-stun" | "shield-up" | "shield-down" | "enemy-missile" | "intercept" | "tower-disabled" | "missile-impact" | "ship-destroyed";
  x: number; y: number;
  x2?: number; y2?: number;
  slot?: number;               // affected tower slot, when relevant
  enemyId?: number;            // boss / shooter the event belongs to
  count?: number;              // reinforcements spawned (boss-spawn)
}
/** Cumulative combat counters kept in the logic state (QA جزئی-۲): shots are
 *  counted at the moment of fire, hits/fizzled when the impact resolves —
 *  the renderer only reads these, it never reconstructs them. Keyed by
 *  modelKind ("hero" for hero shots). Pirate-engagement FX records are
 *  visual only and are deliberately NOT counted here. */
export interface FireStat { shots: number; hits: number; fizzled: number; }
export interface GameState {
  /** Absent on pre-reopening saves. Their running economy and progression remain intact. */
  opening?: OpeningIndustry;
  version: number;
  /** Saved PRNG state: replaying a reducer action must produce the same battle. */
  rngState: number;
  idle: IdleState;
  cash: number; oil: number; fuel: number; steel: number; ammo: number;
  oilSplit: number;
  buildings: Record<BuildingId, number>;
  openingOperations?: OpeningOperations;
  towers: Tower[];
  research: string[];
  cards: Record<TowerKind, { count: number; level: number }>;
  islands: string[];
  security: number; hearts: number; wave: number; highestWave: number;
  phase: Phase; mode: Mode; speed: 1 | 2 | 3; layout: MapLayout;
  enemies: Enemy[]; pirates: Pirate[]; contraband: Contraband[]; merchants: Merchant[]; shots: Shot[]; popups: Popup[];
  battle: BattleContext | null;
  vipShip: VipShip | null; eventCount: number; piratesDestroyed: number;
  pendingImpacts: PendingImpact[];
  boats: BoatUnit[]; mines: MineUnit[];
  enemyMissiles: EnemyMissile[];
  events: BattleEvent[];
  fireStats: Record<string, FireStat>;
  spawnRemaining: number; spawnClock: number; spawnIndex: number; nextId: number; earlyBonus: boolean;
  countdown: number; trafficClock: number; trafficCount: number; destroyed: number;
  elapsed: number; cooldowns: Record<Spell, number>; overdrive: number;
  hero: { x: number; y: number; active: number; attackClock?: number; route?: Point[]; routeIndex?: number; slow?: number };
  hero2: { x: number; y: number; active: number; attackClock?: number; route?: Point[]; routeIndex?: number; slow?: number } | null;
  towerStuns: Record<number, number>;
  /** Cumulative battle clock: battle-seconds including the game-speed
   *  multiplier, advanced only while phase === "battle" and never reset —
   *  the shared time base for cross-team stamps (MECH-A's EMP
   *  weaponDownUntil / radarDownUntil, MECH-B's enemy-missile gating). */
  battleTime: number;
  challengeRule: number;
  chests: number; prestige: number; event: "spill" | "storm" | "vip" | null;
  eventClock: number; manualNight: boolean; lastSavedAt: number;
  combo: number; comboTimer: number; maxCombo: number; waveLeaked: boolean; slowmo: number;
  /** D-024 spiral pre-alerts: consecutive seconds spent in the danger
   *  zone (fuel < 60 and falling / grid < 0.9). `warnings` flips only
   *  after ~10 s of SUSTAIN — a momentary dip or a stable low-fuel
   *  equilibrium never warns; the choke itself is what must not be the
   *  first signal (audit-2 I2). Game.tsx renders these through the
   *  existing context-alert. */
  lowFuelTime: number; lowGridTime: number; lowFuelStart: number;
  warnings: { fuel: boolean; power: boolean };
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
export const SLOTS = slotData.slots.map(({id, island, label, x, z}) => {
  const [px, py] = point3dToPct(x, z);
  return {id, island, label, x: px, y: py};
});
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
/** Each offshore field belongs to its namesake island; the platform may
 *  only be built once that island is unlocked (audit fix: platforms used
 *  to be buildable anywhere with no regional prerequisite). */
export const PLATFORM_ISLANDS: Record<number, string> = { 0: "siri", 1: "larak", 2: "kharg", 3: "jask", 4: "abumusa" };
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
    version: 1, rngState: 0x484f524d, idle: initialIdle(), cash: 1200, oil: 300, fuel: 200, steel: 150, ammo: 300, oilSplit: 40,
    combo: 0, comboTimer: 0, maxCombo: 0, waveLeaked: false, slowmo: 0,
    lowFuelTime: 0, lowGridTime: 0, lowFuelStart: -1, warnings: { fuel: false, power: false },
    buildings: { oil: 1, tank: 1, dock: 1, refinery: 0, steel: 0, arms: 0, power: 1, water: 1, city: 1, welfare: 0, optical: 0 },
    towers: [],
    research: [],
    cards: { cannon: { count: 0, level: 1 }, heavy: { count: 0, level: 1 }, missile: { count: 0, level: 1 }, air: { count: 0, level: 1 }, ew: { count: 0, level: 1 }, boat: { count: 0, level: 1 } },
    islands: ["main", "qeshm"], security: 70, hearts: 20, wave: 1, highestWave: 0,
    phase: "peace", mode: "campaign", speed: 1, layout: "landscape", enemies: [], pirates: [], contraband: [], merchants: [{ id: 1, progress: .24, kind: "bulk", reward: 120, paid: false }, { id: 2, progress: .63, kind: "container", reward: 500, paid: false }], shots: [], popups: [], pendingImpacts: [], boats: [], mines: [], enemyMissiles: [], events: [], battle: null, battleTime: 0, fireStats: {},
    vipShip: null, eventCount: 0, piratesDestroyed: 0,
    spawnRemaining: 0, spawnClock: 0, spawnIndex: 0, nextId: 3, earlyBonus: false, countdown: 15, trafficClock: 0, trafficCount: 0,
    destroyed: 0, elapsed: 0, cooldowns: { strike: 0, emp: 0, overdrive: 0 }, overdrive: 0,
    hero: { ...sampleLane(getLane("landscape", "enemy"), .45), active: 0 }, hero2: null, towerStuns: {}, challengeRule: 0, chests: 0, prestige: 0, event: null, eventClock: 0,
    manualNight: false, lastSavedAt: Date.now(),
  };
}

/** The live install initializer. initialGame() also supplies the unmodified 0.7.4 migration defaults. */
export function freshPortGame(): GameState { return initializeReopening(initialGame()); }

function liveOpeningStats(s:GameState) {
  return openingStats(s,s.towers.reduce((n,t)=>n+towerPowerMw(s,t),0),openingDockEfficiency(s));
}
const openingDependencies = { rates:liveOpeningStats, position:merchantPosition, service:applyOpeningServiceIfDue, timers:advanceOfflineTimers, exportWindow:updateExportWindow };

/** Cost of upgrading FROM `level` TO `level + 1`: BaseCost × 1.15^level —
 *  the exponent sits on the destination step, so the first build costs
 *  exactly the PRD base cost (the old 1.15^(level−1) ran one step behind
 *  and made first builds ~13% cheaper than the PRD table). */
export function upgradeCost(id: BuildingId, level: number) { return Math.ceil(BUILDINGS[id].baseCost * Math.pow(BALANCE.economy.buildingCostGrowth, level)); }
export function towerUpgradeCost(tower: Tower) {
  const def = TOWERS[tower.kind];
  return { cash: Math.ceil(def.cost * Math.pow(1.55, tower.tier)), steel: Math.ceil(def.steel * (1 + tower.tier * 0.6)) };
}
export function towerSellRefund(s: GameState, tower: Tower) {
  let cash = TOWERS[tower.kind].cost, steel = TOWERS[tower.kind].steel;
  for (let tier = 1; tier < tower.tier; tier++) {
    const cost = towerUpgradeCost({ ...tower, tier }); cash += cost.cash; steel += cost.steel;
  }
  const rate = s.research.includes("recycle") ? .8 : .5;
  return { rate, cash: Math.floor(cash * rate), steel: Math.floor(steel * rate) };
}
export function positionAt(progress: number, layout: MapLayout = "landscape") { return sampleLane(getLane(layout, "enemy"), progress); }
export function enemyPosition(enemy: Enemy, layout: MapLayout = "landscape") {
  const p = enemy.rev ? 1 - enemy.progress : enemy.progress;
  if (enemy.kind === "air") { const path = getLane(layout, "enemy"), start = path[0], end = path[path.length - 1]; return { x: start.x + (end.x - start.x) * p, y: start.y + (end.y - start.y) * p }; }
  return positionAt(p, layout);
}
export function enemyMinePosition(mine: EnemyMine, layout: MapLayout = "landscape") { return sampleLane(getLane(layout, "trade"), mine.progress); }
export function objectiveShipPosition(ship: ObjectiveShip, layout: MapLayout = "landscape") { return sampleLane(getLane(layout, "trade"), ship.progress); }
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

export function piratePosition(pirate: Pirate, layout: MapLayout = "landscape") { return sampleLane(getLane(layout, pirate.vipEscort ? "trade" : "pirate"), pirate.progress); }
export function contrabandPosition(ship: Contraband, layout: MapLayout = "landscape") { return sampleLane(getLane(layout, "trade"), ship.progress); }
export function merchantLane(ship: Merchant) {
  // Keep vessels already underway in older saves on their original course.
  if (ship.inbound === undefined) return "trade";
  return ship.inbound ? "inbound" : "outbound";
}
export function merchantPosition(ship: Merchant, layout: MapLayout = "landscape") {
  return sampleLane(getLane(layout, merchantLane(ship)), ship.progress);
}
export function vipPosition(ship: VipShip, layout: MapLayout = "landscape") { return sampleLane(getLane(layout, "trade"), ship.progress); }
export function tankerCapacityFor(dockLevel: number) { return 500 + dockLevel * 500; }
export function portTankerPosition(progress: number, layout: MapLayout = "landscape") { return sampleLane(getLane(layout, "port"), progress); }
export function distance(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.hypot(a.x - b.x, (a.y - b.y) * 0.72); }

export function getStats(s: GameState) {
  if(s.opening) return liveOpeningStats(s);
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
  const oilRate = output("oil") * (s.research.includes("drill") ? 1.25 : 1) * (s.research.includes("seabed") ? 1.1 : 1) + (s.idle.platforms?.length ?? 0) * 8 * grid;
  const dockRate = output("dock") * (s.research.includes("dockauto") ? 1.25 : 1) * (s.research.includes("pipe") ? 1.5 : 1);
  const exportRate = Math.min(oilRate * s.oilSplit / 100, dockRate);
  const dollarRate = exportRate * 2 * (s.research.includes("trade") ? 1.5 : 1);
  // R11: the REAL export rate — money only flows while a tanker is berthed
  // and loading. The theoretical dollarRate above is a planning number; it
  // must never again drive real money (bank capacity, offline income).
  const portTanker = s.idle.port?.tanker;
  const loadingNow = !!portTanker && portTanker.stage === "loading" && portTanker.load < (500 + b.dock * 500) - 0.001 && s.oil > 0.001;
  const realExportRate = loadingNow ? exportRate * 2 * (s.research.includes("trade") ? 1.5 : 1) : 0;
  // Realized export rate over a smoothed 6 h game-time horizon (the two
  // counters live on idle, decay proportionally after six hours, and reset
  // at prestige). The lifetime ledger (port.exportedDollars) must NOT feed
  // this: an early export hoard diluted over a whole save — or a fresh
  // prestige — would otherwise size the bank and pay offline income on
  // a rate the port no longer earns. 60 s floor against opening spikes.
  // This — not the theoretical rate — sizes the harbor bank and pays
  // offline income.
  const avgExportRate = (s.idle.exportWindowDollars ?? 0) / Math.max(60, s.idle.exportWindowTime ?? 0);
  const bankCapacity = Math.max(10000, Math.max(avgExportRate, realExportRate) * 6 * 3600);
  // Tank capacity is its own formula (level × 500 × tanktech): the
  // production step-doubling 2^floor(L/10) must NOT leak into capacity.
  const oilCapacity = b.tank * 500 * (s.research.includes("tanktech") ? 1.2 : 1);
  // D-024: the steel rate is exposed even when it is 0 — steel income
  // being invisible (and unexplained) until the factory existed was
  // audit-2 I1. UI reads this to show "۰ فولاد/ث — مجتمع فولاد بسازید".
  const steelRate = output("steel");
  return { powerProduced, powerUsed, waterProduced, waterUsed, grid, stability, multi, productionBoost, output, oilRate, exportRate, dollarRate, oilCapacity, realExportRate, avgExportRate, bankCapacity, steelRate };
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
  const cycle = spec.salvoSize ? salvoCycleSeconds(spec) : 0;
  const base = spec.mode === "beam" ? spec.damage
    : cycle > 0 ? spec.damage * (1 + spec.critChance) * spec.salvoSize! / cycle // salvo: cycle-average rocket rate (MECH-B)
    : (spec.damage * (1 + spec.critChance)) / specInterval(spec);
  return base * damageTech(s, tower) * getStats(s).grid;
}
export function getRange(s: GameState, tower: Tower) {
  const base = tower.kind === "air" && tower.tier === 4 && tower.branch === 0 ? 65 : TOWERS[tower.kind].range;
  // Environmental visibility factors combine by taking the MOST restrictive
  // one — never by stacking, and never by one cancelling another (QA
  // round 2): scenario fog cuts effective range 30% (detection IS range
  // here) and keeps doing so while a storm event rages (min(0.7, 0.8) =
  // 0.7, not the storm's 0.8 alone); scenario night cuts optical range 20%;
  // a scenario storm coinciding with a storm event is still a single ×0.8.
  const envFactor = Math.min(
    s.event === "storm" ? 0.8 : 1,
    s.phase === "battle" ? conditionRangeFactor(s.battle?.condition) : 1,
  );
  return base * (1 + (tower.tier - 1) * 0.06) * (1 + 0.03 * (s.buildings.optical ?? 0)) * (s.research.includes("radar") ? 1.2 : 1) * (s.research.includes("sonar") && (tower.kind === "ew" || tower.kind === "boat") ? 1.1 : 1) * (s.mode === "challenge" && s.challengeRule === 0 && s.phase === "battle" ? 0.5 : 1) * envFactor;
}
/** Deployed heroes' sustained damage rate — the "hero power" the PRD puts
 *  in the offline defense numerator (replaces the old flat +30). Mirrors
 *  the hero attack table in tick: type 0 = 75/3s, type 1 = 260/15s,
 *  type 2 = 145/4s. */
export function heroPower(s: GameState) {
  const dps = (h: { active: number }) => h.active === 1 ? 260 / 15 : h.active === 2 ? 145 / 4 : 75 / 3;
  return dps(s.hero) + (s.hero2 ? dps(s.hero2) : 0);
}
export function getOfflineReward(s: GameState, now: number) {
  const seconds = Math.max(0, Math.min(BALANCE.economy.offlineHours * 3600, (now - (s.lastSavedAt || now)) / 1000));
  const defense = s.towers.reduce((sum, t) => sum + towerDps(s, t), 0) + heroPower(s);
  const ratio = Math.min(1, defense / (100 + s.wave * 25));
  // Offline income is paid on the REALIZED export rate (R11) — what the
  // port actually earned per second — never the theoretical dollarRate.
  const rate = getStats(s).avgExportRate;
  const managerBonus = s.idle.managerLevels.harbor > 0 ? BALANCE.economy.harborOfflineBonus : 1;
  return { seconds, ratio, amount: seconds > BALANCE.economy.offlineGraceSeconds ? rate * seconds * BALANCE.economy.offlineEfficiency * ratio * managerBonus : 0 };
}
function randomBattle(s: GameState): number {
  let x = s.rngState || 0x484f524d;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  s.rngState = x >>> 0;
  return s.rngState / 0x100000000;
}
function updateExportWindow(s:GameState, duration:number) {
  s.idle.exportWindowTime += duration;
  const horizon = 6 * 3600;
  if (s.idle.exportWindowTime > horizon) {
    s.idle.exportWindowDollars *= horizon / s.idle.exportWindowTime;
    s.idle.exportWindowTime = horizon;
  }
}
function advanceOfflineTimers(s: GameState, seconds: number) {
  s.idle.boostRemaining = Math.max(0, s.idle.boostRemaining - seconds);
  if(s.idle.contract)s.idle.contract.elapsed=Math.min(CONTRACTS[s.idle.contract.id].duration,s.idle.contract.elapsed+seconds);
  if(s.idle.boostCharges<3){const total=s.idle.boostRecharge+seconds;s.idle.boostCharges=Math.min(3,s.idle.boostCharges+Math.floor(total/300));s.idle.boostRecharge=s.idle.boostCharges>=3?0:total%300;}
}
export function hydrateGame(raw: unknown, now = Date.now()): { game: GameState; offline: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const saved = raw as GameState;
  if (saved.version !== 1 || !saved.buildings || !Array.isArray(saved.towers) || !saved.cards) return null;
  const base = initialGame();

  // Tamper hardening: a corrupted or hand-edited save must never crash the game.
  // Every nested structure is type-checked field by field below; anything
  // invalid is dropped or replaced with the safe default from a fresh game.
  const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const num = (v: unknown, fb: number) => typeof v === "number" && Number.isFinite(v) ? v : fb;
  const optNum = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const clampNum = (v: unknown, fb: number, min: number, max: number) => Math.max(min, Math.min(max, num(v, fb)));
  const intIn = (v: unknown, fb: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(num(v, fb))));
  const strArr = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const REWARD_TYPES: readonly Reward["type"][] = ["mission", "milestone", "daily", "chest", "contract"];
  const sanitizeReward = (v: unknown): Reward | null => {
    if (!isRec(v) || typeof v.id !== "string" || !REWARD_TYPES.includes(v.type as Reward["type"])) return null;
    const reward: Reward = {
      id: v.id, type: v.type as Reward["type"],
      title: typeof v.title === "string" ? v.title : "",
      subtitle: typeof v.subtitle === "string" ? v.subtitle : "",
      cash: num(v.cash, 0), xp: num(v.xp, 0),
    };
    for (const key of ["steel", "ammo", "chests", "boosts"] as const) {
      const n = optNum(v[key]);
      if (n !== undefined) reward[key] = n;
    }
    if (isRec(v.cards)) {
      const cards: Partial<Record<TowerKind, number>> = {};
      for (const kind of TOWER_KINDS) {
        const n = optNum(v.cards[kind]);
        if (n !== undefined) cards[kind] = n;
      }
      if (Object.keys(cards).length) reward.cards = cards;
    }
    return reward;
  };
  const sanitizeBattle = (v: unknown): IdleState["lastBattle"] => {
    if (!isRec(v)) return null;
    return {
      id: typeof v.id === "string" ? v.id : "battle",
      wave: intIn(v.wave, 1, 1, 100000),
      title: typeof v.title === "string" ? v.title : "",
      ...(isRec(v.openingReceipt) && Number.isSafeInteger(v.openingReceipt.attempt) && num(v.openingReceipt.attempt, 0) > 0 ? { openingReceipt: {attempt:num(v.openingReceipt.attempt,0), firstClear:v.openingReceipt.firstClear === true, damage:intIn(v.openingReceipt.damage,0,0,2)} } : {}),
      victory: v.victory === true, stars: intIn(v.stars, 0, 0, 3),
      cash: num(v.cash, 0), xp: num(v.xp, 0), chests: intIn(v.chests, 0, 0, 999),
      destroyed: intIn(v.destroyed, 0, 0, 1000000000), seconds: Math.max(0, num(v.seconds, 0)),
      hearts: intIn(v.hearts, 0, 0, 20), claimed: v.claimed === true,
      reason: (DEFEAT_REASONS as readonly string[]).includes(v.reason as string) ? (v.reason as DefeatReason) : undefined,
    };
  };
  const sanitizeContract = (v: unknown): IdleState["contract"] => {
    // Own-property whitelist only. The `in` operator also matches inherited
    // keys ("__proto__", "constructor", "toString", ...), which are not real
    // contracts: their duration is undefined, clampNum then produced NaN
    // elapsed, and claiming the phantom contract turned cash/xp into NaN —
    // a single tampered save wiped the whole economy. With a real own key
    // the duration is always a finite number, so elapsed can never be NaN.
    if (!isRec(v) || typeof v.id !== "string" || !Object.prototype.hasOwnProperty.call(CONTRACTS, v.id)) return null;
    const id = v.id as ContractId;
    return { id, elapsed: clampNum(v.elapsed, 0, 0, CONTRACTS[id].duration) };
  };
  const PORT_STAGES: readonly string[] = ["approach", "loading", "depart"];
  const sanitizePort = (v: unknown): IdleState["port"] => {
    if (!isRec(v)) return base.idle.port;
    const tanker = isRec(v.tanker) && PORT_STAGES.includes(v.tanker.stage as string)
      ? {
          stage: v.tanker.stage as "approach" | "loading" | "depart",
          progress: clampNum(v.tanker.progress, 0, 0, 1),
          load: Math.max(0, num(v.tanker.load, 0)),
        }
      : null;
    return { tanker, nextIn: Math.max(0, num(v.nextIn, 0)), cycles: intIn(v.cycles, 0, 0, Number.MAX_SAFE_INTEGER), exportedDollars: Math.max(0, num(v.exportedDollars, 0)) };
  };
  const sanitizeIdle = (v: unknown): IdleState => {
    if (!isRec(v)) return base.idle;
    const levels = isRec(v.managerLevels) ? v.managerLevels : {};
    const managerLevels = {} as Record<ManagerId, number>;
    for (const id of ["harbor", "energy", "supply"] as ManagerId[]) managerLevels[id] = intIn(levels[id], 0, 0, 5);
    const stars: Record<string, number> = {};
    if (isRec(v.stars)) for (const [key, val] of Object.entries(v.stars)) {
      if (key === "__proto__") continue; // never let a save key reach a prototype slot
      const n = optNum(val);
      if (n !== undefined) stars[key] = intIn(n, 0, 0, 3);
    }
    const offline = isRec(v.offline) && optNum(v.offline.cash) !== undefined
      ? { cash: Math.max(0, num(v.offline.cash, 0)), seconds: Math.max(0, num(v.offline.seconds, 0)), defense: clampNum(v.offline.defense, 0, 0, 1) }
      : null;
    return {
      revision: intIn(v.revision, 0, 0, Number.MAX_SAFE_INTEGER),
      bank: Math.max(0, num(v.bank, 0)),
      collected: Math.max(0, num(v.collected, 0)),
      collections: intIn(v.collections, 0, 0, Number.MAX_SAFE_INTEGER),
      collectionStreak: intIn(v.collectionStreak, 0, 0, 5),
      lastCollectionAt: num(v.lastCollectionAt, base.idle.lastCollectionAt),
      lifetimeIncome: Math.max(0, num(v.lifetimeIncome, 0)),
      xp: Math.max(0, num(v.xp, 0)),
      upgradeCount: intIn(v.upgradeCount, 0, 0, Number.MAX_SAFE_INTEGER),
      claimedMissions: strArr(v.claimedMissions),
      claimedMilestones: strArr(v.claimedMilestones),
      managerLevels,
      managerClock: Math.max(0, num(v.managerClock, 0)),
      boostCharges: intIn(v.boostCharges, base.idle.boostCharges, 0, 9),
      boostRemaining: Math.max(0, num(v.boostRemaining, 0)),
      boostRecharge: Math.max(0, num(v.boostRecharge, 0)),
      autoBattle: v.autoBattle === true,
      stars,
      modeBest: { campaign: intIn(isRec(v.modeBest) ? v.modeBest.campaign : saved.highestWave, 0, 0, 25), endless: intIn(isRec(v.modeBest) ? v.modeBest.endless : 0, 0, 0, 1000), challenge: intIn(isRec(v.modeBest) ? v.modeBest.challenge : 0, 0, 0, 1000) },
      lastBattle: sanitizeBattle(v.lastBattle),
      waveStartedAt: num(v.waveStartedAt, 0),
      waveStartKills: intIn(v.waveStartKills, 0, 0, Number.MAX_SAFE_INTEGER),
      rewards: Array.isArray(v.rewards) ? v.rewards.map(sanitizeReward).filter((r): r is Reward => r !== null).slice(0, 200) : [],
      lootSeed: intIn(v.lootSeed, base.idle.lootSeed, 0, Number.MAX_SAFE_INTEGER),
      openedChests: intIn(v.openedChests, 0, 0, Number.MAX_SAFE_INTEGER),
      completedContracts: intIn(v.completedContracts, 0, 0, Number.MAX_SAFE_INTEGER),
      contract: sanitizeContract(v.contract),
      offline,
      appliedDailyIds: strArr(v.appliedDailyIds).slice(-64),
      port: sanitizePort(v.port),
      platforms: Array.isArray(v.platforms)
        ? [...new Set(v.platforms.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x < PLATFORM_SLOTS.length))]
        : [],
      challengeRuns: intIn(v.challengeRuns, 0, 0, Number.MAX_SAFE_INTEGER),
      exportWindowDollars: Math.max(0, num(v.exportWindowDollars, 0)),
      exportWindowTime: Math.max(0, num(v.exportWindowTime, 0)),
    };
  };
  const sanitizeCards = (v: unknown): GameState["cards"] => {
    const out: GameState["cards"] = {
      cannon: { ...base.cards.cannon }, heavy: { ...base.cards.heavy }, missile: { ...base.cards.missile },
      air: { ...base.cards.air }, ew: { ...base.cards.ew }, boat: { ...base.cards.boat },
    };
    if (isRec(v)) for (const kind of TOWER_KINDS) {
      const c = v[kind];
      if (isRec(c)) out[kind] = { count: intIn(c.count, 0, 0, Number.MAX_SAFE_INTEGER), level: intIn(c.level, 1, 1, 100000) };
    }
    return out;
  };
  const ENEMY_KINDS: readonly Enemy["kind"][] = ["speed", "corvette", "air", "sub", "destroyer", "boss"];
  const sanitizeEnemy = (v: unknown): Enemy | null => {
    if (!isRec(v) || !ENEMY_KINDS.includes(v.kind as Enemy["kind"])) return null;
    const enemy: Enemy = {
      id: num(v.id, 0), kind: v.kind as Enemy["kind"], boss: intIn(v.boss, 0, 0, 5),
      hp: num(v.hp, 1), maxHp: Math.max(1, num(v.maxHp, 1)),
      progress: clampNum(v.progress, 0, 0, 1),
      stun: Math.max(0, num(v.stun, 0)), specialClock: Math.max(0, num(v.specialClock, 0)),
    };
    for (const key of ["burn", "burnDamage", "intercept", "armorBreak", "hitFlash", "weaponDownUntil", "radarDownUntil", "empSlow", "hackTimer", "fireClock", "addsSpawned"] as const) {
      const n = optNum(v[key]);
      if (n !== undefined) enemy[key] = n;
    }
    for (const key of ["rev", "noReward", "isAdd", "shieldUp", "openingMarked"] as const) if (typeof v[key] === "boolean") enemy[key] = v[key];
    return enemy;
  };
  // Wave-2 follow-up (QA-SHIPS advisory): the VIP-escort flag (pirates)
  // and the D-022 ease-in age (all traffic) are part of the live objects
  // and must survive a save reload. Dropping vipEscort resurrected
  // escorts as ordinary traffic pirates — the R6 coast-guard erosion
  // exemption was lost mid-event — and dropping age reset every
  // crossing's ease-in ramp. Strict validation, like every neighbouring
  // field: the flag survives only as the literal `true`, the age only
  // as a finite number (clamped ≥ 0, the house style for ages); garbage
  // is dropped to "absent", never trusted raw.
  const sanitizePirate = (v: unknown): Pirate | null => {
    if (!isRec(v)) return null;
    const pirate: Pirate = { id: num(v.id, 0), progress: clampNum(v.progress, 0, 0, 1), hp: num(v.hp, 1) };
    if (v.vipEscort === true) pirate.vipEscort = true;
    const age = optNum(v.age);
    if (age !== undefined) pirate.age = Math.max(0, age);
    return pirate;
  };
  const sanitizeContraband = (v: unknown): Contraband | null => {
    if (!isRec(v)) return null;
    const ship: Contraband = { id: num(v.id, 0), progress: clampNum(v.progress, 0, 0, 1) };
    const age = optNum(v.age);
    if (age !== undefined) ship.age = Math.max(0, age);
    return ship;
  };
  const MERCHANT_KINDS: readonly Merchant["kind"][] = ["barge", "bulk", "container", "tanker"];
  const sanitizeMerchant = (v: unknown): Merchant | null => {
    if (!isRec(v) || !MERCHANT_KINDS.includes(v.kind as Merchant["kind"])) return null;
    const ship: Merchant = { ...(typeof v.inbound === "boolean" ? {inbound:v.inbound} : {}), id: num(v.id, 0), progress: clampNum(v.progress, 0, 0, 1), kind: v.kind as Merchant["kind"], reward: Math.max(0, num(v.reward, 0)), paid: v.paid === true };
    const age = optNum(v.age);
    if (age !== undefined) ship.age = Math.max(0, age);
    return ship;
  };

  // Buildings are rebuilt from the known ids only: spreading the saved
  // record would carry arbitrary keys (including "__proto__") into the
  // state, the same prototype-chain hole the contract check had.
  const game: GameState = { ...base, ...saved, buildings: { ...base.buildings }, cards: sanitizeCards(saved.cards), cooldowns: { ...base.cooldowns, ...saved.cooldowns }, idle: sanitizeIdle(saved.idle), shots: [], popups: [], pendingImpacts: [], boats: [], mines: [], enemyMissiles: [], events: [] };
  game.opening=restoreOpeningIndustry(saved.opening);
  game.openingOperations = game.opening && saved.openingOperations ? restoreOpeningOperations(saved.openingOperations) : undefined;
  game.rngState = intIn(saved.rngState, base.rngState, 1, 0xffffffff);
  game.cash = Math.max(0, num(game.cash, base.cash)); game.oil = num(game.oil, base.oil); game.fuel = num(game.fuel, base.fuel); game.steel = num(game.steel, base.steel); game.ammo = num(game.ammo, base.ammo);
  game.hearts = Math.max(0, Math.min(20, num(game.hearts, 20))); game.wave = Math.max(1, Math.floor(num(game.wave, 1))); game.highestWave = Math.max(0, Math.floor(num(game.highestWave, 0)));
  game.security = Math.max(0, Math.min(100, num(game.security, 70))); game.prestige = Math.max(0, Math.floor(num(game.prestige, 0))); game.oilSplit = Math.max(0, Math.min(100, num(game.oilSplit, 40)));
  (Object.keys(game.buildings) as BuildingId[]).forEach(k => { game.buildings[k] = intIn(saved.buildings[k], base.buildings[k], 0, 100); });
  game.towers = (Array.isArray(game.towers) ? game.towers : []).filter(t => t && typeof t === "object" && (TOWER_KINDS as string[]).includes(t.kind) && Number.isInteger(t.slot) && t.slot >= 0 && t.slot < SLOTS.length).map(t => {
    const tier = Math.max(1, Math.min(4, Math.floor(num(t.tier, 1))));
    // CIWS recharge timers survive a mid-battle save (MECH-B QA round 2);
    // anything malformed degrades to "slot ready". The legacy shared-window
    // fields (interceptLeft/interceptWindow) are dropped — nothing reads them.
    const rawCharges = (t as Tower).interceptCharges;
    const charges = Array.isArray(rawCharges) ? rawCharges.filter(c => typeof c === "number" && Number.isFinite(c) && c >= 0).map(c => Math.min(CIWS_INTERCEPT_WINDOW, c)).slice(0, CIWS_INTERCEPT_BUDGET) : [];
    return {
      ...t, tier,
      branch: tier === 4 && (t.branch === 0 || t.branch === 1) ? t.branch : null,
      priority: (["first", "strongest", "weakest", "air"] as string[]).includes(t.priority) ? t.priority : "first" as Priority,
      cooldown: Math.max(0, num((t as Tower).cooldown, 0)),
      abilityClock: clampNum(t.abilityClock, 0, 0, 60), salvoLeft: optNum(t.salvoLeft) === undefined ? undefined : intIn(t.salvoLeft, 0, 0, 12),
      focusId: optNum(t.focusId), focusTime: optNum(t.focusTime), lastPopup: optNum(t.lastPopup),
      interceptLeft: undefined, interceptWindow: undefined, interceptCharges: charges.length ? charges : undefined,
    };
  });
  game.towers = game.towers.filter((t, i, all) => all.findIndex(other => other.slot === t.slot) === i);
  for (const key of ["oil", "fuel", "steel", "ammo"] as const) game[key] = Math.max(0, game[key]);
  game.wave = Math.min(1000, game.wave); game.highestWave = Math.min(25, game.highestWave);
  game.battleTime = Math.max(0, num(game.battleTime, 0));
  // ECO state hardening: VIP ship, event counter, pirate counter and the
  // port's realized-export ledger survive only when well-formed.
  game.vipShip = game.vipShip && typeof game.vipShip === "object" && Number.isFinite(game.vipShip.hp) && Number.isFinite(game.vipShip.progress)
    ? { progress: Math.max(0, Math.min(1, game.vipShip.progress)), hp: Math.max(0, game.vipShip.hp), maxHp: Math.max(1, num(game.vipShip.maxHp, 300)), age: Math.max(0, num(game.vipShip.age, 0)) } : null;
  // ECO round 2: the (event, vipShip) pair must agree. A save carrying
  // event:"vip" with no valid ship deadlocks the whole event cycle —
  // the VIP event ends only when its ship resolves, and no new event
  // starts while one is set — so the orphaned event is cleared and the
  // cycle freed. A live ship without its event flag re-opens the event.
  if (game.event !== "spill" && game.event !== "storm" && game.event !== "vip") game.event = null;
  if (game.event === "vip" && !game.vipShip) { game.event = null; game.eventClock = 0; }
  else if (game.event !== "vip" && game.vipShip) { game.event = "vip"; game.eventClock = 0; }
  game.eventCount = Math.max(0, Math.floor(num(game.eventCount, 0)));
  game.piratesDestroyed = Math.max(0, Math.floor(num(game.piratesDestroyed, 0)));
  game.idle.exportWindowDollars = Math.max(0, num(game.idle.exportWindowDollars, 0));
  game.idle.exportWindowTime = Math.max(0, num(game.idle.exportWindowTime, 0));
  if (game.idle.port) game.idle.port = { ...base.idle.port, ...game.idle.port, exportedDollars: Math.max(0, num(game.idle.port.exportedDollars, 0)) };
  (Object.keys(game.buildings) as BuildingId[]).forEach(k => { game.buildings[k] = Math.max(0, Math.floor(num(game.buildings[k], base.buildings[k]))); });
  game.islands = (Array.isArray(game.islands) ? game.islands : base.islands).filter(id => ISLANDS.some(i => i.id === id));
  if (!game.islands.includes("main")) game.islands.push("main");
  game.research = (Array.isArray(game.research) ? game.research : []).filter(r => typeof r === "string");
  // Enums and battle arrays: a tampered phase or a non-array entity list must
  // degrade to a safe value instead of poisoning the reducer.
  const PHASES: readonly Phase[] = ["peace", "battle", "intermission", "defeat", "victory"];
  game.phase = PHASES.includes(saved.phase) ? saved.phase : "peace";
  const MODES: readonly Mode[] = ["campaign", "endless", "challenge"];
  game.mode = MODES.includes(saved.mode) ? saved.mode : base.mode;
  game.speed = saved.speed === 2 || saved.speed === 3 ? saved.speed : 1;
  game.layout = saved.layout === "portrait" ? "portrait" : "landscape";
  // game.event was already validated + VIP-pair-repaired above (ECO round 2); the raw saved enum must not overwrite the repair.
  // Length caps: a tampered save must not be able to inflate entity lists
  // without bound (memory / tick cost). Real battles stay far below these.
  game.enemies = (Array.isArray(saved.enemies) ? saved.enemies.map(sanitizeEnemy).filter((e): e is Enemy => e !== null) : []).slice(0, 500);
  game.pirates = (Array.isArray(saved.pirates) ? saved.pirates.map(sanitizePirate).filter((p): p is Pirate => p !== null) : []).slice(0, 500);
  game.contraband = (Array.isArray(saved.contraband) ? saved.contraband.map(sanitizeContraband).filter((c): c is Contraband => c !== null) : []).slice(0, 500);
  game.merchants = (Array.isArray(saved.merchants) ? saved.merchants.map(sanitizeMerchant).filter((m): m is Merchant => m !== null) : []).slice(0, 500);
  game.spawnRemaining = intIn(saved.spawnRemaining, 0, 0, Number.MAX_SAFE_INTEGER);
  game.spawnClock = Math.max(0, num(saved.spawnClock, 0));
  game.spawnIndex = intIn(saved.spawnIndex, 0, 0, Number.MAX_SAFE_INTEGER);
  game.nextId = intIn(saved.nextId, base.nextId, 1, Number.MAX_SAFE_INTEGER);
  game.countdown = Math.max(0, num(saved.countdown, base.countdown));
  game.trafficClock = Math.max(0, num(saved.trafficClock, 0));
  game.trafficCount = intIn(saved.trafficCount, 0, 0, Number.MAX_SAFE_INTEGER);
  game.destroyed = intIn(saved.destroyed, 0, 0, Number.MAX_SAFE_INTEGER);
  game.elapsed = Math.max(0, num(saved.elapsed, 0));
  game.overdrive = Math.max(0, num(saved.overdrive, 0));
  game.eventClock = Math.max(0, num(saved.eventClock, 0));
  game.chests = intIn(saved.chests, 0, 0, Number.MAX_SAFE_INTEGER);
  game.earlyBonus = saved.earlyBonus === true;
  game.manualNight = saved.manualNight === true;
  game.lastSavedAt = num(saved.lastSavedAt, Date.now());
  game.cooldowns = {
    strike: Math.max(0, num(saved.cooldowns?.strike, 0)),
    emp: Math.max(0, num(saved.cooldowns?.emp, 0)),
    overdrive: Math.max(0, num(saved.cooldowns?.overdrive, 0)),
  };
  const stuns: Record<number, number> = {};
  if (isRec(saved.towerStuns)) for (const [key, val] of Object.entries(saved.towerStuns)) {
    const n = optNum(val), slot = Number(key);
    if (n !== undefined && Number.isInteger(slot) && slot >= 0) stuns[slot] = Math.max(0, n);
  }
  game.towerStuns = stuns;
  const restoreHero = (value: GameState["hero"]): GameState["hero"] => {
    const position = nearestWater({ x: num(value?.x, base.hero.x), y: num(value?.y, base.hero.y) }, game.layout);
    let route = Array.isArray(value?.route) ? value.route.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, 2048) : undefined;
    let routeIndex = route ? intIn(value.routeIndex, 1, 0, route.length) : undefined;
    // Older saves can contain waypoints generated against the former 2D coast.
    if (route && routeIndex !== undefined && routeIndex < route.length) {
      const remaining = [position, ...route.slice(routeIndex)];
      if (remaining.some((p,i) => i > 0 && !safeSegment(remaining[i-1], p, game.layout))) {
        route = findWaterRoute(position, remaining[remaining.length-1], game.layout);
        routeIndex = 1;
      }
    }
    return { ...position, active: intIn(value?.active, 0, 0, 2), attackClock: clampNum(value?.attackClock, 0, 0, 60), slow: clampNum(value?.slow, 0, 0, 60), route, routeIndex };
  };
  game.hero = restoreHero(saved.hero);
  game.hero2 = saved.hero2 && typeof saved.hero2 === "object" ? restoreHero(saved.hero2) : null;
  // Telemetry counters: keep only well-formed non-negative entries; a save
  // predating fireStats (or a tampered one) falls back to an empty map.
  game.fireStats = {};
  if (saved.fireStats && typeof saved.fireStats === "object") for (const k of Object.keys(saved.fireStats)) {
    const v = saved.fireStats[k] as Partial<FireStat> | null;
    if (v && typeof v === "object") game.fireStats[k] = { shots: Math.max(0, Math.floor(num(v.shots, 0))), hits: Math.max(0, Math.floor(num(v.hits, 0))), fizzled: Math.max(0, Math.floor(num(v.fizzled, 0))) };
  }
  // MECH-A entities (QA round-2 متوسط-۵): boats and mines are live battle
  // state the player paid for (a full field = 40 ammo) — a mid-battle
  // save/load must restore them, not silently wipe the minefield and
  // resurrect the boats at full HP (a free heal). Same validation pattern
  // as the rest of this sanitizer: entries with a bad identity are
  // dropped, numeric fields fall back to safe values, nothing crashes.
  game.boats = (Array.isArray(saved.boats) ? saved.boats : []).filter(b => b && typeof b === "object" && (b.role === "garrison" || b.role === "torpedo" || b.role === "ghadir") && Number.isInteger(b.slot) && b.slot >= 0 && b.slot < SLOTS.length && Number.isInteger(b.index) && b.index >= 0).map(b => {
    const maxHp = Math.max(1, num(b.maxHp, boatMaxHp(b.role, 1)));
    return { id: Number.isInteger(b.id) ? b.id : 0, slot: b.slot, role: b.role, index: b.index, hp: Math.max(0, Math.min(maxHp, num(b.hp, maxHp))), maxHp, progress: Math.max(0, Math.min(1, num(b.progress, 0))), offset: num(b.offset, 0), state: b.state === "respawn" ? "respawn" as const : "active" as const, respawnClock: Math.max(0, num(b.respawnClock, 0)), cooldown: Math.max(0, num(b.cooldown, 0)) };
  });
  game.mines = (Array.isArray(saved.mines) ? saved.mines : []).filter(m => m && typeof m === "object" && Number.isInteger(m.slot) && m.slot >= 0 && m.slot < SLOTS.length && Number.isFinite(m.x) && Number.isFinite(m.y)).map(m => ({ id: Number.isInteger(m.id) ? m.id : 0, slot: m.slot, x: m.x, y: m.y }));
  // Restored entity ids must never collide with ids minted after the load.
  for (const b of game.boats) game.nextId = Math.max(game.nextId, b.id + 1);
  for (const m of game.mines) game.nextId = Math.max(game.nextId, m.id + 1);
  // Scenario battle context (SCEN): keep a well-formed one, drop a corrupt
  // one. A save caught mid-battle WITHOUT a valid context cannot resume
  // its mechanics — it falls back to peace and the wave restarts cleanly
  // instead of crashing or running mechanics-free.
  const rawBattle = (saved as GameState).battle;
  if (rawBattle && typeof rawBattle === "object" && Array.isArray(rawBattle.queue)) {
    // Objective ships re-clamp on load (QA round 2): a tampered save must
    // not resurrect a ship above its max HP (or below zero).
    const ship = (v: unknown): ObjectiveShip | null => {
      if (!v || typeof v !== "object") return null;
      const maxHp = Math.max(0, num((v as ObjectiveShip).maxHp, 0));
      return { progress: Math.max(0, Math.min(1, num((v as ObjectiveShip).progress, 0))), hp: Math.max(0, Math.min(maxHp, num((v as ObjectiveShip).hp, 0))), maxHp, slow: Math.max(0, num((v as ObjectiveShip).slow, 0)) };
    };
    const structureMaxHp = Math.max(0, num(rawBattle.structureMaxHp, 0));
    const classOk = (k: unknown) => k === "speed" || k === "corvette" || k === "air" || k === "sub" || k === "destroyer" || k === "boss";
    const objOk = (o: unknown) => o === "repel" || o === "escort" || o === "airdef" || o === "intercept" || o === "structure" || o === "siege" || o === "rescue";
    game.battle = {
      wave: Math.max(1, Math.floor(num(rawBattle.wave, game.wave))),
      condition: typeof rawBattle.condition === "string" ? rawBattle.condition : null,
      objective: objOk(rawBattle.objective) ? rawBattle.objective : "repel",
      queue: rawBattle.queue.filter(u => u && typeof u === "object" && classOk((u as SpawnUnit).kind)).map(u => ({ kind: (u as SpawnUnit).kind, rev: !!(u as SpawnUnit).rev })),
      elapsed: Math.max(0, num(rawBattle.elapsed, 0)),
      escort: ship(rawBattle.escort), stranded: ship(rawBattle.stranded),
      structureHp: Math.max(0, Math.min(structureMaxHp, num(rawBattle.structureHp, 0))), structureMaxHp,
      airTotal: Math.max(0, Math.floor(num(rawBattle.airTotal, 0))), airLeaked: Math.max(0, Math.floor(num(rawBattle.airLeaked, 0))),
      // The minefield cap (6) is re-applied on load, not just at laying
      // time — a tampered save cannot smuggle in a bigger field (QA).
      mines: Array.isArray(rawBattle.mines) ? rawBattle.mines.filter(m => m && typeof m === "object" && Number.isFinite((m as EnemyMine).progress)).map(m => ({ id: Math.floor(num((m as EnemyMine).id, 0)), progress: Math.max(0, Math.min(1, (m as EnemyMine).progress)) })).slice(0, 6) : [],
      mineClock: Math.max(0, num(rawBattle.mineClock, 4)), sweep: {}, failed: rawBattle.failed === true,
      failReason: (DEFEAT_REASONS as readonly string[]).includes(rawBattle.failReason as string) ? (rawBattle.failReason as DefeatReason) : null,
      fatalLeak: (ENEMY_KINDS as readonly string[]).includes(rawBattle.fatalLeak as string) ? (rawBattle.fatalLeak as Enemy["kind"]) : null,
    };
    if (saved.opening && operationForOpening(game) && rawBattle.openingAttempt && Number.isSafeInteger(rawBattle.openingAttempt)) {
      game.battle.openingAttempt = rawBattle.openingAttempt;
      game.battle.markedEscaped = intIn(rawBattle.markedEscaped,0,0,game.battle.queue.length);
      if (rawBattle.deliveredEscortHP !== undefined) game.battle.deliveredEscortHP = intIn(rawBattle.deliveredEscortHP,0,0,10);
      const loan = rawBattle.trainingLoan;
      if (game.wave === 1 && loan && Number.isInteger(loan.slot) && SLOTS[loan.slot] && game.islands.includes(SLOTS[loan.slot].island))
        game.battle.trainingLoan = {slot:loan.slot, kind:"cannon", tier:1, branch:null, priority:"first", cooldown:clampNum(loan.cooldown,0,0,60)};
    }
    if (isRec(rawBattle.sweep)) for (const [slot, value] of Object.entries(rawBattle.sweep)) {
      if (game.towers.some(t => String(t.slot) === slot)) game.battle.sweep[Number(slot)] = clampNum(value, 0, 0, 60);
    }
  } else game.battle = null;
  if (game.phase === "battle" && game.battle) {
    const validSlot = (v: unknown) => Number.isInteger(v) && game.towers.some(t => t.slot === v);
    const models = new Set(TOWER_KINDS.flatMap(k => [modelKindFor(k, 1, null), modelKindFor(k, 4, 0), modelKindFor(k, 4, 1)]));
    game.pendingImpacts = (Array.isArray(saved.pendingImpacts) ? saved.pendingImpacts : []).filter(p => p && isRec(p) && game.enemies.some(e => e.id === p.targetId) && (p.slot === -1 || validSlot(p.slot)) && (p.kind === "hero" || TOWER_KINDS.includes(p.kind)) && (p.modelKind === "hero" || models.has(p.modelKind))).slice(0, 2048).map(p => ({
      targetId: p.targetId, slot: p.slot, kind: p.kind, modelKind: p.modelKind,
      eta: clampNum(p.eta, 0, 0, 60), damage: clampNum(p.damage, 0, 0, 1e12), crit: p.crit === true,
      branch: p.branch === 0 || p.branch === 1 ? p.branch : null,
      heroType: p.heroType === undefined ? undefined : intIn(p.heroType, 0, 0, 2), boatId: optNum(p.boatId),
    }));
    game.enemyMissiles = (Array.isArray(saved.enemyMissiles) ? saved.enemyMissiles : []).filter(m => m && isRec(m) && validSlot(m.targetSlot) && (m.source === "boss" || m.source === "destroyer")).slice(0, 256).map(m => ({
      id: intIn(m.id, 0, 0, Number.MAX_SAFE_INTEGER), sourceId: intIn(m.sourceId, 0, 0, Number.MAX_SAFE_INTEGER), source: m.source, targetSlot: m.targetSlot,
      eta: clampNum(m.eta, 0, 0, 60), total: clampNum(m.total, 1, .001, 60), x1: num(m.x1, 0), y1: num(m.y1, 0), x2: num(m.x2, 0), y2: num(m.y2, 0),
    }));
  }
  for (const entity of [...game.enemies, ...game.pirates, ...game.merchants, ...game.contraband, ...game.enemyMissiles]) game.nextId = Math.max(game.nextId, entity.id + 1);
  if (game.phase === "battle" && !game.battle) { game.phase = "peace"; game.enemies = []; game.spawnRemaining = 0; game.pendingImpacts = []; }
  if (game.phase !== "battle") game.speed = 1;
  game.challengeRule = [0, 1, 2].includes(game.challengeRule) ? game.challengeRule : 0;
  game.combo = intIn(saved.combo, 0, 0, Number.MAX_SAFE_INTEGER);
  game.comboTimer = Math.max(0, num(saved.comboTimer, 0));
  game.maxCombo = intIn(saved.maxCombo, 0, 0, Number.MAX_SAFE_INTEGER);
  game.waveLeaked = saved.waveLeaked === true; game.slowmo = 0;
  // D-024 warning timers: old saves lack them (defaults), tampered ones
  // degrade to "no warning history" — never to a stuck-on alert.
  game.lowFuelTime = Math.max(0, num(game.lowFuelTime, 0)); game.lowGridTime = Math.max(0, num(game.lowGridTime, 0));
  game.lowFuelStart = num(game.lowFuelStart, -1);
  game.warnings = { fuel: (saved.warnings as { fuel?: unknown } | null)?.fuel === true, power: (saved.warnings as { power?: unknown } | null)?.power === true };
  const safeHero = nearestWater(game.hero, game.layout);
  game.hero = { ...game.hero, ...safeHero };
  if(game.opening) {
    const from = Math.max(game.lastSavedAt,game.opening.offlineHigh);
    settleReopeningAbsence(game,from,now,openingDependencies);
    advanceOfflineTimers(game,Math.max(0,(now-from)/1000));
    game.lastSavedAt=now;
    return {game,offline:0};
  }
  const reward = getOfflineReward(game, now);
  // Offline timers (contracts, boost recharge) advance with real absence
  // whether or not the cash reward is positive — they used to freeze
  // whenever the realized export rate made the reward 0.
  if (reward.seconds > 30) advanceOfflineTimers(game, reward.seconds);
  if (reward.amount > 0) {
    game.idle.offline = { cash: (game.idle.offline?.cash ?? 0) + reward.amount, seconds: reward.seconds, defense: reward.ratio };
  }
  game.lastSavedAt = Date.now();
  return { game, offline: reward.amount };
}
export function buildingUpgradeQuote(s: GameState, id: BuildingId, quantity: UpgradeQuantity = 1) {
  const limit = quantity === "max" ? 100 - s.buildings[id] : Math.min(quantity, 100 - s.buildings[id]);
  let levels = 0, cost = 0;
  for (let index = 0; index < limit; index++) {
    const next = (s.opening ? openingPrice : upgradeCost)(id, s.buildings[id] + index);
    if (quantity === "max" && cost + next > s.cash) break;
    cost += next; levels++;
  }
  return { levels, cost, nextLevel: s.buildings[id] + levels, affordable: levels > 0 && s.cash >= cost };
}
function collectRevenue(s: GameState, manual = false) {
  if(s.opening) {openingCollect(s,manual);return;}
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
  const capacity = getStats(s).bankCapacity;
  s.idle.bank = Math.min(capacity, s.idle.bank + cash);
  s.idle.lifetimeIncome += cash;
}
function grantReward(s: GameState, reward: Reward, reveal = true) {
  // Defense in depth: a non-finite amount must never reach the state — the
  // next autosave would serialize NaN as null and reset that resource on
  // the following load (the tail of the S-1 poisoned-contract chain).
  const fin = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : 0);
  s.cash += fin(reward.cash); s.idle.xp += fin(reward.xp);
  s.steel = Math.min(2000, s.steel + fin(reward.steel));
  s.ammo = Math.min(5000, s.ammo + fin(reward.ammo));
  s.chests += fin(reward.chests);
  s.idle.boostCharges = Math.min(9, s.idle.boostCharges + fin(reward.boosts));
  if (reward.cards) for (const kind of TOWER_KINDS) s.cards[kind].count += fin(reward.cards[kind]);
  if (reveal) s.idle.rewards.push(reward);
}

export type Action =
  | { type: "hydrate"; game: GameState }
  | { type: "tick"; dt: number; battlePaused?: boolean; openingElapsed?: number }
  | { type: "opening-help" }
  | { type: "opening-inspect-tank" }
  | { type: "layout"; layout: MapLayout }
  | { type: "split"; value: number }
  | { type: "upgrade-building"; id: BuildingId; quantity?: UpgradeQuantity; guided?: boolean; expectedLevel?:number }
  | { type: "collect-income" }
  | { type: "claim-mission"; id: string }
  | { type: "hire-manager"; id: ManagerId }
  | { type: "activate-production-boost" }
  | { type: "dismiss-reward"; id: string }
  | { type: "repair-opening-dock"; receipt: string; method: "paid" | "service"; allowCollection: boolean }
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
  | { type: "start"; early?: boolean; source?: "player" }
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

function playableInFirstWave(s: GameState, tower: Tower) {
  const spec = weaponSpec(tower.kind,tower.tier,tower.branch);
  return !spec.airOnly && (spec.ammoPerShot <= s.ammo || s.overdrive > 0);
}

function startWave(s: GameState, early: boolean) {
  if (s.phase === "battle") return;
  if (s.idle.lastBattle && !s.idle.lastBattle.claimed) return;
  if (s.phase === "defeat") { if (s.mode === "endless") s.wave = 1; s.hearts = 20; s.enemies = []; }
  if (s.phase === "victory") { s.wave = 1; s.hearts = 20; s.enemies = []; }
  s.earlyBonus = early && s.phase === "intermission";
  if (s.earlyBonus) s.ammo = Math.min(5000, s.ammo + 25);
  if (s.mode === "challenge") { s.challengeRule = (s.idle.challengeRuns ?? 0) % 3; s.idle.challengeRuns = (s.idle.challengeRuns ?? 0) + 1; }
  s.phase = "battle";
  s.hearts = 20;
  s.pendingImpacts = []; // no projectiles carry over between waves
  s.enemyMissiles = []; // enemy projectiles don't carry over either (MECH-B)
  for (const t of s.towers) { t.cooldown = 0; t.salvoLeft = undefined; } // every tower opens fire ready, MLRS with a full salvo loaded
  s.idle.waveStartedAt = s.elapsed; s.idle.waveStartKills = s.destroyed; s.idle.lastBattle = null;
  s.combo = 0; s.comboTimer = 0; s.waveLeaked = false; s.slowmo = 0;
  // The scenario drives this battle (SCEN): composition, condition
  // mechanics and the objective's win/lose state are rolled ONCE here from
  // the same scenario object the bulletin shows — text and mechanics can
  // never diverge. Total count still follows the checklist §۳ formula
  // (buildSpawnQueue builds exactly waveTotal units).
  const scenario = scenarioForWave(s.wave, s.mode, scenarioContextFor(s));
  // The run is recorded in the generator's memory NOW — at actual battle
  // start — never at generation/preview time (QA round 2: phantom runs).
  commitScenarioForWave(s.wave, s.mode);
  const queue = buildSpawnQueue(s.wave, scenario);
  const objective = objectiveTypeOf(scenario.objective);
  const structureMaxHp = objective === "structure" ? 500 + 60 * s.wave : 0;
  s.battle = {
    wave: s.wave, condition: scenario.specialCondition, objective, queue,
    elapsed: 0,
    escort: objective === "escort" ? { progress: 0, hp: 260 + 45 * s.wave, maxHp: 260 + 45 * s.wave, slow: 0 } : null,
    // The stranded ship waits at trade progress 0.7 — where the enemy lane
    // converges with the channel (measured: ~2 units apart there, ~20 at
    // 0.45). Any closer to the harbor and no enemy could ever reach it.
    stranded: objective === "rescue" ? { progress: 0.7, hp: 320 + 50 * s.wave, maxHp: 320 + 50 * s.wave, slow: 0 } : null,
    structureHp: structureMaxHp, structureMaxHp,
    airTotal: queue.filter(u => u.kind === "air").length, airLeaked: 0,
    mines: [], mineClock: 4, sweep: {}, failed: false, failReason: null, fatalLeak: null,
  };
  const opening = operationForOpening(s);
  if (opening) {
    s.battle.openingAttempt = s.nextId++;
    s.battle.markedEscaped = 0;
    if (opening.op === 1 && !s.towers.some(t => playableInFirstWave(s,t))) {
      // Use the familiar construction shortcut's first available pad. The loan never enters the owned inventory.
      const pads = Array.from(new Set([4,3,5,6,7,...SLOTS.map(slot => slot.id)]))
        .filter(id => s.islands.includes(SLOTS[id].island));
      // If every unlocked pad is occupied by an unusable weapon, temporarily mount the loan there.
      const slot = pads.find(id => !s.towers.some(t => t.slot === id)) ?? pads[0];
      if (slot !== undefined) s.battle.trainingLoan = {slot,kind:"cannon",tier:1,branch:null,priority:"first"};
    }
  }
  s.spawnRemaining = queue.length;
  s.spawnIndex = 0; s.spawnClock = 0; s.countdown = 15;
}
/** Objective lost (escort sunk, structure destroyed, intercept line
 *  crossed, air-defense threshold breached): the battle ends as a defeat
 *  even with hearts to spare — checklist ۴٫۰. Mirrors the hearts defeat. */
function objectiveDefeat(s: GameState) {
  if (s.battle) s.battle.mines = [];
  // D-024: the report carries the reason the objective was lost — the
  // path that set `failed` stamped failReason; the objective type is the
  // fallback for any path that didn't.
  const reason: DefeatReason = s.battle?.failReason
    ?? (s.battle?.objective === "airdef" ? "air-leak"
      : s.battle?.objective === "escort" ? "escort-lost"
      : s.battle?.objective === "rescue" ? "rescue-lost"
      : s.battle?.objective === "structure" ? "structure-lost"
      : s.battle?.objective === "intercept" ? "intercept-crossed"
      : "objective-failed");
  s.idle.lastBattle = { id: `battle-${s.nextId++}`, wave: s.wave, title: operationInfo(s.wave, s.mode).title, victory: false, stars: 0, cash: 0, xp: 0, chests: 0, destroyed: s.destroyed - s.idle.waveStartKills, seconds: s.elapsed - s.idle.waveStartedAt, hearts: s.hearts, claimed: false, reason };
  settleOpeningBattle(s,s.idle.lastBattle);
  s.idle.revision++; s.phase = "defeat"; s.enemies = []; s.spawnRemaining = 0; s.pendingImpacts = [];
}
function makeEnemy(s: GameState, kind: Enemy["kind"], progress = 0, rev = false): Enemy {
  const boss = kind === "boss" ? Math.min(5, Math.ceil(s.wave / 5)) : 0;
  const base = kind === "speed" ? 95 : kind === "corvette" ? 240 : kind === "air" ? 80 : kind === "sub" ? 190 : kind === "destroyer" ? 430 : 1200 + boss * 600;
  let maxHp = base * Math.pow(1.22, s.wave);
  if (s.mode === "challenge" && s.challengeRule === 1) { maxHp = Math.round(maxHp * 1.35); }
  return { id: s.nextId++, kind, boss, hp: maxHp, maxHp, progress, stun: 0, specialClock: 0, ...(rev ? { rev: true } : {}) };
}
function enemyTarget(e: Enemy) { return e.kind === "air" ? "air" : e.kind === "sub" || (e.kind === "boss" && e.boss === 2 && e.progress < 0.5) ? "sub" : "sea"; }
/** Submarine detection (checklist ۱٫۵/۲). MECH-A fixes, per audit team 3b:
 *  a STUNNED detector reveals nothing (boss 2's stun used to fail at its
 *  main purpose), and a healthy sonar-hub tower (EW tier 4, branch 1)
 *  reveals submarines across the WHOLE map, not just inside its range. */
function canSeeSub(s: GameState, pos: { x: number; y: number }) {
  const detectorUp = (t: Tower) => (s.towerStuns?.[t.slot] ?? 0) <= 0;
  if (s.towers.some(t => t.kind === "ew" && t.tier === 4 && t.branch === 1 && detectorUp(t))) return true;
  return s.towers.some(t => (t.kind === "ew" || t.kind === "boat") && detectorUp(t) && distance(getSlots(s.layout)[t.slot], pos) <= getRange(s, t));
}

/* ================= MECH-A: EW branches & boat-family mechanics =================
 * EMP branch: periodic area pulse instead of shots. Sonar branch: drone
 * hack + map-wide sub detection (in canSeeSub above). Boat family: real
 * boat entities that block/pin and fire for themselves; mine branch: an
 * automatic minefield plus the Ghadir hunter sub. Numbers marked "spec"
 * come from weapons-spec.ts (R1); the rest are checklist ۱٫۵/۱٫۶ values. */
export const EMP_SLOW_FACTOR = 0.4;        // pulse slow: −60% movement
export const EMP_EFFECT_SECONDS = 4;       // slow + weapon/radar shutdown per pulse
export const SONAR_HACK_INTERVAL = 12;     // seconds between hack attempts (checklist §۱٫۵; manager ruling at MECH-A QA — the fix-program brief's 8s lost to the checklist)
export const SONAR_HACK_DURATION = 10;     // seconds a hacked drone serves the player
export const HACK_DPS = 25;                // hacked drone's fire vs its former fleet
export const HACK_DETONATE_DAMAGE = 150;   // checklist ۱٫۵: kamikaze dive damage
export const HACK_DETONATE_DIST = 2;       // dive triggers at this range (% units)
export const HACK_BLAST_RADIUS = 3.5;
export const HACK_ENGAGE_RADIUS = 12;
export const HACK_APPROACH_SPEED = 6;      // % units/s a hacked drone closes on its target (جزئی-۷)
export const BOAT_RESPAWN_SECONDS = 6;     // redeployment delay after a boat is sunk
export const ANTI_BOAT_WAVE_GROWTH = 1.05; // return fire vs boats grows ×1.05^(wave−1) (QA round-2 متوسط-۴)
export const ANTI_BOAT_ROTATE_SECONDS = 4; // a blocked enemy rotates its return fire between the boats holding it
export const GHADIR_COUNTERFIRE_FACTOR = 0.5; // return fire on the Ghadir (a submarine) lands at half the anti-boat rate
export const BLOCK_BAND = 0.03;            // lane-progress band a blocking boat holds
export const TORPEDO_PIN_RADIUS = 8;       // engagement range of the 100% heavy-ship pin
export const BOAT_FIRE_RANGE_PADDING = 6;  // boats engage out to tower range + this
export const MINE_FIELD_CAP = 10;          // checklist ۱٫۶: max mines per mine tower
export const MINE_TRIGGER_RADIUS = 2.2;
export const MINE_BLAST_RADIUS = 3.5;
export const MINE_SPACING = 2.6;           // min world distance between one tower's mines

const stationCache = new Map<string, number>();
/** Lane progress of the point on the enemy lane closest to a position —
 *  where a tower's boats take station (on the lane, in front of the tower). */
export function laneStationProgress(pos: { x: number; y: number }, layout: MapLayout = "landscape"): number {
  const key = `${layout}:${pos.x.toFixed(2)}:${pos.y.toFixed(2)}`;
  const hit = stationCache.get(key);
  if (hit !== undefined) return hit;
  const path = getLane(layout, "enemy");
  let best = 0, bd = Infinity;
  for (let p = 0; p <= 1.0001; p += 0.002) {
    const d = distance(pos, sampleLane(path, Math.min(1, p)));
    if (d < bd) { bd = d; best = Math.min(1, p); }
  }
  stationCache.set(key, best);
  return best;
}
/** World (%-unit) position of a boat: its lane station plus a perpendicular
 *  offset, so a tower's boats spread across the channel instead of stacking
 *  on one point (and never intersect the enemy spawn line visually). */
export function boatPosition(boat: { progress: number; offset: number }, layout: MapLayout = "landscape"): { x: number; y: number } {
  const path = getLane(layout, "enemy");
  const base = sampleLane(path, boat.progress);
  const ahead = sampleLane(path, Math.min(1, boat.progress + 0.01));
  let nx = -(ahead.y - base.y), ny = ahead.x - base.x;
  const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
  const station = { x: base.x + nx * boat.offset, y: base.y + ny * boat.offset };
  return isWater(station, layout) ? station : base;
}
export type BoatRole = BoatUnit["role"];
export function boatRoleFor(tower: Tower): { role: BoatRole; count: number } {
  if (tower.tier >= 4 && tower.branch === 0) return { role: "torpedo", count: 5 };  // spec units (R1)
  if (tower.tier >= 4 && tower.branch === 1) return { role: "ghadir", count: 1 };
  return { role: "garrison", count: 3 };                                            // spec units from tier 1 (R1)
}
export function boatMaxHp(role: BoatRole, tier: number): number {
  return role === "torpedo" ? 240 : role === "ghadir" ? 600 : 140 + (tier - 1) * 90;
}
function boatOffset(role: BoatRole, index: number): number {
  if (role === "torpedo") return (index - 2) * 1.6;
  if (role === "garrison") return (index - 1) * 1.7;
  return 0;
}
/** Damage per second a blocked/pinned enemy deals to the boat holding it.
 *  Grows ×1.05 per wave (QA round-2 متوسط-۴): enemy HP scales ×1.22^wave,
 *  so flat return fire made boat lines relatively stronger every wave. */
function antiBoatDps(enemy: Enemy, wave: number): number {
  const base = enemy.kind === "boss" ? 26 : enemy.kind === "destroyer" ? 22 : enemy.kind === "corvette" ? 12 : enemy.kind === "speed" ? 6 : 8;
  return base * Math.pow(ANTI_BOAT_WAVE_GROWTH, Math.max(0, wave - 1));
}
function isHeavyShip(enemy: Enemy): boolean {
  return enemy.kind === "corvette" || enemy.kind === "destroyer" || (enemy.kind === "boss" && enemyTarget(enemy) === "sea");
}
function bounty(s: GameState, enemy: Enemy) {
  const base = enemy.kind === "boss" ? 700 : enemy.kind === "destroyer" ? 120 : enemy.kind === "corvette" ? 65 : 35;
  // R10: the early-call +25% lives ONLY on the wave-end reward; per-kill
  // bounties never carry it (the old code applied it twice).
  return Math.round(base * Math.pow(1.1, s.wave));
}

export interface DamageSource {
  kind: TowerKind | "hero" | "burn" | "aura" | "spell";
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
function towerCandidates(s: GameState, tower: Tower, origin?: { x: number; y: number }) {
  const slot = getSlots(s.layout)[tower.slot];
  const from = origin ?? slot; // جزئی-۸: the Ghadir sub measures range from its OWN position
  const def = TOWERS[tower.kind], range = getRange(s, tower);
  const candidates = s.enemies.filter(e => {
    const pos = enemyPosition(e, s.layout), target = enemyTarget(e);
    return e.hp > 0 && e.progress < 1 && (e.hackTimer ?? 0) <= 0 && def.targets.includes(target) && distance(from, pos) <= range && (target !== "sub" || canSeeSub(s, pos));
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
  const tower = p.slot >= 0 ? combatTowers(s).find(t => t.slot === p.slot) : undefined;
  const targetPos = enemyPosition(target, s.layout);
  // Void shot: target left the firing tower's range before impact (hitscan
  // resolves in the same tick it fires, so it is naturally exempt). Boat
  // shots (MECH-A) are exempt: the boat tracked its target from its own
  // position, and a torpedo in the water does not fizzle on range drift.
  if (tower && p.boatId == null && distance(getSlots(s.layout)[tower.slot], targetPos) > getRange(s, tower)) { bumpFireStat(s, p.modelKind, "fizzled"); return; }
  const source: DamageSource = { kind: p.kind, modelKind: p.modelKind, slot: p.slot, branch: p.branch, direct: true };
  const dealt = applyDamage(s, target, p.damage, source);
  if (p.heroType === 2) target.armorBreak = 5; // hero type 2 cracks armor on impact
  if (dealt <= 0) { bumpFireStat(s, p.modelKind, "fizzled"); return; } // intercepted at the destroyer's point-defense: no effects ride along
  bumpFireStat(s, p.modelKind, "hits");
  if (!p.crit && ["silo", "hypersonic", "swarm", "bavar"].includes(p.modelKind)) s.popups.push({ id: s.nextId++, ...targetPos, text: `−${Math.max(1, Math.round(dealt))}`, life: 1.2 });
  if (p.crit) s.popups.push({ id: s.nextId++, x: targetPos.x, y: targetPos.y - 1.5, text: `✸−${Math.max(1, Math.round(dealt))}`, life: 1.2 });
  if (!tower) return;
  const splashSource: DamageSource = { ...source, direct: false };
  if (tower.kind === "heavy") {
    const nearby = towerCandidates(s, tower).filter(other => other.id !== target.id && distance(targetPos, enemyPosition(other, s.layout)) < 9).slice(0, 4);
    for (const other of nearby) applyDamage(s, other, p.damage * 0.35, splashSource);
    if (tower.tier === 4 && tower.branch === 0) for (const e of [target, ...nearby]) { e.burn = 3; e.burnDamage = Math.max(e.burnDamage ?? 0, 18); }
    if (tower.tier === 4 && tower.branch === 1) target.stun = Math.max(target.stun, 2);
  }
  // (Swarm's old +70% splash to 3 extra targets is gone — MECH-B replaced
  //  it with a real 4-missile multi-lock volley at fire time, checklist ۱٫۳.)
  if (tower.tier === 4 && tower.kind === "cannon" && tower.branch === 1) {
    for (const other of towerCandidates(s, tower).filter(e => e.id !== target.id).slice(0, 4)) applyDamage(s, other, p.damage * 0.5, splashSource);
  }
}

/* ================= MECH-A phases (run inside the battle tick) ================= */

/** Keep the boat entities in step with the placed boat-family towers:
 *  create missing units at their lane station, retire units of sold or
 *  re-branched towers, scale HP on tier change, run respawn timers. */
function syncBoats(s: GameState, battleDt: number) {
  const keep = new Set<string>();
  for (const tower of s.towers) {
    if (tower.kind !== "boat") continue;
    const { role, count } = boatRoleFor(tower);
    const maxHp = boatMaxHp(role, tower.tier);
    const station = laneStationProgress(getSlots(s.layout)[tower.slot], s.layout);
    const perBoatInterval = 1 / weaponSpec(tower.kind, tower.tier, tower.branch).fireRate;
    for (let i = 0; i < count; i++) {
      keep.add(`${tower.slot}:${role}:${i}`);
      const boat = s.boats.find(b => b.slot === tower.slot && b.role === role && b.index === i);
      if (!boat) {
        s.boats.push({ id: s.nextId++, slot: tower.slot, role, index: i, hp: maxHp, maxHp, progress: station, offset: boatOffset(role, i), state: "active", respawnClock: 0, cooldown: (i * perBoatInterval) / count });
      } else {
        if (boat.maxHp !== maxHp) { boat.hp = Math.max(1, Math.round(boat.hp * maxHp / boat.maxHp)); boat.maxHp = maxHp; }
        if (boat.role === "ghadir" && boat.state === "active") {
          // Ghadir patrol (MECH-A QA deferred جزئی-۸): the hunter sub does
          // not sit frozen at its station — it paces a ±0.04 lane window
          // around the station (period ~27 battle-seconds), so it meets
          // traffic instead of waiting for it. Garrison/torpedo boats keep
          // their fixed stations (blocking geometry depends on it).
          const pace = Math.sin((s.battleTime ?? 0) * (Math.PI * 2 / 27) + boat.index * 2.1) * 0.04;
          boat.progress = Math.max(0.01, Math.min(0.99, station + pace));
        } else boat.progress = station;
        if (boat.state === "respawn") {
          // Torpedo squadrons do not launch replacements into an active
          // pin engagement (QA round-2 مهم-۱): while a heavy ship sits
          // inside the pin radius of the sunken boat's station, its
          // respawn clock holds. With a flat 6s redeploy the pool would
          // refill faster than return fire drains it (240 HP ≈ 10s per
          // boat) and the pin could never be broken by sinking the
          // squadron — the checklist's "while the boats live" condition.
          const pinEngaged = boat.role === "torpedo" && s.enemies.some(e => e.hp > 0 && isHeavyShip(e) && distance(boatPosition(boat, s.layout), enemyPosition(e, s.layout)) <= TORPEDO_PIN_RADIUS);
          if (!pinEngaged) {
            boat.respawnClock -= battleDt;
            if (boat.respawnClock <= 0) { boat.state = "active"; boat.hp = maxHp; boat.respawnClock = 0; }
          }
        }
      }
    }
  }
  s.boats = s.boats.filter(b => keep.has(`${b.slot}:${b.role}:${b.index}`));
}

/** One hacked drone's turn (MECH-A sonar): it engages its former fleet —
 *  sustained fire on the nearest enemy, and a kamikaze dive (checklist
 *  ۱٫۵: ۱۵۰ damage) when it gets close. It never advances or leaks. */
function hackBehavior(s: GameState, enemy: Enemy, battleDt: number) {
  const pos = enemyPosition(enemy, s.layout);
  let best: Enemy | null = null; let bd = Infinity;
  for (const other of s.enemies) {
    if (other === enemy || other.hp <= 0 || other.progress >= 1 || (other.hackTimer ?? 0) > 0) continue;
    const d = distance(pos, enemyPosition(other, s.layout));
    if (d < bd) { bd = d; best = other; }
  }
  if (!best) return;
  if (bd > HACK_DETONATE_DIST) {
    // Close the distance first (MECH-A QA deferred جزئی-۷): a hacked drone
    // that spawned beyond engage range used to hover in place for its
    // whole 10s and waste the hack. Air units fly the lane's straight
    // chord (enemyPosition's own model), so steering = progress toward
    // the target's chord parameter. Sea-hacked units share the lane
    // polyline; their progress delta is a first-order approach (exact for
    // the air drones the sonar actually hacks).
    const tp = best.rev ? 1 - best.progress : best.progress;
    const cp = enemy.rev ? 1 - enemy.progress : enemy.progress;
    const step = (HACK_APPROACH_SPEED * battleDt) / 100; // % units → lane fraction
    const np = Math.abs(tp - cp) <= step ? tp : cp + Math.sign(tp - cp) * step;
    if (enemy.rev) enemy.progress = 1 - np; else enemy.progress = np;
  }
  if (bd <= HACK_DETONATE_DIST) {
    for (const other of s.enemies) {
      if (other === enemy || other.hp <= 0 || (other.hackTimer ?? 0) > 0) continue;
      if (distance(pos, enemyPosition(other, s.layout)) <= HACK_BLAST_RADIUS) applyDamage(s, other, HACK_DETONATE_DAMAGE, { kind: "aura" });
    }
    enemy.hp = 0; enemy.noReward = true; enemy.hackTimer = 0;
    return;
  }
  if (bd <= HACK_ENGAGE_RADIUS) applyDamage(s, best, HACK_DPS * battleDt, { kind: "aura" });
}

/** EMP pulses and sonar hacks (MECH-A). The EMP branch fires NO shots:
 *  every spec period (2s) it emits one area pulse — spec damage to every
 *  enemy in range, 60% slow, and 4s of weapon + radar shutdown (the
 *  weaponDownUntil / radarDownUntil fields MECH-B consumes). The sonar
 *  branch keeps its spec shots; every 12s it additionally hacks the
 *  nearest air enemy in range for 10s. */
function empSonarPhase(s: GameState, battleDt: number, stats: ReturnType<typeof getStats>) {
  for (const tower of s.towers) {
    if (tower.kind !== "ew" || tower.tier !== 4 || tower.branch === null) continue;
    if ((s.towerStuns?.[tower.slot] ?? 0) > 0) continue;
    const slotPos = getSlots(s.layout)[tower.slot];
    const spec = weaponSpec(tower.kind, tower.tier, tower.branch);
    let clock = (tower.abilityClock ?? 0) + battleDt;
    if (tower.branch === 0) {
      const period = specInterval(spec); // 2s at spec fire rate 0.5
      while (clock >= period) {
        const targets = s.enemies.filter(e => e.hp > 0 && e.progress < 1 && (e.hackTimer ?? 0) <= 0 && distance(slotPos, enemyPosition(e, s.layout)) <= getRange(s, tower));
        if (!targets.length) { clock = period; break; } // hold the charge until something enters range
        clock -= period;
        const damage = spec.damage * damageTech(s, tower) * stats.grid;
        for (const e of targets) {
          applyDamage(s, e, damage, { kind: "ew", modelKind: "emp", slot: tower.slot, branch: 0 });
          e.empSlow = EMP_EFFECT_SECONDS;
          // absolute stamps on the shared battle clock (MECH-B contract)
          e.weaponDownUntil = s.battleTime + EMP_EFFECT_SECONDS;
          e.radarDownUntil = s.battleTime + EMP_EFFECT_SECONDS;
        }
        // FX record for the pulse ring (gamesync MECH-A section renders it)
        s.shots.push({ slot: tower.slot, kind: "ew", modelKind: "emp", targetId: -1, flightDur: 0, damage, crit: false, interval: period, x1: slotPos.x, y1: slotPos.y, x2: slotPos.x, y2: slotPos.y, boatId: -1 });
      }
    } else if (clock >= SONAR_HACK_INTERVAL) {
      let best: Enemy | null = null; let bd = Infinity;
      for (const e of s.enemies) {
        if (e.kind !== "air" || e.hp <= 0 || e.progress >= 1 || (e.hackTimer ?? 0) > 0) continue;
        const d = distance(slotPos, enemyPosition(e, s.layout));
        if (d <= getRange(s, tower) && d < bd) { bd = d; best = e; }
      }
      if (best) { best.hackTimer = SONAR_HACK_DURATION; clock = 0; }
      else clock = SONAR_HACK_INTERVAL; // hold, retry next tick
    }
    tower.abilityClock = clock;
  }
}

/** Automatic minefield of the mine branch (MECH-A): the tower plants sea
 *  mines on the enemy lane inside its range (cap 10, one per spec
 *  interval, spec ammo per mine) and any surface/sub enemy coming within
 *  the trigger radius sets one off for spec damage in the blast radius.
 *  Exploded mines are replanted by the same cycle. */
function minesPhase(s: GameState, battleDt: number, stats: ReturnType<typeof getStats>) {
  s.mines = s.mines.filter(m => s.towers.some(t => t.slot === m.slot && t.kind === "boat" && t.tier === 4 && t.branch === 1));
  const spec = weaponSpec("boat", 4, 1);
  for (const tower of s.towers) {
    if (tower.kind !== "boat" || tower.tier !== 4 || tower.branch !== 1) continue;
    if ((s.towerStuns?.[tower.slot] ?? 0) > 0) continue;
    let clock = (tower.abilityClock ?? 0) + battleDt;
    const period = specInterval(spec);
    while (clock >= period) {
      const count = s.mines.reduce((n, m) => n + (m.slot === tower.slot ? 1 : 0), 0);
      if (count >= MINE_FIELD_CAP || s.ammo < spec.ammoPerShot) { clock = period; break; }
      s.ammo -= spec.ammoPerShot;
      clock -= period;
      const slotPos = getSlots(s.layout)[tower.slot];
      const station = laneStationProgress(slotPos, s.layout);
      // Planting spots are chosen by WORLD distance, not lane progress:
      // the lane is waypoint-parameterised, so equal progress steps are
      // wildly unequal in space — a progress-spread field used to stack
      // all 10 mines on one point, where a single ship tripped them all.
      const off = (count % 2 === 0 ? 1 : -1) * (0.8 + (count % 3) * 0.5);
      let chosen: { x: number; y: number } | null = null; let chosenScore = Infinity;
      for (let p = Math.max(0.005, station - 0.2); p <= Math.min(0.995, station + 0.2); p += 0.001) {
        const cand = boatPosition({ progress: p, offset: off }, s.layout);
        if (distance(slotPos, cand) > getRange(s, tower)) continue;
        let clear = Infinity;
        for (const m of s.mines) if (m.slot === tower.slot) clear = Math.min(clear, distance(m, cand));
        if (clear < MINE_SPACING) continue;
        const score = Math.abs(p - station);
        if (score < chosenScore) { chosenScore = score; chosen = cand; }
      }
      const pos = chosen ?? boatPosition({ progress: station, offset: 0 }, s.layout);
      s.mines.push({ id: s.nextId++, slot: tower.slot, x: pos.x, y: pos.y });
    }
    tower.abilityClock = clock;
  }
  const exploded: MineUnit[] = [];
  const tripped = new Set<number>(); // one mine per enemy per tick — a ship crossing the field trips them one at a time
  for (const mine of s.mines) {
    const near = s.enemies.filter(e => e.hp > 0 && e.progress < 1 && (e.hackTimer ?? 0) <= 0 && !tripped.has(e.id) && enemyTarget(e) !== "air" && distance(mine, enemyPosition(e, s.layout)) <= MINE_TRIGGER_RADIUS);
    if (!near.length) continue;
    for (const e of near) tripped.add(e.id);
    exploded.push(mine);
    const tower = s.towers.find(t => t.slot === mine.slot);
    const damage = spec.damage * (tower ? damageTech(s, tower) : 1) * stats.grid;
    for (const e of s.enemies) {
      if (e.hp <= 0 || e.progress >= 1 || (e.hackTimer ?? 0) > 0) continue;
      // A sea mine is an anti-ship weapon (QA round-2 مهم-۲): the blast
      // honours the same air exclusion as the trigger — air and sea lanes
      // pass within 0.28 units of each other, so without this the mine
      // branch was the game's strongest anti-air weapon by accident.
      if (enemyTarget(e) === "air") continue;
      if (distance(mine, enemyPosition(e, s.layout)) <= MINE_BLAST_RADIUS) applyDamage(s, e, damage, { kind: "boat", modelKind: "mine", slot: mine.slot, branch: 1 });
    }
    s.shots.push({ slot: mine.slot, kind: "boat", modelKind: "mine", targetId: near[0].id, flightDur: 0, damage, crit: false, interval: 0, x1: mine.x, y1: mine.y, x2: mine.x, y2: mine.y, boatId: -1 });
  }
  if (exploded.length) s.mines = s.mines.filter(m => !exploded.includes(m));
}

/** Whether a boat of this tower may engage the enemy. Torpedo boats never
 *  engage submarines (checklist ۱٫۶); submarines must be detected first. */
function boatTargetOk(s: GameState, tower: Tower, boat: BoatUnit, e: Enemy): boolean {
  const target = enemyTarget(e);
  if (!TOWERS[tower.kind].targets.includes(target)) return false;
  if (boat.role === "torpedo" && target === "sub") return false;
  if (target === "sub" && !canSeeSub(s, enemyPosition(e, s.layout))) return false;
  return true;
}

/** Garrison and torpedo boats fire for themselves (MECH-A): per-boat spec
 *  damage and rate, per-shot ammo from the shared stock, shots originating
 *  at the boat's own position. Overdrive and the catamaran aura speed the
 *  boats exactly as they speed towers. The Ghadir does not fire here — it
 *  fires through the tower's discrete loop (sub-priority targeting). */
function boatFirePhase(s: GameState, battleDt: number, stats: ReturnType<typeof getStats>) {
  for (const boat of s.boats) {
    if (boat.state !== "active" || boat.role === "ghadir") continue;
    const tower = s.towers.find(t => t.slot === boat.slot && t.kind === "boat");
    if (!tower || (s.towerStuns?.[tower.slot] ?? 0) > 0) continue;
    const spec = weaponSpec(tower.kind, tower.tier, tower.branch);
    const slotPos = getSlots(s.layout)[tower.slot];
    let rateMult = 1;
    if (s.overdrive > 0) rateMult *= 2;
    if ((distance(slotPos, s.hero) < 18 && s.hero.active === 0) || (s.hero2 && distance(slotPos, s.hero2) < 18 && s.hero2.active === 0)) rateMult *= 1.2;
    const interval = 1 / spec.fireRate;
    boat.cooldown -= battleDt * rateMult;
    if (boat.cooldown > 0) continue;
    const pos = boatPosition(boat, s.layout);
    const engage = getRange(s, tower) + BOAT_FIRE_RANGE_PADDING;
    for (let shotNo = 0; boat.cooldown <= 0; shotNo++) {
      if (shotNo >= MAX_SHOTS_PER_TICK) { boat.cooldown = interval; break; }
      const targets = s.enemies.filter(e => e.hp > 0 && e.progress < 1 && (e.hackTimer ?? 0) <= 0 && distance(pos, enemyPosition(e, s.layout)) <= engage && boatTargetOk(s, tower, boat, e));
      // torpedo boats prioritise the heavy ships they exist to pin
      targets.sort((a, b) => (boat.role === "torpedo" ? Number(isHeavyShip(b)) - Number(isHeavyShip(a)) : 0) || b.progress - a.progress);
      const target = targets[0];
      if (!target) { boat.cooldown = 0; break; }
      const ammoCost = s.overdrive > 0 ? 0 : spec.ammoPerShot;
      if (ammoCost > 0 && s.ammo < ammoCost) { boat.cooldown = interval * 3; break; } // same starved-stock ruling as towers
      if (ammoCost > 0) s.ammo -= ammoCost;
      const crit = randomBattle(s) < spec.critChance;
      let damage = spec.damage * damageTech(s, tower) * stats.grid;
      if (crit) damage *= 2;
      const targetPos = enemyPosition(target, s.layout);
      const flightDur = flightTime(spec.modelKind, distance(pos, targetPos));
      boat.cooldown += interval;
      bumpFireStat(s, spec.modelKind, "shots");
      s.pendingImpacts.push({ targetId: target.id, eta: flightDur, damage, crit, slot: tower.slot, kind: "boat", modelKind: spec.modelKind, branch: tower.branch, boatId: boat.id });
      s.shots.push({ slot: tower.slot, kind: "boat", modelKind: spec.modelKind, targetId: target.id, flightDur, damage, crit, interval: interval / rateMult, x1: pos.x, y1: pos.y, x2: targetPos.x, y2: targetPos.y, boatId: boat.id });
    }
  }
}

/** Return fire on the Ghadir hunter sub (QA round-2 مهم-۱): the sub used
 *  to be untouchable — its 600 HP and respawn cycle were dead numbers.
 *  Destroyers and corvettes (the ASW-capable classes) engaging it deal
 *  HALF the anti-boat rate — a submarine is a harder target than a
 *  surface boat. When the Ghadir sinks, the mine branch holds fire (the
 *  discrete-fire loop already gates on an active Ghadir) until it
 *  redeploys. */
function ghadirCounterfirePhase(s: GameState, battleDt: number) {
  for (const boat of s.boats) {
    if (boat.role !== "ghadir" || boat.state !== "active") continue;
    const tower = s.towers.find(t => t.slot === boat.slot && t.kind === "boat" && t.tier === 4 && t.branch === 1);
    if (!tower) continue;
    const engage = getRange(s, tower) + BOAT_FIRE_RANGE_PADDING;
    const pos = boatPosition(boat, s.layout);
    for (const e of s.enemies) {
      if (e.hp <= 0 || e.progress >= 1 || (e.hackTimer ?? 0) > 0) continue;
      if (e.kind !== "destroyer" && e.kind !== "corvette") continue;
      if (distance(pos, enemyPosition(e, s.layout)) > engage) continue;
      boat.hp -= GHADIR_COUNTERFIRE_FACTOR * antiBoatDps(e, s.wave) * battleDt;
    }
    if (boat.hp <= 0) { boat.hp = 0; boat.state = "respawn"; boat.respawnClock = BOAT_RESPAWN_SECONDS; }
  }
}

export type WaveUnit = { kind: Enemy["kind"]; count: number; boss: number };
/** Wave preview. With a scenario (the normal path — Game.tsx passes the
 *  same scenario the bulletin shows) the counts come from the scenario's
 *  spawn queue, so the preview is exactly what will spawn. Without one,
 *  the legacy fixed formula answers (kept for old callers/tests). */
export function waveComposition(wave: number, scenario?: Scenario): WaveUnit[] {
  if (scenario) {
    const queue = buildSpawnQueue(wave, scenario);
    const counts = new Map<string, WaveUnit>();
    for (const unit of queue) {
      const bossNo = unit.kind === "boss" ? Math.min(5, Math.ceil(wave / 5)) : 0;
      const key = unit.kind === "boss" ? `boss-${bossNo}` : unit.kind;
      const cur = counts.get(key);
      if (cur) cur.count++;
      else counts.set(key, { kind: unit.kind, count: 1, boss: bossNo });
    }
    const order: Record<string, number> = { speed: 0, corvette: 1, air: 2, sub: 3, destroyer: 4 };
    return [...counts.values()].sort((a, b) => (a.kind === "boss" ? 9 : order[a.kind] ?? 5) - (b.kind === "boss" ? 9 : order[b.kind] ?? 5));
  }
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
/** D-024 pre-wave air warning: the incoming wave carries air units and
 *  the player's anti-air coverage is missing — either ZERO air-capable
 *  towers at all, or a heavy air wave (≥5 fliers) with no DEDICATED
 *  anti-air tower (a lone generalist autocannon is exactly the wave-3
 *  trap of audit-2 C1). During battle the rolled queue is authoritative;
 *  in peace the deterministic scenario queue answers (generation is
 *  side-effect-free — peeking registers no phantom run). Game.tsx shows
 *  the warning in the briefing bulletin. */
export function antiAirWarning(s: GameState): { airTotal: number; capable: boolean; dedicated: boolean } | null {
  const queue = s.battle?.queue ?? buildSpawnQueue(s.wave, scenarioForWave(s.wave, s.mode, scenarioContextFor(s)));
  const airTotal = queue.filter(u => u.kind === "air").length;
  if (airTotal === 0) return null;
  const capable = s.towers.some(t => TOWERS[t.kind].targets.includes("air"));
  const dedicated = s.towers.some(t => t.kind === "air");
  if (capable && (dedicated || airTotal < 5)) return null;
  return { airTotal, capable, dedicated };
}
/** D-026 pre-wave intercept warning — the D-024 mechanism's second user.
 *  An intercept objective («رهگیری ناوگان», first met at wave 4) is
 *  decided in the lane's first half, before any land slot can engage:
 *  towers alone cannot hold it (QA-BALANCE kit matrix: every partial
 *  kit loses, the full kit wins). The only counter is the free,
 *  permanent kit — hero type 2 (the heavy-ship hunter) + the EMP pulse
 *  + the Strike spell — and the hero swap is locked once the battle
 *  starts (R9), so the combo must be taught in the briefing BEFORE the
 *  wave, not discovered from the defeat screen. Pure peek, exactly like
 *  antiAirWarning: reads the rolled battle when one exists, else
 *  derives the incoming wave's objective from its scenario; never
 *  mutates state. Returns null for every non-intercept wave.
 *  `heroReady` lets the briefing chip acknowledge a swap already done.
 *  One trap the peek must avoid: victory leaves the FINISHED battle in
 *  state (battle.wave is then s.wave - 1, phase intermission), so the
 *  rolled battle is authoritative only while battle.wave === s.wave —
 *  otherwise the previous wave's objective would shadow the incoming
 *  wave's and the warning would stay silent exactly at the doorstep
 *  where the player plans the swap. */
export function interceptWarning(s: GameState): { units: number; heroReady: boolean } | null {
  const scenario = scenarioForWave(s.wave, s.mode, scenarioContextFor(s));
  const rolled = s.battle && s.battle.wave === s.wave ? s.battle : null;
  const objective = rolled?.objective ?? objectiveTypeOf(scenario.objective);
  if (objective !== "intercept") return null;
  const queue = rolled?.queue ?? buildSpawnQueue(s.wave, scenario);
  return { units: queue.length, heroReady: s.hero.active === 2 };
}
/** Safety cap on shots one tower may fire inside a single tick. The
 *  legitimate worst case (CIWS at speed 3 with a hitched 0.25s frame) is
 *  ~11; 32 leaves generous headroom while bounding pathological bursts. */
const MAX_SHOTS_PER_TICK = 32;

/* — MECH-B: enemy missiles, CIWS interception, boss rules —
 * Destroyer offensive cadence: checklist §۲ gives the destroyer a 5s
 * weapon tempo (§۲٫۵ point-defense) and no separate offensive interval
 * in §۲٫۶, so its missiles fly on the same 5s beat. Boss 2 keeps its
 * checklist §۲٫۲ tempo (15s ability clock → one missile). */
const DESTROYER_MISSILE_INTERVAL = 5;
const ENEMY_MISSILE_RANGE = 26;      // percent units: a destroyer engages towers this close
const ENEMY_MISSILE_STUN = 4;        // seconds a tower hit by an enemy missile stays down (§۲٫۲)
const CIWS_INTERCEPT_BUDGET = 3;     // interception slots per CIWS (checklist ۱٫۱, pack data)
const CIWS_INTERCEPT_WINDOW = 5;     // seconds for one spent slot to recharge
const BOSS_ADD_CAP = 40;             // max reinforcements one boss may spawn (studio ruling)
const BOSS_ADD_BOUNTY_MULT = 0.25;   // boss adds pay 25% of class bounty, no combo (studio ruling)
const BOSS_ADD_SPREAD = 0.012;       // progress spacing between adds of one spawn group

/** MECH-A (wave 1) owns the EMP pulse that stamps weaponDownUntil /
 *  radarDownUntil onto enemies — absolute timestamps on the battle clock
 *  (state.battleTime). Read structurally so this branch is correct both
 *  before and after that merge: no stamp = weapons up. */
function enemyWeaponDown(s: GameState, e: Enemy): boolean {
  const until = (e as { weaponDownUntil?: number }).weaponDownUntil;
  return typeof until === "number" && s.battleTime < until;
}

/** Launch one enemy missile at a tower slot (shared by destroyers and by
 *  the Leviathan's ability — boss 2's tower stun now arrives BY MISSILE,
 *  checklist ۲٫۲/۲٫۶, instead of being applied directly). */
function launchEnemyMissile(s: GameState, shooter: Enemy, source: EnemyMissile["source"], targetSlot: number) {
  const slotPos = getSlots(s.layout)[targetSlot];
  if (!slotPos) return;
  const from = enemyPosition(shooter, s.layout);
  const total = flightTime("bavar", distance(from, slotPos));
  s.enemyMissiles.push({ id: s.nextId++, sourceId: shooter.id, source, targetSlot, eta: total, total, x1: from.x, y1: from.y, x2: slotPos.x, y2: slotPos.y });
}

/** The CIWS that would intercept a missile at pos: nearest standing
 *  Phalanx (cannon tier 4, branch 0) whose range covers the point and
 *  which still has a charged interception slot (3 slots, each recharging
 *  5s after its own use). A disabled CIWS defends nothing. */
function pickInterceptor(s: GameState, pos: { x: number; y: number }): Tower | null {
  let best: Tower | null = null; let bd = Infinity;
  for (const t of s.towers) {
    if (t.kind !== "cannon" || t.tier !== 4 || t.branch !== 0) continue;
    if ((s.towerStuns?.[t.slot] ?? 0) > 0) continue;
    if ((t.interceptCharges?.length ?? 0) >= CIWS_INTERCEPT_BUDGET) continue;
    const sp = getSlots(s.layout)[t.slot];
    if (!sp) continue;
    const d = distance(sp, pos);
    if (d <= getRange(s, t) && d < bd) { bd = d; best = t; }
  }
  return best;
}

function tick(s: GameState, delta: number, battlePaused = false, openingElapsed?:number) {
  const dt = Math.max(0, Math.min(1, delta));
  // D-022 (SHIPS): the ambient traffic layer (merchants / contraband / VIP /
  // pirates / port-tanker sailing legs) runs on the player's speed
  // multiplier like the battle layer does (audit-2 F-8: it used raw dt and
  // ignored the 1/2/3x setting), and every hull eases in from spawn instead
  // of leaving at full speed (F-2/F-6). Crossing-time budget at 1x, set by
  // the rates at each use site: merchants 65-80 s, contraband ~62 s,
  // pirates ~26 s (they were 25/24/11.8 s — the fastest-looking things on
  // the opening screen, F-2). Damage inside the pirate pass runs on the
  // same scaled dt, so the fire-exchange per crossing is invariant under
  // the speed setting; at 1x every damage number is unchanged.
  const trafficDt = dt * (s.phase === "battle" ? s.speed : 1);
  const easeIn = (age: number | undefined) => {
    if (age === undefined) return 1;
    const t = Math.min(1, Math.max(0, age / 3));
    return 0.2 + 0.8 * t * t * (3 - 2 * t);
  };
  s.elapsed += dt;
  if (!battlePaused) s.eventClock += dt;
  // Rolling 6 h export window (game time): fills with the realized
  // export flow and restarts empty on expiry — avgExportRate reads it.
  if (!s.opening) {
    updateExportWindow(s,dt);
    s.idle.boostRemaining = Math.max(0, s.idle.boostRemaining - dt);
    if (s.idle.boostCharges < 3) {
      s.idle.boostRecharge += dt;
      if (s.idle.boostRecharge >= 300) { s.idle.boostCharges++; s.idle.boostRecharge = 0; }
    }
    if (s.idle.contract) s.idle.contract.elapsed = Math.min(CONTRACTS[s.idle.contract.id].duration, s.idle.contract.elapsed + dt);
  }
  if (!s.opening && s.idle.managerLevels.harbor > 0) { s.idle.managerClock += dt; if (s.idle.managerClock >= 10) { collectRevenue(s); s.idle.managerClock = 0; } }
  const stats = getStats(s);
  if (s.opening) {
    advanceReopening(s,openingElapsed ?? dt,openingDependencies);
  } else {
    const oilCapacity = stats.oilCapacity;
    const produced = s.oil < oilCapacity ? stats.oilRate * dt : 0;
    s.oil = Math.min(oilCapacity, s.oil + produced);
    // Port & tanker cycle: crude leaves only aboard a berthed tanker. With no
    // tanker at the pier, production accumulates in storage (the upgrade signal).
    const port = s.idle.port ?? (s.idle.port = { tanker: null, nextIn: 0, cycles: 0, exportedDollars: 0 });
    const tankerCapacity = 500 + s.buildings.dock * 500;
    let exported = 0;
    if (!port.tanker) {
      port.nextIn -= dt;
      if (port.nextIn <= 0) port.tanker = { stage: "approach", progress: 0, load: 0 };
    }
    if (port.tanker) {
      const tanker = port.tanker;
      if (tanker.stage === "approach") {
        tanker.progress = Math.min(1, tanker.progress + trafficDt * 0.04);
        if (tanker.progress >= 1) tanker.stage = "loading";
      } else if (tanker.stage === "loading") {
        // R11 / PRD §3: the valve α rules the real flow — loading runs at
        // the export share of production (min(oilRate × α, dockRate)), not
        // the raw dock rate. α = 0 means the tanker waits at the pier.
        const moved = Math.min(s.oil, stats.exportRate * dt, tankerCapacity - tanker.load);
        s.oil -= moved; tanker.load += moved; exported = moved;
        port.exportedDollars = (port.exportedDollars ?? 0) + moved * 2 * (s.research.includes("trade") ? 1.5 : 1);
        s.idle.exportWindowDollars = (s.idle.exportWindowDollars ?? 0) + moved * 2 * (s.research.includes("trade") ? 1.5 : 1);
        if (tanker.load >= tankerCapacity - 0.001 || (s.oil <= 0.001 && tanker.load > 0)) tanker.stage = "depart";
      } else {
        tanker.progress = Math.max(0, tanker.progress - trafficDt * 0.04);
        if (tanker.progress <= 0) { port.tanker = null; port.nextIn = 18; port.cycles++; }
      }
    }
    addRevenue(s, exported * 2 * (s.research.includes("trade") ? 1.5 : 1));
    // Refinery: conversion is capped by the room left in the fuel tank —
    // with a full tank the refinery stops and burns NO oil (the old code
    // subtracted the oil and clipped the fuel away: the chain's only leak).
    const fuelCap = s.research.includes("reserve") ? 3000 : 2500;
    const refineYield = 0.5 * (s.research.includes("refine") ? 1.2 : 1);
    const fuelRoomOil = Math.max(0, (fuelCap - s.fuel) / refineYield);
    const toRefinery = Math.min(s.oil, stats.oilRate * (1 - s.oilSplit / 100) * dt, stats.output("refinery") * (s.research.includes("pipe") ? 1.5 : 1) * dt, fuelRoomOil);
    s.oil -= toRefinery;
    s.fuel = Math.min(fuelCap, s.fuel + toRefinery * refineYield);
    s.fuel = Math.max(0, s.fuel - s.buildings.power * 0.5 * (s.research.includes("gas") ? 0.7 : 1) * dt);
    const steelBatches = Math.min(s.oil / 10, s.fuel / 2, stats.output("steel") / 3 * dt * (s.research.includes("industrial") ? 1.15 : 1), Math.max(0, 2000 - s.steel) / 3);
    s.oil -= steelBatches * 10; s.fuel -= steelBatches * 2; s.steel += steelBatches * 3;
    const ammoBatches = Math.min(s.fuel / 5, s.steel / 5, stats.output("arms") / 10 * dt * (s.research.includes("ammo") ? 1.4 : 1), Math.max(0, 5000 - s.ammo) / 10);
    s.fuel -= ammoBatches * 5; s.steel -= ammoBatches * 5; s.ammo += ammoBatches * 10;
  }
  // D-024 spiral pre-alerts (audit-2 I2): track SUSTAINED danger so the
  // warning fires BEFORE the choke, not as the choke. Fuel: below 60
  // AND lower than when the run below 60 began (a stable equilibrium at
  // 55 — refinery output matching the burn — is not a spiral and never
  // warns). Grid: below 0.9. Both need ~10 s of sustain.
  if (s.fuel < 60) {
    if (s.lowFuelStart < 0) { s.lowFuelStart = s.fuel; s.lowFuelTime = 0; }
    s.lowFuelTime += dt;
  } else { s.lowFuelStart = -1; s.lowFuelTime = 0; }
  s.lowGridTime = stats.grid < 0.9 ? s.lowGridTime + dt : 0;
  s.warnings = {
    fuel: s.lowFuelTime >= 10 && s.fuel < s.lowFuelStart - 1,
    power: s.lowGridTime >= 10,
  };
  s.shots = [];
  s.events = []; // momentary battle events follow the same one-tick lifecycle (MECH-B)
  s.popups = s.popups.map(p => ({ ...p, life: p.life - dt })).filter(p => p.life > 0);
  // A scenario storm IS the storm system (checklist ۴٫۰): same ×0.8 on
  // merchant speed and tower range (getRange) as the dynamic storm event.
  const stormActive = s.event === "storm" || (s.phase === "battle" && s.battle?.condition === "طوفان");
  // Traffic movement below runs on trafficDt / easeIn (defined at the top
  // of tick, D-022); the spawn cadence itself stays on raw dt.
  if (!s.opening) s.trafficClock += dt;
  const interval = 15 - 0.1 * s.security;
  if (!s.opening && s.trafficClock >= interval) {
    s.trafficClock -= interval; s.trafficCount++;
    const kind = s.security >= 80 && s.trafficCount % 7 === 0 ? "tanker" : s.security >= 50 && s.trafficCount % 4 === 0 ? "container" : s.security >= 20 && s.trafficCount % 2 === 0 ? "bulk" : "barge";
    const toll = kind === "tanker" ? 2500 : kind === "container" ? 500 : kind === "bulk" ? 120 : 25;
    s.merchants.push({ id: s.nextId++, progress: 0, inbound: s.trafficCount % 2 === 1, kind, reward: toll, paid: false, age: 0 });
    if (s.trafficCount % 5 === 0 && !battlePaused) s.pirates.push({ id: s.nextId++, progress: 0, hp: 100, age: 0 });
    // R5 stage one: the optical outpost building reveals contraband.
    // (Smart-customs research no longer gates the reveal — it raises the
    // inspection reward and tolls instead; see the inspect action.)
    if ((s.buildings.optical ?? 0) >= 1 && s.trafficCount % 4 === 0) s.contraband.push({ id: s.nextId++, progress: 0, age: 0 });
  }
  for (const ship of s.merchants) {
    const oldProgress = ship.progress;
    if (!s.opening) {
      if (ship.age !== undefined) ship.age += trafficDt;
      ship.progress += trafficDt / (ship.kind === "tanker" ? 80 : ship.kind === "barge" ? 65 : 70) * (stormActive ? .8 : 1) * easeIn(ship.age);
      if (!ship.paid && oldProgress < .82 && ship.progress >= .82) {
        ship.paid = true;
        const toll = ship.reward * (s.research.includes("smart") ? 1.25 : 1) * (s.research.includes("logistics") ? 1.1 : 1) * (s.research.includes("diplomacy") ? 1.15 : 1);
        addRevenue(s, toll * (1 + .1 * s.idle.managerLevels.harbor));
        const position = merchantPosition(ship, s.layout);
        s.popups.push({ id: s.nextId++, ...position, text: `+${Math.round(toll)}`, life: 1.4 });
      }
    }
    // Enemy mines threaten the shipping lane in real time: merchants keep
    // sailing while the battle layer is frozen (briefing/diary pause), so
    // the detonation check lives HERE, on the segment the ship actually
    // crossed this tick. A point check in the frozen battle section let a
    // ship slip through the ±0.02 window during a pause and disarmed the
    // mine by opening the diary (QA round 2 exploit).
    if (s.phase === "battle" && s.battle && s.battle.mines.length) {
      const mine = s.battle.mines.find(m => m.progress > oldProgress - 0.02 && m.progress < ship.progress + 0.02);
      if (mine) {
        s.battle.mines = s.battle.mines.filter(m => m.id !== mine.id);
        const position = merchantPosition(ship, s.layout);
        ship.progress = 2; // sunk — the traffic filter below drops progress ≥ 1
        s.security = Math.max(0, s.security - 2);
        s.popups.push({ id: s.nextId++, ...position, text: "کشتی تجاری به مین برخورد کرد!", life: 1.8 });
      }
    }
  }
  s.merchants = s.merchants.filter(ship => ship.progress < 1);
  for (const ship of s.contraband) {
    if (ship.age !== undefined) ship.age += trafficDt;
    ship.progress += trafficDt / 62 * easeIn(ship.age);
  }
  s.contraband = s.contraband.filter(ship => ship.progress < 1);
  // VIP golden supertanker (R6): crosses on the trade lane like a merchant
  // (45 s, storm-slowed). Pirates damage it in the pirate pass below; the
  // crossing resolves here — success pays the old event reward, a kill
  // fines security instead.
  // The whole layer freezes with the SAME battlePaused flag as the pirate
  // layer: while paused there is no progress, no damage (pirate pass is
  // frozen too) and no resolve — holding a pause open must not grant a
  // risk-free escort (QA round-2 exploit).
  if (s.vipShip && !battlePaused) {
    const vip = s.vipShip;
    // D-022: the VIP sails on trafficDt too — its age (the pirates' 5 s
    // grace clock) is measured in ship-seconds so the grace stays the same
    // fraction of the crossing at any speed setting. At 1x, unchanged.
    vip.age = (vip.age ?? 0) + trafficDt;
    vip.progress += trafficDt / 45 * (s.event === "storm" ? .8 : 1) * easeIn(vip.age);
    if (vip.hp <= 0) {
      const pos = vipPosition(vip, s.layout);
      s.security = Math.max(0, s.security - 10);
      s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: "💥 سوپرتانکر VIP منهدم شد!", life: 2 });
      s.vipShip = null; if (s.event === "vip") { s.event = null; s.eventClock = 0; }
    } else if (vip.progress >= 1) {
      const pos = vipPosition(vip, s.layout);
      s.cash += 1000; s.security = Math.min(100, s.security + 3);
      s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: "+۱۰۰۰ اسکورت VIP", life: 2 });
      s.vipShip = null; if (s.event === "vip") { s.event = null; s.eventClock = 0; }
    }
  }
  // Coast guard and nearby towers automatically intercept pirates chasing merchant ships.
  // The pirate layer freezes with the battle pause (audit fix: it used to keep fighting and draining ammo).
  for (const pirate of battlePaused ? [] : s.pirates) {
    // D-022: crossing ~26 s at 1x (was ~11.8 s); the whole pass — progress,
    // erosion, hero/tower fire, VIP damage — runs on trafficDt so the
    // exchange per crossing is speed-invariant (at 1x, damage unchanged).
    const pdt = trafficDt;
    if (pirate.age !== undefined) pirate.age += pdt;
    pirate.progress += pdt * (stormActive ? 0.027 : 0.038) * easeIn(pirate.age);
    const pos = piratePosition(pirate, s.layout);
    // VIP escorts are exempt from the passive coast-guard erosion while
    // their target lives (manager ruling, QA round 3): without this the
    // base 4/s erosion killed both escorts at ~25 s and an undefended
    // VIP crossed with HP to spare. Hero / tower / boat fire below is
    // NOT exempt — escorts die to real fire only.
    if (!(pirate.vipEscort && s.vipShip)) pirate.hp -= (s.research.includes("coastguard") ? 12 : 4) * pdt;
    if (distance(s.hero, pos) < 18) pirate.hp -= 22 * pdt;
    for (const tower of s.towers) {
      const slot = getSlots(s.layout)[tower.slot];
      if (slot && TOWERS[tower.kind].targets.includes("sea") && distance(slot, pos) < getRange(s, tower)) {
        const spec = weaponSpec(tower.kind, tower.tier, tower.branch);
        const ammoCost = s.overdrive > 0 ? 0 : spec.ammoPerShot;
        if (s.ammo < ammoCost || spec.airOnly) continue;
        pirate.hp -= towerDps(s, tower) * pdt;
        if (ammoCost > 0) s.ammo = Math.max(0, s.ammo - TOWERS[tower.kind].rate * pdt);
        const mk = spec.modelKind;
        s.shots.push({ slot: tower.slot, kind: tower.kind, modelKind: mk, targetId: pirate.id, flightDur: flightTime(mk, distance(slot, pos)), damage: 0, crit: false, interval: 0, x1: slot.x, y1: slot.y, x2: pos.x, y2: pos.y });
      }
    }
    // Pirates hunting the VIP hold station alongside it and tear into
    // its hull; the coast guard / hero / tower fire in this same pass is
    // the defense (R6). Balance (manager ruling, QA round 2): 6 dmg/s
    // per pirate (was 12) and no damage at all during the ship's first
    // 5 s. Escorts are exempt from the passive erosion above while the
    // ship lives (round 3), so an undefended VIP sinks at ≈30 s
    // (5 s grace + 300 HP / 12 per s) and the event honestly fails.
    if (s.vipShip && Math.abs(pirate.progress - s.vipShip.progress) < 0.08) {
      pirate.progress = s.vipShip.progress - 0.02;
      if ((s.vipShip.age ?? 0) >= 5) s.vipShip.hp -= 6 * pdt;
    }
    if (pirate.hp <= 0) {
      s.events.push({ type: "ship-destroyed", enemyId: pirate.id, ...pos });
      // The bounty routes to the harbor bank, but a full bank must not
      // silently swallow it (QA round 2): whatever does not fit goes to
      // cash, so the +50 popup is always the amount actually received.
      const room = Math.max(0, getStats(s).bankCapacity - s.idle.bank);
      const banked = Math.min(50, room);
      addRevenue(s, banked);
      if (banked < 50) { const overflow = 50 - banked; s.cash += overflow; s.idle.lifetimeIncome += overflow; }
      s.security = Math.min(100, s.security + 2); s.piratesDestroyed++; s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: "+50", life: 1.4 });
    }
    else if (pirate.progress >= 1) { s.security = Math.max(0, s.security - 15); s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: "−۱۵ امنیت", life: 1.4 }); }
  }
  s.pirates = s.pirates.filter(p => p.hp > 0 && p.progress < 1);
  // Defensive net (hydrate repairs this properly): an orphaned VIP
  // event — flag set, ship gone — can never resolve, so free the cycle
  // on the first tick that sees it instead of deadlocking all events.
  if (s.event === "vip" && !s.vipShip) { s.event = null; s.eventClock = 0; }
  // Event type rotates on the event COUNTER (spill → storm → vip), not
  // on elapsed time — the old elapsed formula drifted with session length.
  if (!s.event && s.eventClock >= 180) {
    s.event = (["spill", "storm", "vip"] as const)[s.eventCount % 3]; s.eventCount++; s.eventClock = 0;
    if (s.event === "vip") {
      // R6: the VIP event is a real escort — a golden supertanker with HP
      // enters the trade lane and pirates sortie against it.
      s.vipShip = { progress: 0, hp: 300, maxHp: 300, age: 0 };
      s.pirates.push({ id: s.nextId++, progress: 0, hp: 100, vipEscort: true, age: 0 }, { id: s.nextId++, progress: -0.06, hp: 100, vipEscort: true, age: 0 });
    }
  }
  if (s.event && s.event !== "vip" && s.eventClock >= 60) {
    if (s.event === "spill") s.security = Math.max(0, s.security - 10);
    s.event = null; s.eventClock = 0;
  }
  if (battlePaused) return;
  for (const hero of [s.hero, s.hero2]) {
    if (!hero) continue;
    hero.slow = Math.max(0, (hero.slow ?? 0) - dt);
    let travel = dt * (s.phase === "battle" ? s.speed : 1) * 6 * ((hero.slow ?? 0) > 0 ? 0.5 : 1);
    while (travel > 0 && hero.route && (hero.routeIndex ?? 1) < hero.route.length) {
      const index = hero.routeIndex ?? 1, target = hero.route[index];
      const remaining = Math.hypot(target.x - hero.x, target.y - hero.y);
      if (remaining <= travel) { hero.x = target.x; hero.y = target.y; hero.routeIndex = index + 1; travel -= remaining; }
      else { hero.x += (target.x - hero.x) / remaining * travel; hero.y += (target.y - hero.y) / remaining * travel; travel = 0; }
    }
    if (hero.route && (hero.routeIndex ?? 1) >= hero.route.length) { hero.route = undefined; hero.routeIndex = undefined; }
  }
  const battleDt = dt * (s.phase === "battle" ? s.speed : 1);
  s.battleTime += battleDt; // EMP weapon-down timestamps are measured on this clock (MECH-A contract)
  (Object.keys(s.cooldowns) as Spell[]).forEach(k => { s.cooldowns[k] = Math.max(0, s.cooldowns[k] - battleDt); });
  s.overdrive = Math.max(0, s.overdrive - battleDt);
  s.slowmo = Math.max(0, (s.slowmo ?? 0) - dt);
  if ((s.comboTimer ?? 0) > 0) {
    s.comboTimer = Math.max(0, s.comboTimer - battleDt);
    if (s.comboTimer <= 0) s.combo = 0;
  }
  if (s.phase === "intermission" && (!s.idle.lastBattle || s.idle.lastBattle.claimed)) {
    s.countdown = Math.max(0, s.countdown - battleDt);
    if (s.countdown <= 0 && s.idle.autoBattle && (!s.opening || s.opening.manualWaveAt!==null)) startWave(s, false);
  }
  if (s.phase !== "battle") return;
  if (s.battle) s.battle.elapsed += battleDt;
  s.spawnClock -= battleDt;
  const schedule = openingSchedule(s);
  while (s.spawnRemaining > 0 && (schedule ? s.battle!.elapsed >= (schedule[s.spawnIndex]?.at ?? Infinity) : s.spawnClock <= 0)) {
    const index = s.spawnIndex++;
    // Scenario queue first (rolled in startWave); the legacy index pattern
    // remains only as a fallback for a battle restored without a context.
    const unit = s.battle?.queue[index];
    let kind: Enemy["kind"] = "speed";
    let rev = false;
    if (unit) { kind = unit.kind; rev = unit.rev; }
    else if (s.wave % 5 === 0 && s.spawnRemaining === 1) kind = "boss";
    else if (s.wave >= 4 && index % 6 === 5) kind = "destroyer";
    else if (s.wave >= 3 && index % 5 === 3) kind = "sub";
    else if (s.wave >= 2 && index % 4 === 2) kind = "air";
    else if (index % 3 === 1) kind = "corvette";
    const enemy = makeEnemy(s, kind, 0, rev);
    if (schedule) {
      enemy.maxHp = Math.ceil(enemy.maxHp * operationForOpening(s)!.model_pressure_percent / 100);
      enemy.hp = enemy.maxHp;
      enemy.openingMarked = schedule[index].marked;
    }
    s.enemies.push(enemy); s.spawnRemaining--; s.spawnClock += 1.35;
  }
  for (const key of Object.keys(s.towerStuns ?? {})) { const left = (s.towerStuns[Number(key)] ?? 0) - battleDt; if (left <= 0) delete s.towerStuns[Number(key)]; else s.towerStuns[Number(key)] = left; }
  // MECH-A pre-phase: boats deploy, EMP pulses land and sonar hacks are
  // assigned BEFORE movement, so their effects apply from this same tick.
  // (The shared battle clock advanced ONCE at the top of the battle block —
  // MECH-B's increment; MECH-A's own duplicate increment was removed at the
  // Wave-2 merge, where it had doubled the clock to 2× battle time.)
  syncBoats(s, battleDt);
  empSonarPhase(s, battleDt, stats);
  minesPhase(s, battleDt, stats);
  const reinforcements: Enemy[] = [];
  /** Boss reinforcement spawn (MECH-B): adds are flagged (25% bounty, no
   *  combo), capped per boss, and fanned out around the boss instead of
   *  stacked on one progress point (audit جدید-۱۶/۱۷). */
  const spawnAdds = (boss: Enemy, kinds: Enemy["kind"][]) => {
    const room = Math.max(0, BOSS_ADD_CAP - (boss.addsSpawned ?? 0));
    const list = kinds.slice(0, room);
    list.forEach((kind, i) => {
      const progress = Math.max(0.001, Math.min(0.97, boss.progress + (i - (list.length - 1) / 2) * BOSS_ADD_SPREAD));
      const add = makeEnemy(s, kind, progress);
      add.isAdd = true;
      reinforcements.push(add);
    });
    if (list.length) {
      boss.addsSpawned = (boss.addsSpawned ?? 0) + list.length;
      const bp = enemyPosition(boss, s.layout);
      s.events.push({ type: "boss-spawn", x: bp.x, y: bp.y, enemyId: boss.id, count: list.length });
    }
  };
  for (const enemy of s.enemies) {
    const pos = enemyPosition(enemy, s.layout);
    if ((enemy.burn ?? 0) > 0) { applyDamage(s, enemy, (enemy.burnDamage ?? 0) * battleDt, { kind: "burn" }); enemy.burn = Math.max(0, (enemy.burn ?? 0) - battleDt); }
    enemy.intercept = Math.max(0, (enemy.intercept ?? 0) - battleDt);
    enemy.armorBreak = Math.max(0, (enemy.armorBreak ?? 0) - battleDt);
    enemy.hitFlash = Math.max(0, (enemy.hitFlash ?? 0) - battleDt * 3);
    // MECH-A: the EMP slow counts down in battle time. (weaponDownUntil /
    // radarDownUntil are absolute battleTime stamps — never decremented;
    // consumers compare them against s.battleTime.)
    enemy.empSlow = Math.max(0, (enemy.empSlow ?? 0) - battleDt);
    if ((enemy.hackTimer ?? 0) > 0) {
      // Hacked by a sonar hub (MECH-A): fights for the player — no advance,
      // no leaking, no boss abilities.
      enemy.hackTimer = Math.max(0, (enemy.hackTimer ?? 0) - battleDt);
      hackBehavior(s, enemy, battleDt);
      continue;
    }
    let slow = 1;
    for (const t of s.towers) {
      // EW slow aura: tiers 1-3 ×0.7, sonar branch ×0.4. The EMP branch has
      // NO aura — its slow arrives by pulse (empSlow below). Boat towers no
      // longer slow by aura at all (audit F-6): their boats physically
      // block and pin, which is computed after this loop.
      if (t.kind === "ew" && !(t.tier === 4 && t.branch === 0) && distance(getSlots(s.layout)[t.slot], pos) < getRange(s, t)) {
        slow = Math.min(slow, t.tier === 4 ? 0.4 : 0.7);
      }
    }
    if ((enemy.empSlow ?? 0) > 0) slow = Math.min(slow, EMP_SLOW_FACTOR);
    // Garrison blocking / torpedo pinning (MECH-A): a surface enemy held by
    // a boat does not advance at all. A held enemy shoots back at the boats
    // holding it — the boats are real targets with their own HP, and the
    // pin/block lasts only while they live (checklist ۱٫۶).
    if (enemyTarget(enemy) === "sea") {
      const band = s.boats.filter(b => b.state === "active" && b.role === "garrison" && enemy.progress >= b.progress - 0.002 && enemy.progress <= b.progress + BLOCK_BAND);
      if (band.length) {
        slow = 0;
        // Return fire ROTATES between the boats holding the line (QA
        // round-2 متوسط-۴): permanent focus on boat #1 left the rest of
        // the line at full HP until its turn came.
        const target = band[(Math.floor(s.battleTime / ANTI_BOAT_ROTATE_SECONDS) + enemy.id) % band.length];
        target.hp -= antiBoatDps(enemy, s.wave) * battleDt;
        if (target.hp <= 0) { target.hp = 0; target.state = "respawn"; target.respawnClock = BOAT_RESPAWN_SECONDS; }
      } else if (isHeavyShip(enemy)) {
        // Torpedo pin (QA round-2 مهم-۱): the pinned ship fires back at
        // the NEAREST pinning boat — before this, torpedo boats could
        // never take damage and the pin could only end with the ship.
        let nearest: BoatUnit | undefined; let nd = Infinity;
        for (const b of s.boats) {
          if (b.state !== "active" || b.role !== "torpedo") continue;
          const d = distance(boatPosition(b, s.layout), pos);
          if (d <= TORPEDO_PIN_RADIUS && d < nd) { nd = d; nearest = b; }
        }
        if (nearest) {
          slow = 0; // torpedo squadron pin: heavy ship held 100% while engaged
          nearest.hp -= antiBoatDps(enemy, s.wave) * battleDt;
          if (nearest.hp <= 0) { nearest.hp = 0; nearest.state = "respawn"; nearest.respawnClock = BOAT_RESPAWN_SECONDS; }
        }
      }
    }
    if (enemy.stun > 0) { enemy.stun = Math.max(0, enemy.stun - battleDt); slow = 0; }
    const velocity = enemy.kind === "speed" ? 0.033 : enemy.kind === "air" ? 0.045 : enemy.kind === "boss" ? 0.011 : enemy.kind === "destroyer" ? 0.018 : 0.024;
    // Dawn attack (حمله سحرگاه, checklist ۴٫۰): the opening wave presses
    // faster — +15% enemy speed for the battle's first 30 seconds. (SCEN)
    const dawnBoost = s.battle?.condition === "حمله سحرگاه" && s.battle.elapsed < 30 ? 1.15 : 1;
    enemy.progress += velocity * slow * battleDt * dawnBoost * (s.mode === "challenge" && s.challengeRule === 2 ? 1.3 : 1);
    // Effective time (MECH-B; audit جدید-۱۵): ability and weapon clocks run
    // on the enemy's own slowed/stunned timescale, exactly like its
    // movement — a pinned boss no longer spawns adds, launches stun
    // missiles or cycles its shield at full rate.
    const effDt = battleDt * slow;
    if (enemy.kind === "destroyer") {
      enemy.fireClock = Math.min(DESTROYER_MISSILE_INTERVAL, (enemy.fireClock ?? 0) + effDt);
      if (enemy.fireClock >= DESTROYER_MISSILE_INTERVAL && !enemyWeaponDown(s, enemy)) {
        // nearest standing tower in range (already-disabled ones only as a fallback)
        let targetSlot = -1; let bd = Infinity;
        for (const preferUp of [true, false]) {
          bd = Infinity;
          for (const t of s.towers) {
            if (preferUp && (s.towerStuns?.[t.slot] ?? 0) > 0) continue;
            const sp = getSlots(s.layout)[t.slot];
            if (!sp) continue;
            const d = distance(sp, pos);
            if (d <= ENEMY_MISSILE_RANGE && d < bd) { bd = d; targetSlot = t.slot; }
          }
          if (targetSlot >= 0) break;
        }
        if (targetSlot >= 0) {
          enemy.fireClock = 0;
          launchEnemyMissile(s, enemy, "destroyer", targetSlot);
          s.events.push({ type: "enemy-missile", x: pos.x, y: pos.y, slot: targetSlot, enemyId: enemy.id });
        }
      }
    }
    if (enemy.kind === "boss") {
      enemy.specialClock += effDt;
      // Titan shield transitions ride the same effective-time clock that
      // applyDamage reads (specialClock < 10 of every 15) — report flips.
      if (enemy.boss === 3) {
        const up = enemy.specialClock % 15 < 10;
        if (enemy.shieldUp === undefined) enemy.shieldUp = up;
        else if (enemy.shieldUp !== up) { enemy.shieldUp = up; s.events.push({ type: up ? "shield-up" : "shield-down", x: pos.x, y: pos.y, enemyId: enemy.id }); }
      }
      if (enemy.specialClock >= (enemy.boss === 1 ? 10 : 15)) {
        // The Leviathan's stun is a weapon launch: an EMP weapon shutdown
        // holds the ability at its threshold instead of wasting it.
        const heldByEmp = enemy.boss === 2 && enemyWeaponDown(s, enemy);
        if (!heldByEmp) {
          enemy.specialClock = 0;
          if (enemy.boss === 1) spawnAdds(enemy, ["speed", "speed", "speed", "speed", "air", "air"]);
          if (enemy.boss === 2 && s.towers.length) {
            const victim = s.towers[Math.floor(randomBattle(s) * s.towers.length)], vslot = getSlots(s.layout)[victim.slot];
            launchEnemyMissile(s, enemy, "boss", victim.slot);
            s.events.push({ type: "boss-stun", x: pos.x, y: pos.y, x2: vslot?.x, y2: vslot?.y, slot: victim.slot, enemyId: enemy.id });
          }
          if (enemy.boss === 4) spawnAdds(enemy, ["air", "air"]);
          if (enemy.boss === 5) spawnAdds(enemy, ["speed", "speed", "corvette", "air", "air"]);
        }
      }
    }
  }
  s.enemies.push(...reinforcements);
  // — Enemy missiles in flight (MECH-B; checklist ۲٫۶ + CIWS §۱٫۱) —
  // CIWS slots recharge individually in battle time: each spent slot's
  // timer ticks down and the slot returns only once the timer crosses
  // below zero — two uses of one slot are always >5s apart, so no
  // sliding 5s span (closed or half-open) ever holds more than 3
  // interceptions per CIWS (QA round 2: the old shared window refilled
  // all 3 slots at once and a queued burst slipped 5–6 into one span).
  for (const t of s.towers) {
    const charges = t.interceptCharges;
    if (!charges?.length) continue;
    let w = 0;
    for (let i = 0; i < charges.length; i++) { const c = charges[i] - battleDt; if (c >= 0) charges[w++] = c; }
    charges.length = w;
    if (!w) t.interceptCharges = undefined;
  }
  if (s.enemyMissiles.length) {
    const stillFlying: EnemyMissile[] = [];
    for (const m of s.enemyMissiles) {
      const mpos = enemyMissilePosition(m);
      const ciws = pickInterceptor(s, mpos);
      if (ciws) {
        (ciws.interceptCharges ??= []).push(CIWS_INTERCEPT_WINDOW); // this slot recharges 5s from now
        s.events.push({ type: "intercept", x: mpos.x, y: mpos.y, slot: ciws.slot, enemyId: m.sourceId });
        s.popups.push({ id: s.nextId++, x: mpos.x, y: mpos.y - 1, text: "✦ موشک رهگیری شد", life: 1 });
        continue; // destroyed mid-air: no arrival, no stun
      }
      m.eta -= battleDt;
      if (m.eta > 0) { stillFlying.push(m); continue; }
      const slotPos = getSlots(s.layout)[m.targetSlot];
      if (slotPos && s.towers.some(t => t.slot === m.targetSlot)) {
        s.towerStuns[m.targetSlot] = Math.max(s.towerStuns[m.targetSlot] ?? 0, ENEMY_MISSILE_STUN);
        s.popups.push({ id: s.nextId++, x: slotPos.x, y: slotPos.y, text: "برجک از کار افتاد!", life: 1.6 });
        s.events.push({ type: "tower-disabled", x: slotPos.x, y: slotPos.y, slot: m.targetSlot, enemyId: m.sourceId });
      } else if (slotPos) {
        s.events.push({ type: "missile-impact", x: slotPos.x, y: slotPos.y, enemyId: m.sourceId }); // tower sold mid-flight: harmless splash
      }
    }
    s.enemyMissiles = stillFlying;
  }
  // — Scenario objective & condition mechanics (SCEN; checklist §۴) —
  // Everything here reads the BattleContext rolled in startWave. Losing an
  // objective only FLAGS the failure; the defeat itself is resolved at the
  // single resolution point below (next to the hearts defeat).
  if (s.battle) {
    const ctx = s.battle;
    const failObjective = (text: string, x: number, y: number, reason: DefeatReason) => {
      if (ctx.failed) return;
      ctx.failed = true;
      ctx.failReason = reason; // D-024: the defeat report names this path
      s.popups.push({ id: s.nextId++, x, y, text, life: 2.2 });
    };
    // Intercept (رهگیری ناوگان): no enemy may cross the mid-channel line.
    if (ctx.objective === "intercept") {
      const crosser = s.enemies.find(e => e.hp > 0 && (e.hackTimer ?? 0) <= 0 && e.progress >= INTERCEPT_LINE);
      if (crosser) { const p = enemyPosition(crosser, s.layout); failObjective("دشمن از خط رهگیری گذشت!", p.x, p.y, "intercept-crossed"); }
    }
    // Objective ships under fire: live enemies close aboard engage the ship
    // (up to 4 attackers × 6 dmg/s) — keeping them off is the towers' job.
    // This proximity fire is what makes escort/rescue losable at all.
    const shipFire = (pos: { x: number; y: number }) => {
      let attackers = 0;
      for (const e of s.enemies) if (e.hp > 0 && (e.hackTimer ?? 0) <= 0 && distance(pos, enemyPosition(e, s.layout)) < 12) attackers++;
      return Math.min(attackers, 4) * 6 * battleDt;
    };
    if (ctx.escort) {
      const ship = ctx.escort;
      ship.slow = Math.max(0, ship.slow - battleDt);
      ship.progress += battleDt / 38 * (ship.slow > 0 ? 0.5 : 1) * (stormActive ? 0.8 : 1);
      if (!schedule || ctx.elapsed >= (schedule.find(unit => unit.marked)?.at ?? 0)) {
        ship.hp -= shipFire(objectiveShipPosition(ship, s.layout));
      }
      if (ship.hp <= 0) { const p = objectiveShipPosition(ship, s.layout); failObjective("کاروان اسکورت نابود شد!", p.x, p.y, "escort-lost"); }
      else if (ship.progress >= 1) { if (schedule) ctx.deliveredEscortHP = Math.ceil(10 * ship.hp / ship.maxHp); s.popups.push({ id: s.nextId++, x: 50, y: 30, text: "کاروان سالم به مقصد رسید", life: 2 }); ctx.escort = null; }
    }
    if (ctx.stranded) {
      const ship = ctx.stranded;
      ship.hp -= shipFire(objectiveShipPosition(ship, s.layout));
      if (ship.hp <= 0) { const p = objectiveShipPosition(ship, s.layout); failObjective("کشتی آسیب‌دیده غرق شد!", p.x, p.y, "rescue-lost"); }
    }
    // Enemy mining (مین‌گذاری دشمن): the mines appear on the TRADE lane —
    // the shipping channel is what the enemy mines (ops 10/19 narrative) —
    // never on top of the stranded ship. Boat towers sweep them; any of
    // our ships blundering into one sets it off. (Distinct from the player
    // mine branch, which is MECH-A's system.)
    if (ctx.condition === "مین‌گذاری دشمن") {
      ctx.mineClock -= battleDt;
      if (ctx.mineClock <= 0 && ctx.mines.length < 6) {
        ctx.mineClock = 6.5;
        const progress = 0.15 + ((s.nextId * 37) % 70) / 100;
        if (!ctx.stranded || Math.abs(progress - ctx.stranded.progress) > 0.06) ctx.mines.push({ id: s.nextId++, progress });
      }
    }
    if (ctx.mines.length) {
      for (const tower of s.towers) {
        if (tower.kind !== "boat") continue;
        ctx.sweep[tower.slot] = (ctx.sweep[tower.slot] ?? 0) - battleDt;
        if (ctx.sweep[tower.slot] > 0) continue;
        const slot = getSlots(s.layout)[tower.slot];
        if (!slot) continue;
        const mine = ctx.mines.find(m => distance(slot, enemyMinePosition(m, s.layout)) <= getRange(s, tower));
        if (mine) {
          ctx.mines = ctx.mines.filter(m => m.id !== mine.id);
          ctx.sweep[tower.slot] = 2;
          const pos = enemyMinePosition(mine, s.layout), mk = modelKindFor(tower.kind, tower.tier, tower.branch);
          s.shots.push({ slot: tower.slot, kind: tower.kind, modelKind: mk, targetId: mine.id, flightDur: 0.2, damage: 0, crit: false, interval: 0, x1: slot.x, y1: slot.y, x2: pos.x, y2: pos.y });
          s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: "مین خنثی شد", life: 1.2 });
        }
      }
      // Merchant-vs-mine detonation is handled in the traffic layer above
      // (merchants move even while this section is frozen — see there).
      const detonated = new Set<number>();
      if (ctx.escort) {
        const mine = ctx.mines.find(m => !detonated.has(m.id) && Math.abs(ctx.escort!.progress - m.progress) < 0.02);
        if (mine) {
          detonated.add(mine.id);
          ctx.escort.hp -= 130; ctx.escort.slow = 4;
          const pos = objectiveShipPosition(ctx.escort, s.layout);
          s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: "کاروان به مین برخورد کرد!", life: 1.8 });
          if (ctx.escort.hp <= 0) failObjective("کاروان اسکورت نابود شد!", pos.x, pos.y, "escort-lost");
        }
      }
      for (const hero of [s.hero, s.hero2]) {
        if (!hero) continue;
        const mine = ctx.mines.find(m => !detonated.has(m.id) && distance(hero, enemyMinePosition(m, s.layout)) < 3.5);
        if (mine) { detonated.add(mine.id); hero.slow = 3; const pos = enemyMinePosition(mine, s.layout); s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: "مین منفجر شد!", life: 1.4 }); }
      }
      if (detonated.size) ctx.mines = ctx.mines.filter(m => !detonated.has(m.id));
    }
  }
  // Each hero has a distinct attack cadence in addition to the catamaran's tower aura.
  const heroAttack = (hero: NonNullable<GameState["hero2"]>) => {
    hero.attackClock = (hero.attackClock ?? 0) + battleDt;
    const heroInterval = hero.active === 1 ? 15 : hero.active === 2 ? 4 : 3;
    if (hero.attackClock >= heroInterval) {
      const heroTargets = s.enemies.filter(e => e.hp > 0 && (e.hackTimer ?? 0) <= 0 && distance(hero, enemyPosition(e, s.layout)) < (hero.active === 1 ? 35 : 23) && (enemyTarget(e) !== "sub" || hero.active === 2 || canSeeSub(s, enemyPosition(e, s.layout))));
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
  for (const tower of combatTowers(s)) {
    const slot = getSlots(s.layout)[tower.slot];
    if (!slot) continue;
    if ((s.towerStuns?.[tower.slot] ?? 0) > 0) continue; // knocked out by Leviathan missiles
    // MECH-A: garrison/torpedo towers never fire from the base model —
    // their boats fire for themselves in boatFirePhase. The EMP branch
    // never fires shots — it pulses in empSonarPhase.
    if (tower.kind === "boat" && !(tower.tier === 4 && tower.branch === 1)) continue;
    if (tower.kind === "ew" && tower.tier === 4 && tower.branch === 0) continue;
    // MECH-A: the mine branch's shots are fired by its Ghadir hunter sub —
    // if the sub is not deployed, the branch holds fire.
    let ghadir: BoatUnit | undefined;
    if (tower.kind === "boat" && tower.tier === 4 && tower.branch === 1) {
      ghadir = s.boats.find(b => b.slot === tower.slot && b.role === "ghadir" && b.state === "active");
      if (!ghadir) continue;
    }
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
      const cands = towerCandidates(s, tower, ghadir ? boatPosition(ghadir, s.layout) : undefined); // target re-evaluated for every shot in the tick
      if (spec.airOnly) { // Bavar engages air only (MECH-B; checklist ۱٫۴)
        const air = cands.filter(e => enemyTarget(e) === "air");
        cands.length = 0; cands.push(...air);
      }
      if (ghadir) {
        // Ghadir hunts submarines first (MECH-A), then bosses, then the lead ship
        cands.sort((a, b) => Number(enemyTarget(b) === "sub") - Number(enemyTarget(a) === "sub") || Number(b.kind === "boss") - Number(a.kind === "boss") || b.progress - a.progress);
      }
      const target = cands[0];
      if (!target) { tower.focusId = undefined; tower.focusTime = 0; tower.cooldown = 0; break; } // no target: no cooldown debt accrues
      const targetPos = enemyPosition(target, s.layout);
      const origin = ghadir ? boatPosition(ghadir, s.layout) : slot;
      let mul = 1;
      if (s.overdrive > 0) mul *= 0.5; // overdrive = fire rate ×2 at zero ammo cost (مهم-۳۰)
      if ((distance(slot, s.hero) < 18 && s.hero.active === 0) || (s.hero2 && distance(slot, s.hero2) < 18 && s.hero2.active === 0)) mul /= 1.2; // catamaran aura = nearby fire rate ×1.2 (متوسط-۱۵)
      let interval = specInterval(spec) * mul;
      if (spec.salvoSize) {
        // MLRS salvo cycle (MECH-B; checklist ۱٫۲): rockets inside a salvo
        // leave at the salvo gap; after the last rocket the launcher
        // reloads for the full pause. salvoLeft on the tower is the cycle
        // state the renderer reads for the reload pose.
        const left = tower.salvoLeft ?? spec.salvoSize;
        interval = (left > 1 ? (spec.salvoGap ?? specInterval(spec)) : (spec.reloadTime ?? specInterval(spec))) * mul;
      }
      lastInterval = interval;
      const ammoCost = s.overdrive > 0 || tower === s.battle?.trainingLoan ? 0 : spec.ammoPerShot;
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
      if (spec.volleySize) {
        // Multi-lock volley (MECH-B; checklist ۱٫۳ Swarm, ۱٫۴ Bavar): one
        // cycle launches volleySize missiles, each locked on a different
        // target in priority order; extra missiles wrap onto the same
        // targets when fewer are in range. Ammo is charged once per
        // cycle (above). The first record carries the cycle interval —
        // the rest are volley members, not separate cadence events.
        bumpFireStat(s, spec.modelKind, "shots");
        const locks = cands.slice(0, spec.volleySize);
        if (!locks.length) { tower.cooldown = 0; break; } // every candidate left range mid-cycle: stop without charging cooldown
        for (let i = 0; i < spec.volleySize; i++) {
          const lock = locks[i % locks.length];
          const lockPos = enemyPosition(lock, s.layout);
          const crit = randomBattle(s) < spec.critChance;
          let damage = spec.damage * damageTech(s, tower) * stats.grid;
          if (crit) damage *= 2;
          const flightDur = flightTime(spec.modelKind, distance(slot, lockPos));
          s.pendingImpacts.push({ targetId: lock.id, eta: flightDur, damage, crit, slot: tower.slot, kind: tower.kind, modelKind: spec.modelKind, branch: tower.branch });
          s.shots.push({ slot: tower.slot, kind: tower.kind, modelKind: spec.modelKind, targetId: lock.id, flightDur, damage, crit, interval: i === 0 ? interval : 0, x1: slot.x, y1: slot.y, x2: lockPos.x, y2: lockPos.y });
        }
        tower.cooldown += interval; // one cycle = one interval (ROOT's charge; the volley's missiles share it)
        continue;
      }
      if (spec.salvoSize) {
        const left = tower.salvoLeft ?? spec.salvoSize;
        tower.salvoLeft = left <= 1 ? spec.salvoSize : left - 1;
      }
      const crit = randomBattle(s) < spec.critChance;
      let damage = spec.damage * damageTech(s, tower) * stats.grid;
      if (crit) damage *= 2;
      const flightDur = flightTime(spec.modelKind, distance(origin, targetPos));
      tower.cooldown += interval;
      bumpFireStat(s, spec.modelKind, "shots");
      s.pendingImpacts.push({ targetId: target.id, eta: flightDur, damage, crit, slot: tower.slot, kind: tower.kind, modelKind: spec.modelKind, branch: tower.branch, ...(ghadir ? { boatId: ghadir.id } : {}) });
      s.shots.push({ slot: tower.slot, kind: tower.kind, modelKind: spec.modelKind, targetId: target.id, flightDur, damage, crit, interval, x1: origin.x, y1: origin.y, x2: targetPos.x, y2: targetPos.y, ...(ghadir ? { boatId: ghadir.id } : {}) });
    }
  }
  // MECH-A: garrison/torpedo boats fire from their own positions (their
  //  impacts join the same resolution pass below).
  boatFirePhase(s, battleDt, stats);
  // MECH-A round 2: ASW return fire on the Ghadir hunter sub.
  ghadirCounterfirePhase(s, battleDt);
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
      const pos = enemyPosition(enemy, s.layout);
      s.events.push({ type: "ship-destroyed", enemyId: enemy.id, ...pos });
      if (enemy.noReward) continue; // a hacked drone's detonation pays no bounty
      if (enemy.isAdd) {
        // Boss reinforcements (MECH-B studio ruling; audit جدید-۱۶): 25% of
        // the class bounty and NO combo increment or combo bonus — a boss
        // kept alive on purpose stops being an infinite money pump.
        const cash = Math.round(bounty(s, enemy) * BOSS_ADD_BOUNTY_MULT);
        s.cash += cash; s.destroyed++;
        s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: `+${cash}`, life: 1.4 });
        continue;
      }
      const cash = bounty(s, enemy);
      s.combo = (s.comboTimer ?? 0) > 0 ? (s.combo ?? 0) + 1 : 1;
      s.comboTimer = 3.5;
      s.maxCombo = Math.max(s.maxCombo ?? 0, s.combo);
      const comboBonus = Math.min(120, (s.combo - 1) * 6);
      const total = schedule ? 0 : cash + comboBonus;
      s.cash += total; s.destroyed++;
      if (total > 0) s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: `+${total}`, life: 1.4 });
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
      const leakDamage = enemy.kind === "boss" ? 20 : enemy.kind === "destroyer" ? 3 : 1;
      s.hearts = Math.max(0, s.hearts - leakDamage);
      s.security = Math.max(0, s.security - 1);
      if (s.battle) {
        // D-024: remember which kind's leak zeroed the hearts — a boss
        // leak (instant 20) is a breakthrough, anything else is the line
        // collapsing one leak at a time.
        if (s.hearts <= 0 && !s.battle.fatalLeak) s.battle.fatalLeak = enemy.kind;
        // Air-defense (دفاع هوایی): leaking fliers count against the
        // threshold — more than 20% of the wave's air arm getting
        // through loses the operation, and at least TWO leaks are
        // always tolerated. D-024 tuning: the first air arm is only 6
        // strong, so the old max(1, …) floor made the second leak an
        // instant loss at 18/20 hearts before any dedicated AA was
        // affordable (audit-2 C1); for air arms of 15+ the 20% rule is
        // unchanged.
        if (enemy.openingMarked) s.battle.markedEscaped = (s.battle.markedEscaped ?? 0) + 1;
        if (enemy.kind === "air") {
          s.battle.airLeaked++;
          if (!schedule && s.battle.objective === "airdef" && s.battle.airLeaked > Math.max(2, Math.floor(s.battle.airTotal * 0.2))) { s.battle.failed = true; s.battle.failReason = "air-leak"; }
        }
        // Structure defense (دفاع از سکو / بندر هنگام بارگیری): every leak
        // also pounds the platform / the berthed tanker (30 HP per heart
        // of leak); its destruction loses the operation outright.
        if (s.battle.objective === "structure" && s.battle.structureMaxHp > 0) {
          s.battle.structureHp -= leakDamage * 30;
          if (s.battle.structureHp <= 0) { s.battle.failed = true; s.battle.failReason = "structure-lost"; }
        }
      }
    }
  }
  s.enemies = s.enemies.filter(e => e.hp > 0 && e.progress < 1);
  if (schedule && s.battle?.objective === "airdef") {
    const quota = openingMarkedQuota(s);
    if (quota && 100 * (quota.total - quota.escaped) < quota.requiredPercent * quota.total) {
      s.battle.failed = true; s.battle.failReason = "marked-quota";
    }
  }
  if (s.battle?.failed) { objectiveDefeat(s); return; }
  if (s.hearts <= 0) {
    s.idle.lastBattle = { id:`battle-${s.nextId++}`, wave:s.wave, title:operationInfo(s.wave, s.mode).title, victory:false, stars:0, cash:0, xp:0, chests:0, destroyed:s.destroyed-s.idle.waveStartKills, seconds:s.elapsed-s.idle.waveStartedAt, hearts:0, claimed:false, reason: s.battle?.fatalLeak === "boss" ? "boss-breakthrough" : "line-broken" };
    settleOpeningBattle(s,s.idle.lastBattle);
    s.idle.revision++; s.phase = "defeat"; s.enemies = []; s.spawnRemaining = 0; s.pendingImpacts = []; s.enemyMissiles = []; return;
  }
  if (s.spawnRemaining === 0 && s.enemies.every(e => (e.hackTimer ?? 0) > 0) && !s.battle?.escort) {
    // Studio ruling (QA round-2 متوسط-۳): hacked units are the player's
    // own assets at cleanup — they are silently recalled with the wave
    // (no leak, no bounty, no waiting out the hack timer while the wave
    // hangs open, and no post-"cleanup" leak when the hack expires).
    s.enemies = [];
    s.pendingImpacts = []; // battle over (QA جزئی-۱): no orphan in-flight records freeze into the intermission
    s.enemyMissiles = []; // enemy projectiles die with the battle too (MECH-B)
    const info = operationInfo(s.wave, s.mode);
    let stars = s.hearts >= 19 ? 3 : s.hearts >= 14 ? 2 : 1;
    // Structure defense: the platform/tanker's remaining HP caps the
    // stars — a saved-at-10% platform is not a flawless defense. (SCEN)
    if (s.battle?.objective === "structure" && s.battle.structureMaxHp > 0) {
      const ratio = s.battle.structureHp / s.battle.structureMaxHp;
      stars = Math.min(stars, ratio >= 0.8 ? 3 : ratio >= 0.5 ? 2 : 1);
    }
    if (s.battle) s.battle.mines = []; // the minefield dies with the battle

    const priorStars = s.idle.stars[String(s.wave)] ?? 0;
    if (s.mode === "campaign") s.idle.stars[String(s.wave)] = Math.max(priorStars, stars);
    s.idle.modeBest[s.mode] = Math.max(s.idle.modeBest[s.mode], s.wave);
    const perfect = !s.waveLeaked;
    const perfectBonus = perfect ? 1.25 : 1;
    s.idle.lastBattle = { id:`battle-${s.nextId++}`, wave:s.wave, title:info.title, victory:true, stars, cash:Math.round(info.cash*(s.earlyBonus?1.25:1)*(1+stars*.08)*perfectBonus*(s.mode==="challenge"&&s.challengeRule===1?1.5:1)), xp:Math.round((info.xp+stars*20+(perfect?40:0))*(s.mode==="challenge"&&s.challengeRule===2?1.5:1)), chests:s.wave%5===0?2:s.wave===1||s.mode==="challenge"?1:0, destroyed:s.destroyed-s.idle.waveStartKills, seconds:s.elapsed-s.idle.waveStartedAt, hearts:s.hearts, claimed:false };
    settleOpeningBattle(s,s.idle.lastBattle);
    if (schedule) s.idle.stars[String(s.wave)] = Math.max(s.idle.lastBattle.stars, priorStars);
    s.idle.revision++;
    if (s.mode === "campaign") s.highestWave = Math.max(s.highestWave, s.wave);
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
    opening: state.opening ? {...state.opening, ledger:{...state.opening.ledger}, carry:{...state.opening.carry}, events:state.opening.events.slice()} : undefined,
    idle: {
      ...idle,
      port: idle.port ? { ...idle.port, tanker: idle.port.tanker ? { ...idle.port.tanker } : null } : idle.port,
      contract: idle.contract ? { ...idle.contract } : null,
      stars: { ...idle.stars },
      modeBest: { ...idle.modeBest },
      managerLevels: { ...idle.managerLevels },
    },
    buildings: { ...state.buildings },
    towers: state.towers.map(t => ({ ...t, interceptCharges: t.interceptCharges?.slice() })),
    enemies: state.enemies.map(e => ({ ...e })),
    boats: (state.boats ?? []).map(b => ({ ...b })),
    mines: (state.mines ?? []).map(m => ({ ...m })),
    pirates: state.pirates.map(p => ({ ...p })),
    vipShip: state.vipShip ? { ...state.vipShip } : null,
    contraband: state.contraband.map(c => ({ ...c })),
    merchants: state.merchants.map(m => ({ ...m })),
    popups: state.popups.slice(),
    cooldowns: { ...state.cooldowns },
    hero: { ...state.hero, route: state.hero.route?.slice() },
    hero2: state.hero2 ? { ...state.hero2, route: state.hero2.route?.slice() } : null,
    towerStuns: { ...state.towerStuns },
    pendingImpacts: state.pendingImpacts.map(p => ({ ...p })),
    enemyMissiles: (state.enemyMissiles ?? []).map(m => ({ ...m })),
    battle: state.battle ? {
      ...state.battle,
      trainingLoan: state.battle.trainingLoan ? {...state.battle.trainingLoan} : undefined,
      queue: state.battle.queue.slice(),
      mines: state.battle.mines.slice(),
      escort: state.battle.escort ? { ...state.battle.escort } : null,
      stranded: state.battle.stranded ? { ...state.battle.stranded } : null,
      sweep: { ...state.battle.sweep },
    } : null,
    fireStats,
    // shared by reference — tick never writes these: research, cards,
    // islands, layout; shots is reassigned (s.shots = []) before any push.
  };
}

export function gameReducer(state: GameState, action: Action | {type:"advance";steps:number;battlePaused:boolean;openingElapsed?:number}): GameState {
  if (action.type === "hydrate") return action.game;
  if (action.type === "reset") { const fresh = freshPortGame(); fresh.layout = state.layout; fresh.idle.appliedDailyIds = state.idle.appliedDailyIds; fresh.idle.revision = state.idle.revision + 1; return fresh; }
  if (action.type === "advance") {
    const steps=Math.max(0,Math.min(4,Math.floor(action.steps)));
    if(steps===0 && state.opening && action.openingElapsed && action.openingElapsed>0) {
      const next=cloneForTick(state);
      advanceReopening(next,action.openingElapsed,openingDependencies);
      return next;
    }
    let next = state;
    const shots: GameState['shots'] = [], events: GameState['events'] = [];
    for (let i = 0; i < steps; i++) {
      next = gameReducer(next, {type:"tick",dt:0.125,battlePaused:action.battlePaused,openingElapsed:action.openingElapsed===undefined?undefined:action.openingElapsed/steps});
      shots.push(...next.shots); events.push(...next.events);
    }
    return {...next, shots, events};
  }
  if (action.type === "tick") {
    if (!Number.isFinite(action.dt) || action.dt <= 0) return state;
    const s = cloneForTick(state);
    tick(s, action.dt, action.battlePaused, action.openingElapsed);
    if (s.phase !== "battle") s.speed = 1;
    return s;
  }
  const s = structuredClone(state);
  // Shot records are one-render FX events: a non-tick action must not let
  // gamesync replay the previous tick's shots (and double-count telemetry).
  s.shots = [];
  s.events = []; // same one-tick lifecycle for battle events (MECH-B)
  switch (action.type) {
    case "layout": if (s.layout !== action.layout) { s.layout = action.layout; const point = nearestWater(s.hero, action.layout); s.hero.x = point.x; s.hero.y = point.y; s.hero.route = undefined; s.hero.routeIndex = undefined; } break;
    case "split": if (Number.isFinite(action.value)) s.oilSplit = Math.max(0, Math.min(100, action.value)); break;
    case "upgrade-building": {
      const quote = buildingUpgradeQuote(s, action.id, action.quantity ?? 1), oldLevel = s.buildings[action.id];
      if (!quote.affordable || (action.expectedLevel!==undefined && oldLevel!==action.expectedLevel)) break;
      if(s.opening) {
        if(action.id==="tank") openingTankOrder(s,quote.cost,openingCapacity(s),action.guided===true);
        else s.opening.ledger.spent+=quote.cost;
      }
      s.cash -= quote.cost; s.buildings[action.id] = quote.nextLevel; s.idle.upgradeCount += quote.levels; s.idle.xp += quote.levels * 8;
      for (const milestone of [10,25,50,100]) if (oldLevel < milestone && quote.nextLevel >= milestone && !s.idle.claimedMilestones.includes(`${action.id}-${milestone}`)) {
        s.idle.claimedMilestones.push(`${action.id}-${milestone}`);
        grantReward(s, { id:`milestone-${action.id}-${milestone}`, type:"milestone", title:`${BUILDINGS[action.id].short} متحول شد!`, subtitle:`سطح ${milestone}؛ یک جهش در قدرت تولید.`, cash:BUILDINGS[action.id].baseCost*3, xp:milestone*5, chests:1, boosts:1 });
      }
      break;
    }
    case "opening-help":
      if(s.opening && s.opening.helpRequestedAt===null) {s.opening.helpRequestedAt=openingInputTime(s.opening);portEvent(s.opening,"help",undefined,undefined,s.opening.helpRequestedAt);}
      break;
    case "opening-inspect-tank":
      if(s.opening?.stalled && s.opening.inspectedEpisode!==s.opening.stallEpisode) {
        s.opening.inspectedEpisode=s.opening.stallEpisode;portEvent(s.opening,"inspect_tank",undefined,undefined,openingInputTime(s.opening));
      }
      break;
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
    case "repair-opening-dock":
      if (!requestOpeningRepair(s,action.receipt,action.method,action.allowCollection)) return state;
      break;
    case "claim-battle": {
      const report=s.idle.lastBattle;if(!report||report.claimed)break;
      report.claimed=true;
      grantReward(s,{id:report.id,type:"mission",title:report.title,subtitle:"غنائم عملیات",cash:report.openingReceipt ? 0 : report.cash,xp:report.xp,chests:report.chests},false);
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
      if(s.opening) {
        const from=Math.max(action.now-action.seconds*1000,s.opening.offlineHigh);
        settleReopeningAbsence(s,from,action.now,openingDependencies);
        if(action.now>from) advanceOfflineTimers(s,(action.now-from)/1000);
        s.lastSavedAt=Math.max(s.lastSavedAt,action.now);
        break;
      }
      const reward=getOfflineReward({...s,lastSavedAt:action.now-Math.max(0,action.seconds)*1000},action.now);
      // Timers advance on any real absence, independent of the cash reward.
      if(reward.seconds>0)advanceOfflineTimers(s,reward.seconds);
      if(reward.amount>0){s.idle.offline={cash:(s.idle.offline?.cash??0)+reward.amount,seconds:reward.seconds,defense:reward.ratio};}
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
        const tower: Tower = { slot: action.slot, kind: action.kind, tier: 1, branch: null, priority: "first" };
        s.towers.push(tower);
        if (s.battle?.trainingLoan && playableInFirstWave(s,tower)) delete s.battle.trainingLoan;
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
      if (tower) { const refund = towerSellRefund(s, tower); s.cash += refund.cash; s.steel = Math.min(2000, s.steel + refund.steel); s.towers = s.towers.filter(t => t.slot !== action.slot); }
      // MECH-A entities retire with their tower in EVERY phase (QA
      // round-2 جزئی-۳): cleanup used to wait for the next battle tick,
      // leaving ghost boats/mines rendered through peacetime.
      s.boats = s.boats.filter(b => b.slot !== action.slot);
      s.mines = s.mines.filter(m => m.slot !== action.slot);
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
    case "speed": if (s.phase !== "battle") return state; s.speed = (s.speed === 1 ? 2 : s.speed === 2 ? 3 : 1); break;
    case "start": {
      const first=s.opening && s.mode==="campaign" && s.wave===1 && s.opening.manualWaveAt===null;
      if(first && (action.source!=="player" || !openingWaveAvailable(s))) break;
      const previous=s.phase;
      startWave(s,!!action.early);
      if(first && previous!=="battle" && s.phase==="battle" && s.opening) {
        s.opening.manualWaveAt=openingInputTime(s.opening);portEvent(s.opening,"wave_manual",undefined,undefined,s.opening.manualWaveAt);
      }
      break;
    }
    case "select-operation": {
      if (s.phase === "battle" || (s.idle.lastBattle && !s.idle.lastBattle.claimed)) break;
      if(!Number.isInteger(action.wave)||action.wave<1||action.wave>Math.min(25,s.highestWave+1))break;
      s.mode="campaign";s.wave=action.wave;s.hearts=20;s.phase="peace";s.enemies=[];s.enemyMissiles=[];s.battle=null;s.spawnRemaining=0;s.idle.lastBattle=null;break;
    }
    case "mode": if (s.phase === "battle" || (s.idle.lastBattle && !s.idle.lastBattle.claimed)) break; s.mode = action.mode; s.wave = action.mode === "campaign" ? Math.min(25,s.highestWave+1) : 1; s.hearts = 20; s.phase = "peace"; s.enemies = []; s.enemyMissiles = []; s.battle = null; s.spawnRemaining = 0; s.idle.lastBattle=null; break;
    case "spell": {
      if (s.cooldowns[action.spell] > 0 || s.phase !== "battle") break;
      if (action.spell === "strike") {
        if (action.x === undefined || action.y === undefined) break;
        // Spell damage goes through the single damage path (QA-ROOT: the flat
        // hp cut bypassed the Titan's shield cycle and every other defense).
        // A hacked drone fights for the player (MECH-A QA round-2 متوسط-۲):
        // the player's own spells must not hit it — every other damage path
        // already exempts hackTimer > 0, and killing it paid a bounty.
        for (const e of s.enemies) if ((e.hackTimer ?? 0) <= 0 && distance(enemyPosition(e, s.layout), { x: action.x, y: action.y }) < 17) applyDamage(s, e, 450, { kind: "spell" });
        s.popups.push({ id: s.nextId++, x: action.x, y: action.y, text: "💥", life: 1.2 }); s.cooldowns.strike = 60;
      } else if (action.spell === "emp") {
        for (const e of s.enemies) { if ((e.hackTimer ?? 0) > 0) continue; e.stun = 6; applyDamage(s, e, 35, { kind: "spell" }); } s.cooldowns.emp = 90;
      } else { s.overdrive = 10; s.cooldowns.overdrive = 120; }
      break;
    }
    case "hero": { const route = findWaterRoute(s.hero, { x: action.x, y: action.y }, s.layout); s.hero.x = route[0].x; s.hero.y = route[0].y; s.hero.route = route; s.hero.routeIndex = 1; break; }
    case "hero2": { if (s.hero2) { const route = findWaterRoute(s.hero2, { x: action.x, y: action.y }, s.layout); s.hero2.x = route[0].x; s.hero2.y = route[0].y; s.hero2.route = route; s.hero2.routeIndex = 1; } break; }
    case "hero2-select": { if (s.hero2 && s.phase !== "battle" && action.hero !== s.hero.active) s.hero2.active = action.hero; break; }
    case "deploy-hero2": { if (!s.hero2 && s.highestWave >= 5 && s.cash >= 3000 && action.hero !== s.hero.active) { s.cash -= 3000; s.hero2 = { ...sampleLane(getLane(s.layout, "enemy"), .3), active: action.hero }; } break; }
    case "recall-hero2": { s.hero2 = null; break; }
    case "hero-select": if (s.phase !== "battle" && s.hero2?.active !== action.hero) s.hero.active = action.hero; break;
    case "unlock": {
      const island = ISLANDS.find(i => i.id === action.island);
      if (!island) break;
      const cost = island.cost;
      if (!s.islands.includes(action.island) && s.cash >= cost) { s.cash -= cost; s.islands.push(action.island); }
      break;
    }
    case "build-platform": {
      const built = s.idle.platforms ?? (s.idle.platforms = []);
      const cost = platformCost(built.length);
      if (!built.includes(action.id) && s.islands.includes(PLATFORM_ISLANDS[action.id] ?? "") && s.cash >= cost) { s.cash -= cost; built.push(action.id); }
      break;
    }
    case "open-chest": {
      if (s.chests > 0 && !s.idle.rewards.some(r=>r.type === "chest")) { const reward=previewChest(s);s.chests--;s.idle.openedChests++;s.idle.lootSeed=advanceLootSeed(s.idle.lootSeed);grantReward(s,reward); }
      break;
    }
    case "inspect": {
      // R5: the reveal gate is enforced by the reducer itself, not only
      // by the UI hiding the button — without the optical outpost the
      // action is rejected, so a contraband ship smuggled in by a stale
      // or tampered save grants nothing.
      if ((s.buildings.optical ?? 0) < 1) break;
      const ship = s.contraband.find(item => item.id === action.id);
      // R5 stage two: smart-customs research raises the inspection reward
      // (the optical outpost alone already allows the inspection).
      if (ship) { const pos = contrabandPosition(ship, s.layout); const rewardSteel = s.research.includes("smart") ? 75 : 50; s.steel = Math.min(2000, s.steel + rewardSteel); s.contraband = s.contraband.filter(item => item.id !== action.id); s.popups.push({ id: s.nextId++, x: pos.x, y: pos.y, text: `+${rewardSteel} فولاد`, life: 1.4 }); }
      break;
    }
    case "upgrade-card": if (s.cards[action.kind].count >= 3) { s.cards[action.kind].count -= 3; s.cards[action.kind].level++; } break;
    case "resolve-event": {
      if (s.event === "spill" && s.cash >= 300) { s.cash -= 300; s.security = Math.min(100, s.security + 2); s.event = null; s.eventClock = 0; }
      else if (s.event === "vip") { /* R6: no instant resolve — the escort outcome (crossing or destruction) settles the VIP event. */ }
      else if (s.event === "storm") { s.event = null; s.eventClock = 0; }
      break;
    }
    case "night": s.manualNight = !s.manualNight; break;
    case "prestige": {
      if (s.phase !== "battle" && !(s.idle.lastBattle && !s.idle.lastBattle.claimed) && s.cash >= 100000 && s.highestWave >= 10) {
        const fresh=initialGame();s.cash=fresh.cash;s.oil=fresh.oil;s.fuel=fresh.fuel;s.steel=fresh.steel;s.ammo=fresh.ammo;s.buildings=fresh.buildings;s.idle.platforms=[];s.idle.port=fresh.idle.port;s.prestige++;s.phase="peace";s.wave=1;s.hearts=20;s.enemies=[];s.spawnRemaining=0;s.battle=null;
        s.lowFuelTime=0;s.lowGridTime=0;s.lowFuelStart=-1;s.warnings={fuel:false,power:false}; // D-024: warning history restarts with the economy
        // R7: prestige resets planted towers (research, cards, managers,
        // islands and heroes are kept) — and the harbor bank restarts at
        // 0, NOT the 260 gift that only a brand-new game receives.
        s.towers=[];s.pendingImpacts=[];s.towerStuns={};
        s.boats=[];s.mines=[];s.enemyMissiles=[];s.pirates=[];s.vipShip=null;s.event=null;s.eventClock=0;
        s.idle.bank=0;s.idle.collected=0;s.idle.collections=0;s.idle.claimedMissions=[];s.idle.claimedMilestones=[];s.idle.lastBattle=null;s.idle.contract=null;s.idle.offline=null;s.idle.rewards=[];
        // The rolling export window restarts at prestige too: the new
        // run's bank capacity and offline income build on fresh exports.
        s.idle.exportWindowDollars=0;s.idle.exportWindowTime=0;
        grantReward(s,{id:`prestige-${s.prestige}`,type:"milestone",title:"فصل تازهٔ توسعه آغاز شد",subtitle:"تولید و قدرت برجک‌ها برای همیشه ۱۰٪ بیشتر شد. مدیرها، کارت‌ها و جزایر شما حفظ شدند.",cash:0,xp:200,chests:2,boosts:2});
      }
      break;
    }
  }
  s.idle.revision++; // tick returned early above; every other action bumps revision
  return s;
}
