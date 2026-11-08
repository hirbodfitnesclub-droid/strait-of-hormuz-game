"""Audit runner — `npm run test:audit`.

Runs every probe in scripts/audit/ against the static Android-web build,
collects their structured assertions, prints a per-DoD-section pass/fail
summary plus a combined results.json, and exits:
  0 = all assertions pass (skips allowed)
  1 = at least one assertion failed
  2 = infrastructure error (build/server/probe produced no result)

The runner builds out/ if missing and serves it on its own port (3310)
when nothing is already listening there; a server it started is stopped
again at the end. Other teams' servers (3200/3300/3400) are never touched.

Usage: python3 scripts/audit/runner.py [--probe cadence] [--port 3310]
       [--no-build] [--out results.json]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
PROBES = ["probe_cadence", "probe_wavecomp", "probe_economy", "probe_scene"]


def probe_python() -> str:
    env = os.environ.get("AUDIT_PYTHON")
    if env:
        return env
    venv = os.path.expanduser("~/tools/venv-geo/bin/python")
    return venv if os.path.exists(venv) else sys.executable


def http_up(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def ensure_build(no_build: bool) -> bool:
    if os.path.exists(os.path.join(REPO, "out", "index.html")):
        return True
    if no_build:
        print("ERROR: out/index.html missing and --no-build given", file=sys.stderr)
        return False
    print("building static web bundle (scripts/build-android-web.mjs) ...", flush=True)
    r = subprocess.run(["node", "scripts/build-android-web.mjs"], cwd=REPO)
    return r.returncode == 0 and os.path.exists(os.path.join(REPO, "out", "index.html"))


def ensure_server(port: int) -> subprocess.Popen | None:
    """Returns the Popen if we started the server (caller must stop it),
    None if one was already serving."""
    url = f"http://localhost:{port}/"
    if http_up(url):
        return None
    proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--directory",
         os.path.join(REPO, "out")],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        if http_up(url):
            return proc
        time.sleep(0.2)
    proc.terminate()
    raise RuntimeError(f"could not start static server on port {port}")


def run_probe(name: str, base_url: str, tmp_dir: str) -> dict:
    out_json = os.path.join(tmp_dir, f"{name}.json")
    cmd = [probe_python(), os.path.join(HERE, f"{name}.py"),
           "--base-url", base_url, "--out-json", out_json]
    print(f"\n=== {name} ===", flush=True)
    r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True)
    for line in r.stdout.splitlines():
        if line.startswith(("[PASS]", "[FAIL]", "[SKIP]")):
            print(" ", line, flush=True)
    if r.returncode not in (0, 1) and r.stderr:
        print(r.stderr[-2000:], file=sys.stderr)
    if os.path.exists(out_json):
        with open(out_json, encoding="utf-8") as f:
            return json.load(f)
    return {"probe": name, "section": "(unknown)", "meta": {},
            "assertions": [{"section": "(infra)", "id": f"{name}.infra",
                            "name": "probe produced no result", "status": "fail",
                            "expected": "JSON result", "actual": f"exit {r.returncode}",
                            "detail": (r.stderr or "")[-300:]}]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="append", default=[],
                    help="run only this probe (repeatable); default: all")
    ap.add_argument("--port", type=int, default=3310)
    ap.add_argument("--no-build", action="store_true")
    ap.add_argument("--out", default=os.path.join(HERE, "results.json"))
    args = ap.parse_args()

    names = [f"probe_{p}" if not p.startswith("probe_") else p
             for p in args.probe] or PROBES
    unknown = [n for n in names if n not in PROBES]
    if unknown:
        print(f"unknown probes: {unknown}; known: {PROBES}", file=sys.stderr)
        return 2
    if not ensure_build(args.no_build):
        return 2
    server = None
    try:
        try:
            server = ensure_server(args.port)
        except RuntimeError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 2
        base_url = f"http://localhost:{args.port}"
        tmp_dir = os.path.join(HERE, ".tmp")
        os.makedirs(tmp_dir, exist_ok=True)
        results = [run_probe(n, base_url, tmp_dir) for n in names]
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

    print("\n================ AUDIT SUMMARY ================")
    for sec, c in sections.items():
        print(f"  {sec}: {c['pass']} pass / {c['fail']} fail / {c['skip']} skip")
    print(f"  TOTAL: {total['pass']} pass / {total['fail']} fail / {total['skip']} skip")
    print(f"  results: {args.out}")
    return 1 if total["fail"] else 0


if __name__ == "__main__":
    sys.exit(main())
