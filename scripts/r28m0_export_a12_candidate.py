#!/usr/bin/env python3
"""Export the A12 candidate as an ignored R28M0 checkpoint inventory."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.product_prelaunch.r28m0_dryrun import export_a12_candidate


def main() -> int:
    report = export_a12_candidate()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
