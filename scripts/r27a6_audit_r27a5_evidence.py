#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.eval.loss_anomaly import classify_dev_heldout_anomaly
from src.training.eval.split_audit import audit_splits

ART5 = ROOT / "artifacts/r27a5"
ART6 = ROOT / "artifacts/r27a6"


def read_json(path, default=None):
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else (default or {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a5_sustained_pilot_distillation_v1")
    args = ap.parse_args()
    metrics = read_json(ART5 / f"model_lab/runs/{args.campaign_id}/metrics.json")
    stream = read_json(ART5 / "reports/interleaved_training_stream_manifest.json")
    splits = audit_splits(
        ART5 / "training_mix/interleaved_train.jsonl",
        ART5 / "training_mix/dev.jsonl",
        ART5 / "training_mix/heldout.jsonl",
    )
    anomaly = classify_dev_heldout_anomaly(metrics, splits)
    report = {
        "ok": True,
        "campaign_id": args.campaign_id,
        "r27a5_metrics_found": bool(metrics),
        "stream_manifest_found": bool(stream),
        "train_records": metrics.get("train_records"),
        "dev_records": metrics.get("dev_records"),
        "heldout_records": metrics.get("heldout_records"),
        "train_tokens": metrics.get("total_train_tokens"),
        "dev_loss": metrics.get("dev_loss"),
        "heldout_loss": metrics.get("heldout_loss"),
        "split_audit": splits,
        "anomaly": anomaly,
        "proceed_to_longrun": bool(anomaly.get("proceed")),
        "decision": "proceed_with_stratified_heldout" if anomaly.get("proceed") else "block_longrun_until_fixed",
        "old_question_pack_001_rows_51_100_used": stream.get("old_question_pack_001_rows_51_100_used", 0),
        "contains_eval_prompts": stream.get("contains_eval_prompts", False),
    }
    out = ART6 / "reports/r27a5_evidence_audit.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    classes = ", ".join(anomaly.get("classification", []))
    doc = ROOT / "docs/r27/R27A6_R27A5_EVIDENCE_AUDIT.md"
    doc.write_text(
        "# R27A6 R27A5 Evidence Audit\n\n"
        f"R27A5 dev loss was `{metrics.get('dev_loss')}` and heldout loss was `{metrics.get('heldout_loss')}`. "
        f"The audit classification is `{classes}` and the decision is `{report['decision']}`.\n\n"
        f"Dev token-length mean: `{splits['splits']['dev']['token_length']['mean']:.2f}`. "
        f"Heldout token-length mean: `{splits['splits']['heldout']['token_length']['mean']:.2f}`. "
        f"Cross-split duplicate count: `{splits['duplicates']['cross_split_duplicate_count']}`.\n\n"
        "The lower heldout loss is treated as a split-composition/length/curriculum imbalance unless duplicate leakage or an evaluation-accounting bug is detected. "
        "R27A6 therefore builds a stratified heldout stream before autonomous training. Rows 51-100 from the old question pack remain excluded.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
