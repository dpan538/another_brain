#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.eval.r27a7_baseline import intake_r27a6_evidence


def main():
    baseline = intake_r27a6_evidence(ROOT)
    report = {
        "ok": bool(baseline.get("lineage_resume_compatible")),
        "lineage_decision": "resume_r27a6_best_checkpoint" if baseline.get("lineage_resume_compatible") else "blocked_missing_r27a6_lineage",
        "r27a6_commit": baseline.get("r27a6_commit", ""),
        "checkpoint_path": baseline.get("best_checkpoint_path", ""),
        "tokenizer_path": baseline.get("tokenizer_path", ""),
        "vocab_size": baseline.get("vocab_size"),
        "model_config": baseline.get("model_config", {}),
        "no_tokenizer_training": True,
        "no_pretrained_weights": True,
    }
    out = ROOT / "artifacts/r27a7/reports/lineage_decision.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
