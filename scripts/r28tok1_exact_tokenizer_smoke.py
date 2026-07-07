#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    result = subprocess.run(["node", "scripts/r28tok1_node_exact_tokenizer_smoke.mjs"], cwd=ROOT, text=True, capture_output=True, timeout=120)
    if result.stdout:
        print(result.stdout, end="")
    if result.returncode != 0 and result.stderr:
        print(result.stderr, file=sys.stderr, end="")
    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError:
        return result.returncode or 1
    return 0 if result.returncode == 0 and report.get("ok") is True else 1


if __name__ == "__main__":
    raise SystemExit(main())
