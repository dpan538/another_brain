#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.eval.r27a7_baseline import intake_r27a6_evidence, load_json
from src.training.model_lab.scale_decision import decide_model_scale


def main():
    baseline = load_json(ROOT / "artifacts/r27a7/reports/r27a6_baseline.json") or intake_r27a6_evidence(ROOT)
    probe = load_json(ROOT / "artifacts/r27a7/reports/mps_device_probe.json")
    if not probe:
        raise SystemExit("run_r27a7_mps_device_probe_first")
    decision = decide_model_scale(probe, baseline)
    out = ROOT / "artifacts/r27a7/reports/model_scale_decision.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(decision, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    doc = ROOT / "docs/r27/R27A7_MODEL_SCALE_DECISION.md"
    doc.write_text(
        "# R27A7 Model Scale Decision\n\n"
        f"- Selected scale: `{decision['selected_scale']}`\n"
        f"- Train model size: `{decision['train_model_size']}`\n"
        f"- Context length: `{decision['context_length']}`\n"
        f"- Lineage: `{decision['lineage']}`\n"
        f"- Resume R27A6 checkpoint: `{decision['resume_r27a6_checkpoint']}`\n"
        f"- MPS available: `{decision['mps_available']}`\n"
        f"- Reason: `{decision['reason']}`\n"
        f"- Q4 selected-model total estimate bytes: `{decision['product_budget']['q4_total_estimate_bytes']}`\n"
        f"- 0.5B q4 estimate bytes: `{decision['estimate_only']['0.5B']['q4_total_estimate_bytes']}`\n"
        f"- 2B q4 estimate bytes: `{decision['estimate_only']['2B']['q4_total_estimate_bytes']}`\n\n"
        "R27A7 chooses a single decoder. 0.5B and 2B are estimate-only unless a future measured, safe, explicitly approved path exists.\n",
        encoding="utf-8",
    )
    print(json.dumps(decision, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
