"""Conservative source-evidence contract for R30J0-P.

The helpers in this module intentionally return decisions and aggregate-safe
metadata only.  They never return a matched secret, contact detail, sensitive
phrase, source excerpt, or inferred owner preference.  Authorship is derived
from explicit reviewed provenance; a filename is never authorship evidence.
"""

from __future__ import annotations

from collections import Counter
import hashlib
from pathlib import PurePosixPath
import re
from typing import Any, Iterable, Mapping


AUTHORSHIP_CLASSES = (
    "OWNER_AUTHORED_HIGH_CONFIDENCE",
    "OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE",
    "OWNER_AUTHORED_EDITED",
    "MIXED_OWNER_AI",
    "AI_OR_CODEX_GENERATED",
    "THIRD_PARTY",
    "UNKNOWN",
)

PRIMARY_AUTHORSHIP_CLASSES = frozenset(
    {"OWNER_AUTHORED_HIGH_CONFIDENCE", "OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE"}
)
SECONDARY_AUTHORSHIP_CLASSES = frozenset({"OWNER_AUTHORED_EDITED"})

SOURCE_TYPES = (
    "casual_chinese",
    "casual_english",
    "spoken_answer_chinese",
    "spoken_answer_english",
    "reflective_writing",
    "project_explanation",
    "academic_writing",
    "formal_email_or_message",
    "short_message",
    "caption_or_microcopy",
    "creative_writing",
    "other",
)

PERSONAL_REGISTERS = (
    "ordinary_chat",
    "practical_answer",
    "logic_explanation",
    "philosophical_reflection",
    "project_discussion",
    "formal_message",
)

HISTORICAL_ASSET_DECISIONS = ("REUSE", "REVIEW", "REJECT", "SUPERSEDED")
REVIEW_STATUSES = ("UNREVIEWED", "REVIEW_REQUIRED", "OWNER_APPROVED", "REJECTED")

TEXT_EXTENSIONS = frozenset(
    {".md", ".markdown", ".txt", ".json", ".jsonl", ".yaml", ".yml", ".csv", ".tsv", ".html", ".htm"}
)
DOCUMENT_EXTENSIONS = frozenset({".pdf", ".doc", ".docx", ".rtf", ".odt", ".pages", ".ppt", ".pptx"})
CANDIDATE_EXTENSIONS = TEXT_EXTENSIONS | DOCUMENT_EXTENSIONS

_EXCLUDED_COMPONENTS = frozenset(
    {
        ".git",
        "node_modules",
        "dist",
        "build",
        "coverage",
        "weights",
        "weight",
        "checkpoints",
        "checkpoint",
        "adapters",
        "models",
        "logs",
        "log",
        "tests",
        "test",
        "evals",
        "eval",
        "reports",
        "report",
        "telemetry",
        "responses",
        "requests",
        "raw_responses",
        "synthetic",
        "generated",
        "public_corpus",
        "public_ingestion",
        "corpus",
        "__pycache__",
        ".cache",
    }
)
_EXCLUDED_SUFFIXES = frozenset(
    {
        ".safetensors",
        ".gguf",
        ".bin",
        ".pt",
        ".pth",
        ".onnx",
        ".mlmodel",
        ".mlpackage",
        ".ckpt",
        ".log",
        ".sqlite",
        ".db",
    }
)
_EXCLUDED_NAME_FRAGMENTS = (
    "deepseek",
    "codex",
    "api_response",
    "api-request",
    "api_request",
    "authorization",
    "secret",
    "credential",
    "private_key",
    "access_token",
)

