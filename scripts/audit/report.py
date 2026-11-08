"""Assertion/result protocol shared by all audit probes.

A probe builds a list of assertions, then calls emit(): the result is
written as JSON (for runner.py to aggregate) and also printed to stdout
between AUDIT_JSON_BEGIN / AUDIT_JSON_END markers, so a human running the
probe directly sees the same structured verdict. Exit code: 0 when every
assertion passed (skips allowed), 1 otherwise.
"""
from __future__ import annotations

import json
import sys


def assertion(section: str, aid: str, name: str, status: str,
              expected=None, actual=None, detail: str = "") -> dict:
    if status not in ("pass", "fail", "skip"):
        raise ValueError(f"bad status {status!r}")
    return {"section": section, "id": aid, "name": name, "status": status,
            "expected": expected, "actual": actual, "detail": detail}


def check(section: str, aid: str, name: str, ok: bool,
          expected=None, actual=None, detail: str = "") -> dict:
    return assertion(section, aid, name, "pass" if ok else "fail",
                     expected, actual, detail)


def emit(probe: str, section: str, assertions: list[dict],
         meta: dict | None = None, out_path: str | None = None) -> int:
    payload = {"probe": probe, "section": section,
               "assertions": assertions, "meta": meta or {}}
    text = json.dumps(payload, ensure_ascii=False, indent=1)
    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    print("AUDIT_JSON_BEGIN")
    print(text)
    print("AUDIT_JSON_END")
    for a in assertions:
        mark = {"pass": "PASS", "fail": "FAIL", "skip": "SKIP"}[a["status"]]
        print(f"[{mark}] {a['id']} {a['name']} "
              f"(expected={a['expected']!r}, actual={a['actual']!r}) {a['detail']}")
    failed = [a for a in assertions if a["status"] == "fail"]
    return 1 if failed else 0


def parse_args(argv=None):
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default="http://localhost:3310")
    p.add_argument("--out-json", default=None)
    return p.parse_args(argv)


def fatal(probe: str, section: str, message: str, out_path: str | None) -> int:
    """Infrastructure failure inside a probe: one failed assertion so the
    runner reports it instead of crashing."""
    return emit(probe, section,
                [assertion(section, f"{probe}.infra", "probe infrastructure",
                           "fail", expected="probe runs to completion",
                           actual=message)],
                out_path=out_path)


__all__ = ["assertion", "check", "emit", "parse_args", "fatal"]
if __name__ == "__main__":
    sys.exit(0)
