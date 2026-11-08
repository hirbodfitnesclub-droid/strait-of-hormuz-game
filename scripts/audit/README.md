# Audit harness (TESTINFRA — fix program, wave 0)

Structured, repeatable probes that turn the DoD checklist into executable
assertions. Built for the fix program in
`strait-of-hormuz-game-docs/fix-program.md`: wave-1 teams change behaviour,
these probes prove what changed and lock what must not (the audit's
«چیزهای سالم» healthy list is the regression baseline).

## Run

```bash
npm run test:audit            # everything: build (if needed) + serve + probes
python3 scripts/audit/runner.py --probe cadence   # one probe
python3 scripts/audit/runner.py --port 3310 --no-build
```

Exit codes: `0` all pass · `1` any assertion failed · `2` infra error.
Combined output lands in `scripts/audit/results.json` (git-ignored).
The runner serves `out/` on port 3310 only if nothing is listening there,
and stops a server it started. Probes use the Playwright venv at
`~/tools/venv-geo` (override with `AUDIT_PYTHON`) and a persistent browser
profile (override with `AUDIT_PROFILE`) so the 24MB of GLB models stay
cached between runs.

## Files

| file | role |
|---|---|
| `seedlib.py` | Shared seed library: complete `hydrateGame`-valid saves — all 18 tower configs (6 families × {T3, T4 branch 0, T4 branch 1}), boss saves (waves 5/10/15/20/25), one rich economy save, one fresh-player save, parked-enemy battle fixtures, and the localStorage seed-injection JS. |
| `harness.py` | Browser plumbing (headless Chromium + SwiftShader, persistent profile) and the two measurement channels: FX instrumentation (wraps `BattleFX.shoot/rail/flashAt` on `window.__gamesync3d`) and the `window.__telemetry` snapshot reader (team ROOT's channel, preferred when present). |
| `report.py` | Assertion protocol: every probe emits `{probe, section, assertions[], meta}` JSON + human lines; exit 0/1. |
| `probe_cadence.py` | §0–§1 fire cadence per family (silo / autocannon / EW / laser / MLRS) from real shot events in seeded battles. |
| `probe_wavecomp.py` | §2–§3 regression lock: live spawn composition + 1.35 game-s spawn interval for waves 1/3/5/10. |
| `probe_economy.py` | §7 regression lock: hydrate integrity, net oil rate vs the ported `getStats` pipeline, harbor-manager auto-collect, contract timer — from the rich seed. |
| `probe_scene.py` | Map/scene basics: 29 slot pads, renderer alive + veil lifted, tower GLB model loads. |
| `runner.py` | Orchestrates build + server + probes, aggregates per-DoD-section pass/fail. |

## Timing rule (important)

Headless SwiftShader on a shared VM dilates **wall** time by an order of
magnitude. Every time-based assertion here is therefore measured on the
game's own clock (`state.elapsed`, stamped into FX/dispatch events as
`g`): intervals in game-seconds are exact regardless of host load. Rates
that divide two game-clock quantities (economy) are likewise invariant.

## Expected verdicts on the pre-fix build

- `probe_cadence`: **silo FAIL** (measured ≈0.25 game-s vs 5.0 reference —
  the F-1 continuous-DPS bug), EW FAIL (fires plasma projectiles), MLRS
  FAIL (no reload pause). These reds are correct and are the harness's
  proof of function; they must turn green only when ROOT/FX land the
  discrete-fire architecture.
- `probe_wavecomp`, `probe_economy`, `probe_scene`: **PASS** — the
  regression baseline for waves 1–2.
