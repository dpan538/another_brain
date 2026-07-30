#!/usr/bin/env python3
import subprocess
import sys

if __name__ == "__main__":
    cmd = [sys.executable, "scripts/r27a6_run_autonomous_campaign.py", *sys.argv[1:]]
    raise SystemExit(subprocess.call(cmd))
