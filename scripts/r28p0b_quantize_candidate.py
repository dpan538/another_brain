#!/usr/bin/env python3
"""Write a metadata-only q4 quantization plan for R28P0B."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.product_prelaunch.candidate_binding import quantize_candidate


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthetic-if-missing", action="store_true")
    parser.add_argument("--quant", default="q4")
    args = parser.parse_args()
    report = quantize_candidate(quant=args.quant, synthetic_if_missing=args.synthetic_if_missing)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
