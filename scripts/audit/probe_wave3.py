"""Wrapper: runs probe_wave3.cjs (the reducer-level scripted fresh
player) and re-emits its verdict in the shared audit JSON protocol."""
from __future__ import annotations

import json
import os
import subprocess
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import report

SECTION = "§fresh-player gate (D-024)"


def main() -> int:
    args = report.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", ".."))
    r = subprocess.run(["node", os.path.join(here, "probe_wave3.cjs")],
                       cwd=repo, capture_output=True, text=True)
    for line in r.stdout.splitlines():
        if not line.startswith(("AUDIT_JSON", "{", "}", '"', "[", "]", " ")):
            print(line, flush=True)
    try:
        block = r.stdout.split("AUDIT_JSON_BEGIN")[1].split("AUDIT_JSON_END")[0]
        payload = json.loads(block)
    except Exception:  # noqa: BLE001 - verdict, not a crash
        return report.fatal(
            "probe_wave3", SECTION,
            f"node probe produced no JSON (exit {r.returncode}): "
            f"{(r.stderr or r.stdout)[-400:]}", args.out_json)
    return report.emit("probe_wave3", SECTION, payload["assertions"],
                       meta=payload.get("meta"), out_path=args.out_json)


if __name__ == "__main__":
    sys.exit(main())
