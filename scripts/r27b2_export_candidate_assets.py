#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.browser_export.candidate_asset_writer import write_export_report
from src.browser_export.candidate_discovery import discover_candidate
from src.browser_export.model_reconstruct import reconstruct_candidate_model


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prefer-handoff", action="store_true")
    parser.add_argument("--synthetic-if-missing", action="store_true")
    args = parser.parse_args()

    candidate = discover_candidate(prefer_handoff=args.prefer_handoff, synthetic_if_missing=args.synthetic_if_missing)
    reconstruction = reconstruct_candidate_model(candidate, synthetic_if_missing=args.synthetic_if_missing)
    reconstruction["discovery"] = candidate
    export_report = write_export_report(reconstruction)
    print(json.dumps(export_report, indent=2, sort_keys=True))
    return 0 if export_report.get("candidate_id") else 1


if __name__ == "__main__":
    raise SystemExit(main())
