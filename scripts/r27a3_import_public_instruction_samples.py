#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "artifacts/r27a3/reports/public_instruction_import_report.json"


def main():
    report = {
        "ok": True,
        "imported_rows": 0,
        "status": "candidate_only_no_live_teacher_calls",
        "training_allowed": False,
        "teacher_truth": False,
        "external_llm_api_called": False,
        "doubao_called": False,
        "note": "Infinity-Instruct was gated during R27A3 unauthenticated access, so no public instruction rows were imported.",
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
