"""Sample an attached Android phone during play. No root or game-state changes."""
import argparse
import json
import subprocess
import time
from datetime import datetime, timezone

PACKAGE = 'ir.hormuz.sovereign'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adb', default='adb')
    parser.add_argument('--serial', help='adb serial if several devices are attached')
    parser.add_argument('--seconds', type=int, default=600)
    parser.add_argument('--interval', type=int, default=30)
    parser.add_argument('--output', required=True, help='new JSONL file')
    args = parser.parse_args()
    if min(args.interval, args.seconds) < 1:
        parser.error('seconds and interval must be positive')
    adb = [args.adb] + (['-s', args.serial] if args.serial else [])

    def read(*command):
        try:
            result = subprocess.run(adb + list(command), capture_output=True, text=True, timeout=15)
        except subprocess.TimeoutExpired:
            return 'UNAVAILABLE: adb timeout'
        return result.stdout.strip() if result.returncode == 0 else 'UNAVAILABLE: ' + result.stderr.strip()

    if read('get-state') != 'device' or not read('shell', 'pm', 'path', PACKAGE).startswith('package:'):
        parser.exit(1, 'Connect and authorize a phone with Strait of Hormuz installed.\n')
    with open(args.output, 'x', encoding='utf-8') as stream:
        def write(record):
            stream.write(json.dumps(record, ensure_ascii=False) + '\n')
            stream.flush()

        write({'startedUtc': datetime.now(timezone.utc).isoformat(),
               'model': read('shell', 'getprop', 'ro.product.model'),
               'android': read('shell', 'getprop', 'ro.build.version.release'),
               'packageVersion': [line.strip() for line in read('shell', 'dumpsys', 'package', PACKAGE).splitlines()
                                  if 'versionName=' in line or 'versionCode=' in line]})
        start = time.monotonic()
        while True:
            elapsed = time.monotonic() - start
            cpu = read('shell', 'dumpsys', 'cpuinfo')
            write({'seconds': round(elapsed, 2),
                   'processCpu': [line.strip() for line in cpu.splitlines() if PACKAGE in line] or None,
                   'memory': read('shell', 'dumpsys', 'meminfo', PACKAGE),
                   'thermalService': read('shell', 'dumpsys', 'thermalservice'),
                   'battery': read('shell', 'dumpsys', 'battery')})
            if elapsed >= args.seconds:
                break
            deadline = start + min(args.seconds, elapsed + args.interval)
            time.sleep(max(0, deadline - time.monotonic()))


if __name__ == '__main__':
    main()
