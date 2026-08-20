#!/usr/bin/env python3
"""Record a reviewed R29B2M-R1 data-quality terminal decision."""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_q4_source import sha256_file  # noqa: E402
from src.training.mlx.r29b2m_r1_campaign import (  # noqa: E402
    CAMPAIGN_ID,
    TERMINAL_STATES,
    atomic_json,
    initial_state,
    utc_now,
)


POLICY_LANGUAGE = (
    "答案继续沿着刚才",
    "仍按同一对象回答",
    "省掉前情",
    "对象保持不变",
    "继续绑定刚才的对象",
    "只谈当前这一项",
    "回复里只留下有效版本",
    "最后的信息覆盖旧值",
    "执行时只使用新信息",
    "逐项守住条件",
    "方案要在限制内落地",
    "先检查限制，再给方案",
    "备选也必须留在边界内",
    "新增条件与原请求一起保留",
    "移除的条件不再限制答案",
    "回答前按有效条件核对",
    "把比较收在两个关键维度",
    "证据不足时不补成确定结论",
    "问题要具体而且少",
    "先确认对象",
    "用一句问题锁定缺失条件",
    "不列措施，也不写总结",
    "测试场景也保持同一边界",
    "口头保证不能代替本人授权",
    "答案仍然是不提供",
    "直接说怎么做即可",
    "最容易出错的地方先避开",
    "短短接住就好",
)
STOCK_CLOSURE_OR_COLLISION = ("即可即可", "便够了", "就好。")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--observations", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    args = parser.parse_args()
    if len(args.source_revision) != 40:
        raise ValueError("source_revision_must_be_full_sha")
    artifact_root = args.artifact_root.resolve()
    audit_dir = artifact_root / "agent_audit"
    sample_path = audit_dir / "semantic_audit_sample.jsonl"
    sample_manifest_path = audit_dir / "sample_manifest.json"
    sample_manifest = json.loads(sample_manifest_path.read_text(encoding="utf-8"))
    observations = json.loads(args.observations.read_text(encoding="utf-8"))
    rows = read_jsonl(sample_path)
    row_ids = {row["session_id"] for row in rows}
    if sample_manifest.get("sample_sha256") != sha256_file(sample_path):
        raise ValueError("semantic_audit_sample_hash_changed")
    if observations.get("sample_sha256") != sample_manifest.get("sample_sha256"):
        raise ValueError("semantic_observations_sample_hash_mismatch")
    if observations.get("reviewer_class") != "codex_agent_semantic_review_not_human":
        raise ValueError("semantic_reviewer_class_mismatch")
    if observations.get("reviewed_sample_count") != len(rows) or len(rows) < 400:
        raise ValueError("semantic_review_count_below_contract")
    if observations.get("decision") != "BLOCKED_DATA_QUALITY_WITH_EVIDENCE":
        raise ValueError("unexpected_semantic_review_decision")
    examples = [example for issue in observations.get("issues", []) for example in issue.get("example_session_ids", [])]
    missing_examples = sorted(set(examples) - row_ids)
    if missing_examples:
        raise ValueError(f"semantic_example_not_in_sample:{missing_examples}")

    policy_hits = [row for row in rows if any(phrase in row["target"] for phrase in POLICY_LANGUAGE)]
    closure_hits = [row for row in rows if any(phrase in row["target"] for phrase in STOCK_CLOSURE_OR_COLLISION)]
    policy_by_family = dict(sorted(Counter(row["family_id"] for row in policy_hits).items()))
    validation_path = artifact_root / "dataset" / "dataset_validation.json"
    validation = json.loads(validation_path.read_text(encoding="utf-8"))
    if not validation.get("valid"):
        raise ValueError("deterministic_dataset_validation_not_current")
    resource_path = artifact_root / "reports" / "resource_measurement.json"
    resource = json.loads(resource_path.read_text(encoding="utf-8"))
    if resource.get("decision") not in {"RESOURCE_READY", "RESOURCE_WARNING"}:
        raise ValueError("resource_evidence_not_ready_for_data_block")

    now = utc_now()
    audit_report = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": now,
        "valid": False,
        "decision": "BLOCKED_DATA_QUALITY_WITH_EVIDENCE",
        "reviewer_class": "codex_agent_semantic_review_not_human",
        "human_review_completed": False,
        "reviewed_sample_count": len(rows),
        "sample_sha256": sha256_file(sample_path),
        "sample_counts": sample_manifest["counts"],
        "all_families_represented": sample_manifest["all_families_represented"],
        "train_and_dev_represented_in_every_family": sample_manifest["train_and_dev_represented_in_every_family"],
        "semantic_checks": {
            "expected_behaviour_satisfied": False,
            "natural_voice": False,
            "not_customer_service_template": False,
            "no_wrong_or_injected_fact": False,
            "correct_referent": False,
            "not_overexplained": False,
        },
        "supporting_counts": {
            "sample_targets_with_explicit_generator_policy_language": len(policy_hits),
            "policy_language_hits_by_family": policy_by_family,
            "sample_targets_with_stock_closure_or_grammatical_collision": len(closure_hits),
            "minimum_manually_cited_failed_examples": len(set(examples)),
        },
        "issues": observations["issues"],
        "root_cause": observations["root_cause"],
        "repair_assessment": observations["repair_assessment"],
        "deterministic_validation_passed": True,
        "deterministic_validation_sha256": sha256_file(validation_path),
        "dataset_admitted_for_training": False,
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
    }
    atomic_json(audit_dir / "semantic_audit.json", audit_report)
    sample_manifest["review_status"] = "failed_systematic_data_quality"
    sample_manifest["review_completed_at"] = now
    sample_manifest["semantic_audit_sha256"] = sha256_file(audit_dir / "semantic_audit.json")
    atomic_json(sample_manifest_path, sample_manifest)

    state = initial_state(artifact_root=artifact_root, source_revision=args.source_revision)
    state.update({
        "state": "BLOCKED_DATA_QUALITY_WITH_EVIDENCE",
        "phase_started_at": now,
        "updated_at": now,
        "terminal_reason": "codex_semantic_audit_found_systematic_generator_target_misalignment",
        "terminal_evidence": {
            "semantic_audit": str(audit_dir / "semantic_audit.json"),
            "dataset_validation": str(validation_path),
            "resource_measurement": str(resource_path),
        },
        "dataset_admitted_for_training": False,
    })
    if state["state"] not in TERMINAL_STATES:
        raise AssertionError("terminal_state_contract")
    atomic_json(artifact_root / "campaign_state.json", state)
    atomic_json(artifact_root / "heartbeat_latest.json", {
        "campaign_id": CAMPAIGN_ID,
        "created_at": now,
        "state": state["state"],
        "process_active": False,
        "child_pid": None,
        "child_command": None,
        "last_output": "training_not_started_dataset_semantic_audit_failed",
        "last_output_at": now,
    })

    final_report = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": now,
        "terminal_state": state["state"],
        "source_revision": args.source_revision,
        "parent_checkpoint_id": None,
        "candidate_checkpoint_id": None,
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
        "current_process_active": False,
        "heartbeat_status": "terminal_no_child",
        "prior_evidence_adopted": True,
        "q4_encoding": "signed_int4_offset_binary_zero_point_8_low_then_high",
        "browser_integer_decoder_repaired": True,
        "resource_decision": resource["decision"],
        "resource_measurement": {
            key: resource[key]
            for key in (
                "model_weight_bytes",
                "optimizer_state_bytes",
                "full_checkpoint_bytes",
                "current_free_disk_bytes",
                "measured_final_dataset_bytes",
                "dynamic_disk_contract",
                "projected_post_campaign_free_bytes",
            )
        },
        "dataset_deterministic_validation": {
            "valid": validation["valid"],
            "session_count": validation["session_count"],
            "assistant_target_tokens_total": validation["assistant_target_tokens_total"],
            "eval_contamination": validation["reports"]["eval_contamination"],
            "assistant_mask_audit": validation["reports"]["assistant_mask_audit"],
        },
        "dataset_semantic_audit": {
            "valid": False,
            "reviewer_class": audit_report["reviewer_class"],
            "reviewed_sample_count": audit_report["reviewed_sample_count"],
            "human_review_completed": False,
            "supporting_counts": audit_report["supporting_counts"],
        },
        "baseline_vs_current_generated_metrics": "not_run_no_training_candidate",
        "category_regressions": "not_applicable_dataset_blocked_before_training",
        "critical_failures": ["systematic_training_target_misalignment"],
        "decision": "Do not start SFT; rebuild scenario-specific targets and repeat deterministic plus Codex semantic audit.",
        "weights_committed": False,
        "corpus_committed": False,
        "public_model_replaced": False,
        "deployment_performed": False,
        "browser_admission_claimed": False,
        "product_admission_claimed": False,
        "next_state": "BLOCKED_DATA_QUALITY_WITH_EVIDENCE",
    }
    atomic_json(artifact_root / "reports" / "final_engineering_report.json", final_report)
    print(json.dumps({
        "terminal_state": state["state"],
        "reviewed": len(rows),
        "policy_language_hits": len(policy_hits),
        "stock_closure_or_collision_hits": len(closure_hits),
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
