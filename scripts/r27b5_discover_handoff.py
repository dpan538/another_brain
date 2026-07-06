#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.browser_export.handoff_discovery import discover_handoff_candidate

MANIFEST_DIR = ROOT / "artifacts/r27b5/manifests"


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-synthetic-if-missing", action="store_false", dest="synthetic_if_missing")
    args = parser.parse_args()
    report = discover_handoff_candidate(synthetic_if_missing=args.synthetic_if_missing)
    report["product_model"] = False
    report["browser_admission"] = False
    report["release_checkpoint"] = False
    write_json(MANIFEST_DIR / "handoff_discovery.json", report)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report.get("candidate_id") else 1


if __name__ == "__main__":
    raise SystemExit(main())
