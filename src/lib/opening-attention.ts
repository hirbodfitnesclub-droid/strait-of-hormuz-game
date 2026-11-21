import rules from "../data/reopening/attention.json";

export type OpeningFocus = "tank" | "treasury_to_tank" | "treasury" | "wave" | "battle_ability";
export const openingAttentionRules = rules;
export function canOfferOpeningWave(opening: { activeSeconds: number; firstTollAt: number | null; manualWaveAt: number | null } | null | undefined) {
  return !opening || opening.manualWaveAt !== null || (opening.activeSeconds >= rules.minimum_active_s_wave_1 && opening.firstTollAt !== null);
}

export interface AttentionScene {
  activeSeconds: number;
  firstTollAt: number | null;
  manualWaveAt: number | null;
  stalled: boolean;
  mastery: boolean;
  collectedFirstToll: boolean;
  cash: number;
  bank: number;
  bankCapacity: number;
  upgradeCost: number | null;
  battle: boolean;
  abilityReady: boolean;
}
export function openingFocus(s: AttentionScene): OpeningFocus | null {
  if (s.battle) return s.abilityReady ? "battle_ability" : null;
  const wave = canOfferOpeningWave(s) && s.manualWaveAt === null ? "wave" : null;
  const available = Math.floor(s.bank);
  if (s.stalled) {
    if (s.mastery) return null;
    if (s.upgradeCost !== null) {
      if (s.cash >= s.upgradeCost) return "tank";
      if (available > 0 && s.cash + available >= s.upgradeCost) return "treasury_to_tank";
    }
    return wave;
  }
  const firstDue = s.firstTollAt !== null && !s.collectedFirstToll;
  const fullBank = s.bankCapacity > 0 && s.bank / s.bankCapacity >= rules.treasury_threshold_fraction;
  return available > 0 && (firstDue || fullBank) ? "treasury" : wave;
}

export interface HintMemory {
  episode: string;
  focus: OpeningFocus | null;
  since: number;
  dismissed: OpeningFocus[];
}
export function emptyHintMemory(): HintMemory {
  return {episode:"", focus:null, since:0, dismissed:[]};
}
export function visitHint(memory: HintMemory, episode: string, focus: OpeningFocus | null, now: number): HintMemory {
  if (memory.episode !== episode) {
    return {episode, focus, since:now, dismissed:[]};
  }
  return memory.focus === focus && memory.since <= now ? memory : {...memory, focus, since:now};
}
export function visibleHint(memory: HintMemory, now: number) {
  const age = now - memory.since;
  const period = rules.hint_window_s + rules.hint_cooldown_s;
  return age >= 0 && age % period < rules.hint_window_s && memory.focus && !memory.dismissed.includes(memory.focus) ? memory.focus : null;
}
export function dismissHint(memory: HintMemory) {
  return memory.focus && !memory.dismissed.includes(memory.focus)
    ? {...memory, dismissed:[...memory.dismissed, memory.focus]} : memory;
}

/** Samples monotonic foreground time. Catch-up throttling for combat frames must not erase player decision time. */
export class ForegroundSeconds {
  private active = false;
  private previous = 0;
  private accumulated = 0;
  setActive(next: boolean, now: number) {
    if (this.active) this.accumulated += Math.max(0, now - this.previous) / 1000;
    this.previous = now;
    this.active = next;
  }
  take(now: number) {
    this.setActive(this.active, now);
    const elapsed = this.accumulated;
    this.accumulated = 0;
    return elapsed;
  }
}
