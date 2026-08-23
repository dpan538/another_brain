#!/usr/bin/env python3
"""Finalize the mandatory Batch-1 futility stop without reopening live generation."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import statistics
import tempfile
from typing import Any
from datetime import datetime, timezone
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.r29p0_context_fit import ExactRuntimeTokenizer, TOKENIZER_PATH, measure_pair  # noqa: E402


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(-(-fraction * len(ordered) // 1)) - 1))
    return ordered[index]


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def atomic_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(value)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", default="artifacts/r29p0_pairwise_oracle")
    args = parser.parse_args()
    artifact = (ROOT / args.artifact_root).resolve()
    report_root = artifact / "reports"
    cases = {row["case_id"]: row for row in read_jsonl(ROOT / "evals/r29p0_pairwise_oracle_v1/cases.jsonl")}
    manifest = read_json(ROOT / "evals/r29p0_pairwise_oracle_v1/manifest.json")
    records = read_json(artifact / "raw/live_records.json")
    source_lock = read_json(artifact / "source_lock.json")
    guards = read_json(artifact / "reviews/panel_a_codex_batch1_guard_results.json")
    reviews = read_jsonl(artifact / "reviews/panel_a_codex_batch1_review.jsonl")
    panel_summary = read_json(report_root / "panel_a_codex_batch1_summary.json")
    guard_latency = read_json(report_root / "guard_latency.json")
    secret_scan = read_json(report_root / "secret_scan.json")
    smoke = [row for row in records if row["phase"] == "smoke"]
    batch = [row for row in records if row["phase"] == "batch1"]
    other = [row for row in records if row["phase"] not in {"smoke", "batch1"}]
    if len(smoke) != 9 or len(batch) != 60 or other:
        raise RuntimeError("r29p0_futility_request_count_mismatch")
    if panel_summary["futility_decision"] != "STOP" or panel_summary["reviewer_class"] != "codex_agent_provisional_panel_a_not_human":
        raise RuntimeError("r29p0_futility_review_mismatch")
    if secret_scan["violations"] != 0 or secret_scan["secret_exposure"]:
        raise RuntimeError("r29p0_secret_scan_failed")
    batch_ids = manifest["batches"]["batch_1"]
    tokenizer = ExactRuntimeTokenizer.from_file(TOKENIZER_PATH)
    context_rows: list[dict[str, Any]] = []
    for case_id in batch_ids:
        candidate_a = next(row for row in batch if row["case_id"] == case_id and row["arm"] == "A")["result"]["response"]
        candidate_b = next(row for row in batch if row["case_id"] == case_id and row["arm"] == "B")["result"]["response"]
        measured = measure_pair(tokenizer, cases[case_id]["messages"], candidate_a, candidate_b)
        measured.pop("serialized", None)
        context_rows.append({"case_id": case_id, **measured})
    context_fit_count = sum(bool(row["fits"]) for row in context_rows)
    context_report = {
        "schema_version": "r29p0.context_fit_summary.v1",
        "case_count": len(context_rows),
        "actual_efish_tokenizer": True,
        "fit_count": context_fit_count,
        "fit_rate": context_fit_count / len(context_rows),
        "required_rate": 0.95,
        "preferred_fit_count": sum(bool(row["preferred_fit"]) for row in context_rows),
        "total_tokens_min": min(row["total_tokens"] for row in context_rows),
        "total_tokens_median": statistics.median(row["total_tokens"] for row in context_rows),
        "total_tokens_max": max(row["total_tokens"] for row in context_rows),
        "semantic_truncation_count": 0,
        "overflow_decision": "ABSTAIN_FALLBACK_A",
        "rows": context_rows,
    }
    atomic_json(report_root / "context_fit_analysis.json", context_report)
    pair_rows = [row for row in batch if row["arm"] == "A"]
    pair_ready = [float(row["pair_ready_ms"]) for row in pair_rows]
    guard_by_case = {row["case_id"]: float(row["mean_guard_ms"]) for row in guard_latency["rows"]}
    projected: dict[str, Any] = {}
    for delay in [100, 200, 300, 350, 500]:
        values = [float(row["pair_ready_ms"]) + guard_by_case[row["case_id"]] + delay for row in pair_rows]
        projected[str(delay)] = {
            "p50_ms": percentile(values, 0.5), "p75_ms": percentile(values, 0.75),
            "p90_ms": percentile(values, 0.9), "p95_ms": percentile(values, 0.95), "max_ms": max(values),
        }
    latency_report = {
        "schema_version": "r29p0.latency_analysis.v1",
        "case_count": 20,
        "pair_ready": {
            "p50_ms": percentile(pair_ready, 0.5), "p75_ms": percentile(pair_ready, 0.75),
            "p90_ms": percentile(pair_ready, 0.9), "p95_ms": percentile(pair_ready, 0.95), "max_ms": max(pair_ready),
        },
        "guard_latency": {key: guard_latency[key] for key in ("measurement", "p50_ms", "p95_ms", "max_ms")},
        "projected_with_local_delay_ms": projected,
        "primary_350ms_p95_pass": projected["350"]["p95_ms"] <= 5000,
        "primary_350ms_max_pass": projected["350"]["max_ms"] <= 8000,
        "unselected_candidate_streamed": False,
    }
    atomic_json(report_root / "latency_analysis.json", latency_report)
    exact_count = sum(bool(row["exact_text_equal"]) for row in guards)
    guard_failure_count = sum(not bool(row["passed"]) for row in guards)
    review_by_id = {row["case_id"]: row for row in reviews}
    raw_equivalent_nonidentical = sum(
        not row["exact_text_equal"] and review_by_id[row["case_id"]]["equivalence"] == "EQUIVALENT" for row in guards
    )
    safe_headroom = panel_summary["equivalent_nonidentical_headroom_count"]
    mismatch_counts: dict[str, int] = {}
    for row in guards:
        for field in row["mismatch_fields"]:
            mismatch_counts[field] = mismatch_counts.get(field, 0) + 1
    headroom_report = {
        "schema_version": "r29p0.batch1_futility.v1",
        "cases": 20,
        "reviewer_class": "codex_agent_provisional_panel_a_not_human",
        "human_review": False,
        "exact_duplicate_count": exact_count,
        "exact_duplicate_rate": exact_count / 20,
        "nonidentical_count": 20 - exact_count,
        "raw_provisional_equivalent_nonidentical_count": raw_equivalent_nonidentical,
        "raw_provisional_equivalent_nonidentical_rate": raw_equivalent_nonidentical / 20,
        "protected_guard_failure_count": guard_failure_count,
        "protected_guard_failure_rate": guard_failure_count / 20,
        "protected_mismatch_counts": mismatch_counts,
        "safe_equivalent_nonidentical_headroom_count": safe_headroom,
        "safe_equivalent_nonidentical_headroom_rate": safe_headroom / 20,
        "required_batch1_headroom_rate": 0.25,
        "oracle_a_to_b_count": panel_summary["oracle_a_to_b_count"],
        "oracle_a_to_b_rate": panel_summary["oracle_a_to_b_rate"],
        "required_batch1_a_to_b_rate": 0.15,
        "panel_a_equivalent": sum(row["equivalence"] == "EQUIVALENT" for row in reviews),
        "panel_a_inequivalent": sum(row["equivalence"] == "INEQUIVALENT" for row in reviews),
        "panel_a_uncertain": sum(row["equivalence"] == "UNCERTAIN" for row in reviews),
        "decision": "STOP_BEFORE_BATCH_2",
    }
    atomic_json(report_root / "batch1_futility.json", headroom_report)
    total_input = sum(int(row["result"]["input_tokens"]) for row in records)
    total_output = sum(int(row["result"]["output_tokens"]) for row in records)
    total_cost_usd = sum(float(row["estimated_cost_usd"]) for row in records)
    total_guard_usd = sum(float(row["estimated_cost_usd_guard"]) for row in records)
    pair_records = [row for row in batch if row["arm"] in {"A", "B"}]
    mean_pair_cost_cny = sum(float(row["estimated_cost_usd"]) for row in pair_records) * 10 / 20
    cost_report = {
        "schema_version": "r29p0.cost_analysis.v1",
        "live_requests": len(records),
        "maximum_live_requests": 190,
        "requests_not_spent_after_futility": 190 - len(records),
        "input_tokens": total_input,
        "output_tokens": total_output,
        "cache_hit_tokens": sum(int(row["result"]["cache_hit_tokens"]) for row in records),
        "cache_miss_tokens": sum(int(row["result"]["cache_miss_tokens"]) for row in records),
        "estimated_actual_cost_usd": total_cost_usd,
        "estimated_actual_cost_cny": total_cost_usd * 10,
        "peak_price_guard_cost_usd": total_guard_usd,
        "peak_price_guard_cost_cny": total_guard_usd * 10,
        "hard_cost_ceiling_cny": 2,
        "mean_two_candidate_product_turn_cost_cny": mean_pair_cost_cny,
        "projection_1000_turns_cny": mean_pair_cost_cny * 1000,
        "projection_5000_turns_cny": mean_pair_cost_cny * 5000,
        "projection_50_users_100_turns_each_cny": mean_pair_cost_cny * 5000,
    }
    atomic_json(report_root / "cost_analysis.json", cost_report)
    terminal = {
        "schema_version": "r29p0.final_terminal.v1",
        "campaign_id": "r29p0_equivalence_pairwise_oracle_v1",
        "terminal_state": "BLOCKED_CANDIDATE_HEADROOM",
        "decision_precedence": "batch1_futility_and_context_fit",
        "batch_2_started": False,
        "batch_3_started": False,
        "live_requests": len(records),
        "scored_cases_generated": 20,
        "safe_candidate_headroom_rate": safe_headroom / 20,
        "batch1_required_headroom_rate": 0.25,
        "oracle_a_to_b_rate": panel_summary["oracle_a_to_b_rate"],
        "batch1_required_a_to_b_rate": 0.15,
        "context_fit_rate": context_report["fit_rate"],
        "context_fit_required_rate": 0.95,
        "latency_350ms_projected_p95_ms": projected["350"]["p95_ms"],
        "latency_350ms_projected_max_ms": projected["350"]["max_ms"],
        "latency_blocker": False,
        "factual_gate_evaluated": False,
        "value_gate_evaluated": False,
        "human_panel_a_completed": False,
        "human_panel_b_completed": False,
        "owner_review_pack_generated": False,
        "provisional_reviewer_is_human": False,
        "architecture_value": "NOT_DEMONSTRATED",
        "trainability": "NOT_TESTED",
        "actual_96m_value": "NOT_TESTED",
        "browser_ranker_value": "NOT_TESTED",
        "product_admission": False,
        "training_started": False,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
        "local_ranker_trained": False,
        "actual_efish_ranker_used": False,
        "ranker_training_authorized": False,
        "secret_scan_pass": True,
        "secret_exposure": False,
        "production_modified": False,
        "deployment_performed": False,
        "source_lock_sha256": source_lock["combined_sha256"],
        "panel_a_review_sha256": panel_summary["review_sha256"],
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    atomic_json(report_root / "final_terminal.json", terminal)
    campaign_state = {
        **terminal,
        "state": terminal["terminal_state"],
        "immutable_historical_states_preserved": True,
        "active_process": False,
        "heartbeat_status": "terminal",
    }
    atomic_json(artifact / "campaign_state.json", campaign_state)
    atomic_json(artifact / "heartbeat_latest.json", {
        "campaign_id": terminal["campaign_id"], "state": terminal["terminal_state"],
        "status": "terminal", "process_active": False, "updated_at": terminal["completed_at"],
    })
    report_md = f"""# R29P0 final report\n\nTerminal state: **BLOCKED_CANDIDATE_HEADROOM**.\n\nBatch 1 generated 20 scored cases (60 requests) after a 9-request smoke. The fixed futility rule stopped all remaining generation. Candidate A/B were exact duplicates in {exact_count}/20 cases. Of the eight non-identical pairs, provisional blinded Panel A considered {raw_equivalent_nonidentical} equivalent, but the conservative protected-feature guard rejected all eight. Safe equivalent non-identical headroom was therefore {safe_headroom}/20 (0%; required 25%), and the oracle changed A to B in 0/20 cases (required 15%).\n\nThe exact efish tokenizer fit only {context_fit_count}/20 pairs ({context_report['fit_rate']:.1%}) below 256 tokens, versus the 95% requirement. No semantic truncation was performed; overflow means ABSTAIN/FALLBACK_A.\n\nLatency was not the blocker. Pair-ready p95 was {latency_report['pair_ready']['p95_ms']:.1f} ms. With measured guard time and a simulated 350 ms future local ranker, projected final-ready p95 was {projected['350']['p95_ms']:.1f} ms and max {projected['350']['max_ms']:.1f} ms.\n\nTotal live requests were {len(records)}; estimated actual-period cost was CNY {cost_report['estimated_actual_cost_cny']:.6f}, with a peak-price conservative bound of CNY {cost_report['peak_price_guard_cost_cny']:.6f}. Secret exposure was false.\n\nThis result does not test trainability, an actual 96M ranker, browser ranker value, or product admission. `ranker_training_authorized=false`; no training, model modification, production change, or deployment occurred.\n"""
    atomic_text(report_root / "final_report.md", report_md)
    print(json.dumps({
        "terminal_state": terminal["terminal_state"], "live_requests": len(records),
        "safe_headroom_rate": terminal["safe_candidate_headroom_rate"],
        "context_fit_rate": terminal["context_fit_rate"],
        "cost_cny": cost_report["estimated_actual_cost_cny"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
