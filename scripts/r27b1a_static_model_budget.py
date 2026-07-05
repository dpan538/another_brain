#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.browser_export.quantize import budget_fit
from scripts.r27b1a_common import ARTIFACT_ROOT, mark_local_only_artifact_dir, write_json

BUDGET = {
    "total_budget_bytes": 100_000_000,
    "model_weight_budget_bytes": 70_000_000,
    "tokenizer_budget_bytes": 5_000_000,
    "runtime_budget_bytes": 15_000_000,
    "rag_gate_budget_bytes": 10_000_000,
}


def recommendation(rows: list[dict]) -> str:
    fits = [row for row in rows if row["q4_fits_model_weight_budget"]]
    if not fits:
        return "No listed candidate fits the 70MB model weight budget under q4."
    largest = max(fits, key=lambda row: row["params"])
    return f"Largest listed q4 estimate that fits 70MB model budget: {largest['label']}."


def make_budget_report(params: list[int]) -> dict:
    labels = {
        7_528_128: "current candidate 7.5M",
        30_000_000: "30M q4 estimate",
        60_000_000: "60M q4 estimate",
        100_000_000: "100M q4 estimate",
        500_000_000: "0.5B q4 estimate",
        2_000_000_000: "2B q4 estimate",
    }
    rows = []
    for value in params:
        fit = budget_fit(value, BUDGET["model_weight_budget_bytes"])
        rows.append(
            {
                "label": labels.get(value, f"{value} params"),
                "params": value,
                "int8_bytes": fit["estimates"]["int8"]["total_bytes"],
                "q4_bytes": fit["estimates"]["q4"]["total_bytes"],
                "int8_fits_model_weight_budget": fit["fits_model_weight_budget"]["int8"],
                "q4_fits_model_weight_budget": fit["fits_model_weight_budget"]["q4"],
            }
        )
    return {
        "budget": BUDGET,
        "rows": rows,
        "recommendation": recommendation(rows),
        "non_claims": [
            "budget estimates are not product model admission",
            "q4 estimates do not validate model quality",
            "no weights or tokenizer artifacts are committed",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--params", default="7528128,30000000,60000000,100000000,500000000,2000000000")
    parser.add_argument("--out", default=str(ARTIFACT_ROOT / "reports" / "static_model_budget.json"))
    args = parser.parse_args()

    mark_local_only_artifact_dir()
    params = [int(item) for item in args.params.split(",") if item.strip()]
    report = make_budget_report(params)
    write_json(Path(args.out), report)
    doc = Path("docs/r27/R27B1A_100MB_MODEL_BUDGET.md")
    lines = [
        "# R27B1A 100MB Model Budget",
        "",
        f"Budget: `{BUDGET}`.",
        "",
        "| Candidate | Params | int8 bytes | q4 bytes | int8 fits 70MB | q4 fits 70MB |",
        "| --- | ---: | ---: | ---: | --- | --- |",
    ]
    for row in report["rows"]:
        lines.append(
            f"| {row['label']} | {row['params']} | {row['int8_bytes']} | {row['q4_bytes']} | {row['int8_fits_model_weight_budget']} | {row['q4_fits_model_weight_budget']} |"
        )
    lines.extend(["", f"Recommendation: {report['recommendation']}", ""])
    doc.write_text("\n".join(lines), encoding="utf-8")
    print(f"R27B1A static model budget wrote {args.out}")
    print(report["recommendation"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
