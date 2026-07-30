from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / "artifacts/r27a9b"
REPORTS = ART / "reports"
HANDOFF = ART / "handoff/R27_BROWSER_CANDIDATE_HANDOFF.json"
BLOCK = ART / "handoff/BLOCK_NO_CANDIDATE.json"
REGISTRY_SUMMARY = ROOT / "data/training_registry/r27a9b_browser_handoff_summary.json"
TOKENIZER = ROOT / "artifacts/r27a4/model_lab/tokenizer/tokenizer.json"

A8B_HANDOFF = ROOT / "artifacts/r27a8b/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json"
A8B_REPORTS = ROOT / "artifacts/r27a8b/reports"
A7R2_READY = ROOT / "artifacts/r27a7r2/go/R27A8B_READY.json"
A7_REPORTS = ROOT / "artifacts/r27a7/reports"
A6_BASELINE = A7_REPORTS / "r27a6_baseline.json"

NON_CLAIMS = {
    "engineering_candidate_only": True,
    "product_training": False,
    "formal_decoder_training": False,
    "phase_4": False,
    "product_model_admission": False,
    "browser_admission": False,
    "release_checkpoint": False,
    "weights_committed": False,
    "tokenizer_artifacts_committed": False,
    "artifacts_committed": False,
    "raw_corpus_committed": False,
    "clean_corpus_committed": False,
    "processed_corpus_committed": False,
    "external_llm_api_called": False,
    "doubao_called": False,
}


def read_json(path: Path, default: Any = None) -> Any:
    path = Path(path)
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> Any:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return data


def display_path(path: str | Path | None) -> str:
    if not path:
        return ""
    p = Path(path)
    if p.is_absolute():
        try:
            return str(p.relative_to(ROOT))
        except ValueError:
            return str(p)
    return str(p)


def resolve_repo_path(path: str | Path | None, root: Path = ROOT) -> Path | None:
    if not path:
        return None
    p = Path(path)
    if p.is_absolute():
        parts = p.parts
        if "artifacts" in parts:
            return root.joinpath(*parts[parts.index("artifacts") :])
        try:
            return p.relative_to(root)
        except ValueError:
            return p
    return root / p


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def checkpoint_info(path: str | Path | None, root: Path = ROOT) -> dict[str, Any]:
    resolved = resolve_repo_path(path, root)
    info = {
        "path": display_path(path),
        "exists": False,
        "size_bytes": 0,
        "corrupted": True,
        "reason": "checkpoint_missing",
    }
    if resolved is None:
        return info
    info["path"] = display_path(resolved)
    if not resolved.exists():
        return info
    size = resolved.stat().st_size
    info.update({"exists": True, "size_bytes": size})
    if size < 1024 * 1024:
        info["reason"] = "checkpoint_too_small"
        return info
    info.update({"corrupted": False, "reason": ""})
    return info


def tokenizer_info(root: Path = ROOT) -> dict[str, Any]:
    path = root / "artifacts/r27a4/model_lab/tokenizer/tokenizer.json"
    return {
        "path": display_path(path),
        "exists": path.exists(),
        "mismatch": not path.exists(),
        "reason": "" if path.exists() else "tokenizer_missing",
    }