# These patterns deliberately produce one boolean.  Callers must never expose
# the matching text or which pattern matched.
_SENSITIVE_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE | re.MULTILINE)
    for pattern in (
        r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
        r"\b(?:api[_-]?key|secret|password|authorization|bearer|access[_-]?token)\s*[:=]\s*[^\s,;]{6,}",
        r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
        r"(?<!\d)(?:\+?\d[\s().-]?){8,15}(?!\d)",
        r"(?:身份证|护照|银行卡|银行账号|账户号码|卡号|account\s*(?:number|no\.?))",
        r"(?:家庭住址|居住地址|邮寄地址|门牌号|住在.{0,16}(?:路|街|号))",
        r"(?:诊断|病史|病历|处方|健康状况|心理疾病|mental\s+health|medical\s+record)",
        r"(?:宗教信仰|教派|religious\s+belief|religion\s*:)",
        r"(?:政治立场|政党偏好|投票偏好|political\s+(?:belief|affiliation))",
        r"(?:性取向|性别认同|sexual\s+orientation|gender\s+identity)",
        r"(?:犯罪记录|刑事记录|案底|criminal\s+record)",
        r"(?:工资|薪资|收入|存款|负债|财务状况|bank\s+balance|financial\s+record)",
        r"(?:学号|成绩单|处分记录|校务|student\s+id|academic\s+record)",
        r"(?:工作机密|单位机密|人事档案|员工编号|绩效记录|employment\s+record|hr\s+record)",
        r"(?:第三方隐私|他人隐私|private\s+information\s+about\s+another\s+person)",
    )
)

_SAFE_CODE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,127}$")


def normalized_logical_path(value: str) -> str:
    """Validate a repository-relative POSIX logical path."""

    path = PurePosixPath(value.replace("\\", "/"))
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ValueError("logical_path_must_be_repository_relative")
    return path.as_posix()


def discovery_exclusion_reason(logical_path: str) -> str | None:
    """Return a safe reason code without opening excluded content."""

    normalized = normalized_logical_path(logical_path)
    path = PurePosixPath(normalized)
    parts = tuple(part.lower() for part in path.parts)
    name = parts[-1]
    suffix = path.suffix.lower()
    if normalized.startswith("artifacts/r30j0/"):
        return "scanner_output_self_excluded"
    if any(component in _EXCLUDED_COMPONENTS for component in parts):
        return "excluded_path_category"
    if any(component.startswith("r29") and "artifacts" in parts for component in parts):
        return "prior_experiment_artifact_excluded"
    if any("corpus" in component for component in parts):
        return "generic_or_external_corpus_excluded"
    if suffix in _EXCLUDED_SUFFIXES:
        return "weight_checkpoint_build_or_log_excluded"
    if name.startswith(".env") or name.endswith(".pem") or name.endswith(".key"):
        return "secret_bearing_filename_never_opened"
    if any(fragment in name for fragment in _EXCLUDED_NAME_FRAGMENTS):
        return "api_secret_or_agent_material_never_opened"
    if name.endswith(".provenance.json"):
        return "provenance_sidecar_not_source_content"
    if suffix not in CANDIDATE_EXTENSIONS:
        return "unsupported_source_format"
    return None


def contains_sensitive_content(text: str) -> bool:
    """Return only a conservative sensitive-content boolean."""

    return any(pattern.search(text) is not None for pattern in _SENSITIVE_PATTERNS)


