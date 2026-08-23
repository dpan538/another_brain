#!/usr/bin/env python3
"""Emit the R30J0 parameter, static-size, memory and latency projection.

This script performs arithmetic only.  It does not load weights, instantiate a
model, benchmark a browser, start training or write artifacts.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.personal_judge.architecture_spec import audit_r28m1_source_config, validate_contract  # noqa: E402


DEFAULT_CONFIG = ROOT / "config" / "r30j0_personal_judge_architecture_v1.json"
DEFAULT_SOURCE_CONFIG = ROOT / "web" / "another_brain" / "model_assets" / "r28m1" / "model.config.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--source-config", type=Path, default=DEFAULT_SOURCE_CONFIG)
    parser.add_argument("--compact", action="store_true", help="emit compact rather than indented JSON")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    contract = json.loads(args.config.read_text(encoding="utf-8"))
    report = validate_contract(contract)
    source = json.loads(args.source_config.read_text(encoding="utf-8"))
    report["source_evidence_audit"] = audit_r28m1_source_config(contract, source)
    print(
        json.dumps(
            report,
            ensure_ascii=False,
            sort_keys=True,
            indent=None if args.compact else 2,
            separators=(",", ":") if args.compact else None,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
