#!/usr/bin/env python3
"""Generate the R28P1 prelaunch intake report."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.product_prelaunch.r28p1_intake import generate_prelaunch_intake


def main() -> int:
    report = generate_prelaunch_intake()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
