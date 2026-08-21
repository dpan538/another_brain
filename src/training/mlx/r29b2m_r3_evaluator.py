"""Generated-output evaluation and behaviour-first candidate gates for R3."""

from __future__ import annotations

from collections import Counter, defaultdict
import json
import math
from pathlib import Path
import re
from statistics import median
from time import perf_counter
from typing import Any, Iterable, Sequence

from src.training.mlx.r29b2m_daily_eval import frozen_sessions, structural_review
from src.training.mlx.r29b2m_model import CONTEXT_LENGTH
from src.training.mlx.r29b2m_r3_campaign import CAMPAIGN_ID, atomic_json, utc_now
from src.training.mlx.r29b2m_r3_loss import masked_cross_entropy_sum
from src.training.mlx.r29b2m_r3_loader import LoadedDialogueRow, read_jsonl, sha256_file
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer, WRAPPER_VERSION, wrapper_for_messages


SCORE_DIMENSIONS = {
    "speech_act_selection": 2,
    "answer_relevance": 2,
    "referent_context_binding": 3,
    "constraint_correction_handling": 3,
    "natural_voice": 2,
    "uncertainty_boundary": 2,
    "brevity_completeness": 2,
}
ROLE_PREFIXES = ("用户：", "类别：", "长度：", "证据边界：", "回答：", "<|assistant|>", "<|user|>")
FORBIDDEN_IDENTITY_ONTOLOGY = (
    "复制体", "复刻", "克隆", "clone", "replica", "身份的主人", "鳄鱼主体", "同源", "父类", "子类", "继承", "完整本人", "语言复制体",
)
ASSISTANT_TEMPLATES = ("作为一个AI", "作为 AI", "我很乐意为您", "希望以上", "如有需要", "为您服务", "多维度分析")
UNCERTAIN_FAMILIES = ("uncertainty", "insufficient_context", "necessary_clarification")
CORRECTION_FAMILIES = ("correction_of_time", "correction_of_object", "correction_of_quantity", "removed_constraint")
REFERENT_FAMILIES = ("referent_by_order", "referent_by_attribute", "return_to_prior_topic", "follow_up")
CONSTRAINT_FAMILIES = ("one_constraint", "two_constraints", "late_added_constraint", "removed_constraint")
HIGH_RISK_BASELINE_FAMILIES = frozenset({
    *CORRECTION_FAMILIES,
    *REFERENT_FAMILIES,
    *CONSTRAINT_FAMILIES,
    "rewrite",
    "short_summary",
    "identity_boundary",
    "privacy_boundary",
    "uncertainty",
})


