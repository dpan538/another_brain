"""Frozen descriptive contracts for R30J1A.

This module deliberately contains no owner-specific values.  It defines the
closed descriptive label spaces, exact protected-content checks, deterministic
style mutations, source-group splitting, serialization, and pure metric
helpers used by the local/ignored campaign artifacts.

Nothing in this file assigns preference, Personal Fit, persona mode, or answer
quality.  ``AUTHENTIC_OWNER`` is an authorship/domain observation only.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
import hashlib
import json
import math
import re
from typing import Any, Iterable, Mapping, Sequence


CAMPAIGN_ID = "r30j1a_personal_representation_bootstrap_v1"
CAMPAIGN_SEED = 3001101
CONTEXT_LENGTH = 512
NORMAL_TOKEN_TARGET = 448
RESERVED_TOKENS = 64
REPRESENTATION_DIM = 512

DOMAIN_LABELS = (
    "AUTHENTIC_OWNER",
    "CONTROLLED_OWNER_STYLE_VARIANT",
    "GENERIC_ASSISTANT",
    "OTHER_PUBLIC_SAFE",
)

REGISTER_CANDIDATES = (
    "ordinary_chat",
    "casual_banter",
    "weird_question",
    "absurd_meta_ai",
    "practical_advice",
    "technical_explanation",
    "debugging",
    "project_discussion",
    "academic_discussion",
    "philosophy",
    "personal_reflection",
    "light_emotional",
    "formal_message",
    "creative_play",
    "roleplay",
)

MECHANICS_LABELS = (
    "customer_service_opening",
    "over_structured",
    "expanded_explanation",
    "generic_validation",
    "forced_question",
    "textbook_framing",
    "repetition",
    "corporate_politeness",
    "over_conclusion",
    "excessive_disclaimer",
)

FORBIDDEN_TRAINING_LABEL_FRAGMENTS = (
    "personal_fit",
    "personal_mismatch",
    "preference",
    "crocodile",
    "wired",
    "persona_mode",
    "generation",
)

SPLITS = ("train", "dev", "heldout")
ADMISSION_CLASSES = (
    "TRAINING_PUBLIC_SAFE",
    "TRAINING_DEIDENTIFIED_SAFE",
    "ANALYSIS_ONLY",
    "REJECT",
)


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha256("\0".join(parts).encode("utf-8")).hexdigest()
    return f"{prefix}.{digest[:32]}"


_ARABIC_NUMBER_RE = re.compile(r"(?<![A-Za-z0-9])[-+]?\d+(?:[.,]\d+)*(?:%|％)?")
_CHINESE_NUMBER_RE = re.compile(r"[零〇一二两三四五六七八九十百千万亿兆]+")
_DATE_RE = re.compile(
    r"(?:\d{4}[年./-]\d{1,2}(?:[月./-]\d{1,2}日?)?|\d{1,2}[月./-]\d{1,2}日?)"
)
_TIME_RE = re.compile(r"(?:[01]?\d|2[0-3])[:：][0-5]\d(?:[:：][0-5]\d)?|(?:上午|下午|晚上|凌晨)?\d{1,2}点(?:半|\d{1,2}分)?")
_CURRENCY_RE = re.compile(r"(?:CNY|RMB|USD|EUR|GBP|JPY|AUD|人民币|美元|欧元|英镑|日元|澳元|[¥￥$€£])\s*\d+(?:[.,]\d+)*", re.IGNORECASE)
_URL_RE = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_QUOTE_RE = re.compile(r"[\"“‘]([^\"”’]{1,120})[\"”’]")
_NEGATION_RE = re.compile(r"(?:不|没|无|未|否|别|勿|不能|不可|不要|没有|并非|不是|never|not|no\b)", re.IGNORECASE)
_CONDITION_RE = re.compile(r"(?:如果|若|除非|只有|只要|在.+?时|前提|条件|必须|只能|可以|可能|if\b|unless\b|only if\b|must\b|may\b|can\b)", re.IGNORECASE)
_LOGIC_RE = re.compile(r"(?:因此|所以|结论|意味着|等价|推出|否则|并且|或者|但|however|therefore|thus|implies|conclusion)", re.IGNORECASE)


def _matches(pattern: re.Pattern[str], text: str) -> tuple[str, ...]:
    values: set[str] = set()
    for match in pattern.finditer(text):
        value = match.group(1) if match.lastindex else match.group(0)
        value = re.sub(r"\s+", " ", value).strip().casefold()
        if value:
            values.add(value)
    return tuple(sorted(values))


@dataclass(frozen=True)
class ProtectedContentSignature:
    arabic_numbers: tuple[str, ...]
    chinese_numbers: tuple[str, ...]
    dates: tuple[str, ...]
    times: tuple[str, ...]
    currency: tuple[str, ...]
    urls: tuple[str, ...]
    emails: tuple[str, ...]
    quoted_values: tuple[str, ...]
    negations: tuple[str, ...]
    conditions: tuple[str, ...]
    logical_markers: tuple[str, ...]
    explicit_names: tuple[str, ...]

    def as_dict(self) -> dict[str, list[str]]:
        return {name: list(getattr(self, name)) for name in self.__dataclass_fields__}


def protected_content_signature(text: str, *, explicit_names: Iterable[str] = ()) -> ProtectedContentSignature:
    names = tuple(sorted({str(value).strip().casefold() for value in explicit_names if str(value).strip()}))
    return ProtectedContentSignature(
        arabic_numbers=_matches(_ARABIC_NUMBER_RE, text),
        chinese_numbers=_matches(_CHINESE_NUMBER_RE, text),
        dates=_matches(_DATE_RE, text),
        times=_matches(_TIME_RE, text),
        currency=_matches(_CURRENCY_RE, text),
        urls=_matches(_URL_RE, text),
        emails=_matches(_EMAIL_RE, text),
        quoted_values=_matches(_QUOTE_RE, text),
        negations=_matches(_NEGATION_RE, text),
        conditions=_matches(_CONDITION_RE, text),
        logical_markers=_matches(_LOGIC_RE, text),
        explicit_names=names,
    )


def protected_content_equal(source: str, candidate: str, *, explicit_names: Iterable[str] = ()) -> bool:
    return protected_content_signature(source, explicit_names=explicit_names) == protected_content_signature(
        candidate, explicit_names=explicit_names
    )


@dataclass(frozen=True)
class MutationSpec:
    mutation_id: str
    mechanics_label: str
    prefix: str = ""
    suffix: str = ""
    repeat_source: bool = False


CONTROLLED_MUTATIONS: tuple[MutationSpec, ...] = (
    MutationSpec("add_customer_service_opening", "customer_service_opening", prefix="好的，很高兴帮你。"),
    MutationSpec("expand_explanation", "expanded_explanation", prefix="展开说。"),
    MutationSpec("bulletize", "over_structured", prefix="• "),
    MutationSpec("add_generic_validation", "generic_validation", prefix="这个问题很值得聊。"),
    MutationSpec("add_forced_followup_question", "forced_question", suffix=" 你觉得呢？"),
    MutationSpec("add_textbook_framing", "textbook_framing", prefix="从定义来看："),
    MutationSpec("add_corporate_politeness", "corporate_politeness", prefix="感谢你的提问。"),
    MutationSpec("add_repetition", "repetition", suffix=" ", repeat_source=True),
    MutationSpec("add_over_conclusion", "over_conclusion", prefix="总之，"),
    MutationSpec("add_unnecessary_disclaimer", "excessive_disclaimer", prefix="仅供参考。"),
)


def apply_controlled_mutation(source: str, mutation: MutationSpec) -> str:
    if not source.strip():
        raise ValueError("mutation_source_empty")
    candidate = mutation.prefix + source + mutation.suffix
    if mutation.repeat_source:
        candidate += source
    if not protected_content_equal(source, candidate):
        raise ValueError(f"mutation_protected_content_changed:{mutation.mutation_id}")
    # Every controlled candidate must retain the full source literally.  This
    # is intentionally stricter than a generic semantic-similarity score.
    if source not in candidate:
        raise ValueError(f"mutation_source_not_literal_substring:{mutation.mutation_id}")
    return candidate


_MECHANICS_PATTERNS: dict[str, re.Pattern[str]] = {
    "customer_service_opening": re.compile(r"^(?:当然可以|很高兴|没问题|好的[，,])"),
    "over_structured": re.compile(r"(?:^|\n)\s*(?:[•*-]|\d+[.)、])"),
    "expanded_explanation": re.compile(r"^(?:展开说|先详细说明|下面展开)"),
    "generic_validation": re.compile(r"(?:很值得聊|理解你的感受|这个问题很重要)"),
    "forced_question": re.compile(r"(?:你觉得呢|还有什么想了解|需要我继续吗)[？?]?\s*$"),
    "textbook_framing": re.compile(r"^(?:可以从这个角度理解|从定义来看|教材式地说)"),
    "repetition": re.compile(r"(.{6,80})\s+\1\s*$", re.DOTALL),
    "corporate_politeness": re.compile(r"^(?:感谢你的提问|感谢您的关注|尊敬的)"),
    "over_conclusion": re.compile(r"^(?:总之|综上所述|归根结底)[，,:：]"),
    "excessive_disclaimer": re.compile(r"^(?:仅供参考|我不是专业人士|请咨询专业人士)[。.!！]"),
}


def mechanics_vector(text: str) -> list[int]:
    return [int(_MECHANICS_PATTERNS[label].search(text) is not None) for label in MECHANICS_LABELS]


def owner_register(row: Mapping[str, Any]) -> str:
    module = str(row.get("module", ""))
    scene = str(row.get("scene", ""))
    if any(marker in scene for marker in ("项目", "上线", "合作者", "使用场景")):
        return "project_discussion"
    if module in {"怪问题", "怪问题抽象"}:
        return "weird_question"
    if module in {"价值观", "审美", "审美 / 哲学"}:
        return "personal_reflection"
    if module in {"抽象判断", "语言与意义"}:
        return "philosophy"
    if module == "关系语境":
        return "light_emotional"
    return "ordinary_chat"


def public_register(row: Mapping[str, Any]) -> str:
    family = str(row.get("family_kind", ""))
    capability = str(row.get("capability", ""))
    if family in {"planning"} or capability in {"daily_food_answer", "household_answer", "simple_planning"}:
        return "practical_advice"
    if family in {"referent", "correction", "constraint", "rewrite", "summary", "comparison"}:
        return "technical_explanation"
    return "ordinary_chat"


def deterministic_group_splits(groups_by_register: Mapping[str, Sequence[str]], *, seed: int = CAMPAIGN_SEED) -> dict[str, str]:
    """Assign whole source groups with register-stratified 70/15/15 targets."""

    assignments: dict[str, str] = {}
    for register, raw_groups in sorted(groups_by_register.items()):
        groups = sorted(set(raw_groups), key=lambda value: hashlib.sha256(f"{seed}:{register}:{value}".encode()).hexdigest())
        if len(groups) < 3:
            # Unsupported tiny registers are not silently invented.  The
            # dataset builder must collapse or exclude them before this point.
            raise ValueError(f"register_has_fewer_than_three_source_groups:{register}:{len(groups)}")
        heldout = max(1, round(len(groups) * 0.15))
        dev = max(1, round(len(groups) * 0.15))
        if heldout + dev >= len(groups):
            heldout = dev = 1
        train = len(groups) - heldout - dev
        if train < 1:
            raise ValueError(f"register_has_no_train_source_group:{register}")
        for group in groups[:train]:
            assignments[group] = "train"
        for group in groups[train : train + dev]:
            assignments[group] = "dev"
        for group in groups[train + dev :]:
            assignments[group] = "heldout"
    return assignments


def validate_source_split_integrity(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    source_splits: dict[str, set[str]] = defaultdict(set)
    semantic_splits: dict[str, set[str]] = defaultdict(set)
    mutation_splits: dict[str, set[str]] = defaultdict(set)
    row_ids: set[str] = set()
    for row in rows:
        row_id = str(row["example_id"])
        if row_id in row_ids:
            raise ValueError(f"duplicate_example_id:{row_id}")
        row_ids.add(row_id)
        split = str(row["split"])
        if split not in SPLITS:
            raise ValueError(f"invalid_split:{split}")
        source_splits[str(row["source_group_id"])].add(split)
        semantic_splits[str(row["semantic_family_id"])].add(split)
        mutation_splits[str(row["mutation_family_id"])].add(split)
    leaks = {
        "source": sorted(key for key, values in source_splits.items() if len(values) != 1),
        "semantic": sorted(key for key, values in semantic_splits.items() if len(values) != 1),
        "mutation": sorted(key for key, values in mutation_splits.items() if len(values) != 1),
    }
    if any(leaks.values()):
        raise ValueError("source_split_leakage_detected")
    return {
        "valid": True,
        "example_count": len(rows),
        "source_group_count": len(source_splits),
        "semantic_family_count": len(semantic_splits),
        "mutation_family_count": len(mutation_splits),
        "source_leakage_count": 0,
        "semantic_family_leakage_count": 0,
        "mutation_family_leakage_count": 0,
    }


def serialize_dialogue_unit(register: str, context: str, response: str) -> str:
    if register not in REGISTER_CANDIDATES:
        raise ValueError(f"unknown_register:{register}")
    if not context.strip() or not response.strip():
        raise ValueError("empty_context_or_response")
    return (
        f"<REGISTER>\n{register}\n</REGISTER>\n"
        f"<CONTEXT>\n{context.strip()}\n</CONTEXT>\n"
        f"<RESPONSE>\n{response.strip()}\n</RESPONSE>\n<EOS>"
    )


def encode_dialogue_unit(
    tokenizer: Any,
    *,
    register: str,
    context: str,
    response: str,
    hard_max: int = CONTEXT_LENGTH,
    normal_target: int = NORMAL_TOKEN_TARGET,
) -> dict[str, Any]:
    """Encode without silently truncating protected context.

    The common J1A sources are short.  For an overlength source, only the
    oldest context-token prefix may be removed, and only when the complete
    protected signature remains.  The response is never truncated.
    """

    serialized = serialize_dialogue_unit(register, context, response)
    original_ids = tokenizer.encode(serialized, max_tokens=100_000, add_bos=True) + [tokenizer.eos]
    original_tokens = len(original_ids)
    if original_tokens <= normal_target:
        return {
            "input_ids": original_ids,
            "serialized_text": serialized,
            "original_tokens": original_tokens,
            "selected_tokens": original_tokens,
            "window_method": "full_source_no_window",
            "semantic_cut_detected": False,
        }
    # Work in source text rather than slicing the completed serialized IDs so
    # tags/response/EOS are structurally intact.
    context_ids = tokenizer.encode(context.strip(), max_tokens=100_000, add_bos=False)
    empty_context_serialized = serialize_dialogue_unit(register, "…", response)
    fixed_ids = tokenizer.encode(empty_context_serialized, max_tokens=100_000, add_bos=True) + [tokenizer.eos]
    budget = normal_target - len(fixed_ids) + 1
    if budget <= 0:
        raise ValueError("response_and_structure_exceed_normal_target")
    selected_context_ids = context_ids[-budget:]
    selected_context = tokenizer.decode(selected_context_ids).strip()
    if not selected_context:
        raise ValueError("context_window_empty")
    semantic_cut = not protected_content_equal(context, selected_context)
    if semantic_cut:
        raise ValueError("context_window_would_cut_protected_semantics")
    selected_serialized = serialize_dialogue_unit(register, selected_context, response)
    selected_ids = tokenizer.encode(selected_serialized, max_tokens=100_000, add_bos=True) + [tokenizer.eos]
    if len(selected_ids) > normal_target or len(selected_ids) > hard_max:
        raise ValueError("deterministic_window_still_overlength")
    return {
        "input_ids": selected_ids,
        "serialized_text": selected_serialized,
        "original_tokens": original_tokens,
        "selected_tokens": len(selected_ids),
        "window_method": "protected_context_suffix_window",
        "semantic_cut_detected": False,
    }


_SENTENCE_RE = re.compile(r"[。！？!?]+")
_PUNCT_RE = re.compile(r"[^\w\u3400-\u9fff\s]", re.UNICODE)
_LATIN_RE = re.compile(r"[A-Za-z]+")
_LIST_RE = re.compile(r"(?:^|\n)\s*(?:[•*-]|\d+[.)、])")
_ASSISTANT_PHRASE_RE = re.compile(r"当然可以|很高兴|感谢(?:你的|您的)?(?:提问|关注)|希望(?:能|这).{0,12}帮助|理解你的感受")
_PROJECT_NAME_RE = re.compile(r"(?:another[_ ]?brain|efishother|efishv1|DeepSeek|R\d+[A-Z0-9-]*)", re.IGNORECASE)
_PROPER_NOUN_RE = re.compile(r"(?:[A-Z][A-Za-z0-9_-]{2,}|《[^》]{1,30}》)")


def surface_features(text: str, *, token_count: int | None = None) -> list[float]:
    length = max(1, len(text))
    sentences = [value for value in _SENTENCE_RE.split(text) if value.strip()]
    latin = _LATIN_RE.findall(text)
    return [
        math.log1p(len(text)),
        math.log1p(token_count if token_count is not None else len(text)),
        math.log1p(len(sentences)),
        math.log1p(text.count("\n") + 1),
        text.count("，") / length,
        (text.count("。") + text.count(".")) / length,
        (text.count("？") + text.count("?")) / length,
        (text.count("！") + text.count("!")) / length,
        len(latin) / max(1, len(re.findall(r"[\u3400-\u9fff]", text)) + len(latin)),
        len(_LIST_RE.findall(text)) / max(1, len(sentences)),
        float(_ASSISTANT_PHRASE_RE.search(text) is not None),
        float(text.rstrip().endswith(("？", "?"))),
    ]


def shortcut_transform(text: str, slice_name: str, *, owner_phrase_patterns: Sequence[re.Pattern[str]] = ()) -> str:
    if slice_name == "punctuation_normalized":
        return re.sub(r"\s+", " ", _PUNCT_RE.sub(" ", text)).strip()
    if slice_name == "assistant_phrase_removed":
        return re.sub(r"\s+", " ", _ASSISTANT_PHRASE_RE.sub("[STYLE]", text)).strip()
    if slice_name == "owner_phrase_masked":
        result = text
        for pattern in owner_phrase_patterns:
            result = pattern.sub("[PHRASE]", result)
        return result
    if slice_name == "proper_noun_removed":
        return _PROPER_NOUN_RE.sub("[NAME]", text)
    if slice_name == "project_name_removed":
        return _PROJECT_NAME_RE.sub("[PROJECT]", text)
    return text


def confusion_matrix(gold: Sequence[int], predicted: Sequence[int], class_count: int) -> list[list[int]]:
    matrix = [[0 for _ in range(class_count)] for _ in range(class_count)]
    for left, right in zip(gold, predicted):
        matrix[int(left)][int(right)] += 1
    return matrix


def classification_report(gold: Sequence[int], predicted: Sequence[int], labels: Sequence[str]) -> dict[str, Any]:
    if len(gold) != len(predicted) or not gold:
        raise ValueError("classification_report_invalid_inputs")
    matrix = confusion_matrix(gold, predicted, len(labels))
    rows: dict[str, dict[str, float | int]] = {}
    f1_values: list[float] = []
    recalls: list[float] = []
    for index, label in enumerate(labels):
        tp = matrix[index][index]
        fp = sum(matrix[row][index] for row in range(len(labels))) - tp
        fn = sum(matrix[index]) - tp
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        rows[label] = {"precision": precision, "recall": recall, "f1": f1, "support": sum(matrix[index])}
        f1_values.append(f1)
        recalls.append(recall)
    return {
        "sample_count": len(gold),
        "accuracy": sum(int(a == b) for a, b in zip(gold, predicted)) / len(gold),
        "macro_f1": sum(f1_values) / len(f1_values),
        "balanced_accuracy": sum(recalls) / len(recalls),
        "per_class": rows,
        "confusion_matrix": matrix,
    }


def multilabel_report(gold: Sequence[Sequence[int]], predicted: Sequence[Sequence[int]], labels: Sequence[str]) -> dict[str, Any]:
    if len(gold) != len(predicted) or not gold:
        raise ValueError("multilabel_report_invalid_inputs")
    per_label: dict[str, Any] = {}
    f1_values: list[float] = []
    for index, label in enumerate(labels):
        left = [int(row[index]) for row in gold]
        right = [int(row[index]) for row in predicted]
        report = classification_report(left, right, ("absent", "present"))
        value = report["per_class"]["present"]
        per_label[label] = value
        f1_values.append(float(value["f1"]))
    return {"sample_count": len(gold), "macro_f1": sum(f1_values) / len(f1_values), "per_label": per_label}


def assert_descriptive_labels_only(labels: Iterable[str]) -> None:
    lowered = [str(value).casefold() for value in labels]
    bad = [value for value in lowered if any(fragment in value for fragment in FORBIDDEN_TRAINING_LABEL_FRAGMENTS)]
    if bad:
        raise ValueError("normative_or_generation_label_forbidden:" + ",".join(sorted(bad)))


assert_descriptive_labels_only((*DOMAIN_LABELS, *REGISTER_CANDIDATES, *MECHANICS_LABELS))
