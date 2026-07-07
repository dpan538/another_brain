#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r27b4_bundle_report import make_bundle_report
from src.browser_export.full_bundle_budget import classify_budget, inputs_from_reports
from src.browser_export.handoff_discovery import discover_handoff_candidate

MANIFEST_DIR = ROOT / "artifacts/r27b5/manifests"


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def make_full_bundle_budget_report(synthetic_if_missing: bool = True) -> dict:
    handoff = discover_handoff_candidate(synthetic_if_missing=synthetic_if_missing)
    bundle = make_bundle_report()
    budget = classify_budget(inputs_from_reports(bundle, handoff))
    report = {
        "ok": True,
        "handoff": handoff,
        "bundle": bundle,
        "budget": budget,
        "candidate_route": budget["candidate_route"],
        "classification": budget["classification"],
        "product_model": False,
        "product_model_admission": False,
        "browser_admission": False,
        "release_checkpoint": False,
        "backend_inference": False,
        "external_llm_api": False,
        "hosted_vector_store": False,
    }
    if not bundle.get("ok", False):
        report["ok"] = False
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-synthetic-if-missing", action="store_false", dest="synthetic_if_missing")
    args = parser.parse_args()
    report = make_full_bundle_budget_report(synthetic_if_missing=args.synthetic_if_missing)
    write_json(MANIFEST_DIR / "full_bundle_budget_gate.json", report)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