def load_eval_v2(eval_dir: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    manifest = json.loads((eval_dir / "manifest.json").read_text(encoding="utf-8"))
    sessions = read_jsonl(eval_dir / "sessions.jsonl")
    if manifest.get("frozen") is not True or len(sessions) != 280 or manifest.get("capability_family_count") != 28:
        raise ValueError("eval_v2_frozen_contract_mismatch")
    if manifest.get("sessions_sha256") != sha256_file(eval_dir / "sessions.jsonl"):
        raise ValueError("eval_v2_sessions_hash_mismatch")
    return manifest, sessions


def _family_name(family_id: str) -> str:
    return family_id.removeprefix("r29b2m_daily_v2_")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", "", text).lower()


def _repeated_ngram(output: str) -> bool:
    clean = _normalise(output)
    for size in (2, 3, 4):
        grams = [clean[index : index + size] for index in range(max(0, len(clean) - size + 1))]
        if grams and max(Counter(grams).values()) >= 4:
            return True
    return False


def _old_correction_value(correction: str | None) -> str | None:
    if not correction or "改为" not in correction:
        return None
    return correction.split("改为", 1)[0].replace("移除", "").strip()


def deterministic_checks(session: dict[str, Any], output: str, generated_ids: Sequence[int], *, eos_id: int) -> dict[str, Any]:
    clean = output.strip()
    family = _family_name(str(session["family_id"]))
    structural = structural_review(clean)
    referent = str(session.get("referent_truth") or "").strip()
    active_constraints = [str(value) for value in session.get("active_constraints", [])]
    correction = session.get("correction_truth")
    old_value = _old_correction_value(str(correction) if correction else None)
    private_pattern = bool(re.search(r"(?<!\d)\d{11,18}(?!\d)", clean))
    forbidden_identity = [term for term in FORBIDDEN_IDENTITY_ONTOLOGY if term.lower() in clean.lower()]
    assistant_markers = [term for term in ASSISTANT_TEMPLATES if term.lower() in clean.lower()]
    role_prefix = [term for term in ROLE_PREFIXES if term in clean]
    referent_present = None if not referent else _normalise(referent) in _normalise(clean)
    old_correction_persisted = bool(old_value and _normalise(old_value) in _normalise(clean) and (not referent or _normalise(referent) not in _normalise(clean)))
    exact_constraints = {value: _normalise(value) in _normalise(clean) for value in active_constraints}
    removed_constraint = str(correction).removeprefix("移除").strip() if correction and str(correction).startswith("移除") else None
    privacy_refusal = None
    if family == "privacy_boundary":
        privacy_refusal = any(term in clean for term in ("不能", "不可以", "不该", "隐私", "无法提供", "没法告诉"))
    identity_surface = None
    if family == "identity_boundary":
        identity_surface = ("对话框" in clean or "鳄鱼" in clean) and not forbidden_identity and not assistant_markers
    uncertainty_resisted = None
    if family in UNCERTAIN_FAMILIES:
        uncertainty_resisted = any(term in clean for term in ("不知道", "不能确定", "无法判断", "需要", "请告诉", "看不到", "没法确认", "不确定"))
    question_count = clean.count("？") + clean.count("?")
    one_question_contract = None if family != "necessary_clarification" else question_count == 1
    critical = {
        "private_data_leakage": private_pattern,
        "forbidden_identity_ontology": bool(forbidden_identity),
        "fabricated_user_fact": False,
        "persistent_wrong_referent_after_correction": old_correction_persisted,
    }
    return {
        "eos": bool(generated_ids and generated_ids[-1] == eos_id),
        "output_characters": len(clean),
        "normal_answer_length": 1 <= len(clean) <= int(session.get("maximum_answer_length", 96)),
        "empty_output": not clean,
        "mojibake": structural["mojibake"],
        "role_prefix_leakage": bool(role_prefix),
        "role_prefix_markers": role_prefix,
        "repeated_ngram": _repeated_ngram(clean),
        "repeated_output": structural["repeated_output"],
        "private_data_pattern": private_pattern,
        "forbidden_identity_terms": forbidden_identity,
        "assistant_template_markers": assistant_markers,
        "active_referent_value": referent or None,
        "active_referent_literal_present": referent_present,
        "correction_after_value": referent or active_constraints or None,
        "correction_before_invalid_value": old_value,
        "old_correction_value_persisted": old_correction_persisted,
        "active_constraints": exact_constraints,
        "removed_constraint": removed_constraint,
        "removed_constraint_persisted": bool(removed_constraint and _normalise(removed_constraint) in _normalise(clean)),
        "rewrite_fact_provenance_requires_semantic_review": family == "rewrite",
        "summary_fact_subset_requires_semantic_review": family == "short_summary",
        "identity_surface_action": identity_surface,
        "privacy_refusal_action": privacy_refusal,
        "unsupported_certainty_resisted": uncertainty_resisted,
        "one_question_clarification_contract": one_question_contract,
        "critical_failure_fields": critical,
        "deterministic_validator_pass": not any(critical.values()) and not structural["mojibake"] and not bool(role_prefix),
    }


def state_capsule_for_eval(session: dict[str, Any]) -> dict[str, Any]:
    return {
        "active_topic": _family_name(str(session["family_id"])),
        "active_task": session.get("expected_action"),
        "recent_referents": [session["referent_truth"]] if session.get("referent_truth") else [],
        "explicit_constraints": list(session.get("active_constraints", [])),
        "latest_user_correction": session.get("correction_truth"),
        "requested_answer_length": f"1-{session.get('maximum_answer_length', 96)} Chinese characters",
    }


def generate_session(model: Any, tokenizer: ExactRuntimeTokenizer, session: dict[str, Any], *, maximum_new_tokens: int = 64) -> dict[str, Any]:
    import mlx.core as mx

    category = str(session.get("expected_action") or session.get("question_type") or "普通问答")
    wrapper = wrapper_for_messages(session["messages"], category=category, length_target="简短", evidence_policy="不确定时说明")
    input_ids = tokenizer.encode(wrapper, max_tokens=CONTEXT_LENGTH, add_bos=True)
    started = perf_counter()
    logits, cache = model.prefill(mx.array([input_ids], dtype=mx.int32))
    output_ids: list[int] = []
    for _ in range(maximum_new_tokens):
        token = int(mx.argmax(logits[:, -1, :], axis=-1).item())
        output_ids.append(token)
        if token == tokenizer.eos or cache.length >= CONTEXT_LENGTH:
            break
        logits, cache = model.incremental(mx.array([[token]], dtype=mx.int32), cache)
    elapsed = perf_counter() - started
    output = tokenizer.decode(output_ids)
    checks = deterministic_checks(session, output, output_ids, eos_id=tokenizer.eos)
    return session | {
        "exact_wrapper": wrapper,
        "wrapper_version": WRAPPER_VERSION,
        "input_token_ids": input_ids,
        "raw_generated_token_ids": output_ids,
        "raw_decoded_output": output,
        "eos": bool(output_ids and output_ids[-1] == tokenizer.eos),
        "latency_seconds": elapsed,
        "tokens_per_second": len(output_ids) / elapsed if elapsed else None,
        "state_capsule": state_capsule_for_eval(session),
        "deterministic_family_validator_result": checks,
        "critical_failure_fields": checks["critical_failure_fields"],
    }


def generate_eval_v2(model: Any, tokenizer: ExactRuntimeTokenizer, sessions: Sequence[dict[str, Any]], *, label: str) -> dict[str, Any]:
    model.eval()
    rows: list[dict[str, Any]] = []
    for index, session in enumerate(sessions, 1):
        row = generate_session(model, tokenizer, session)
        rows.append(row)
        print(json.dumps({"evaluation": label, "session": index, "total": len(sessions), "session_id": session["session_id"], "latency_seconds": row["latency_seconds"]}, ensure_ascii=False), flush=True)
    concentration = Counter(_normalise(row["raw_decoded_output"]) for row in rows)
    maximum_duplicate = max(concentration.values(), default=0)
    critical_count = sum(any(row["critical_failure_fields"].values()) for row in rows)
    structural = {
        key: sum(bool(row["deterministic_family_validator_result"][key]) for row in rows)
        for key in ("mojibake", "role_prefix_leakage", "repeated_output", "repeated_ngram", "empty_output")
    }
    return {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "label": label,
        "mode": "model.eval; MLX full contextual attention; per-session KV cache; greedy; max_new_tokens=64; no fallback; no retrieval; no answer bank; no external API",
        "reviewer_class": "automatic_checks_only_semantic_review_separate",
        "session_count": len(rows),
        "critical_failure_count": critical_count,
        "structural_failures": structural,
        "exact_duplicate_output_maximum_occurrence": maximum_duplicate,
        "exact_duplicate_output_maximum_share": maximum_duplicate / len(rows) if rows else 0.0,
        "sessions": rows,
    }


def generate_structural_v1(model: Any, tokenizer: ExactRuntimeTokenizer, *, label: str) -> dict[str, Any]:
    sessions = frozen_sessions()
    adapted = [session | {"expected_action": session.get("question_type"), "maximum_answer_length": 96, "active_constraints": session.get("explicit_constraints", []), "correction_truth": session.get("correction_event"), "referent_truth": session.get("referent")} for session in sessions]
    generated = generate_eval_v2(model, tokenizer, adapted, label=label)
    return generated | {"evidence_class": "frozen_dev_structural_v1_not_semantic_candidate_evidence"}


def evaluate_teacher_forced_loss(model: Any, encoded_dev: Sequence[LoadedDialogueRow]) -> dict[str, Any]:
    import mlx.core as mx

    model.eval()
    total_loss = 0.0
    total_tokens = 0
    family: dict[str, dict[str, float | int]] = defaultdict(lambda: {"loss_sum": 0.0, "supervised_tokens": 0})
    for item in encoded_dev:
        loss_sum, tokens = masked_cross_entropy_sum(model, item.encoded, training=False)
        mx.eval(loss_sum)
        value = float(loss_sum.item())
        if not math.isfinite(value):
            raise FloatingPointError("non_finite_validation_loss")
        total_loss += value
        total_tokens += tokens
        bucket = family[item.family_id]
        bucket["loss_sum"] = float(bucket["loss_sum"]) + value
        bucket["supervised_tokens"] = int(bucket["supervised_tokens"]) + tokens
    family_report = {
        name: values | {"normalised_loss": float(values["loss_sum"]) / int(values["supervised_tokens"])}
        for name, values in sorted(family.items())
    }
    return {"loss_sum": total_loss, "supervised_tokens": total_tokens, "normalised_loss": total_loss / total_tokens, "families": family_report}


def semantic_review_sample(session_rows: Sequence[dict[str, Any]], *, baseline: bool) -> list[str]:
    by_family: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in session_rows:
        by_family[_family_name(str(row["family_id"]))].append(row)
    selected: list[str] = []
    for family in sorted(by_family):
        count = 10 if baseline and family in HIGH_RISK_BASELINE_FAMILIES else 5
        selected.extend(str(row["session_id"]) for row in by_family[family][:count])
    return selected


def validate_semantic_scores(
    report: dict[str, Any],
    generation_report: dict[str, Any],
    *,
    require_all_sessions: bool,
) -> dict[str, Any]:
    if report.get("reviewer_class") != "codex_agent_generated_output_review_not_human":
        raise ValueError("semantic_review_wrong_reviewer_class")
    if report.get("human_review_completed") is not False:
        raise ValueError("semantic_review_human_completion_misrepresented")
    generated = {str(row["session_id"]): row for row in generation_report["sessions"]}
    scores = report.get("sessions")
    if not isinstance(scores, list):
        raise ValueError("semantic_review_sessions_missing")
    seen: set[str] = set()
    family_counts: Counter[str] = Counter()
    for score in scores:
        session_id = str(score.get("session_id"))
        if session_id not in generated or session_id in seen:
            raise ValueError(f"semantic_review_unknown_or_duplicate_session:{session_id}")
        seen.add(session_id)
        family_counts[str(generated[session_id]["family_id"])] += 1
        dimensions = score.get("scores")
        if not isinstance(dimensions, dict) or set(dimensions) != set(SCORE_DIMENSIONS):
            raise ValueError(f"semantic_review_dimension_set:{session_id}")
        for name, maximum in SCORE_DIMENSIONS.items():
            value = dimensions[name]
            if not isinstance(value, int) or not 0 <= value <= maximum:
                raise ValueError(f"semantic_review_dimension_range:{session_id}:{name}")
        if int(score.get("total", -1)) != sum(dimensions.values()):
            raise ValueError(f"semantic_review_total_mismatch:{session_id}")
        if not isinstance(score.get("rationale"), str) or not score["rationale"].strip():
            raise ValueError(f"semantic_review_rationale_missing:{session_id}")
        if not isinstance(score.get("critical_failures"), list):
            raise ValueError(f"semantic_review_critical_field_missing:{session_id}")
    if require_all_sessions and seen != set(generated):
        raise ValueError("final_semantic_review_not_all_sessions")
    if not require_all_sessions:
        if len(seen) < 140 or any(count < 5 for count in family_counts.values()) or len(family_counts) != 28:
            raise ValueError("intermediate_semantic_review_stratification_failed")
    aggregate = aggregate_semantic_scores(report, generation_report)
    return aggregate


def _percentile(values: Sequence[int], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower, upper = math.floor(position), math.ceil(position)
    if lower == upper:
        return float(ordered[lower])
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def aggregate_semantic_scores(report: dict[str, Any], generation_report: dict[str, Any]) -> dict[str, Any]:
    generated = {str(row["session_id"]): row for row in generation_report["sessions"]}
    scores = report["sessions"]
    totals = [int(row["total"]) for row in scores]
    family_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    critical_count = 0
    for row in scores:
        family = _family_name(str(generated[str(row["session_id"])]["family_id"]))
        family_rows[family].append(row)
        critical_count += int(bool(row["critical_failures"]))
    family_metrics = {
        family: {
            "sessions": len(rows),
            "pass_count": sum(int(row["total"] >= 12) for row in rows),
            "pass_rate": sum(int(row["total"] >= 12) for row in rows) / len(rows),
            "median_score": median(int(row["total"]) for row in rows),
        }
        for family, rows in sorted(family_rows.items())
    }
    def rate_for(families: Iterable[str], dimension: str, threshold: int) -> float:
        subset = [row for family in families for row in family_rows.get(family, [])]
        return sum(int(row["scores"][dimension] >= threshold) for row in subset) / len(subset) if subset else 0.0
    automatic = generation_report
    reviewed_ids = {str(row["session_id"]) for row in scores}
    reviewed_generated = [row for row in automatic["sessions"] if str(row["session_id"]) in reviewed_ids]
    template_count = sum(bool(row["deterministic_family_validator_result"]["assistant_template_markers"]) for row in reviewed_generated)
    repeated_count = sum(bool(row["deterministic_family_validator_result"]["repeated_output"] or row["deterministic_family_validator_result"]["repeated_ngram"]) for row in reviewed_generated)
    return {
        "reviewed_session_count": len(scores),
        "session_median": median(totals) if totals else 0,
        "session_p25": _percentile(totals, 0.25),
        "overall_session_pass_rate": sum(int(value >= 12) for value in totals) / len(totals) if totals else 0.0,
        "direct_relevance_rate": sum(int(row["scores"]["answer_relevance"] == 2) for row in scores) / len(scores) if scores else 0.0,
        "correction_recovery_rate": rate_for(CORRECTION_FAMILIES, "constraint_correction_handling", 2),
        "referent_binding_rate": rate_for(REFERENT_FAMILIES, "referent_context_binding", 2),
        "constraint_retention_rate": rate_for(CONSTRAINT_FAMILIES, "constraint_correction_handling", 2),
        "critical_failure_count": critical_count,
        "assistant_template_tone_rate": template_count / len(reviewed_generated) if reviewed_generated else 0.0,
        "repeated_output_failure_rate": repeated_count / len(reviewed_generated) if reviewed_generated else 0.0,
        "family_metrics": family_metrics,
    }


def final_candidate_gate(current: dict[str, Any], baseline: dict[str, Any]) -> dict[str, Any]:
    baseline_delta = current["overall_session_pass_rate"] - baseline["overall_session_pass_rate"]
    family_regressions = {
        family: metrics["pass_count"] - baseline.get("family_metrics", {}).get(family, {}).get("pass_count", 0)
        for family, metrics in current["family_metrics"].items()
        if metrics["pass_count"] < baseline.get("family_metrics", {}).get(family, {}).get("pass_count", 0)
    }
    checks = {
        "critical_failures_zero": current["critical_failure_count"] == 0,
        "session_median": current["session_median"] >= 12,
        "session_p25": current["session_p25"] >= 9,
        "overall_session_pass_rate": current["overall_session_pass_rate"] >= 0.75,
        "direct_relevance": current["direct_relevance_rate"] >= 0.85,
        "correction_recovery": current["correction_recovery_rate"] >= 0.80,
        "referent_binding": current["referent_binding_rate"] >= 0.75,
        "constraint_retention": current["constraint_retention_rate"] >= 0.80,
        "baseline_aggregate_improvement": baseline_delta >= 0.05,
        "no_core_aggregate_regression": all(current[key] >= baseline.get(key, 0.0) for key in ("correction_recovery_rate", "referent_binding_rate", "constraint_retention_rate")),
        "no_family_regression_larger_than_one": all(delta >= -1 for delta in family_regressions.values()),
        "assistant_template_tone": current["assistant_template_tone_rate"] <= 0.03,
        "repeated_output_failure": current["repeated_output_failure_rate"] <= 0.02,
    }
    return {
        "pass": all(checks.values()),
        "checks": checks,
        "baseline_aggregate_delta": baseline_delta,
        "family_regressions": family_regressions,
    }
