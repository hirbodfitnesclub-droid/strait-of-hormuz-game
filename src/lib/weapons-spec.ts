/* Canonical weapon specification — the single source of truth for tower combat
 * numbers (fix program, ruling R1; audit بحرانی-۲ / مهم-۲: three conflicting
 * numeric sources collapsed into this one file).
 *
 * Values come from the owner's model-pack design data
 * (~/workspace/owner-models/src/data/towers.ts): per-shot damage, fire rate,
 * ammo per shot and power draw (MW) for all 18 towers (6 families × tiers 1-3,
 * plus the 12 tier-4 branches). Ranges are NOT here — they stay at the game's
 * current percent-unit values in game.ts (TOWERS / getRange).
 *
 * Pack inconsistencies, resolved per R1:
 * - The pack's `dps` column is derived, not canonical, and is internally
 *   inconsistent for the special branches (it silently bakes in multi-target /
 *   ability effects). It is ignored everywhere; real DPS = damage × fireRate
 *   (e.g. CIWS = 9 × 14 = 126, not the printed 612).
 * - Laser: the pack's damage 90 is its BASE DPS (continuous beam), not a
 *   per-shot value; its printed fireRate 2.0 is not a shot rate. mode: "beam".
 * - Garrison: damage/fireRate are PER BOAT and 3 boats fire from tier 1
 *   (3 × 15 × 1.5 = 67.5 ≈ the pack's printed 68 DPS). Torpedo squadron:
 *   5 boats (5 × 120 × 0.9 = 540 = printed DPS).
 * - MLRS: the pack's ammoPerShot 12 is per 12-rocket salvo cycle → 1 per
 *   rocket (salvoSize records the cycle; the real salvo + reload pause is
 *   Wave-1 MECH-B work — ROOT fires rockets singly at the pack fire rate).
 * - Hypersonic: permanent crit (checklist ۱٫۳) → critChance 1, crit = ×2.
 *
 * Crit chances are the checklist §۰٫۱۰ ladder: tiers 1-2 = 8%, tier 3 = 12%,
 * tier 4 = 16%, rolled per shot; a crit doubles that shot's damage.
 */
import type { TowerKind } from "./game";

export type ModelKind =
  | "autocannon" | "ciws" | "railgun"
  | "howitzer" | "mlrs" | "thermobaric"
  | "silo" | "hypersonic" | "swarm"
  | "aadefense" | "bavar" | "laser"
  | "ew" | "emp" | "sonar"
  | "garrison" | "torpedo" | "mine";

export interface WeaponSpec {
  modelKind: ModelKind;
  kind: TowerKind;
  tier: number;            // 1..4
  branch: number | null;   // null for tiers 1-3; 0/1 for tier 4
  damage: number;          // per shot (laser: base DPS — see mode)
  fireRate: number;        // shots per second, per firing unit (laser: 0, unused)
  ammoPerShot: number;     // shared-stock cost of one shot (MLRS: per rocket)
  powerMW: number;
  critChance: number;      // per shot, 0..1; crit multiplies damage by 2
  units: number;           // independent firing units (garrison 3, torpedo 5, else 1)
  mode: "shot" | "beam";   // beam = continuous hitscan, no projectile (laser only)
  salvoSize?: number;      // MLRS rockets per cycle (12) — for MECH-B's salvo
}

const critFor = (tier: number) => (tier >= 4 ? 0.16 : tier === 3 ? 0.12 : 0.08);

function entry(kind: TowerKind, modelKind: ModelKind, tier: number, branch: number | null,
  damage: number, fireRate: number, ammoPerShot: number, powerMW: number,
  extra: Partial<WeaponSpec> = {}): WeaponSpec {
  return {
    modelKind, kind, tier, branch, damage, fireRate, ammoPerShot, powerMW,
    critChance: critFor(tier), units: 1, mode: "shot", ...extra,
  };
}

