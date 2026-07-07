#!/usr/bin/env python3
"""Report exact R28M0 dry-run artifact bytes and admission decision."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.product_prelaunch.r28m0_dryrun import budget_report


def main() -> int:
    report = budget_report()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
