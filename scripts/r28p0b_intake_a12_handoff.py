#!/usr/bin/env python3
"""Read the R27A12 handoff for R28P0B."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.product_prelaunch.a12_handoff_intake import load_a12_handoff, write_intake_report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-synthetic-if-missing", action="store_true")
    args = parser.parse_args()
    report = load_a12_handoff(synthetic_if_missing=not args.no_synthetic_if_missing)
    path = write_intake_report(report)
    print(json.dumps({"report": path.as_posix(), **report}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
