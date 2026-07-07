#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.browser_export.candidate_asset_writer import (
    load_export_report,
    load_quantization_report,
    write_candidate_static_manifest,
    write_export_report,
    write_quantization_report,
)
from src.browser_export.candidate_discovery import discover_candidate
from src.browser_export.model_reconstruct import reconstruct_candidate_model


def ensure_inputs(synthetic_if_missing: bool) -> tuple[dict, dict]:
    try:
        export_report = load_export_report()
    except FileNotFoundError:
        candidate = discover_candidate(prefer_handoff=True, synthetic_if_missing=synthetic_if_missing)
        export_report = write_export_report(reconstruct_candidate_model(candidate, synthetic_if_missing=synthetic_if_missing))
    try:
        quantization_report = load_quantization_report()
    except FileNotFoundError:
        quantization_report = write_quantization_report(export_report, "q4")
    return export_report, quantization_report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthetic-if-missing", action="store_true")
    args = parser.parse_args()
    export_report, quantization_report = ensure_inputs(args.synthetic_if_missing)
    manifest = write_candidate_static_manifest(export_report, quantization_report)
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
