"""Audit runner v2 — `npm run test:audit2` (fix program 2, TESTINFRA2).

Runs the four Wave-0 gates of fix-program-2 against the static
Android-web build, on top of the v1 runner's build/server plumbing:

  probe_amplitude  D-019 gate: real-GLB animation amplitude per tower
                   config + building idle lists (MUST fail on v0.5.0 code)
  probe_heat       D-020 gate: opening-view triangle budget <= 800k +
                   battle render-cap structure (MUST fail on v0.5.0 code)
  probe_wave3      D-024 gate: scripted fresh player following the
                   game's own mission chain must survive wave 3
                   (MUST fail on v0.5.0 code)
  probe_i5         D-020 Wave-0 gate: team 5's zero-fire suspicion
                   replayed on a real frame vs the raw reducer

Exit codes mirror runner.py: 0 all pass, 1 any assertion failed,
2 infrastructure error. These probes are EXPECTED to be red on the
pre-fix build — red here is the harness proving it can catch the
owner's phone verdicts; they turn green only when ANIM / PERF2 /
BALANCE land their fixes.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import runner as v1

PROBES2 = ["probe_amplitude", "probe_heat", "probe_wave3", "probe_i5"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="append", default=[],
                    help="run only this probe (repeatable); default: all")
    ap.add_argument("--port", type=int, default=3310)
    ap.add_argument("--no-build", action="store_true")
    ap.add_argument("--out", default=os.path.join(v1.HERE, "results2.json"))
    args = ap.parse_args()

    names = [f"probe_{p}" if not p.startswith("probe_") else p
             for p in args.probe] or PROBES2
    unknown = [n for n in names if n not in PROBES2]
    if unknown:
        print(f"unknown probes: {unknown}; known: {PROBES2}", file=sys.stderr)
        return 2
    if not v1.ensure_build(args.no_build):
        return 2
    server = None
    try:
        try:
            server = v1.ensure_server(args.port)
        except RuntimeError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 2
        base_url = f"http://localhost:{args.port}"
        tmp_dir = os.path.join(v1.HERE, ".tmp")
        os.makedirs(tmp_dir, exist_ok=True)
        results = [v1.run_probe(n, base_url, tmp_dir) for n in names]
    finally:
        if server is not None:
            server.terminate()

    sections: dict[str, dict[str, int]] = {}
    total = {"pass": 0, "fail": 0, "skip": 0}
    for res in results:
        for a in res.get("assertions", []):
            sec = sections.setdefault(a.get("section", "?"),
                                      {"pass": 0, "fail": 0, "skip": 0})
            sec[a["status"]] = sec.get(a["status"], 0) + 1
            total[a["status"]] = total.get(a["status"], 0) + 1
    combined = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "base_url": base_url, "probes": results,
                "sections": sections, "total": total}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False, indent=1)

    print("\n================ AUDIT-2 SUMMARY ================")
    for sec, c in sections.items():
        print(f"  {sec}: {c['pass']} pass / {c['fail']} fail / {c['skip']} skip")
    print(f"  TOTAL: {total['pass']} pass / {total['fail']} fail / {total['skip']} skip")
    print(f"  results: {args.out}")
    return 1 if total["fail"] or total["skip"] or not total["pass"] else 0


if __name__ == "__main__":
    sys.exit(main())
