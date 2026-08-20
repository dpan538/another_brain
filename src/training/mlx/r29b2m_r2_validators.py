"""Deterministic and family-specific validators for R29B2M-R2."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher
import json
import re
from typing import Any, Iterable, Sequence

from src.training.mlx.r29b2m_r2_schema import FAMILY_CONTRACTS, REQUIRED_FIELDS, ScenarioSpec


POLICY_EXACT = (
    "省掉前情，只接当前追问", "对象保持不变", "继续绑定刚才的对象", "最后的信息覆盖旧值",
    "执行时只使用新信息", "逐项守住条件", "先检查限制，再给方案", "答案继续沿着刚才",
    "仍按同一对象回答", "只谈当前这一项", "回复里只留下有效版本", "备选也必须留在边界内",
    "新增条件与原请求一起保留", "移除的条件不再限制答案", "回答前按有效条件核对",
    "证据不足时不补成确定结论", "用一句问题锁定缺失条件", "测试场景也保持同一边界",
    "保持对象", "绑定对象", "覆盖旧值", "逐项守住", "不另起话题", "核对后回答",
)
POLICY_REGEX = tuple(
    re.compile(pattern)
    for pattern in (
        r"(?:答案|回复|输出|模型)(?:应该|应当|需要|必须|不得|继续|只|保持)",
        r"(?:回答时|执行时|回复中|输出中|改写时|模型应|策略是)",
        r"(?:有效条件|当前对象|目标对象)[^。；]{0,8}(?:保持|绑定|核对|覆盖)",
        r"(?:先|逐项)(?:检查|核对|守住).{0,10}(?:条件|限制|规则)",
        r"(?:不另起话题|只谈当前|沿着刚才|覆盖旧值)",
    )
)
POLICY_METADATA_WORDS = frozenset(("答案", "回复", "输出", "模型", "策略", "验证", "评估器", "规则", "行为"))
POLICY_ALLOWLIST = (
    "这个问题没有统一答案", "没人能替你回答", "等对方回答后再决定", "先回答最要紧的部分",
)
GRAMMAR_PATTERNS = tuple(
    re.compile(pattern)
    for pattern in (
        r"即可即可", r"就好[。！？]?就好", r"便够了", r"。。", r"；。", r"。，",
        r"现在\s*[，,]\s*另外\s*[，,]", r"([\u4e00-\u9fff]{2,8})\1",
        r"(?:但是|而且|所以|然后|或者|以及|并且|如果|因为)[：:]?$",
        r"[：:]$", r"([。！？])\1+",
    )
)
IDENTITY_WORDS = frozenset(("我是对话框", "鳄鱼", "前面忘了", "对话框就是对话框"))
PRIVACY_WORDS = frozenset(("私人", "隐私", "电话", "住址", "账号", "本人授权"))
INTERNAL_ONTOLOGY = frozenset(("复制体", "复刻", "克隆", "clone", "replica", "同源", "父类", "子类", "继承", "完整本人"))


@dataclass(frozen=True)
class ValidationIssue:
    category: str
    code: str
    detail: str
    critical: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {"category": self.category, "code": self.code, "detail": self.detail, "critical": self.critical}


def normalize(text: str) -> str:
    return re.sub(r"[\s，。！？、,.!?；;：:'\"“”‘’（）()\-—]", "", text).lower()


def validate_schema_dict(value: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    missing = [field for field in REQUIRED_FIELDS if field not in value]
    if missing:
        return [ValidationIssue("schema", "missing_required_fields", ",".join(missing))]
    try:
        spec = ScenarioSpec.from_dict(value)
    except (KeyError, TypeError, ValueError) as error:
        return [ValidationIssue("schema", "typed_parse_failed", str(error))]
    if spec.family_kind not in FAMILY_CONTRACTS:
        issues.append(ValidationIssue("schema", "unknown_family_kind", spec.family_kind))
    if spec.split not in {"train", "dev"}:
        issues.append(ValidationIssue("schema", "invalid_split", spec.split))
    if spec.provenance != "project_authored_r29b2m_r2":
        issues.append(ValidationIssue("schema", "unknown_provenance", spec.provenance))
    if spec.review_status not in {"pass", "repaired", "project_authored_reviewed"}:
        issues.append(ValidationIssue("schema", "unreviewed_scenario", spec.review_status))
    if len(spec.canonical_targets) < 3 or len(spec.canonical_targets) > 5:
        issues.append(ValidationIssue("schema", "canonical_target_count", str(len(spec.canonical_targets))))
    if len({normalize(target) for target in spec.canonical_targets}) != len(spec.canonical_targets):
        issues.append(ValidationIssue("schema", "targets_only_punctuation_different", spec.scenario_id))
    if len(spec.prompt_variants) < 3 or len(spec.prompt_variants) > 6:
        issues.append(ValidationIssue("schema", "prompt_variant_count", str(len(spec.prompt_variants))))
    unknown_ids = (set(spec.target_fact_ids) | set(spec.forbidden_fact_ids) | set(spec.source_fact_ids) | set(spec.requested_addition_fact_ids)) - set(spec.world_facts)
    if unknown_ids:
        issues.append(ValidationIssue("schema", "unknown_fact_ids", ",".join(sorted(unknown_ids))))
    return issues


def validate_roles(messages: Sequence[Any]) -> list[ValidationIssue]:
    if not messages or len(messages) > 5:
        return [ValidationIssue("role", "message_count", str(len(messages)))]
    issues = []
    for index, message in enumerate(messages):
        role = message.role if hasattr(message, "role") else message.get("role")
        content = message.content if hasattr(message, "content") else message.get("content")
        expected = "user" if index % 2 == 0 else "assistant"
        if role != expected or not isinstance(content, str) or not content.strip():
            issues.append(ValidationIssue("role", "alternation_or_empty", f"turn={index}"))
    if (messages[-1].role if hasattr(messages[-1], "role") else messages[-1].get("role")) != "user":
        issues.append(ValidationIssue("role", "last_message_not_user", "last"))
    return issues


def detect_policy_language(target: str) -> list[ValidationIssue]:
    if any(allowed in target for allowed in POLICY_ALLOWLIST):
        filtered = target
        for allowed in POLICY_ALLOWLIST:
            filtered = filtered.replace(allowed, "")
    else:
        filtered = target
    hits = sorted({phrase for phrase in POLICY_EXACT if phrase in filtered})
    regex_hits = sorted({pattern.pattern for pattern in POLICY_REGEX if pattern.search(filtered)})
    word_hits = [word for word in POLICY_METADATA_WORDS if word in filtered]
    density = len(word_hits) / max(1, len(re.findall(r"[\u4e00-\u9fff]{2,}", filtered)))
    if hits or regex_hits or (len(word_hits) >= 2 and density >= 0.2):
        detail = json.dumps({"phrases": hits, "patterns": regex_hits, "metadata_words": sorted(word_hits)}, ensure_ascii=False)
        return [ValidationIssue("policy_language", "meta_policy_target", detail)]
    return []


def detect_grammar_collisions(target: str) -> list[ValidationIssue]:
    issues = []
    for pattern in GRAMMAR_PATTERNS:
        match = pattern.search(target.strip())
        if match:
            issues.append(ValidationIssue("grammar_collision", "malformed_target", match.group(0)))
    clauses = [normalize(item) for item in re.split(r"[。！？；]", target) if normalize(item)]
    if len(clauses) != len(set(clauses)):
        issues.append(ValidationIssue("grammar_collision", "duplicated_clause", target))
    for left, right in zip(clauses, clauses[1:]):
        if min(len(left), len(right)) >= 5 and SequenceMatcher(None, left, right).ratio() >= 0.86:
            issues.append(ValidationIssue("grammar_collision", "adjacent_near_identical_sentences", target))
    return issues


def validate_fact_provenance(spec: ScenarioSpec, target: str) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    allowed_ids = set(spec.target_fact_ids)
    for fact_id, value in spec.world_facts.items():
        if len(value) >= 2 and value in target and fact_id not in allowed_ids:
            issues.append(ValidationIssue("fact_provenance", "unlicensed_scenario_fact", f"{fact_id}:{value}"))
    for value in spec.must_include_values:
        if value not in target:
            issues.append(ValidationIssue("fact_provenance", "missing_required_value", value))
    for value in spec.must_exclude_values:
        if value and value in target:
            issues.append(ValidationIssue("fact_provenance", "forbidden_value_present", value))
    for fact_id in spec.forbidden_fact_ids:
        value = spec.world_facts.get(fact_id, "")
        if value and value in target:
            issues.append(ValidationIssue("fact_provenance", "forbidden_fact_present", f"{fact_id}:{value}"))
    return issues


def validate_correction_invariant(spec: ScenarioSpec, target: str) -> list[ValidationIssue]:
    if spec.family_kind != "correction":
        return []
    issues = []
    if not spec.correction_after or spec.correction_after not in target:
        issues.append(ValidationIssue("correction", "new_value_missing", str(spec.correction_after)))
    if spec.correction_before and spec.correction_before in target:
        old_clause = next((clause for clause in re.split(r"[。；]", target) if spec.correction_before in clause), "")
        inactive_markers = (
            "不再", "不用", "无需", "不必", "不能再", "不要", "取消", "作废", "不是", "不按", "旧", "放下", "移除",
            "不进入", "保持原状", "不足", "不可靠", "压缩", "无法", "释放", "别", "避免",
            "不继续", "已纠正", "不适用", "不作为", "不围着", "不默认",
        )
        if not any(marker in old_clause for marker in inactive_markers):
            issues.append(ValidationIssue("correction", "old_value_still_active", spec.correction_before))
    return issues


def validate_referent_invariant(spec: ScenarioSpec, target: str) -> list[ValidationIssue]:
    if spec.family_kind != "referent":
        return []
    issues = []
    if not spec.active_referent or spec.active_referent not in target:
        issues.append(ValidationIssue("referent", "active_referent_missing", str(spec.active_referent)))
    for value in spec.alternative_referents:
        if value and value in target:
            issues.append(ValidationIssue("referent", "alternative_referent_present", value))
    return issues


def validate_constraint_invariant(spec: ScenarioSpec, target: str) -> list[ValidationIssue]:
    if spec.family_kind not in {"constraint", "planning"}:
        return []
    issues = []
    if spec.active_constraints and not spec.must_include_values:
        issues.append(ValidationIssue("constraint", "constraint_has_no_target_evidence", spec.scenario_id))
    for evidence in spec.must_include_values:
        if evidence not in target:
            issues.append(ValidationIssue("constraint", "active_constraint_dropped", evidence))
    for removed in spec.removed_constraints:
        if removed and removed in target:
            clause = next((part for part in re.split(r"[。；]", target) if removed in part), "")
            if not any(marker in clause for marker in ("取消", "移除", "不用", "不再", "不限", "随意", "忽略", "放开")):
                issues.append(ValidationIssue("constraint", "removed_constraint_retained", removed))
    if spec.family_kind == "constraint" and not spec.active_constraints:
        issues.append(ValidationIssue("constraint", "no_verifiable_active_constraint", spec.scenario_id))
    return issues


def validate_rewrite_entailment(spec: ScenarioSpec, target: str) -> list[ValidationIssue]:
    if spec.family_kind != "rewrite":
        return []
    expected = set(spec.source_fact_ids) | set(spec.requested_addition_fact_ids)
    issues = []
    if set(spec.target_fact_ids) != expected:
        issues.append(ValidationIssue("rewrite", "target_fact_ledger_mismatch", f"expected={sorted(expected)}"))
    issues.extend(validate_fact_provenance(spec, target))
    return issues


def validate_summary_subset(spec: ScenarioSpec, target: str) -> list[ValidationIssue]:
    if spec.family_kind != "summary":
        return []
    issues = []
    if not set(spec.target_fact_ids).issubset(set(spec.source_fact_ids)):
        issues.append(ValidationIssue("summary", "target_fact_not_source_subset", spec.scenario_id))
    issues.extend(validate_fact_provenance(spec, target))
    return issues


def validate_identity_privacy_separation(spec: ScenarioSpec, target: str) -> list[ValidationIssue]:
    issues = []
    if spec.family_kind == "identity":
        if any(word in target for word in PRIVACY_WORDS):
            issues.append(ValidationIssue("identity_privacy", "privacy_answer_in_identity_scenario", target))
        if any(word in target for word in INTERNAL_ONTOLOGY):
            issues.append(ValidationIssue("identity_privacy", "internal_ontology_leak", target))
    elif spec.family_kind == "privacy":
        if any(word in target for word in IDENTITY_WORDS):
            issues.append(ValidationIssue("identity_privacy", "identity_answer_in_privacy_scenario", target))
    return issues


def validate_family_target(spec: ScenarioSpec, target: str) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    issues.extend(detect_policy_language(target))
    issues.extend(detect_grammar_collisions(target))
    if not target.strip() or len(target) > spec.maximum_answer_characters:
        issues.append(ValidationIssue("schema", "target_length", f"{len(target)}/{spec.maximum_answer_characters}"))
    issues.extend(validate_fact_provenance(spec, target))
    issues.extend(validate_correction_invariant(spec, target))
    issues.extend(validate_referent_invariant(spec, target))
    issues.extend(validate_constraint_invariant(spec, target))
    issues.extend(validate_rewrite_entailment(spec, target))
    issues.extend(validate_summary_subset(spec, target))
    issues.extend(validate_identity_privacy_separation(spec, target))
    if spec.family_kind == "clarification" and target.count("？") + target.count("?") > 1:
        issues.append(ValidationIssue("clarification", "more_than_one_question", target))
    if spec.family_kind == "acknowledgement" and len([part for part in re.split(r"[。！？]", target) if part]) > 2:
        issues.append(ValidationIssue("acknowledgement", "more_than_two_sentences", target))
    return _deduplicate_issues(issues)


def validate_semantic_digest(before: str, after: str) -> list[ValidationIssue]:
    return [] if before == after else [ValidationIssue("semantic_digest", "semantic_change", f"{before}!={after}")]


def validate_paired_variation(row: dict[str, Any], spec: ScenarioSpec) -> list[ValidationIssue]:
    issues = []
    expected_prefix = spec.scenario_id + "_v"
    if not str(row.get("variation_pair_id", "")).startswith(expected_prefix):
        issues.append(ValidationIssue("paired_variation", "pair_id_not_parent_bound", str(row.get("variation_pair_id"))))
    if row.get("parent_scenario_id") != spec.scenario_id:
        issues.append(ValidationIssue("paired_variation", "wrong_parent", str(row.get("parent_scenario_id"))))
    issues.extend(validate_semantic_digest(spec.semantic_digest(), str(row.get("semantic_digest"))))
    if tuple(row.get("target_fact_ids_before", [])) != spec.target_fact_ids or tuple(row.get("target_fact_ids_after", [])) != spec.target_fact_ids:
        issues.append(ValidationIssue("paired_variation", "fact_ids_changed", spec.scenario_id))
    if any(token in json.dumps(row.get("operator_ids", [])) for token in ("cartesian", "modulo", "generic_tail", "truncate")):
        issues.append(ValidationIssue("paired_variation", "forbidden_operator", str(row.get("operator_ids"))))
    return issues


def near_duplicate(left: str, right: str) -> float:
    return SequenceMatcher(None, normalize(left), normalize(right)).ratio()


def dataset_duplicate_issues(rows: Sequence[dict[str, Any]]) -> list[ValidationIssue]:
    normalized_sessions: Counter[str] = Counter()
    for row in rows:
        normalized_sessions[normalize(json.dumps({"messages": row["messages"], "target": row["target"]}, ensure_ascii=False))] += 1
    return [ValidationIssue("exact_duplicate", "duplicate_session", f"count={count}") for count in normalized_sessions.values() if count > 1]


def split_family_issues(rows: Sequence[dict[str, Any]]) -> list[ValidationIssue]:
    split_by_group: dict[str, set[str]] = defaultdict(set)
    split_by_parent: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        split_by_group[str(row["split_group"])].add(str(row["split"]))
        split_by_parent[str(row["parent_scenario_id"])].add(str(row["split"]))
    issues = [ValidationIssue("split_family", "split_group_crossed", group) for group, values in split_by_group.items() if len(values) > 1]
    issues.extend(ValidationIssue("split_family", "parent_scenario_crossed", parent) for parent, values in split_by_parent.items() if len(values) > 1)
    return issues


def eval_contamination_issues(rows: Sequence[dict[str, Any]], eval_rows: Sequence[dict[str, Any]], *, threshold: float = 0.88) -> list[ValidationIssue]:
    references = [(item["session_id"], message["content"]) for item in eval_rows for message in item["messages"] if message["role"] == "user"]
    issues = []
    for row in rows:
        prompt = str(row["messages"][-1]["content"])
        for session_id, reference in references:
            similarity = near_duplicate(prompt, reference)
            if similarity >= threshold:
                issues.append(ValidationIssue("eval_contamination", "near_duplicate", f"{row['session_id']}:{session_id}:{similarity:.4f}"))
                break
    return issues


def concentration_report(rows: Sequence[dict[str, Any]]) -> dict[str, Any]:
    targets = Counter(normalize(str(row["target"])) for row in rows)
    openings = Counter(normalize(str(row["target"]))[:6] for row in rows)
    skeletons = Counter(str(row["renderer_skeleton_id"]) for row in rows)
    size = max(1, len(rows))
    max_opening, max_opening_count = max(openings.items(), key=lambda item: item[1])
    max_skeleton, max_skeleton_count = max(skeletons.items(), key=lambda item: item[1])
    return {
        "distinct_normalized_targets": len(targets),
        "maximum_exact_target_occurrence": max(targets.values()),
        "maximum_six_character_opening": max_opening,
        "maximum_six_character_opening_share": max_opening_count / size,
        "maximum_renderer_skeleton": max_skeleton,
        "maximum_renderer_skeleton_share": max_skeleton_count / size,
        "valid": max(targets.values()) <= 2 and max_opening_count / size <= 0.015 and max_skeleton_count / size <= 0.02,
    }


def _deduplicate_issues(issues: Iterable[ValidationIssue]) -> list[ValidationIssue]:
    result = []
    seen = set()
    for issue in issues:
        key = (issue.category, issue.code, issue.detail)
        if key not in seen:
            result.append(issue)
            seen.add(key)
    return result
