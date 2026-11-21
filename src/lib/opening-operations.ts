import { openingCollect, openingInputTime } from "./opening-industry";
import campaign from "../data/reopening/campaign.json";
import economy from "../data/reopening/economy.json";
import type { GameState, Tower } from "./game";
import type { BattleReport } from "./progression";

const operations = campaign.operations.slice(0, 3);
const schedules = operations.map(op => op.groups.flatMap(group =>
  Array.from({length:group.count}, (_, i) => ({at:group.start_s + i * group.spacing_s, marked:group.objective_live}))
));

export function operationForOpening(s: GameState, wave = s.wave, mode = s.mode) {
  return s.opening && mode === "campaign" ? operations[wave - 1] ?? null : null;
}

export function openingSchedule(s: GameState) {
  return operationForOpening(s) ? schedules[s.wave - 1] : undefined;
}

export interface OpeningOperations {
  lastSettled: number;
  firstTerminal: number[];
  cleared: number[];
  dockDamage: number;
  damageAttempt: number;
  serviceDue: number | null;
}

export interface OpeningBattleReceipt {
  attempt: number;
  damage: number;
  firstClear: boolean;
}

function count(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
}

export function restoreOpeningOperations(raw: Partial<OpeningOperations> | null | undefined): OpeningOperations {
  const stages = (values: unknown) => Array.isArray(values)
    ? operations.map(op => op.op).filter(op => values.includes(op)) : [];
  const dockDamage = count(raw?.dockDamage, economy.repair.points_cap_per_facility);
  return {
    lastSettled:count(raw?.lastSettled), firstTerminal:stages(raw?.firstTerminal),
    cleared:stages(raw?.cleared), dockDamage, damageAttempt:count(raw?.damageAttempt),
    serviceDue:dockDamage && typeof raw?.serviceDue === "number" && Number.isFinite(raw.serviceDue) ? Math.max(0,raw.serviceDue) : null,
  };
}

export function openingDockEfficiency(s: GameState) {
  return economy.repair.efficiency_by_points[s.openingOperations?.dockDamage ?? 0];
}

export function openingMarkedQuota(s: GameState) {
  const op = operationForOpening(s);
  if (!op || op.quota_min_pct === null || !s.battle) return null;
  const schedule = schedules[op.op - 1];
  const total = schedule.filter(unit => unit.marked).length;
  const escaped = s.battle.markedEscaped ?? 0;
  const arrived = schedule.slice(0, s.spawnIndex).filter(unit => unit.marked).length;
  const live = s.enemies.filter(enemy => enemy.openingMarked && enemy.hp > 0 && enemy.progress < 1).length;
  return {total, escaped, intercepted:Math.max(0, arrived - live - escaped), requiredPercent:op.quota_min_pct};
}

export function combatTowers(s: GameState): Tower[] {
  const loan = s.phase === "battle" && s.battle?.trainingLoan;
  return loan ? [...s.towers.filter(t => t.slot !== loan.slot),loan] : s.towers;
}

export function openingWinCredit(wave: number, firstClear: boolean) {
  const rates = economy.operation_rewards;
  const band = rates.first_clear_ranges.find(row => row.from <= wave && wave <= row.to)!;
  return firstClear
    ? band.base + band.per_index * wave + band.per_chapter * Math.ceil(wave / rates.chapter_span)
    : rates.repeat_clear_base + rates.repeat_clear_per_index * wave;
}

