/**
 * Day/night cycle math — VIS2, ruling D-021 (fix program 2).
 *
 * Pure functions + a small state machine; no React/THREE imports, so the
 * audit harness can unit-test the contract directly (scripts/audit/
 * test_daynight.mts). WorldView3D.tsx is the only consumer: it feeds the
 * driver the game's own clock (`state.elapsed`, game-seconds) once per
 * rendered frame and pushes the resulting hour into the 3D map.
 *
 * THE CONTRACT (what UI2's tri-state toggle wires against):
 *   mode 'auto'  — ambient cycle: 900 game-s day + 900 game-s night,
 *                  with a ~20 game-s dusk/dawn blend centered on each
 *                  phase boundary. Never a snap.
 *   mode 'day'   — held day.   mode 'night' — held night.
 *                  Switching modes travels over ~20 game-s like any
 *                  other transition; it does NOT latch into the cycle
 *                  (the old XOR `manualNight !== parity` permanently
 *                  inverted every later cycle — that bug is dead).
 *   scenarioNight — a scenario-forced night (battle condition «شب»)
 *                  overrides the mode for the length of the battle and
 *                  blends through the SAME 20 game-s transition, in and
 *                  out.
 *   legacy manualNight — until UI2's control lands, the old two-state
 *                  weather button still flips `state.manualNight`. An
 *                  edge on that flag latches a momentary override to
 *                  the opposite phase, released automatically at the
 *                  next 900 s phase boundary — so even the legacy
 *                  button can no longer invert the cycle permanently.
 *
 * "Nightness" n ∈ [0,1] is the single currency: 0 = full day anchor
 * (map hour 10.0), 1 = full night anchor (map hour 21.5). The map's
 * own lighting (sun elevation, lamp fade, sky, fog) is a smooth
 * function of the hour, so a continuous hour = a continuous world.
 */

export type TimeMode = 'auto' | 'day' | 'night';

export const DAY_PHASE_S = 900;
export const NIGHT_PHASE_S = 900;
export const CYCLE_S = DAY_PHASE_S + NIGHT_PHASE_S; // 1800
export const TRANSITION_S = 20;

/** Day anchor (map hour) at nightness 0 / night anchor at nightness 1. */
export const DAY_HOUR = 10.0;
export const NIGHT_HOUR = 21.5;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const sstep = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * The ambient ('auto') nightness for a game-clock reading.
 * Blend windows of TRANSITION_S are CENTERED on the phase boundaries
 * (t = 900 and t = 1800/0), so each full phase lasts exactly 900 s
 * boundary-to-boundary, with 880 s of full day / full night between
 * blends. Continuous everywhere, slope ≤ 1.5/TRANSITION_S per second.
 */
export function autoNightness(elapsed: number): number {
  const u = ((elapsed % CYCLE_S) + CYCLE_S) % CYCLE_S;
  const half = TRANSITION_S / 2;
  if (u < half) return 1 - sstep((u + half) / TRANSITION_S); // dawn tail
  if (u < DAY_PHASE_S - half) return 0; // full day
  if (u < DAY_PHASE_S + half) return sstep((u - (DAY_PHASE_S - half)) / TRANSITION_S); // dusk
  if (u < CYCLE_S - half) return 1; // full night
  return 1 - sstep((u - (CYCLE_S - half)) / TRANSITION_S); // dawn head
}

/**
 * Nightness → map hour. Piecewise path that lingers at the anchors and
 * crosses the map's twilight band (hours ≈17.4–18.5, where its internal
 * night factor sweeps 0→1) during the middle half of the blend, so the
 * 20 s reads as: sun sinks → dusk colors + lamps fade → full night.
 */
export function hourForNightness(n: number): number {
  const x = clamp01(n);
  if (x <= 0.25) return lerp(DAY_HOUR, 16.9, x / 0.25);
  if (x <= 0.75) return lerp(16.9, 18.9, (x - 0.25) / 0.5);
  return lerp(18.9, NIGHT_HOUR, (x - 0.75) / 0.25);
}

