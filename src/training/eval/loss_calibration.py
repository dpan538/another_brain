from __future__ import annotations

from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import NON_CLAIMS, ROOT, now_utc, read_json, write_json, write_text


def _num(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _same_float(left: Any, right: Any, tolerance: float = 1e-9) -> bool:
    lnum = _num(left)
    rnum = _num(right)
    return lnum is not None and rnum is not None and abs(lnum - rnum) <= tolerance


def _length_bucket_report(root: Path) -> dict[str, Any]:
    paths = {
        "train_continued_pretraining": root / "artifacts/r27a7/training_mix/continued_pretraining_stream.jsonl",
        "train_sft_dialogue": root / "artifacts/r27a7/training_mix/sft_dialogue_stream.jsonl",
        "train_rag_value": root / "artifacts/r27a7/training_mix/rag_value_anchor_replay_stream.jsonl",
        "dev": root / "artifacts/r27a7/training_mix/dev.jsonl",
        "stratified_heldout": root / "artifacts/r27a7/training_mix/stratified_heldout.jsonl",
    }
    out: dict[str, Any] = {}
    for name, path in paths.items():
        if not path.exists():
            out[name] = {"exists": False}
            continue
        lengths: list[int] = []
        seen: set[str] = set()
        duplicate_rows = 0
        for idx, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
            if not line.strip():
                continue
            if line in seen:
                duplicate_rows += 1
            seen.add(line)
            lengths.append(len(line))
            if idx >= 4000:
                break
        if not lengths:
            out[name] = {"exists": True, "sample_rows": 0}
            continue
        sorted_lengths = sorted(lengths)
        out[name] = {
            "exists": True,
            "sample_rows": len(lengths),
            "duplicate_rows_in_sample": duplicate_rows,
            "min_chars": sorted_lengths[0],
            "median_chars": sorted_lengths[len(sorted_lengths) // 2],
            "p90_chars": sorted_lengths[min(len(sorted_lengths) - 1, int(len(sorted_lengths) * 0.9))],
            "max_chars": sorted_lengths[-1],
        }
    return out


def audit_loss_calibration(root: Path = ROOT) -> dict[str, Any]:
    intake = read_json(root / "artifacts/r27a10/reports/a8b_a9b_intake.json", {})
    ledger = read_json(root / "artifacts/r27a8b/reports/campaign_ledger.json", {})
    evaluation = read_json(root / "artifacts/r27a8b/reports/campaign_evaluation.json", {})
    readiness = read_json(root / "artifacts/r27a8b/reports/dialogue_readiness.json", {})
    segments = ledger.get("segments", [])
    last = segments[-1] if segments else {}

    eval_train_loss = evaluation.get("train_loss")
    last_train_loss = last.get("train_loss_end")
    final_dev = evaluation.get("dev_loss")
    final_heldout = evaluation.get("stratified_heldout_loss")
    final_gap = None
    if _num(final_dev) is not None and _num(eval_train_loss) is not None:
        final_gap = float(final_dev) - float(eval_train_loss)

    train_loss_is_last_observed_batch = _same_float(eval_train_loss, last_train_loss)
    train_loss_is_window_mean = False
    stage_count = len(segments)
    context_lengths = sorted({s.get("context_length") for s in segments if s.get("context_length")})
    train_stage_losses = {
        f"seg{s.get('segment_index')}_{s.get('stage_id')}": {
            "train_loss_end": s.get("train_loss_end"),
            "dev_loss": s.get("dev_loss"),
            "stratified_heldout_loss": s.get("stratified_heldout_loss"),
            "stage_mix": s.get("stage_mix", {}),
        }
        for s in segments
    }

    findings: list[str] = []
    if train_loss_is_last_observed_batch:
        findings.append("campaign_evaluation.train_loss equals the last segment train_loss_end, so it is a last observed training-batch proxy.")
    if final_gap is not None and final_gap > 3.0:
        findings.append("final dev loss is more than 3.0 nats above the reported train loss.")
    if final_heldout is not None and eval_train_loss is not None and float(final_heldout) - float(eval_train_loss) > 2.0:
        findings.append("final heldout loss is also far above the reported train loss.")
    if readiness.get("dialogue_readiness") == "not_ready":
        findings.append("dialogue readiness remained not_ready despite the low reported train loss.")

    loss_gap_status = "inconclusive"
    block_training = False
    if train_loss_is_last_observed_batch and final_gap is not None and final_gap > 3.0:
        loss_gap_status = "likely_accounting_bug"
        block_training = True
    elif final_gap is not None and final_gap > 3.0:
        loss_gap_status = "likely_eval_mismatch"
    elif final_gap is not None and final_gap > 1.5:
        loss_gap_status = "likely_data_mismatch"

    report = {
        "ok": True,
        "created_at_utc": now_utc(),
        "loss_gap_status": loss_gap_status,
        "block_training": block_training,
        "blocker_report": "artifacts/r27a10/reports/BLOCK_LOSS_ACCOUNTING.json" if block_training else "",
        "train_loss_trusted": not train_loss_is_last_observed_batch,
        "dev_loss_trusted": True,
        "heldout_loss_trusted": True,
        "reported_train_loss": eval_train_loss,
        "reported_train_loss_source": "last_segment_train_loss_end" if train_loss_is_last_observed_batch else "unknown_or_aggregate",
        "last_segment_train_loss_end": last_train_loss,
        "final_dev_loss": final_dev,
        "final_stratified_heldout_loss": final_heldout,
        "final_train_dev_gap": final_gap,
        "train_loss_is_last_observed_batch": train_loss_is_last_observed_batch,
        "train_loss_is_window_mean": train_loss_is_window_mean,
        "same_tokenizer_context_reported": len(context_lengths) <= 1,
        "context_lengths_seen": context_lengths,
        "sft_label_masking_audit": {
            "assistant_only_train_labels_confirmed": False,
            "full_sequence_cross_entropy_likely": True,
            "reason": "The committed training loop calls model(x, y) and the model uses cross_entropy over every target token.",
        },
        "dev_heldout_reduction": "windowed_average_eval_loss",
        "stage_count": stage_count,
        "stage_wise_losses": train_stage_losses,
        "length_distribution_sample": _length_bucket_report(root),
        "split_leakage": {
            "status": "no_direct_evidence",
            "note": "A10 did not find a direct leakage marker in A8B reports; this audit does not train on eval prompts.",
        },
        "overfit_signal": bool(final_gap is not None and final_gap > 3.0),
        "findings": findings,
        "recommended_fix": [
            "Stop using a single last-batch train loss as the headline train/dev comparison.",
            "Report train_loss_last_observed separately from train_loss_window_mean and train_loss_eval_window.",
            "Evaluate train/dev/heldout with the same tokenizer, context, reduction, and masking contract.",
            "Keep SFT/dialogue metrics stage-aware instead of comparing stage changes naively.",
            "Do not run R27A10 training until BLOCK_LOSS_ACCOUNTING is cleared.",
        ],
        "intake_reference": bool(intake),
        **NON_CLAIMS,
    }
    return report


def write_loss_calibration_report(root: Path = ROOT) -> dict[str, Any]:
    report = audit_loss_calibration(root)
    write_json(root / "artifacts/r27a10/reports/loss_calibration_audit.json", report)
    if report.get("block_training"):
        write_json(
            root / "artifacts/r27a10/reports/BLOCK_LOSS_ACCOUNTING.json",
            {
                "ok": False,
                "blocker": "loss_accounting_bug",
                "reason": "A8B reported train_loss is a last observed training-batch proxy and is not comparable to dev/heldout loss.",
                "clearance_required_before_training": True,
                "active_approval_after_completion": 0,
                **NON_CLAIMS,
            },
        )
    write_text(root / "docs/r27/R27A10_LOSS_CALIBRATION_AUDIT.md", render_loss_doc(report))
    return report


def audit_r27a11_loss_accounting_clearance(root: Path = ROOT) -> dict[str, Any]:
    validation = read_json(root / "artifacts/r27a11/reports/loss_accounting_validation.json", {})
    fixed = bool(validation.get("ok") and validation.get("loss_accounting_fixed"))
    return {
        "ok": fixed,
        "created_at_utc": now_utc(),
        "loss_gap_status": "fixed" if fixed else "BLOCK_LOSS_ACCOUNTING_CONTINUES",
        "block_training": not fixed,
        "train_loss_trusted": fixed,
        "dev_loss_trusted": fixed,
        "heldout_loss_trusted": fixed,
        "corrected_method": "token_weighted_average_negative_log_likelihood",
        "headline_train_loss_source": "running_train_loss_or_eval_train_loss" if fixed else "unknown",
        "last_batch_loss_debug_only": fixed,
        "validation_report": "artifacts/r27a11/reports/loss_accounting_validation.json",
        "recommended_fix": [] if fixed else ["Run scripts/r27a11_validate_loss_accounting.py and do not train until it passes."],
        **NON_CLAIMS,
    }


def render_loss_doc(report: dict[str, Any]) -> str:
    return f"""# R27A10 Loss Calibration Audit

R27A10 found a loss-calibration blocker before starting any new training.

## Result

- Status: `{report.get('loss_gap_status')}`
- Block training: `{report.get('block_training')}`
- Reported train loss: `{report.get('reported_train_loss')}`
- Reported train loss source: `{report.get('reported_train_loss_source')}`
- Final dev loss: `{report.get('final_dev_loss')}`
- Final stratified heldout loss: `{report.get('final_stratified_heldout_loss')}`
- Final train/dev gap: `{report.get('final_train_dev_gap')}`
- Train loss trusted: `{report.get('train_loss_trusted')}`
- Dev loss trusted: `{report.get('dev_loss_trusted')}`
- Heldout loss trusted: `{report.get('heldout_loss_trusted')}`

## Diagnosis

The A8B headline train loss is not an eval-equivalent aggregate. It matches the last segment `train_loss_end`, while dev and heldout are windowed evaluation losses. That makes the apparent 0.2459 vs 5.3019 gap a metric-accounting problem until a comparable train eval window is reported.

## Required Fix

- Add separate `train_loss_last_observed`, `train_loss_window_mean`, and `train_loss_eval_window` fields.
- Keep stage-aware metrics for Chinese/general, SFT/dialogue, RAG/value, and consolidation stages.
- Re-run training only after this blocker is cleared by a later approved repair.

R27A10 does not train, does not mutate corpus files, does not approve phase_4, and does not claim product/browser admission.
"""