def estimate_language(text: str) -> str:
    cjk = len(re.findall(r"[\u3400-\u9fff]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    if cjk == 0 and latin == 0:
        return "unknown"
    if cjk >= max(20, latin * 2):
        return "zh"
    if latin >= max(20, cjk * 2):
        return "en"
    if cjk and latin:
        return "mixed"
    return "other"


def _valid_safe_code(value: Any) -> bool:
    return isinstance(value, str) and _SAFE_CODE.fullmatch(value) is not None


def authorship_from_provenance(provenance: Mapping[str, Any] | None, subject_sha256: str) -> str:
    """Classify authorship only from a reviewed, hash-bound attestation.

    No filename is accepted by this function.  Missing, malformed, unreviewed,
    or hash-mismatched provenance is conservatively UNKNOWN.
    """

    if not isinstance(provenance, Mapping):
        return "UNKNOWN"
    claimed = provenance.get("authorship_class")
    if claimed not in AUTHORSHIP_CLASSES:
        return "UNKNOWN"
    if provenance.get("subject_sha256") != subject_sha256:
        return "UNKNOWN"
    high_confidence = PRIMARY_AUTHORSHIP_CLASSES | SECONDARY_AUTHORSHIP_CLASSES
    if claimed in high_confidence:
        if provenance.get("review_status") != "OWNER_APPROVED":
            return "UNKNOWN"
        if provenance.get("reviewed_by_role") != "OWNER":
            return "UNKNOWN"
        required_attestation = {
            "OWNER_AUTHORED_HIGH_CONFIDENCE": "OWNER_DECLARATION",
            "OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE": "TRANSCRIPT_PROCESS_RECORD",
            "OWNER_AUTHORED_EDITED": "EDIT_HISTORY_AUDIT",
        }[claimed]
        if provenance.get("attestation_kind") != required_attestation:
            return "UNKNOWN"
    return str(claimed)


def source_type_from_provenance(provenance: Mapping[str, Any] | None) -> str:
    if isinstance(provenance, Mapping) and provenance.get("source_type") in SOURCE_TYPES:
        return str(provenance["source_type"])
    return "other"


def answer_transcript_authorship(
    row: Mapping[str, Any], *, process_evidence: Mapping[str, Any]
) -> str:
    """Recognize an admitted answer transcript from compound process evidence.

    This path is intentionally not based on the corpus filename.  Every row
    must carry the user-answered permission/provenance invariants and the
    caller must separately establish tracked-file, review-document, exact-row-
    count, split, privacy and duplicate checks for the complete process.
    """

    provenance = row.get("provenance")
    row_ok = (
        isinstance(provenance, Mapping)
        and provenance.get("source_type") == "user_answered"
        and provenance.get("license_or_permission") == "user-authored-reviewed-for-project-training"
        and provenance.get("contains_private_data") is False
        and provenance.get("external_llm_used") is False
        and row.get("review_status") == "reviewed_for_training_corpus"
        and row.get("public_commit_allowed") is True
        and row.get("contains_private_data") is False
        and row.get("training_allowed") is True
        and isinstance(row.get("target_answer"), str)
        and bool(row["target_answer"].strip())
        and row.get("target_answer") == row.get("user_answer_clean")
    )
    required_process_flags = (
        "all_expected_files_tracked",
        "review_docs_confirm_wording_preserved",
        "row_count_98",
        "split_counts_78_10_10",
        "private_rows_zero",
        "duplicate_normalized_targets_zero",
        "all_row_invariants_pass",
    )
    if row_ok and all(process_evidence.get(flag) is True for flag in required_process_flags):
        return "OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE"
    return "UNKNOWN"


def spoken_source_type(language: str) -> str:
    if language == "zh":
        return "spoken_answer_chinese"
    if language == "en":
        return "spoken_answer_english"
    # Mixed/unknown rows remain a generic source type; source type is never
    # promoted from a filename.
    return "other"


def split_groups_from_provenance(
    provenance: Mapping[str, Any] | None, *, content_sha256: str, source_id: str
) -> dict[str, str]:
    """Return document/idea/family groups without inferring semantic ideas."""

    split = provenance.get("split_groups") if isinstance(provenance, Mapping) else None
    if isinstance(split, Mapping) and all(_valid_safe_code(split.get(key)) for key in ("document", "idea", "family")):
        return {key: str(split[key]) for key in ("document", "idea", "family")}
    # Exact duplicate documents share a group. Unknown ideas/families receive a
    # source-local quarantine group; they cannot silently cross a future split.
    return {
        "document": f"doc.{content_sha256[:24]}",
        "idea": f"idea.unknown.{source_id[-24:]}",
        "family": f"family.unknown.{source_id[-24:]}",
    }


def selection_decision(
    authorship_class: str,
    *,
    contains_sensitive_sections: bool,
    review_status: str,
    ngram_overlap_excluded: bool = False,
) -> dict[str, Any]:
    """Apply the R30J0-P tier rule; training remains forbidden in J0."""

    if authorship_class not in AUTHORSHIP_CLASSES:
        raise ValueError("unknown_authorship_class")
    if review_status not in REVIEW_STATUSES:
        raise ValueError("unknown_review_status")
    if contains_sensitive_sections:
        return {
            "personalization_priority": "EXCLUDE",
            "allowed_for_style_analysis": False,
            "allowed_for_training_candidate": False,
            "reason": "excluded_sensitive_content",
            "excluded_sensitive_content": True,
        }
    if ngram_overlap_excluded:
        return {
            "personalization_priority": "QUARANTINE",
            "allowed_for_style_analysis": False,
            "allowed_for_training_candidate": False,
            "reason": "ngram_overlap_requires_group_review",
            "excluded_sensitive_content": False,
        }
    if authorship_class in PRIMARY_AUTHORSHIP_CLASSES:
        return {
            "personalization_priority": "PRIMARY",
            "allowed_for_style_analysis": review_status == "OWNER_APPROVED",
            "allowed_for_training_candidate": False,
            "reason": "primary_authorship_requires_separate_future_training_authorization",
            "excluded_sensitive_content": False,
        }
    if authorship_class in SECONDARY_AUTHORSHIP_CLASSES:
        return {
            "personalization_priority": "SECONDARY",
            "allowed_for_style_analysis": review_status == "OWNER_APPROVED",
            "allowed_for_training_candidate": False,
            "reason": "edited_secondary_only_requires_separation_from_primary",
            "excluded_sensitive_content": False,
        }
    if authorship_class in {"THIRD_PARTY", "AI_OR_CODEX_GENERATED"}:
        return {
            "personalization_priority": "EXCLUDE",
            "allowed_for_style_analysis": False,
            "allowed_for_training_candidate": False,
            "reason": "non_owner_or_synthetic_source_excluded",
            "excluded_sensitive_content": authorship_class == "THIRD_PARTY",
        }
    return {
        "personalization_priority": "QUARANTINE",
        "allowed_for_style_analysis": False,
        "allowed_for_training_candidate": False,
        "reason": "authorship_not_high_confidence",
        "excluded_sensitive_content": False,
    }


def normalized_character_ngrams(text: str, *, n: int = 8, maximum: int = 20_000) -> frozenset[bytes]:
    """Build hashed n-grams in memory; raw n-grams are never returned."""

    normalized = re.sub(r"\s+", "", text).casefold()
    if len(normalized) < n:
        return frozenset()
    values: set[bytes] = set()
    for index in range(min(len(normalized) - n + 1, maximum)):
        values.add(hashlib.blake2s(normalized[index : index + n].encode("utf-8"), digest_size=8).digest())
    return frozenset(values)


def ngram_overlap_ratio(left: frozenset[bytes], right: frozenset[bytes]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / min(len(left), len(right))


def style_wrapper_preserves_source(source: str, candidate: str, prefix: str) -> bool:
    """Admit only a literal prefix wrapper around the complete source text."""

    if not source or not prefix or candidate != prefix + source:
        return False
    # Wrappers cannot themselves add numbers, dates, quotation marks,
    # negation, conditions, URLs, email-like values, or currency markers.
    forbidden_wrapper_signal = re.compile(
        r"[0-9０-９一二三四五六七八九十百千万亿年月日时点%％¥￥$€£]|"
        r"(?:不|没|无|未|否|如果|若|除非|https?://|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)|"
        r"[\"'“”‘’]",
        re.IGNORECASE,
    )
    return forbidden_wrapper_signal.search(prefix) is None


def make_source_id(logical_path: str, content_sha256: str) -> str:
    normalized = normalized_logical_path(logical_path)
    digest = hashlib.sha256(f"{normalized}\0{content_sha256}".encode("utf-8")).hexdigest()
    return f"psrc.{digest[:32]}"


_INVENTORY_REQUIRED_FIELDS = frozenset(
    {
        "source_id",
        "logical_path",
        "bytes",
        "sha256",
        "authorship_class",
        "source_type",
        "language",
        "estimated_owner_content_ratio",
        "personalization_priority",
        "contains_sensitive_sections",
        "excluded_sensitive_content",
        "allowed_for_style_analysis",
        "allowed_for_training_candidate",
        "reason",
        "review_status",
        "split_groups",
        "historical_asset_decision",
        "ngram_overlap_excluded",
    }
)
_FORBIDDEN_RAW_FIELDS = frozenset(
    {"content", "raw_content", "raw_text", "excerpt", "raw_excerpt", "matched_value", "secret", "owner_value"}
)


def validate_inventory_record(record: Mapping[str, Any]) -> None:
    missing = _INVENTORY_REQUIRED_FIELDS - set(record)
    if missing:
        raise ValueError("inventory_required_fields_missing")
    if set(record) & _FORBIDDEN_RAW_FIELDS:
        raise ValueError("inventory_raw_or_sensitive_field_forbidden")
    normalized_logical_path(str(record["logical_path"]))
    if record["authorship_class"] not in AUTHORSHIP_CLASSES:
        raise ValueError("inventory_authorship_invalid")
    if record["source_type"] not in SOURCE_TYPES:
        raise ValueError("inventory_source_type_invalid")
    if record["historical_asset_decision"] not in HISTORICAL_ASSET_DECISIONS:
        raise ValueError("inventory_historical_decision_invalid")
    if record["review_status"] not in REVIEW_STATUSES:
        raise ValueError("inventory_review_status_invalid")
    if record["allowed_for_training_candidate"] is not False:
        raise ValueError("j0_training_candidate_must_be_false")
    if record["contains_sensitive_sections"] and (
        record["personalization_priority"] != "EXCLUDE" or record["allowed_for_style_analysis"] is not False
    ):
        raise ValueError("sensitive_source_must_be_excluded")
    if record["personalization_priority"] == "PRIMARY" and record["authorship_class"] not in PRIMARY_AUTHORSHIP_CLASSES:
        raise ValueError("primary_requires_primary_authorship")
    if record["personalization_priority"] == "SECONDARY" and record["authorship_class"] not in SECONDARY_AUTHORSHIP_CLASSES:
        raise ValueError("secondary_requires_edited_authorship")


def aggregate_inventory(records: Iterable[Mapping[str, Any]], *, excluded_file_count: int, read_error_count: int) -> dict[str, Any]:
    """Return an aggregate safe for stdout and reports; never include paths."""

    rows = list(records)
    return {
        "schema_version": "r30j0.personal-source-discovery-summary.v1",
        "status": "DISCOVERY_ONLY_NO_TRAINING",
        "candidate_source_count": len(rows),
        "excluded_file_count": excluded_file_count,
        "read_error_count": read_error_count,
        "sensitive_excluded_count": sum(bool(row["excluded_sensitive_content"]) for row in rows),
        "allowed_for_style_analysis_count": sum(bool(row["allowed_for_style_analysis"]) for row in rows),
        "allowed_for_training_candidate_count": 0,
        "authorship_counts": dict(sorted(Counter(str(row["authorship_class"]) for row in rows).items())),
        "source_type_counts": dict(sorted(Counter(str(row["source_type"]) for row in rows).items())),
        "priority_counts": dict(sorted(Counter(str(row["personalization_priority"]) for row in rows).items())),
        "historical_asset_decision_counts": dict(
            sorted(Counter(str(row["historical_asset_decision"]) for row in rows).items())
        ),
        "owner_values_emitted": False,
        "raw_excerpts_emitted": False,
        "paths_emitted_to_stdout": False,
        "network_requests": 0,
        "training_started": False,
    }