export interface DayNightInput {
  /** Game clock, game-seconds (state.elapsed). */
  elapsed: number;
  /** Tri-state mode from the UI contract; 'auto' when untouched. */
  mode: TimeMode;
  /** Scenario-forced night (battle condition «شب»). */
  scenarioNight: boolean;
  /** Legacy two-state toggle flag (state.manualNight). */
  manualNight: boolean;
}

export interface DayNightOutput {
  nightness: number;
  hour: number;
  target: number;
  /** What is currently deciding the target (for HUD/debug evidence). */
  source: 'scenario' | 'mode' | 'manual' | 'auto';
}

/**
 * Stateful driver: turns (possibly discontinuous) targets into a
 * display nightness that only ever travels at transition speed.
 *
 * - Continuous targets (the auto curve) are tracked exactly.
 * - A target STEP (mode switch, scenario start/end, legacy override)
 *   starts a TRANSITION_S smoothstep travel from the current display.
 * - Clock discontinuities (first frame, save load, offline jump,
 *   elapsed regression) snap — a 20 s fake transition after returning
 *   to a backgrounded game would be a bug, not a feature.
 */
export class DayNightDriver {
  private display: number | null = null;
  private animFrom: number | null = null;
  private animStart = 0;
  private lastElapsed: number | null = null;
  private prevTarget: number | null = null;
  private lastManual: boolean | null = null;
  private overrideNight: boolean | null = null;
  private overridePhase = 0;

  update(input: DayNightInput): DayNightOutput {
    const { elapsed, mode, scenarioNight, manualNight } = input;
    const phaseIndex = Math.floor(elapsed / DAY_PHASE_S);

    // Legacy toggle edge → momentary override to the opposite phase,
    // released at the next phase boundary (never a permanent inversion).
    if (this.lastManual !== null && manualNight !== this.lastManual) {
      this.overrideNight = (this.display ?? autoNightness(elapsed)) < 0.5;
      this.overridePhase = phaseIndex;
    }
    this.lastManual = manualNight;
    if (this.overrideNight !== null && phaseIndex !== this.overridePhase) {
      this.overrideNight = null;
    }

    let target: number;
    let source: DayNightOutput['source'];
    if (scenarioNight) {
      target = 1;
      source = 'scenario';
    } else if (mode === 'day') {
      target = 0;
      source = 'mode';
    } else if (mode === 'night') {
      target = 1;
      source = 'mode';
    } else if (this.overrideNight !== null) {
      target = this.overrideNight ? 1 : 0;
      source = 'manual';
    } else {
      target = autoNightness(elapsed);
      source = 'auto';
    }

    // Clock discontinuity → snap.
    if (
      this.display === null ||
      this.lastElapsed === null ||
      elapsed < this.lastElapsed ||
      elapsed - this.lastElapsed > 30
    ) {
      this.display = target;
      this.animFrom = null;
    } else {
      const dt = elapsed - this.lastElapsed;
      // A target jump the auto curve could not have produced on its own
      // (its max slope is 1.5/TRANSITION_S per second) starts a travel.
      if (
        this.animFrom === null &&
        this.prevTarget !== null &&
        Math.abs(target - this.prevTarget) > (1.5 / TRANSITION_S) * dt + 0.02
      ) {
        this.animFrom = this.display;
        this.animStart = elapsed;
      }
      if (this.animFrom !== null) {
        const k = clamp01((elapsed - this.animStart) / TRANSITION_S);
        this.display = lerp(this.animFrom, target, sstep(k));
        if (k >= 1) {
          this.display = target;
          this.animFrom = null;
        }
      } else {
        this.display = target;
      }
    }

    this.lastElapsed = elapsed;
    this.prevTarget = target;
    return { nightness: this.display, hour: hourForNightness(this.display), target, source };
  }
}
