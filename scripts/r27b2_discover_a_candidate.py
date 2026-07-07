#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.browser_export.candidate_asset_writer import MANIFEST_DIR, write_json
from src.browser_export.candidate_discovery import discover_candidate


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prefer-handoff", action="store_true")
    parser.add_argument("--synthetic-if-missing", action="store_true", default=True)
    parser.add_argument("--no-synthetic-if-missing", action="store_false", dest="synthetic_if_missing")
    args = parser.parse_args()

    candidate = discover_candidate(prefer_handoff=args.prefer_handoff, synthetic_if_missing=args.synthetic_if_missing)
    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    write_json(MANIFEST_DIR / "candidate_discovery.json", candidate)
    print(json.dumps(candidate, indent=2, sort_keys=True))
    return 0 if candidate.get("candidate_id") else 1


if __name__ == "__main__":
    raise SystemExit(main())
