"""Reference/q4 stages invoked only after R29B1R has a verified CPU runtime."""
from __future__ import annotations

import json
import statistics
from pathlib import Path
from typing import Any

from src.training.reference.r29b1r_campaign import atomic_json
from src.training.reference.r29b1r_reference import sha256


ROOT = Path(__file__).resolve().parents[1]


def _read(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _checkpoint_for(supervisor: Any) -> Path:
    desktop = supervisor.prior_artifact_root.parents[2]
    checkpoint = desktop / "another_brain_train_r27a12" / "artifacts/r27a12/model_lab/checkpoints/r27a12_budgetfit_product_path_training_v1_seg10_chinese_general.pt"
    if not checkpoint.exists():
        raise RuntimeError("selected_r27a12_checkpoint_missing")
    return checkpoint


def _worker(supervisor: Any, environment: Any, phase: str, action: str, output: Path, extra: list[str], timeout: int = 1800) -> dict[str, Any]:
    trace = supervisor.run_probe(
        phase=phase,
        environment=environment,
        mode="clean",
        action=action,
        timeout=timeout,
        script=ROOT / "scripts/r29b1r_reference_worker.py",
        extra_args=[*extra, "--output", str(output)],
    )
    if trace["exit_code"] != 0 or trace["timed_out"] or not output.exists():
        raise RuntimeError(f"reference_worker_failed:{action}")
    return _read(output)


def _selection(report: dict[str, Any]) -> dict[str, Any]:
    choices = []
    for candidate in report["candidates"]:
        metrics = candidate["metrics"]
        top1 = sum(row["top1_match"] for row in metrics) / len(metrics)
        top5 = statistics.median(row["top5_overlap"] for row in metrics)
        cosine = statistics.median(row["logit_cosine"] for row in metrics)
        passes = (
            candidate["package_bytes"] <= 60_000_000
            and candidate["manifest_validation"]["ok"]
            and not candidate["missing_keys"]
            and not candidate["unexpected_keys"]
            and top1 >= 0.85
            and top5 >= 0.8
            and cosine >= 0.97
        )
        choices.append({"candidate_id": candidate["candidate_id"], "package_bytes": candidate["package_bytes"], "top1_agreement": top1, "median_top5_overlap": top5, "median_logit_cosine": cosine, "passes": passes, "manifest": candidate["manifest"]})
    passing = sorted((item for item in choices if item["passes"]), key=lambda item: (item["package_bytes"], item["candidate_id"]))
    return {"candidates": choices, "selected": passing[0] if passing else None, "projected_static_bundle_bytes": (passing[0]["package_bytes"] + 22_204_089) if passing else None}


def run_reference_pipeline(*, supervisor: Any, environment: Any, mps_status: dict[str, Any]) -> int:
    checkpoint = _checkpoint_for(supervisor)
    tokenizer = ROOT / "web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json"
    asset_dir = ROOT / "web/another_brain/model_assets/r28m1"
    if not tokenizer.exists():
        supervisor.write("ABORTED_SAFELY", reason="exact_runtime_tokenizer_missing")
        return 3
    inventory = {
        "selected_checkpoint": str(checkpoint),
        "checkpoint_sha256": sha256(checkpoint),
        "checkpoint_bytes": checkpoint.stat().st_size,
        "selection_evidence": str(supervisor.prior_artifact_root.parents[2] / "another_brain_train_r27a12/artifacts/r27a12/reports/model_selection.json"),
        "role": "r27a12_documented_new_96m_parent",
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
    }
    atomic_json(supervisor.artifact_root / "reports/checkpoint_inventory.json", inventory)
    safe = _worker(supervisor, environment, "CHECKPOINT_SAFE_LOAD", "safe-load", supervisor.artifact_root / "reports/checkpoint_safe_load.json", ["--checkpoint", str(checkpoint)])
    atomic_json(supervisor.artifact_root / "reports/checkpoint_tensor_inventory.json", safe["inventory"])
    atomic_json(supervisor.artifact_root / "reports/checkpoint_unsafe_globals.json", {"unsafe_globals": safe["loader"]["unsafe_globals"]})
    if not safe["strict_state_match"] or not safe["architecture_matches_expected"] or safe["inventory"]["nonfinite"]:
        supervisor.write("ABORTED_SAFELY", reason="checkpoint_structure_or_finiteness_failed", checkpoint_safe_load=safe)
        return 3
    architecture = {
        "source": "src/training/model_lab/mini_decoder.py",
        "contract": "pre_ln_multiheadattention_qkv_packed_residual_then_exact_gelu_mlp_residual",
        "layernorm_eps": 1e-5,
        "n_layer": 7,
        "n_embd": 896,
        "n_head": 14,
        "head_dim": 64,
        "context_length": 256,
        "vocab_size": 16000,
        "checkpoint_sha256": inventory["checkpoint_sha256"],
        "tokenizer_sha256": sha256(tokenizer),
    }
    atomic_json(supervisor.artifact_root / "reports/architecture_audit.json", architecture)
    fp32 = _worker(supervisor, environment, "FP32_REFERENCE", "fp32", supervisor.artifact_root / "reports/fp32_reference_generation.json", ["--checkpoint", str(checkpoint), "--tokenizer", str(tokenizer)], timeout=3600)
    kv = _worker(supervisor, environment, "KV_CACHE_PARITY", "kv-cache", supervisor.artifact_root / "reports/kv_cache_parity.json", ["--checkpoint", str(checkpoint), "--tokenizer", str(tokenizer)], timeout=3600)
    kv_ok = (
        kv["prefill_max_abs_error"] <= 1e-4
        and kv["incremental_max_abs_error"] <= 1e-4
        and kv["all_greedy_match"]
        and kv["generated_exact_match"]
        and kv["all_layers_advance"]
        and kv["reset_max_abs_error"] <= 1e-5
        and kv["overflow_rejected"]
        and kv["session_isolation_max_abs_error"] <= 1e-5
    )
    if not kv_ok:
        supervisor.write("ABORTED_SAFELY", reason="real_kv_cache_parity_failed", kv_cache_parity=kv)
        return 3
    current = _worker(supervisor, environment, "CURRENT_Q4_REFERENCE", "current-q4", supervisor.artifact_root / "reports/current_q4_reference.json", ["--checkpoint", str(checkpoint), "--tokenizer", str(tokenizer), "--asset-dir", str(asset_dir)], timeout=3600)
    current_metrics = {
        "median_top5_overlap": statistics.median(row["top5_overlap"] for row in current["rows"]),
        "median_logit_cosine": statistics.median(row["logit_cosine"] for row in current["rows"]),
        "top1_agreement": sum(row["top1_match"] for row in current["rows"]) / len(current["rows"]),
        "greedy_failure_rate": sum(not row["greedy_match"] for row in current["rows"]) / len(current["rows"]),
    }
    atomic_json(supervisor.artifact_root / "reports/fp32_vs_current_q4.json", {"metrics": current_metrics, "rows": current["rows"]})
    attribution = {
        "fp32_checkpoint_quality": "observed_in_fp32_reference_generation",
        "current_per_tensor_q4_degradation": current_metrics,
        "browser_scalar_implementation": "retained_R29B0_evidence_required_for_browser_only_claims",
        "missing_contextual_attention": "R29B0 documented false; R29B1R Python q4 uses full actual contextual model",
        "missing_kv_cache": "R29B0 documented false; R29B1R CPU KV parity is separate",
        "tokenizer_wrapper": "exact_runtime_tokenizer_and_training_wrapper_used",
        "quality_verifier_and_fallback": "not re-run; no public-answer claim",
    }
    atomic_json(supervisor.artifact_root / "reports/failure_attribution.json", attribution)
    q4v2 = _worker(supervisor, environment, "Q4V2_EXPERIMENT", "q4v2", supervisor.artifact_root / "reports/q4v2_experiment.json", ["--checkpoint", str(checkpoint), "--tokenizer", str(tokenizer), "--q4v2-root", str(supervisor.artifact_root / "q4v2")], timeout=7200)
    selection = _selection(q4v2)
    atomic_json(supervisor.artifact_root / "reports/q4v2_candidate_a.json", q4v2["candidates"][0])
    atomic_json(supervisor.artifact_root / "reports/q4v2_candidate_b.json", q4v2["candidates"][1])
    atomic_json(supervisor.artifact_root / "reports/q4v2_selection.json", selection)
    if not selection["selected"] or int(selection["projected_static_bundle_bytes"] or 10**12) >= 100_000_000:
        supervisor.write("ABORTED_SAFELY", reason="q4v2_quality_or_budget_gate_failed", q4v2_selection=selection)
        return 3
    supervisor.write(
        "FINAL_VALIDATION",
        selected_environment=environment.label,
        selected_checkpoint_sha256=inventory["checkpoint_sha256"],
        mps_status=mps_status,
        q4v2_selection=selection,
        training_started=False,
    )
    supervisor.write("PASSED_REFERENCE_Q4_GATE", selected_environment=environment.label, selected_checkpoint_sha256=inventory["checkpoint_sha256"], mps_status=mps_status, q4v2_selection=selection)
    return 0
