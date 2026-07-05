#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.browser_export.candidate_asset_writer import load_export_report, write_quantization_report
from src.browser_export.candidate_discovery import discover_candidate
from src.browser_export.model_reconstruct import reconstruct_candidate_model
from src.browser_export.candidate_asset_writer import write_export_report


def ensure_export_report(synthetic_if_missing: bool) -> dict:
    try:
        return load_export_report()
    except FileNotFoundError:
        candidate = discover_candidate(prefer_handoff=True, synthetic_if_missing=synthetic_if_missing)
        reconstruction = reconstruct_candidate_model(candidate, synthetic_if_missing=synthetic_if_missing)
        return write_export_report(reconstruction)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--quant", default="q4")
    parser.add_argument("--synthetic-if-missing", action="store_true")
    args = parser.parse_args()

    export_report = ensure_export_report(args.synthetic_if_missing)
    report = write_quantization_report(export_report, args.quant)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
