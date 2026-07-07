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
    MANIFEST_DIR,
    MAX_TOTAL_STATIC_BYTES,
    MODEL_WEIGHT_BUDGET_BYTES,
    RUNTIME_UI_RAG_GATE_BYTES,
    TOKENIZER_BUDGET_BYTES,
    load_export_report,
    write_json,
    write_export_report,
)
from src.browser_export.candidate_discovery import discover_candidate
from src.browser_export.model_reconstruct import reconstruct_candidate_model
from src.browser_export.quantize import budget_fit


COMPARISON_PARAMS = {
    "60M": 60_000_000,
    "100M": 100_000_000,
    "125M": 125_000_000,
    "150M": 150_000_000,
    "0.5B_estimate_only": 500_000_000,
    "2B_estimate_only": 2_000_000_000,
}


def ensure_export_report(synthetic_if_missing: bool) -> dict:
    try:
        return load_export_report()
    except FileNotFoundError:
        candidate = discover_candidate(prefer_handoff=True, synthetic_if_missing=synthetic_if_missing)
        return write_export_report(reconstruct_candidate_model(candidate, synthetic_if_missing=synthetic_if_missing))


def make_budget_report(export_report: dict) -> dict:
    params = int(export_report.get("params", 0))
    candidate_fit = budget_fit(params, MODEL_WEIGHT_BUDGET_BYTES)
    tokenizer_estimate = 0
    total_q4_estimate = candidate_fit["estimates"]["q4"]["total_bytes"] + tokenizer_estimate + RUNTIME_UI_RAG_GATE_BYTES
    total_int8_estimate = candidate_fit["estimates"]["int8"]["total_bytes"] + tokenizer_estimate + RUNTIME_UI_RAG_GATE_BYTES
    comparisons = {
        label: {
            **budget_fit(value, MODEL_WEIGHT_BUDGET_BYTES),
            "q4_total_with_shell_bytes": budget_fit(value, MODEL_WEIGHT_BUDGET_BYTES)["estimates"]["q4"]["total_bytes"] + TOKENIZER_BUDGET_BYTES + RUNTIME_UI_RAG_GATE_BYTES,
        }
        for label, value in COMPARISON_PARAMS.items()
    }
    report = {
        "ok": total_q4_estimate <= MAX_TOTAL_STATIC_BYTES,
        "candidate_id": export_report.get("candidate_id", ""),
        "candidate_params": params,
        "candidate_q4_size_bytes": candidate_fit["estimates"]["q4"]["total_bytes"],
        "candidate_int8_size_bytes": candidate_fit["estimates"]["int8"]["total_bytes"],
        "tokenizer_estimate_bytes": tokenizer_estimate,
        "runtime_ui_rag_gates_budget_bytes": RUNTIME_UI_RAG_GATE_BYTES,
        "total_q4_estimate_bytes": total_q4_estimate,
        "total_int8_estimate_bytes": total_int8_estimate,
        "budget_bytes": MAX_TOTAL_STATIC_BYTES,
        "under_100mb": total_q4_estimate <= MAX_TOTAL_STATIC_BYTES,
        "comparisons": comparisons,
        "product_model": False,
        "browser_admission": False,
        "blockers": export_report.get("blockers", []),
    }
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthetic-if-missing", action="store_true")
    args = parser.parse_args()
    report = make_budget_report(ensure_export_report(args.synthetic_if_missing))
    write_json(MANIFEST_DIR / "candidate_budget.json", report)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
