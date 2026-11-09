/**
 * VIS2 (D-021) unit gate for src/lib/daynight.ts — run:
 *   npx tsx scripts/audit/test_daynight.mts
 * Asserts the ruling's numbers directly: 900 s phases, ~20 s blends
 * centered on the boundaries, mode/scenario steps that travel (never
 * snap), and the death of the legacy XOR permanent inversion.
 */
import {
  DayNightDriver,
  autoNightness,
  hourForNightness,
  CYCLE_S,
  TRANSITION_S,
} from '../../src/lib/daynight';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${name} ${detail}`);
  }
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---- auto curve: phases and blend geometry
check('auto(60)=0 full day', near(autoNightness(60), 0));
check('auto(450)=0 midday plateau', near(autoNightness(450), 0));
check('auto(890)=0 blend not started', near(autoNightness(890), 0));
check('auto(900)=0.5 dusk midpoint', near(autoNightness(900), 0.5));
check('auto(910)=1 full night', near(autoNightness(910), 1));
check('auto(1200)=1 night plateau', near(autoNightness(1200), 1));
check('auto(1790)=1 dawn not started', near(autoNightness(1790), 1));
check('auto(1800)=auto(0)=0.5 dawn midpoint', near(autoNightness(1800), autoNightness(0)) && near(autoNightness(0), 0.5));
check('auto(1810)=0 day again', near(autoNightness(1810), 0));
check('auto period = CYCLE_S', near(autoNightness(123.4), autoNightness(123.4 + CYCLE_S)));
{
  let mono = true;
  let prev = -1;
  for (let t = 890; t <= 910; t += 0.5) {
    const v = autoNightness(t);
    if (v < prev - 1e-12) mono = false;
    prev = v;
  }
  check('dusk blend monotonic', mono);
  // full-day plateau width 880, full-night plateau width 880 -> phases are 900 boundary-to-boundary
  let dayWidth = 0;
  let nightWidth = 0;
  for (let t = 0; t < CYCLE_S; t += 0.25) {
    if (autoNightness(t) === 0) dayWidth += 0.25;
    if (autoNightness(t) === 1) nightWidth += 0.25;
  }
  check('full-day plateau 880±1', Math.abs(dayWidth - 880) <= 1, `got ${dayWidth}`);
  check('full-night plateau 880±1', Math.abs(nightWidth - 880) <= 1, `got ${nightWidth}`);
}

// ---- hour path
check('hour(0)=10 day anchor', near(hourForNightness(0), 10));
check('hour(1)=21.5 night anchor', near(hourForNightness(1), 21.5));
check('hour(0.25)=16.9', near(hourForNightness(0.25), 16.9));
check('hour(0.75)=18.9', near(hourForNightness(0.75), 18.9));
{
  let mono = true;
  let prev = -1;
  for (let n = 0; n <= 1.0001; n += 0.01) {
    const h = hourForNightness(Math.min(1, n));
    if (h < prev - 1e-12) mono = false;
    prev = h;
  }
  check('hour path monotonic', mono);
}

// ---- driver: auto tracking is exact (no spurious animation)
{
  const d = new DayNightDriver();
  let ok = true;
  let worst = 0;
  for (let t = 0; t <= 4000; t += 0.5) {
    const out = d.update({ elapsed: t, mode: 'auto', scenarioNight: false, manualNight: false });
    const err = Math.abs(out.nightness - autoNightness(t));
    worst = Math.max(worst, err);
    if (err > 1e-9) ok = false;
  }
  check('driver tracks auto exactly', ok, `worst err ${worst}`);
}

// ---- driver: mode step travels ~20 s, never snaps
{
  const d = new DayNightDriver();
  d.update({ elapsed: 2000, mode: 'auto', scenarioNight: false, manualNight: false }); // u=200, day
  let prev = 0;
  let maxSlope = 0;
  let at10 = -1;
  let at20 = -1;
  for (let t = 2000; t <= 2040; t += 0.25) {
    const out = d.update({ elapsed: t, mode: 'night', scenarioNight: false, manualNight: false });
    maxSlope = Math.max(maxSlope, Math.abs(out.nightness - prev) / 0.25);
    prev = out.nightness;
    if (Math.abs(t - 2010) < 0.13) at10 = out.nightness;
    if (Math.abs(t - 2020) < 0.13) at20 = out.nightness;
  }
  check('mode step: mid-travel ≈0.5 at +10s', Math.abs(at10 - 0.5) < 0.06, `got ${at10}`);
  check('mode step: arrived ≈1 at +20s', at20 > 0.99, `got ${at20}`);
  check('mode step: slope bounded (no snap)', maxSlope <= 1.5 / TRANSITION_S + 0.01, `max ${maxSlope}`);
}

// ---- driver: scenario force blends in AND out
{
  const d = new DayNightDriver();
  d.update({ elapsed: 300, mode: 'auto', scenarioNight: false, manualNight: false });
  let mid = -1;
  for (let t = 300; t <= 330; t += 0.25) {
    const out = d.update({ elapsed: t, mode: 'auto', scenarioNight: true, manualNight: false });
    if (Math.abs(t - 310) < 0.13) mid = out.nightness;
  }
  check('scenario night: mid-blend ≈0.5 at +10s', Math.abs(mid - 0.5) < 0.06, `got ${mid}`);
  let back = -1;
  for (let t = 330; t <= 360; t += 0.25) {
    const out = d.update({ elapsed: t, mode: 'auto', scenarioNight: false, manualNight: false });
    back = out.nightness;
  }
  check('scenario end: blended back to auto (0)', near(back, 0, 0.01), `got ${back}`);
}

// ---- driver: legacy toggle cannot permanently invert (XOR is dead)
{
  const d = new DayNightDriver();
  d.update({ elapsed: 300, mode: 'auto', scenarioNight: false, manualNight: false }); // day
  d.update({ elapsed: 300.25, mode: 'auto', scenarioNight: false, manualNight: true }); // press -> night override
  let held = -1;
  for (let t = 300.25; t <= 330; t += 0.25) {
    held = d.update({ elapsed: t, mode: 'auto', scenarioNight: false, manualNight: true }).nightness;
  }
  check('legacy press: override reaches night', held > 0.99, `got ${held}`);
  // ride past TWO phase boundaries without touching the toggle again
  let after = -1;
  for (let t = 330; t <= 1950; t += 1) {
    after = d.update({ elapsed: t, mode: 'auto', scenarioNight: false, manualNight: true }).nightness;
  }
  // u(1950)=150 -> auto is full day (0). Permanent XOR would still show night (1).
  check('override released at boundary: back to auto day', near(after, autoNightness(1950), 0.01), `got ${after}`);
}

// ---- driver: clock jumps snap (load / offline / regression)
{
  const d = new DayNightDriver();
  d.update({ elapsed: 100, mode: 'auto', scenarioNight: false, manualNight: false });
  const out = d.update({ elapsed: 100 + 1000, mode: 'auto', scenarioNight: false, manualNight: false });
  check('clock jump snaps to target', near(out.nightness, autoNightness(1100)), `got ${out.nightness}`);
}

console.log(`daynight: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