export function settleOpeningBattle(s: GameState, report: BattleReport) {
  const op = operationForOpening(s), battle = s.battle;
  if (!op || !battle?.openingAttempt) return;
  const account = s.openingOperations ?? restoreOpeningOperations(null);
  if (account.lastSettled >= battle.openingAttempt) return;
  const firstClear = report.victory && !account.cleared.includes(op.op);
  const objectiveHP = battle.escort ? Math.ceil(10 * battle.escort.hp / battle.escort.maxHp) : battle.deliveredEscortHP;
  const severe = report.hearts < 10 || (objectiveHP !== undefined && objectiveHP < 4);
  const light = report.hearts < 17 || (objectiveHP !== undefined && op.objective_initial !== null && 3 * objectiveHP < 2 * op.objective_initial);
  const severity = !report.victory || severe ? campaign.work_order.failure_points : light ? 1 : 0;
  const damage = op.op < campaign.work_order.no_damage_before_op || account.firstTerminal.includes(op.op)
    ? 0 : Math.min(severity, economy.repair.points_cap_per_facility - account.dockDamage);
  report.cash = report.victory ? openingWinCredit(op.op, firstClear) : economy.operation_rewards.on_failure;
  delete battle.trainingLoan;
  report.openingReceipt = {attempt:battle.openingAttempt, firstClear, damage};
  report.title = op.title_fa;
  report.seconds = battle.elapsed;
  if (report.victory && objectiveHP !== undefined && op.objective_initial && 2 * objectiveHP < op.objective_initial) {
    report.stars = Math.min(campaign.result_stars.cap_if_objective_below_half_start, report.stars);
  }
  s.cash += report.cash;
  s.openingOperations = {
    ...account, lastSettled:battle.openingAttempt,
    firstTerminal:account.firstTerminal.includes(op.op) ? account.firstTerminal : [...account.firstTerminal, op.op],
    cleared:firstClear ? [...account.cleared, op.op] : account.cleared,
    damageAttempt:damage > 0 ? battle.openingAttempt : account.damageAttempt,
    dockDamage:account.dockDamage + damage,
  };
}

export function openingRepairCost(dockLevel: number) {
  const level = Math.min(10, dockLevel) - 1;
  return {cash:24 + 4 * level, steel:4 + level};
}

export function openingRepairQuote(s: GameState) {
  const account = s.openingOperations;
  if (!s.opening || !account?.dockDamage) return null;
  const {cash, steel} = openingRepairCost(s.buildings.dock);
  const fromBank = s.cash < cash;
  const affordable = s.steel >= steel && s.cash + Math.floor(s.idle.bank) >= cash;
  return {cash,steel,fromBank,affordable,remaining:account.dockDamage,
    key:`dock:${account.damageAttempt}:${account.dockDamage}`, serviceDue:account.serviceDue,
    serviceDuration:economy.recovery.work_order_cost_wall_active_seconds};
}

export function requestOpeningRepair(s: GameState, receipt: string, method: "paid" | "service", allowCollection: boolean) {
  const quote = openingRepairQuote(s);
  if (!s.opening || !quote || !s.openingOperations || quote.key !== receipt || quote.serviceDue !== null) return false;
  if (method === "service") {
    if (quote.affordable) return false;
    s.openingOperations = {...s.openingOperations,serviceDue:openingInputTime(s.opening) + quote.serviceDuration};
    return true;
  }
  if (!quote.affordable || (quote.fromBank && !allowCollection)) return false;
  payOpeningRepair(s, quote);
  return true;
}

function payOpeningRepair(s: GameState, quote: NonNullable<ReturnType<typeof openingRepairQuote>>) {
  if (quote.fromBank) openingCollect(s, true);
  // The service covers only the selected point’s missing amounts. No surplus enters stock.
  if (s.opening) s.opening.ledger.spent += Math.min(s.cash, quote.cash);
  s.cash = Math.max(0, s.cash - quote.cash);
  s.steel = Math.max(0, s.steel - quote.steel);
  s.openingOperations = {...s.openingOperations!, dockDamage:quote.remaining - 1,serviceDue:null};
}

export function applyOpeningServiceIfDue(s: GameState) {
  if (!s.opening || s.openingOperations?.serviceDue == null || openingInputTime(s.opening) < s.openingOperations.serviceDue) return;
  const quote = openingRepairQuote(s);
  if (quote) payOpeningRepair(s, quote);
}
