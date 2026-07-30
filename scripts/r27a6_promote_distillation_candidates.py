#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.distillation.candidate_queue import read_jsonl, write_jsonl
from src.training.distillation.promotion_review import review_candidate

ART = ROOT / "artifacts/r27a6"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-promoted", type=int, default=25000)
    ap.add_argument("--target-zh-mixed-ratio", type=float, default=0.68)
    ap.add_argument("--engineering-only", action="store_true")
    ap.add_argument("--require-final-answer-only", action="store_true")
    ap.add_argument("--reject-generic-assistant-style", action="store_true")
    args = ap.parse_args()
    reviewed = [review_candidate(c) for c in read_jsonl(ART / "distillation/candidate_queue.jsonl")]
    promoted = [c for c in reviewed if c["training_allowed"]][: args.max_promoted]
    rows = [{
        "record_id": c["candidate_id"],
        "curriculum": "sft_public_instruction",
        "text": f"用户：{c['prompt']}\n回答：{c['final_answer']}",
        "language": c.get("language", "mixed"),
        "source_dataset_id": c.get("source_dataset_id", ""),
        "license_names": c.get("license_names", []),
        "license_obligations": c.get("license_obligations", []),
        "training_allowed": True,
        "engineering_only": True,
    } for c in promoted]
    write_jsonl(ART / "distillation/promoted_instruction_rows.jsonl", rows)
    report = {
        "ok": True,
        "reviewed": len(reviewed),
        "promoted_instruction_rows": len(rows),
        "target_promoted_instruction_rows_if_sources_allow": 6000,
        "rejected": len(reviewed) - len(promoted),
        "engineering_only": bool(args.engineering_only),
        "require_final_answer_only": bool(args.require_final_answer_only),
        "reject_generic_assistant_style": bool(args.reject_generic_assistant_style),
    }
    (ART / "reports/promoted_instruction_report.json").write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