def _number(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _score_loss(loss: Any) -> float:
    if loss is None:
        return 0.0
    return max(0.0, min(1.0, (6.5 - _number(loss, 6.5)) / 3.0))


def _bool_score(value: Any) -> float:
    return 1.0 if value else 0.0


def _matching_segment(ledger: dict[str, Any], checkpoint_path: str) -> dict[str, Any]:
    for segment in ledger.get("segments", []):
        if segment.get("checkpoint_path") == checkpoint_path:
            return segment
    return {}


def _best_a8b_checkpoint(ledger: dict[str, Any]) -> tuple[str, str]:
    best = ledger.get("best_checkpoints", {})
    for kind, key in (
        ("best_product_probe", "best_product_probe_checkpoint"),
        ("best_dialogue_readiness", "best_dialogue_readiness_checkpoint"),
        ("best_rag_honesty", "best_rag_honesty_checkpoint"),
        ("best_dev_loss", "best_dev_loss_checkpoint"),
    ):
        if best.get(key):
            return kind, best[key]
    return "final_checkpoint", best.get("final_checkpoint", "")


def _a8b_candidate_from_reports() -> dict[str, Any] | None:
    ledger = read_json(A8B_REPORTS / "campaign_ledger.json", {})
    if not ledger:
        return None
    evaluation = read_json(A8B_REPORTS / "campaign_evaluation.json", {})
    readiness = read_json(A8B_REPORTS / "dialogue_readiness.json", {})
    budget = read_json(A8B_REPORTS / "100mb_budget.json", {})
    handoff_decision = read_json(A8B_REPORTS / "candidate_handoff_decision.json", {})
    kind, checkpoint_path = _best_a8b_checkpoint(ledger)
    segment = _matching_segment(ledger, checkpoint_path)
    best = ledger.get("best_checkpoints", {})
    final_checkpoint = best.get("final_checkpoint", "")
    final_worse = bool(final_checkpoint and final_checkpoint != checkpoint_path)
    return {
        "candidate_id": f"r27a8b_{kind}",
        "source": "r27a8b",
        "source_priority": 1,
        "campaign_id": ledger.get("campaign_id", "r27a8b_resource_safe_overnight_v1"),
        "input_surfaces": [
            display_path(A8B_HANDOFF),
            display_path(A8B_REPORTS),
            display_path(A7R2_READY),
        ],
        "source_handoff_written": bool(handoff_decision.get("handoff_written")) or A8B_HANDOFF.exists(),
        "source_handoff_safe": bool(handoff_decision.get("safe")) or A8B_HANDOFF.exists(),
        "checkpoint_kind": kind,
        "checkpoint_path": checkpoint_path,
        "final_checkpoint_path": final_checkpoint,
        "final_not_selected_reason": "final_worse_than_best_or_not_best_probe" if final_worse else "",
        "selected_model": ledger.get("selected_model", "new_100m"),
        "selected_device": ledger.get("device", ""),
        "context_length": segment.get("context_length") or ledger.get("launch", {}).get("selected_context_length"),
        "parameter_count": segment.get("parameter_count") or budget.get("parameter_count"),
        "optimizer_tokens": ledger.get("optimizer_tokens", 0),
        "wall_clock_seconds": ledger.get("wall_clock_seconds", 0),
        "dev_loss": segment.get("dev_loss", best.get("best_dev_loss", evaluation.get("dev_loss"))),
        "heldout_loss": segment.get("stratified_heldout_loss", evaluation.get("stratified_heldout_loss")),
        "dialogue_readiness_label": readiness.get("dialogue_readiness", "unknown"),
        "dialogue_readiness_score": segment.get("dialogue_readiness_score", best.get("best_dialogue_readiness", 0.0)),
        "rag_honesty_score": segment.get("rag_honesty_score", best.get("best_rag_honesty", 0.0)),
        "answer_as_user_score": segment.get("product_probe_score", best.get("best_product_probe", 0.0)),
        "chinese_first_behavior": readiness.get("chinese_first_behavior", "unknown"),
        "safety_guard_score": 1.0 if readiness.get("safety_guard") == "clean" else 0.0,
        "leakage_detected": not all(
            readiness.get(key) is True
            for key in ("no_private_leakage", "no_eval_leakage", "no_old_pack_leakage", "no_hidden_prompt", "no_chain_of_thought")
        ),
        "collapse_risk": readiness.get("collapse_risk", 0.0),
        "fits_100mb": bool(budget.get("fits_100mb")),
        "q4_total_estimate_bytes": budget.get("budget", {}).get("q4_total_estimate_bytes"),
        "budget_risk": budget.get("budget", {}).get("budget_risk", "unknown"),
        **NON_CLAIMS,
    }


def _a7_candidate_from_reports() -> dict[str, Any] | None:
    evaluation = read_json(A7_REPORTS / "campaign_evaluation_report.json", {})
    readiness = read_json(A7_REPORTS / "dialogue_readiness_report.json", {})
    budget = read_json(A7_REPORTS / "100mb_browser_budget_report.json", {})
    if not evaluation:
        return None
    checkpoint_path = evaluation.get("best_checkpoint_path") or budget.get("best_checkpoint_path", "")
    return {
        "candidate_id": "r27a7_best_reported_checkpoint",
        "source": "r27a7",
        "source_priority": 4,
        "campaign_id": evaluation.get("campaign_id", "r27a7_mps_24h_large_decoder_v1"),
        "checkpoint_kind": "best_reported_checkpoint",
        "checkpoint_path": checkpoint_path,
        "final_checkpoint_path": "",
        "selected_model": evaluation.get("selected_scale") or budget.get("selected_scale"),
        "selected_device": evaluation.get("device_result"),
        "parameter_count": budget.get("selected_model_params"),
        "optimizer_tokens": evaluation.get("total_train_tokens", 0),
        "wall_clock_seconds": evaluation.get("observed_wall_clock_seconds", 0),
        "dev_loss": evaluation.get("best_dev_loss"),
        "heldout_loss": evaluation.get("best_heldout_loss"),
        "dialogue_readiness_label": readiness.get("overall_readiness_label", "unknown"),
        "dialogue_readiness_score": readiness.get("dialogue_score", 0.0),
        "rag_honesty_score": readiness.get("rag_honesty_score", 0.0),
        "answer_as_user_score": readiness.get("answer_as_user_score", 0.0),
        "chinese_first_behavior": "continued_lineage",
        "safety_guard_score": readiness.get("safety_guard_score", 0.0),
        "leakage_detected": bool(readiness.get("private_training_data_leakage"))
        or bool(readiness.get("eval_prompt_memorization_detected"))
        or _number(readiness.get("old_excluded_rows_used"), 1.0) > 0
        or bool(readiness.get("chain_of_thought_saved")),
        "collapse_risk": readiness.get("collapse_risk_score", 1.0),
        "fits_100mb": bool(budget.get("fits_100mb_q4") or budget.get("fits_current_100mb_budget")),
        "q4_total_estimate_bytes": budget.get("total_q4_with_app_estimate_bytes") or budget.get("q4_total_estimate_bytes"),
        "budget_risk": "low" if budget.get("fits_current_100mb_budget") else "high",
        **NON_CLAIMS,
    }


def _a6_candidate_from_reports() -> dict[str, Any] | None:
    baseline = read_json(A6_BASELINE, {})
    if not baseline:
        return None
    return {
        "candidate_id": "r27a6_best_baseline_checkpoint",
        "source": "r27a6",
        "source_priority": 5,
        "campaign_id": "r27a6_autonomous_longrun_dialogue_readiness_v1",
        "checkpoint_kind": baseline.get("best_checkpoint_kind", "best_product_probe"),
        "checkpoint_path": baseline.get("best_checkpoint_path", ""),
        "final_checkpoint_path": "",
        "selected_model": baseline.get("model_config", {}).get("model_size", "mini_8m"),
        "selected_device": baseline.get("r27a6_device", "unknown"),
        "context_length": baseline.get("model_config", {}).get("context_length"),
        "parameter_count": baseline.get("params"),
        "optimizer_tokens": baseline.get("model_config", {}).get("max_train_tokens", 0),
        "dev_loss": baseline.get("dev_loss"),
        "heldout_loss": baseline.get("heldout_loss"),
        "dialogue_readiness_label": baseline.get("dialogue_readiness_label", "unknown"),
        "dialogue_readiness_score": 0.0,
        "rag_honesty_score": baseline.get("rag_honesty_score", 0.0),
        "answer_as_user_score": 0.0,
        "chinese_first_behavior": "baseline_lineage",
        "safety_guard_score": 1.0 if not baseline.get("missing_evidence") else 0.0,
        "leakage_detected": False,
        "collapse_risk": baseline.get("collapse_risk_score", 1.0),
        "fits_100mb": True,
        "q4_total_estimate_bytes": 58964064,
        "budget_risk": "low",
        **NON_CLAIMS,
    }


def intake_candidates() -> dict[str, Any]:
    candidates = []
    for loader in (_a8b_candidate_from_reports, _a7_candidate_from_reports, _a6_candidate_from_reports):
        candidate = loader()
        if candidate:
            candidates.append(candidate)
    report = {
        "ok": True,
        "a8b_handoff_present": A8B_HANDOFF.exists(),
        "a8b_reports_present": A8B_REPORTS.exists(),
        "a7r2_ready_present": A7R2_READY.exists(),
        "a7_reports_present": A7_REPORTS.exists(),
        "a6_baseline_present": A6_BASELINE.exists(),
        "a7r2_ready": read_json(A7R2_READY, {}),
        "candidate_count": len(candidates),
        "candidates": candidates,
        "no_training_ran": True,
        **NON_CLAIMS,
    }
    return write_json(REPORTS / "candidate_inventory.json", report)


def hard_reject_reasons(candidate: dict[str, Any], root: Path = ROOT) -> list[str]:
    reasons = []
    ckpt = checkpoint_info(candidate.get("checkpoint_path"), root)
    tok = tokenizer_info(root)
    if _number(candidate.get("safety_guard_score"), 0.0) < 1.0:
        reasons.append("safety_guard_below_1")
    if candidate.get("leakage_detected"):
        reasons.append("leakage_detected")
    if ckpt["corrupted"]:
        reasons.append(ckpt["reason"])
    if tok["mismatch"]:
        reasons.append(tok["reason"])
    if candidate.get("fits_100mb") is not True:
        reasons.append("q4_budget_impossible")
    if _number(candidate.get("rag_honesty_score"), 0.0) < 0.2:
        reasons.append("rag_honesty_catastrophic")
    if _number(candidate.get("collapse_risk"), 1.0) >= 0.5:
        reasons.append("collapse_risk_high")
    if candidate.get("checkpoint_kind") == "final_checkpoint" and candidate.get("final_not_selected_reason") == "final_worse_than_best_or_not_best_probe":
        reasons.append("final_worse_than_best_without_justification")
    return reasons


def score_candidate(candidate: dict[str, Any], root: Path = ROOT) -> dict[str, Any]:
    ckpt = checkpoint_info(candidate.get("checkpoint_path"), root)
    tok = tokenizer_info(root)
    reject = hard_reject_reasons(candidate, root)
    collapse_score = max(0.0, min(1.0, 1.0 - _number(candidate.get("collapse_risk"), 1.0)))
    components = {
        "safety": 0.20 * min(1.0, _number(candidate.get("safety_guard_score"), 0.0)),
        "budget": 0.12 * _bool_score(candidate.get("fits_100mb")),
        "dialogue": 0.16 * min(1.0, _number(candidate.get("dialogue_readiness_score"), 0.0)),
        "rag_honesty": 0.14 * min(1.0, _number(candidate.get("rag_honesty_score"), 0.0)),
        "answer_as_user": 0.12 * min(1.0, _number(candidate.get("answer_as_user_score"), 0.0)),
        "chinese_first": 0.08 * (1.0 if candidate.get("chinese_first_behavior") not in {"unknown", ""} else 0.0),
        "collapse": 0.08 * collapse_score,
        "export_readiness": 0.06 * (1.0 if ckpt["exists"] and tok["exists"] else 0.0),
        "loss": 0.04 * _score_loss(candidate.get("dev_loss")),
    }
    score = 0.0 if reject else round(sum(components.values()), 6)
    ranked = {
        **candidate,
        "eligible": not reject,
        "score": score,
        "score_components": components,
        "hard_reject_reasons": reject,
        "checkpoint_info": ckpt,
        "tokenizer_info": tok,
    }
    return ranked


def rank_candidate_dicts(candidates: list[dict[str, Any]], root: Path = ROOT) -> dict[str, Any]:
    ranked = [score_candidate(candidate, root) for candidate in candidates]
    ranked.sort(key=lambda item: (item["eligible"], item["score"], -int(item.get("source_priority", 99))), reverse=True)
    selected = next((item for item in ranked if item["eligible"]), None)
    return {
        "ok": True,
        "candidate_count": len(candidates),
        "eligible_count": sum(1 for item in ranked if item["eligible"]),
        "selected_candidate_id": selected.get("candidate_id") if selected else None,
        "selected_candidate": selected,
        "ranked_candidates": ranked,
        "no_training_ran": True,
        **NON_CLAIMS,
    }


def rank_candidates(include_recovery: bool = False) -> dict[str, Any]:
    inventory = read_json(REPORTS / "candidate_inventory.json", None) or intake_candidates()
    candidates = list(inventory.get("candidates", []))
    if include_recovery:
        recovery = read_json(REPORTS / "micro_recovery_result.json", {})
        if recovery.get("candidate"):
            candidates.append(recovery["candidate"])
    report = rank_candidate_dicts(candidates, ROOT)
    report["include_recovery"] = include_recovery
    return write_json(REPORTS / "candidate_ranking.json", report)


def build_freeze_decision(ranking: dict[str, Any]) -> dict[str, Any]:
    selected = ranking.get("selected_candidate")
    if not selected:
        return {
            "ok": False,
            "decision": "BLOCK_NO_CANDIDATE",
            "reason": "no_candidate_passed_hard_rejects",
            "selected_candidate": None,
            "micro_recovery_required": False,
            "micro_recovery_skipped_reason": "no_safe_base_candidate",
            "no_training_ran": True,
            **NON_CLAIMS,
        }
    weak = selected.get("dialogue_readiness_label") not in {"candidate", "ready"}
    return {
        "ok": True,
        "decision": "FREEZE_ENGINEERING_CANDIDATE",
        "selected_candidate_id": selected.get("candidate_id"),
        "selected_candidate": selected,
        "checkpoint_selection": "best_checkpoint_not_final",
        "final_checkpoint_policy": selected.get("final_not_selected_reason") or "final_not_selected_unless_best",
        "candidate_is_weak": weak,
        "micro_recovery_required": False,
        "micro_recovery_skipped_reason": "default_skip_candidate_safe_but_a9b_closeout_only" if weak else "not_needed",
        "handoff_is_product_admission": False,
        "no_training_ran": True,
        **NON_CLAIMS,
    }


def make_freeze_decision() -> dict[str, Any]:
    ranking = read_json(REPORTS / "candidate_ranking.json", None) or rank_candidates()
    return write_json(REPORTS / "freeze_decision.json", build_freeze_decision(ranking))


def write_browser_handoff_manifest() -> dict[str, Any]:
    decision = read_json(REPORTS / "freeze_decision.json", None) or make_freeze_decision()
    if decision.get("decision") == "BLOCK_NO_CANDIDATE":
        block = {
            **decision,
            "handoff_written": False,
            "handoff_path": display_path(BLOCK),
        }
        write_json(BLOCK, block)
        write_registry_summary(block)
        return block
    selected = decision["selected_candidate"]
    ckpt_path = resolve_repo_path(selected.get("checkpoint_path"), ROOT)
    ckpt_hash = file_sha256(ckpt_path) if ckpt_path and ckpt_path.exists() else ""
    handoff = {
        "ok": True,
        "decision": "FREEZE_ENGINEERING_CANDIDATE",
        "handoff_status": "engineering_candidate_weak_not_product_ready"
        if decision.get("candidate_is_weak")
        else "engineering_candidate",
        "campaign_id": selected.get("campaign_id"),
        "candidate_id": selected.get("candidate_id"),
        "source": selected.get("source"),
        "checkpoint_kind": selected.get("checkpoint_kind"),
        "checkpoint_path": selected.get("checkpoint_path"),
        "checkpoint_sha256": ckpt_hash,
        "checkpoint_size_bytes": selected.get("checkpoint_info", {}).get("size_bytes"),
        "selected_model": selected.get("selected_model"),
        "selected_device": selected.get("selected_device"),
        "context_length": selected.get("context_length"),
        "parameter_count": selected.get("parameter_count"),
        "tokenizer_path": display_path(TOKENIZER),
        "optimizer_tokens": selected.get("optimizer_tokens"),
        "dev_loss": selected.get("dev_loss"),
        "heldout_loss": selected.get("heldout_loss"),
        "dialogue_readiness_label": selected.get("dialogue_readiness_label"),
        "dialogue_readiness_score": selected.get("dialogue_readiness_score"),
        "rag_honesty_score": selected.get("rag_honesty_score"),
        "answer_as_user_score": selected.get("answer_as_user_score"),
        "chinese_first_behavior": selected.get("chinese_first_behavior"),
        "collapse_risk": selected.get("collapse_risk"),
        "safety_guard_score": selected.get("safety_guard_score"),
        "leakage_detected": selected.get("leakage_detected"),
        "fits_100mb": selected.get("fits_100mb"),
        "q4_total_estimate_bytes": selected.get("q4_total_estimate_bytes"),
        "budget_risk": selected.get("budget_risk"),
        "final_checkpoint_path": selected.get("final_checkpoint_path"),
        "final_not_selected_reason": selected.get("final_not_selected_reason"),
        "b_line_instruction": "Evaluate this as an engineering candidate only; do not treat it as product/browser admission.",
        "micro_recovery_ran": False,
        **NON_CLAIMS,
    }
    write_json(HANDOFF, handoff)
    write_registry_summary(handoff)
    return handoff


def evaluate_handoff_candidate() -> dict[str, Any]:
    handoff = read_json(HANDOFF, None)
    if not handoff:
        block = read_json(BLOCK, {})
        report = {"ok": False, "status": "BLOCK_NO_CANDIDATE", "block": block, "no_training_ran": True, **NON_CLAIMS}
        return write_json(REPORTS / "handoff_evaluation.json", report)
    ckpt = checkpoint_info(handoff.get("checkpoint_path"), ROOT)
    tok = tokenizer_info(ROOT)
    failures = []
    if ckpt["corrupted"]:
        failures.append(ckpt["reason"])
    if tok["mismatch"]:
        failures.append(tok["reason"])
    if handoff.get("safety_guard_score") != 1.0:
        failures.append("safety_not_clean")
    if handoff.get("leakage_detected"):
        failures.append("leakage_detected")
    if handoff.get("fits_100mb") is not True:
        failures.append("budget_not_fit")
    for key, expected in NON_CLAIMS.items():
        if handoff.get(key) is not expected:
            failures.append(f"{key}_claim_mismatch")
    report = {
        "ok": not failures,
        "failures": failures,
        "candidate_id": handoff.get("candidate_id"),
        "checkpoint_info": ckpt,
        "tokenizer_info": tok,
        "dialogue_readiness_label": handoff.get("dialogue_readiness_label"),
        "engineering_candidate_only": True,
        "no_training_ran": True,
        **NON_CLAIMS,
    }
    return write_json(REPORTS / "handoff_evaluation.json", report)


def write_budget_report() -> dict[str, Any]:
    handoff = read_json(HANDOFF, None)
    if not handoff:
        report = {"ok": False, "status": "BLOCK_NO_CANDIDATE", "no_training_ran": True, **NON_CLAIMS}
    else:
        report = {
            "ok": True,
            "candidate_id": handoff.get("candidate_id"),
            "parameter_count": handoff.get("parameter_count"),
            "fits_100mb": handoff.get("fits_100mb"),
            "q4_total_estimate_bytes": handoff.get("q4_total_estimate_bytes"),
            "budget_risk": handoff.get("budget_risk"),
            "browser_admission": False,
            "release_checkpoint": False,
            "no_training_ran": True,
            **NON_CLAIMS,
        }
    return write_json(REPORTS / "100mb_budget.json", report)


def write_registry_summary(handoff_or_block: dict[str, Any]) -> dict[str, Any]:
    summary = {
        "ok": bool(handoff_or_block.get("ok")),
        "decision": handoff_or_block.get("decision"),
        "candidate_id": handoff_or_block.get("candidate_id"),
        "source": handoff_or_block.get("source"),
        "campaign_id": handoff_or_block.get("campaign_id"),
        "checkpoint_kind": handoff_or_block.get("checkpoint_kind"),
        "checkpoint_path": handoff_or_block.get("checkpoint_path"),
        "handoff_path": display_path(HANDOFF if handoff_or_block.get("ok") else BLOCK),
        "dialogue_readiness_label": handoff_or_block.get("dialogue_readiness_label"),
        "fits_100mb": handoff_or_block.get("fits_100mb"),
        "q4_total_estimate_bytes": handoff_or_block.get("q4_total_estimate_bytes"),
        "micro_recovery_ran": handoff_or_block.get("micro_recovery_ran", False),
        "active_approvals_after_completion": 0,
        **NON_CLAIMS,
    }
    return write_json(REGISTRY_SUMMARY, summary)


def create_recovery_marker(args: argparse.Namespace) -> dict[str, Any]:
    marker = {
        "active": True,
        "campaign_id": args.campaign_id,
        "wall_clock_cap_hours": args.wall_clock_cap_hours,
        "max_optimizer_tokens": args.max_optimizer_tokens,
        "max_segments": args.max_segments,
        "allow_sweep": False,
        "lower_lr": True,
        "product_training": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "release_checkpoint": False,
    }
    return write_json(REPORTS / "recovery_marker.json", marker)


def run_micro_recovery(args: argparse.Namespace) -> dict[str, Any]:
    marker = read_json(REPORTS / "recovery_marker.json", {})
    decision = read_json(REPORTS / "freeze_decision.json", {})
    required = bool(decision.get("micro_recovery_required"))
    report = {
        "ok": not required,
        "campaign_id": args.campaign_id,
        "status": "skipped_not_required" if not required else "blocked_manual_review_required",
        "reason": "R27A9B default path does not run recovery unless freeze decision explicitly requires it.",
        "marker_active": bool(marker.get("active")),
        "training_ran": False,
        "optimizer_tokens": 0,
        "wall_clock_seconds": 0,
        "max_optimizer_tokens": marker.get("max_optimizer_tokens"),
        "max_segments": marker.get("max_segments"),
        **NON_CLAIMS,
    }
    return write_json(REPORTS / "micro_recovery_result.json", report)


def consume_recovery_marker(args: argparse.Namespace) -> dict[str, Any]:
    marker = read_json(REPORTS / "recovery_marker.json", {})
    marker.update({"active": False, "consumed": True, "campaign_id": args.campaign_id, "active_approval_after_completion": 0})
    return write_json(REPORTS / "recovery_marker.json", marker)