export const WEAPON_SPECS: WeaponSpec[] = [
  // — توپخانه سریع / autocannon family —
  entry("cannon", "autocannon", 1, null, 12, 4.0, 1, 5),
  entry("cannon", "autocannon", 2, null, 22, 4.4, 1, 8),
  entry("cannon", "autocannon", 3, null, 39, 5.0, 2, 14),
  entry("cannon", "ciws", 4, 0, 9, 14.0, 2, 30),
  entry("cannon", "railgun", 4, 1, 340, 0.55, 4, 55),
  // — توپخانه سنگین / howitzer family —
  entry("heavy", "howitzer", 1, null, 45, 0.5, 3, 4),
  entry("heavy", "howitzer", 2, null, 81, 0.55, 3, 7),
  entry("heavy", "howitzer", 3, null, 146, 0.6, 4, 12),
  entry("heavy", "mlrs", 4, 0, 60, 1.1, 1, 18, { salvoSize: 12 }),
  entry("heavy", "thermobaric", 4, 1, 420, 0.32, 6, 22),
  // — سیلوی موشک / silo family —
  entry("missile", "silo", 1, null, 180, 0.2, 5, 10),
  entry("missile", "silo", 2, null, 324, 0.22, 5, 16),
  entry("missile", "silo", 3, null, 583, 0.25, 6, 26),
  entry("missile", "hypersonic", 4, 0, 1450, 0.16, 8, 40, { critChance: 1 }),
  entry("missile", "swarm", 4, 1, 380, 0.3, 10, 34),
  // — پدافند هوایی / aadefense family —
  entry("air", "aadefense", 1, null, 20, 2.0, 1, 12),
  entry("air", "aadefense", 2, null, 36, 2.4, 1, 20),
  entry("air", "aadefense", 3, null, 65, 3.0, 2, 34),
  entry("air", "bavar", 4, 0, 520, 0.4, 6, 48),
  entry("air", "laser", 4, 1, 90, 0, 0, 80, { mode: "beam" }),
  // — جنگ الکترونیک / ew family —
  entry("ew", "ew", 1, null, 4, 1.0, 0, 15),
  entry("ew", "ew", 2, null, 7, 1.2, 0, 26),
  entry("ew", "ew", 3, null, 12, 1.5, 0, 42),
  entry("ew", "emp", 4, 0, 40, 0.5, 0, 70),
  entry("ew", "sonar", 4, 1, 25, 1.0, 0, 60),
  // — قایق رهگیر / garrison family (damage & rate are per boat) —
  entry("boat", "garrison", 1, null, 15, 1.5, 1, 6, { units: 3 }),
  entry("boat", "garrison", 2, null, 27, 1.8, 1, 10, { units: 3 }),
  entry("boat", "garrison", 3, null, 48, 2.2, 2, 16, { units: 3 }),
  entry("boat", "torpedo", 4, 0, 120, 0.9, 5, 20, { units: 5 }),
  entry("boat", "mine", 4, 1, 300, 0.35, 4, 24),
];

const SPEC_BY_KEY = new Map<string, WeaponSpec>(
  WEAPON_SPECS.map(s => [`${s.kind}:${s.tier}:${s.branch ?? "-"}`, s]),
);

/** Canonical spec for a placed tower. Tier 4 requires its branch (0/1);
 *  tiers 1-3 always resolve to the family base entry. */
export function weaponSpec(kind: TowerKind, tier: number, branch: number | null): WeaponSpec {
  const key = tier >= 4 ? `${kind}:4:${branch ?? 0}` : `${kind}:${Math.max(1, Math.min(3, tier))}:-`;
  const spec = SPEC_BY_KEY.get(key);
  if (!spec) throw new Error(`weapons-spec: no entry for ${key}`);
  return spec;
}

export function modelKindFor(kind: TowerKind, tier: number, branch: number | null): ModelKind {
  return weaponSpec(kind, tier, branch).modelKind;
}

/** Seconds between individual shots. Multi-unit towers (garrison / torpedo
 *  boats) interleave their units, so the tower-level cadence is
 *  1 / (fireRate × units) while each shot keeps the per-unit damage.
 *  Beam weapons have no interval (0). */
export function specInterval(spec: WeaponSpec): number {
  if (spec.mode === "beam" || spec.fireRate <= 0) return 0;
  return 1 / (spec.fireRate * spec.units);
}

/** The game logic measures distances in percent units (the map is 100 wide);
 *  the 3D world the FX durations were tuned against is ≈658 units wide, so
 *  one percent unit ≈ 6.58 world units. flightTime() below converts with this
 *  scale — it is an approximation by design (checklist §۰٫۳ only needs impact
 *  timing consistent with the visuals). */
export const WORLD_UNITS_PER_PCT = 6.58;

/** Approximate projectile flight time in seconds for a shot covering distPct
 *  percent-units, transcribed from the per-family FX durations in
 *  gamesync.ts (dispatchShotFx). Railgun and laser are hitscan: 0.
 *  Wave-1 FX consumes this same table via the shot record's flightDur. */
export function flightTime(modelKind: ModelKind | string, distPct: number): number {
  const w = Math.max(0, distPct) * WORLD_UNITS_PER_PCT;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  switch (modelKind) {
    case "railgun":
    case "laser": return 0; // hitscan
    case "silo": return clamp(w / 60, 0.9, 2.2);
    case "hypersonic": return clamp(w / 220, 0.35, 0.8);
    case "swarm": return clamp(w / 70, 0.7, 1.8);
    case "bavar": return clamp(w / 65, 0.8, 1.8);
    case "howitzer": return clamp(w / 95, 0.5, 1.5);
    case "mlrs": return clamp(w / 85, 0.6, 1.6);
    case "thermobaric": return clamp(w / 80, 0.6, 1.4);
    case "emp": return clamp(w / 110, 0.4, 1.1);
    case "sonar": return clamp(w / 80, 0.6, 1.5);
    case "ew": return clamp(w / 120, 0.35, 1);
    case "ciws": return Math.max(0.08, w / 360);
    case "aadefense": return Math.max(0.08, w / 320);
    case "torpedo":
    case "mine": return clamp(w / 34, 1, 2.6);
    default: return Math.max(0.08, w / 300); // autocannon / garrison tracers
  }
}
