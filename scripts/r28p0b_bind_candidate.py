#!/usr/bin/env python3
"""Bind an A12 handoff candidate to R28P0B metadata without committing assets."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.product_prelaunch.candidate_binding import bind_candidate


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthetic-if-missing", action="store_true")
    args = parser.parse_args()
    report = bind_candidate(synthetic_if_missing=args.synthetic_if_missing)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
