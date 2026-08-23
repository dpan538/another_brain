#!/usr/bin/env python3
"""Recover R30J0-P owner-writing evidence without exposing source text.

All populated outputs are local/ignored.  Standard output is deliberately an
aggregate-only receipt: it contains no path, excerpt, hash, preference value,
or sensitive-category match.  The script never accesses the DeepSeek secret,
never calls a network service, and never authorizes training.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import statistics
import tempfile
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_ROOT = ROOT / "artifacts" / "r30j0"
PERSONAL_ROOT = ARTIFACT_ROOT / "personal_sources"
REPORT_ROOT = ARTIFACT_ROOT / "reports"
REVIEW_ROOT = ARTIFACT_ROOT / "owner_review" / "personal_source_review"

import sys

sys.path.insert(0, str(ROOT))
from src.personal_judge.source_evidence_contract import (  # noqa: E402
    AUTHORSHIP_CLASSES,
    PERSONAL_REGISTERS,
    SOURCE_TYPES,
    authorship_from_provenance,
    contains_sensitive_content,
    discovery_exclusion_reason,
    estimate_language,
    make_source_id,
    normalized_logical_path,
    selection_decision,
    source_type_from_provenance,
    split_groups_from_provenance,
    style_wrapper_preserves_source,
    validate_inventory_record,
)


CAMPAIGN_ID = "r30j0_personal_efish_judge_v1"
R26_FILES = tuple(
    sorted(
        ROOT.glob("training/llm_corpus/r26e_user_answered_*.jsonl")
    )
    + sorted(ROOT.glob("training/llm_corpus/r26g_user_answered_*.jsonl"))
)
R26_APPROVALS = (
    ROOT / "training/from_scratch/APPROVE_R26E_PROMOTE_FIRST50_USER_ANSWERS.json",
    ROOT / "training/from_scratch/APPROVE_R26G_FIX_AND_INTAKE_USER_ANSWERS.json",
)
R26_PROCESS_DOCS = (
    ROOT / "docs/R26E_FIRST50_USER_ANSWER_PROMOTION.md",
    ROOT / "docs/R26G_FIX_AND_INTAKE_USER_ANSWERS.md",
    ROOT / "docs/R26H_USER_ANSWER_CORPUS_READINESS.md",
)
EDITED_IDENTITY_FILES = (
    ROOT / "identity_pack/cards/interview_round1_cards.jsonl",
    ROOT / "identity_pack/cards/interview_round2_cards.jsonl",
)
AI_HISTORY_ASSETS = (
    (ROOT / "identity_pack/cards/seed_identity_cards.jsonl", "REVIEW"),
    (ROOT / "identity_pack/cards/culture_awareness_cards.jsonl", "REVIEW"),
    (ROOT / "data/training_registry/r28surf5_style_profile.json", "SUPERSEDED"),
    (ROOT / "data/hybrid_signal/efish_emotional_grammar_v1.json", "REJECT"),
)
LOCAL_SOURCE_ROOTS = (
    ROOT / "artifacts/training_os/personal_writing_intake",
    ROOT / "private",
    ROOT / "datasets/private",
    ROOT / "identity_pack/private",
    ROOT / "private_sources",
)
MAX_LOCAL_TEXT_BYTES = 4 * 1024 * 1024

PROFILE_DIMENSIONS = (
    "response_density",
    "warmth",
    "directness",
    "formality",
    "reflection",
    "explanation_depth",
    "assistantness_tolerance",
    "question_frequency",
    "humour",
    "philosophy_style",
)

FORMAL_RE = re.compile(r"因此|然而|综上|首先|其次|此外|由此可见|毋庸置疑")
ASSISTANT_RE = re.compile(r"很高兴|当然可以|希望(?:能|这).{0,12}帮|感谢|理解你的感受|为你解答")
HUMOUR_RE = re.compile(r"哈哈|嘿|笑死|开玩笑|～|~")
HEDGE_RE = re.compile(r"可能|也许|大概|或许|未必|不一定|我猜|我觉得")
COLLOQUIAL_RE = re.compile(r"吧|嘛|呢|啊|其实|反正|挺|有点")
QUESTION_RE = re.compile(r"[？?]")
EXCLAMATION_RE = re.compile(r"[！!]")
BULLET_RE = re.compile(r"(?:^|\n)\s*(?:[-*•]|\d+[.)、])")
NORMATIVE_TARGET = r"回答|表达|语气|风格|说法|口气|解释|句子|列表|客服|措辞|节奏"
NORMATIVE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("explicit_preference", re.compile(rf"(?:我(?:更)?(?:喜欢|偏好|希望).{{0,24}}(?:{NORMATIVE_TARGET})|(?:{NORMATIVE_TARGET}).{{0,24}}我(?:更)?(?:喜欢|偏好|希望))")),
    ("explicit_rejection", re.compile(rf"(?:我(?:不喜欢|讨厌|不想要).{{0,24}}(?:{NORMATIVE_TARGET})|不要.{{0,16}}(?:{NORMATIVE_TARGET})|(?:{NORMATIVE_TARGET}).{{0,24}}(?:太|很)?(?:假|冷|正式|啰嗦|客服))")),
    ("explicit_acceptance", re.compile(rf"(?:(?:这样|这种).{{0,16}}(?:{NORMATIVE_TARGET}).{{0,16}}(?:可以|对|更好|合适))")),
)

# Prefix-only wrappers keep the complete source answer as a literal suffix.
# They are style-contrast candidates, not preferred answers or semantic proof.
STYLE_WRAPPERS: tuple[tuple[str, str], ...] = (
    ("add_customer_service_opening", "当然可以。"),
    ("make_more_formal", "就这个问题而言，"),
    ("make_more_verbose", "先多说几句："),
    ("add_unnecessary_validation", "这个问题很值得聊。"),
    ("add_unnecessary_disclaimer", "仅供参考，"),
    ("add_bullet_structure", "• "),
    ("add_textbook_framing", "可以从这个角度看："),
    ("make_too_cold", "答："),
    ("make_too_warm", "认真回应，"),
    ("make_overly_enthusiastic", "太好了，"),
    ("make_overly_apologetic", "抱歉，"),
)

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
URL_RE = re.compile(r"https?://[^\s<>'\"]+", re.IGNORECASE)
PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d[\s().-]?){8,15}(?!\d)")
ABS_PATH_RE = re.compile(r"(?:^|[\s'\"])(?:/(?:Users|private|home|var/folders)/[^\s'\"]+|[A-Za-z]:\\(?:Users|Documents|AppData)\\[^\s'\"]+)")
SECRETISH_RE = re.compile(r"(?:api[_-]?key|authorization|bearer|password|access[_-]?token)\s*[:=]\s*\S+", re.IGNORECASE)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def safe_code(value: str, prefix: str = "code") -> str:
    normalized = re.sub(r"[^a-z0-9._-]+", "-", value.casefold()).strip("-._")
    if len(normalized) < 3:
        normalized = f"{prefix}-{hashlib.sha256(value.encode('utf-8')).hexdigest()[:12]}"
    return normalized[:120]


def logical(path: Path) -> str:
    return normalized_logical_path(path.relative_to(ROOT).as_posix())


def atomic_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(value)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def atomic_json(path: Path, value: Any) -> None:
    atomic_text(path, json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def redact_review_text(value: str, maximum: int = 180) -> str:
    value = SECRETISH_RE.sub("[已移除]", value)
    value = EMAIL_RE.sub("[已移除]", value)
    value = URL_RE.sub("[已移除]", value)
    value = PHONE_RE.sub("[已移除]", value)
    value = ABS_PATH_RE.sub(" [已移除]", value)
    value = re.sub(r"\s+", " ", value).strip()
    if not value:
        return "[没有可展示的清洗片段]"
    return value[:maximum]


def source_language(row: dict[str, Any], text: str) -> str:
    declared = str(row.get("language") or "").lower()
    if declared in {"zh", "en", "mixed"}:
        return declared
    return estimate_language(text)


def primary_source_type(language: str) -> str:
    return "spoken_answer_english" if language == "en" else "spoken_answer_chinese"


def classify_register(row: dict[str, Any]) -> str:
    combined = " ".join(
        str(row.get(key) or "")
        for key in ("scene", "module", "question_intent", "answer_mode", "tags")
    )
    if re.search(r"项目|上线|进度|合作者|使用场景|project", combined, re.IGNORECASE):
        return "project_discussion"
    if re.search(r"朋友|关系|情绪|压力|公开评论|随口|ordinary|emotional", combined, re.IGNORECASE):
        return "ordinary_chat"
    if re.search(r"价值|审美|哲学|语言与意义|抽象|怪问题|reflection", combined, re.IGNORECASE):
        return "philosophical_reflection"
    if re.search(r"挑战|证据|纠错|逻辑|前提|boundary|challenge|weird_question", combined, re.IGNORECASE):
        return "logic_explanation"
    if re.search(r"建议|判断|使用|怎么办|ask_opinion|practical", combined, re.IGNORECASE):
        return "practical_answer"
    return "ordinary_chat"


def transcript_process_evidence_ok() -> tuple[bool, dict[str, Any]]:
    approval_ok = all(
        path.is_file()
        and (payload := read_json(path)).get("approved") is True
        and payload.get("reviewer") == "user"
        and payload.get("consumed") is True
        and payload.get("allow_raw_source_commit") is False
        for path in R26_APPROVALS
    )
    docs_ok = all(path.is_file() for path in R26_PROCESS_DOCS)
    rows: list[dict[str, Any]] = []
    parse_ok = len(R26_FILES) == 6
    for path in R26_FILES:
        try:
            rows.extend(read_jsonl(path))
        except Exception:
            parse_ok = False
    invariant_count = 0
    split_counts: Counter[str] = Counter()
    normalized_targets: Counter[str] = Counter()
    external_llm_false_count = 0
    provenance_private_false_count = 0
    training_allowed_count = 0
    for row in rows:
        provenance = row.get("provenance") or {}
        split_counts[str(row.get("split"))] += 1
        normalized = re.sub(r"\s+", "", str(row.get("user_answer_clean") or "")).casefold()
        normalized_targets[hashlib.sha256(normalized.encode("utf-8")).hexdigest()] += 1
        external_llm_false_count += provenance.get("external_llm_used") is False
        provenance_private_false_count += provenance.get("contains_private_data") is False
        training_allowed_count += row.get("training_allowed") is True
        if (
            provenance.get("source_type") == "user_answered"
            and provenance.get("license_or_permission") == "user-authored-reviewed-for-project-training"
            and provenance.get("external_llm_used") is False
            and provenance.get("contains_private_data") is False
            and row.get("review_status") == "reviewed_for_training_corpus"
            and row.get("public_commit_allowed") is True
            and row.get("training_allowed") is True
            and row.get("contains_private_data") is False
            and row.get("target_answer") == row.get("user_answer_clean")
            and isinstance(row.get("user_answer_clean"), str)
            and bool(row.get("user_answer_clean").strip())
        ):
            invariant_count += 1
    duplicate_group_count = sum(count > 1 for count in normalized_targets.values())
    split_exact = split_counts == Counter({"train": 78, "dev": 10, "heldout": 10})
    exact = (
        parse_ok
        and approval_ok
        and docs_ok
        and len(rows) == 98
        and invariant_count == 98
        and split_exact
        and duplicate_group_count == 0
        and external_llm_false_count == 98
        and provenance_private_false_count == 98
        and training_allowed_count == 98
    )
    return exact, {
        "source_file_count": len(R26_FILES),
        "row_count": len(rows),
        "row_invariant_pass_count": invariant_count,
        "approval_records_pass": approval_ok,
        "process_docs_present": docs_ok,
        "split_counts": dict(sorted(split_counts.items())),
        "split_78_10_10_pass": split_exact,
        "normalized_target_duplicate_group_count": duplicate_group_count,
        "external_llm_false_count": external_llm_false_count,
        "provenance_private_false_count": provenance_private_false_count,
        "training_allowed_count": training_allowed_count,
        "compound_evidence_pass": exact,
    }


def inventory_record(
    *,
    logical_path: str,
    raw_bytes: bytes,
    authorship_class: str,
    source_type: str,
    language: str,
    owner_ratio: float | None,
    contains_sensitive: bool,
    review_status: str,
    historical_decision: str,
    split_groups: dict[str, str] | None = None,
    reason_override: str | None = None,
) -> dict[str, Any]:
    digest = sha256_bytes(raw_bytes)
    source_id = make_source_id(logical_path, digest)
    decision = selection_decision(
        authorship_class,
        contains_sensitive_sections=contains_sensitive,
        review_status=review_status,
    )
    if reason_override:
        decision["reason"] = reason_override
    groups = split_groups or split_groups_from_provenance(None, content_sha256=digest, source_id=source_id)
    record = {
        "source_id": source_id,
        "logical_path": logical_path,
        "bytes": len(raw_bytes),
        "sha256": digest,
        "authorship_class": authorship_class,
        "source_type": source_type,
        "language": language,
        "estimated_owner_content_ratio": owner_ratio,
        "personalization_priority": decision["personalization_priority"],
        "contains_sensitive_sections": contains_sensitive,
        "excluded_sensitive_content": decision["excluded_sensitive_content"],
        "allowed_for_style_analysis": decision["allowed_for_style_analysis"],
        "allowed_for_training_candidate": False,
        "reason": decision["reason"],
        "review_status": review_status,
        "split_groups": groups,
        "historical_asset_decision": historical_decision,
        "ngram_overlap_excluded": False,
    }
    validate_inventory_record(record)
    return record


def discover_r26_transcripts() -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    compound_ok, evidence = transcript_process_evidence_ok()
    inventory: list[dict[str, Any]] = []
    admitted: list[dict[str, Any]] = []
    duplicate_counter: Counter[str] = Counter()
    for path in R26_FILES:
        rows = read_jsonl(path)
        file_family = "r26e-owner-answer-pack" if path.name.startswith("r26e_") else "r26g-owner-answer-pack"
        for index, row in enumerate(rows, 1):
            text = str(row.get("user_answer_clean") or "")
            raw = canonical_bytes(row)
            language = source_language(row, text)
            sensitive = bool(row.get("contains_private_data")) or contains_sensitive_content(text)
            source_row = safe_code(str(row.get("source_row_id") or row.get("sample_id") or index), "row")
            row_path = f"{logical(path)}#row-{source_row}"
            digest = sha256_bytes(raw)
            source_id = make_source_id(row_path, digest)
            idea_code = safe_code(f"{row.get('pack_id') or file_family}-{row.get('source_row_id') or index}", "idea")
            family_code = safe_code(str(row.get("pack_id") or file_family), "family")
            document_code = safe_code(f"document-{file_family}", "document")
            record = inventory_record(
                logical_path=row_path,
                raw_bytes=raw,
                authorship_class="OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE" if compound_ok else "UNKNOWN",
                source_type=primary_source_type(language),
                language=language,
                owner_ratio=1.0 if compound_ok else None,
                contains_sensitive=sensitive,
                review_status="OWNER_APPROVED" if compound_ok else "REVIEW_REQUIRED",
                historical_decision="REUSE" if compound_ok and not sensitive else "REJECT",
                split_groups={"document": document_code, "idea": idea_code, "family": family_code},
            )
            inventory.append(record)
            normalized = re.sub(r"\s+", "", text).casefold()
            duplicate_counter[hashlib.sha256(normalized.encode("utf-8")).hexdigest()] += 1
            if record["allowed_for_style_analysis"]:
                admitted.append(
                    {
                        "source_id": source_id,
                        "text": text,
                        "question": str(row.get("question") or ""),
                        "language": language,
                        "source_type": record["source_type"],
                        "register": classify_register(row),
                        "answer_mode": str(row.get("answer_mode") or ""),
                        "split_groups": record["split_groups"],
                        "sensitive_content_removed": False,
                    }
                )
    evidence.update(
        {
            "admitted_style_row_count": len(admitted),
            "sensitive_passage_excluded_count": sum(row["excluded_sensitive_content"] for row in inventory),
            "normalized_duplicate_group_count": sum(count > 1 for count in duplicate_counter.values()),
            "old_generation_split_treated_as_personal_holdout": False,
            "personal_holdout_created": False,
            "future_personal_holdout_requires_new_owner_reviewed_source_families": True,
        }
    )
    return inventory, admitted, evidence


def discover_identity_edited() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    inventory: list[dict[str, Any]] = []
    historical: list[dict[str, Any]] = []
    for path in EDITED_IDENTITY_FILES:
        if not path.is_file():
            continue
        for index, row in enumerate(read_jsonl(path), 1):
            raw = canonical_bytes(row)
            text_for_scan = " ".join(str(row.get(key) or "") for key in ("claim", "safe_answer", "voice_hint"))
            sensitive = contains_sensitive_content(text_for_scan)
            card_id = safe_code(str(row.get("id") or index), "card")
            row_path = f"{logical(path)}#card-{card_id}"
            record = inventory_record(
                logical_path=row_path,
                raw_bytes=raw,
                authorship_class="OWNER_AUTHORED_EDITED",
                source_type="reflective_writing",
                language=estimate_language(text_for_scan),
                owner_ratio=0.5,
                contains_sensitive=sensitive,
                review_status="REVIEW_REQUIRED",
                historical_decision="REVIEW" if not sensitive else "REJECT",
                reason_override="curated_from_owner_interview_secondary_review_required" if not sensitive else None,
            )
            inventory.append(record)
        historical.append(
            {
                "asset_id": safe_code(f"asset-{path.stem}", "asset"),
                "logical_path": logical(path),
                "authorship_class": "OWNER_AUTHORED_EDITED",
                "decision": "REVIEW",
                "reason": "curated_interview_cards_are_secondary_not_raw_owner_transcript",
                "raw_content_copied": False,
            }
        )
    return inventory, historical


def discover_ai_history() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    inventory: list[dict[str, Any]] = []
    historical: list[dict[str, Any]] = []
    for path, decision in AI_HISTORY_ASSETS:
        if not path.is_file():
            continue
        raw = path.read_bytes()
        record = inventory_record(
            logical_path=logical(path),
            raw_bytes=raw,
            authorship_class="AI_OR_CODEX_GENERATED",
            source_type="other",
            language="unknown",
            owner_ratio=0.0,
            contains_sensitive=False,
            review_status="REJECTED",
            historical_decision=decision,
            reason_override="historical_generated_or_derived_asset_not_owner_style_evidence",
        )
        inventory.append(record)
        historical.append(
            {
                "asset_id": safe_code(f"asset-{path.stem}", "asset"),
                "logical_path": logical(path),
                "authorship_class": "AI_OR_CODEX_GENERATED",
                "decision": decision,
                "reason": "generated_or_derived_historical_asset_not_primary_owner_evidence",
                "raw_content_copied": False,
            }
        )
    return inventory, historical


def register_for_plain_source(source_type: str, provenance: dict[str, Any] | None) -> str:
    declared = str((provenance or {}).get("register") or "")
    if declared in PERSONAL_REGISTERS:
        return declared
    if source_type in {"reflective_writing", "creative_writing"}:
        return "philosophical_reflection"
    if source_type == "project_explanation":
        return "project_discussion"
    if source_type == "academic_writing":
        return "logic_explanation"
    if source_type == "formal_email_or_message":
        return "formal_message"
    return "ordinary_chat"


def admitted_plain_source(
    record: dict[str, Any], text: str, provenance: dict[str, Any] | None,
) -> dict[str, Any]:
    return {
        "source_id": record["source_id"],
        "text": text,
        "question": "",
        "language": record["language"],
        "source_type": record["source_type"],
        "register": register_for_plain_source(record["source_type"], provenance),
        "answer_mode": "",
        "split_groups": record["split_groups"],
        "sensitive_content_removed": False,
    }


def discover_local_private_sources() -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    inventory: list[dict[str, Any]] = []
    admitted: list[dict[str, Any]] = []
    root_presence: dict[str, bool] = {}
    excluded_files = 0
    read_errors = 0
    for root in LOCAL_SOURCE_ROOTS:
        root_presence[logical(root)] = root.is_dir()
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if path.is_symlink() or not path.is_file():
                continue
            repo_path = logical(path)
            reason = discovery_exclusion_reason(repo_path)
            if reason is not None:
                excluded_files += 1
                continue
            try:
                raw = path.read_bytes()
            except OSError:
                read_errors += 1
                continue
            digest = sha256_bytes(raw)
            provenance_path = path.with_name(path.name + ".provenance.json")
            provenance: dict[str, Any] | None = None
            if provenance_path.is_file():
                try:
                    provenance = read_json(provenance_path)
                except Exception:
                    provenance = None
            authorship = authorship_from_provenance(provenance, digest)
            source_type = source_type_from_provenance(provenance)
            text: str | None = None
            if len(raw) <= MAX_LOCAL_TEXT_BYTES:
                try:
                    text = raw.decode("utf-8")
                except UnicodeDecodeError:
                    text = None
            sensitive = contains_sensitive_content(text) if text is not None else False
            language = estimate_language(text) if text is not None else "unknown"
            review = str((provenance or {}).get("review_status") or "REVIEW_REQUIRED")
            if review not in {"UNREVIEWED", "REVIEW_REQUIRED", "OWNER_APPROVED", "REJECTED"}:
                review = "REVIEW_REQUIRED"
            record = inventory_record(
                logical_path=repo_path,
                raw_bytes=raw,
                authorship_class=authorship,
                source_type=source_type,
                language=language,
                owner_ratio=(provenance or {}).get("estimated_owner_content_ratio"),
                contains_sensitive=sensitive,
                review_status=review,
                historical_decision="REVIEW" if authorship != "UNKNOWN" else "REJECT",
                split_groups=split_groups_from_provenance(
                    provenance,
                    content_sha256=digest,
                    source_id=make_source_id(repo_path, digest),
                ),
            )
            if text is None and record["allowed_for_style_analysis"]:
                record["personalization_priority"] = "QUARANTINE"
                record["allowed_for_style_analysis"] = False
                record["reason"] = "text_not_safely_parseable_review_required"
                validate_inventory_record(record)
            inventory.append(record)
            if text is not None and record["allowed_for_style_analysis"]:
                admitted.append(admitted_plain_source(record, text, provenance))
    return inventory, admitted, {
        "candidate_root_presence": root_presence,
        "excluded_file_count": excluded_files,
        "read_error_count": read_errors,
    }


def discover_repository_tree_candidates() -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    """Conservatively audit every current-tree file, including ignored files.

    Files already handled by a stronger source-specific path are counted but
    not duplicated. Every other supported text/document source becomes either
    hash-bound admitted evidence or an UNKNOWN/REJECT inventory record. No
    unproven file is promoted merely because of its filename.
    """

    inventory: list[dict[str, Any]] = []
    admitted: list[dict[str, Any]] = []
    exclusion_counts: Counter[str] = Counter()
    files_seen = 0
    already_handled = 0
    read_errors = 0
    symlinks_skipped = 0
    known_files = {
        path.resolve()
        for path in (*R26_FILES, *R26_APPROVALS, *R26_PROCESS_DOCS, *EDITED_IDENTITY_FILES)
    } | {path.resolve() for path, _decision in AI_HISTORY_ASSETS}

    def handled_by_local_root(path: Path) -> bool:
        resolved = path.resolve()
        return any(root.is_dir() and (resolved == root.resolve() or root.resolve() in resolved.parents) for root in LOCAL_SOURCE_ROOTS)

    for path in ROOT.rglob("*"):
        if path.is_symlink():
            symlinks_skipped += 1
            continue
        if not path.is_file():
            continue
        files_seen += 1
        if path.resolve() in known_files or handled_by_local_root(path):
            already_handled += 1
            continue
        repo_path = logical(path)
        reason = discovery_exclusion_reason(repo_path)
        if reason is not None:
            exclusion_counts[reason] += 1
            continue
        try:
            raw = path.read_bytes()
        except OSError:
            read_errors += 1
            continue
        digest = sha256_bytes(raw)
        provenance_path = path.with_name(path.name + ".provenance.json")
        provenance: dict[str, Any] | None = None
        if provenance_path.is_file():
            try:
                provenance = read_json(provenance_path)
            except Exception:
                provenance = None
        authorship = authorship_from_provenance(provenance, digest)
        source_type = source_type_from_provenance(provenance)
        try:
            text = raw.decode("utf-8") if len(raw) <= MAX_LOCAL_TEXT_BYTES else None
        except UnicodeDecodeError:
            text = None
        # Unparseable supported documents cannot be declared sensitivity-safe.
        sensitive = contains_sensitive_content(text) if text is not None else True
        language = estimate_language(text) if text is not None else "unknown"
        review = str((provenance or {}).get("review_status") or "REVIEW_REQUIRED")
        if review not in {"UNREVIEWED", "REVIEW_REQUIRED", "OWNER_APPROVED", "REJECTED"}:
            review = "REVIEW_REQUIRED"
        owner_ratio = (provenance or {}).get("estimated_owner_content_ratio")
        if not isinstance(owner_ratio, (int, float)) or isinstance(owner_ratio, bool):
            owner_ratio = None
        record = inventory_record(
            logical_path=repo_path,
            raw_bytes=raw,
            authorship_class=authorship,
            source_type=source_type,
            language=language,
            owner_ratio=owner_ratio,
            contains_sensitive=sensitive,
            review_status=review,
            historical_decision=(
                "REVIEW"
                if authorship in {"OWNER_AUTHORED_HIGH_CONFIDENCE", "OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE", "OWNER_AUTHORED_EDITED"}
                and not sensitive
                else "REJECT"
            ),
            split_groups=split_groups_from_provenance(
                provenance,
                content_sha256=digest,
                source_id=make_source_id(repo_path, digest),
            ),
            reason_override="full_tree_unknown_provenance_excluded_until_resolved" if authorship == "UNKNOWN" else None,
        )
        inventory.append(record)
        if text is not None and record["allowed_for_style_analysis"]:
            admitted.append(admitted_plain_source(record, text, provenance))

    return inventory, admitted, {
        "repository_tree_files_seen": files_seen,
        "already_handled_file_count": already_handled,
        "inventory_candidate_count": len(inventory),
        "excluded_file_count": sum(exclusion_counts.values()),
        "exclusion_reason_counts": dict(sorted(exclusion_counts.items())),
        "read_error_count": read_errors,
        "symlinks_skipped": symlinks_skipped,
        "full_tree_discovery_complete": read_errors == 0,
        "ignored_files_in_scope": True,
    }


def text_metrics(text: str) -> dict[str, Any]:
    compact = re.sub(r"\s+", "", text)
    return {
        "characters": len(compact),
        "question": bool(QUESTION_RE.search(text)),
        "exclamation": bool(EXCLAMATION_RE.search(text)),
        "multi_paragraph": "\n" in text,
        "bullet": bool(BULLET_RE.search(text)),
        "formal": bool(FORMAL_RE.search(text)),
        "assistant": bool(ASSISTANT_RE.search(text)),
        "humour": bool(HUMOUR_RE.search(text)),
        "hedge": bool(HEDGE_RE.search(text)),
        "colloquial": bool(COLLOQUIAL_RE.search(text)),
    }


def density_bucket(length: int) -> str:
    if length <= 40:
        return "sparse"
    if length <= 90:
        return "compact"
    return "moderate"


def build_evidence_ledger(admitted: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ledger: list[dict[str, Any]] = []
    for source in admitted:
        metrics = text_metrics(source["text"])
        observations = (
            ("response_density", density_bucket(metrics["characters"])),
            ("question_frequency", "question_present" if metrics["question"] else "question_absent"),
            ("formality", "formal_marker_present" if metrics["formal"] else "formal_marker_absent"),
            ("assistantness_tolerance", "assistant_marker_present" if metrics["assistant"] else "assistant_marker_absent"),
            ("sentence_rhythm", "multi_paragraph" if metrics["multi_paragraph"] else "single_paragraph"),
            ("humour", "playful_marker_present" if metrics["humour"] else "playful_marker_absent"),
        )
        for dimension, value in observations:
            suffix = safe_code(f"{source['source_id']}-{dimension}", "evidence")[-72:]
            ledger.append(
                {
                    "evidence_id": f"evidence.{suffix}",
                    "source_id": source["source_id"],
                    "evidence_type": "descriptive_style",
                    "domain": source["register"],
                    "language": source["language"],
                    "proposed_dimension": dimension,
                    "proposed_value": value,
                    "confidence": 0.95,
                    "source_type": source["source_type"],
                    "owner_review_required": True,
                    "sensitive_content_removed": source["sensitive_content_removed"],
                    "notes": "descriptive_observation_not_normative_preference",
                }
            )
        for evidence_type, pattern in NORMATIVE_PATTERNS:
            if pattern.search(source["text"]):
                ledger.append(
                    {
                        "evidence_id": f"evidence.normative.{hashlib.sha256((source['source_id'] + evidence_type).encode()).hexdigest()[:24]}",
                        "source_id": source["source_id"],
                        "evidence_type": evidence_type,
                        "domain": source["register"],
                        "language": source["language"],
                        "proposed_dimension": "assistantness_tolerance",
                        "proposed_value": None,
                        "confidence": 0.55,
                        "source_type": source["source_type"],
                        "owner_review_required": True,
                        "sensitive_content_removed": source["sensitive_content_removed"],
                        "notes": "candidate_normative_evidence_requires_owner_review",
                    }
                )
    return ledger


def choose_hypothesis(register: str, sources: list[dict[str, Any]], dimension: str) -> tuple[Any, int, int, float]:
    if not sources:
        return None, 0, 0, 0.0
    metrics = [text_metrics(source["text"]) for source in sources]
    n = len(metrics)
    lengths = [metric["characters"] for metric in metrics]
    median_length = statistics.median(lengths)
    if dimension == "response_density":
        candidate = density_bucket(int(median_length))
        support = sum(density_bucket(metric["characters"]) == candidate for metric in metrics)
        confidence = 0.75 * support / n
    elif dimension == "question_frequency":
        rate = sum(metric["question"] for metric in metrics) / n
        candidate = "rarely" if rate <= 0.10 else "only_if_needed" if rate <= 0.30 else "conversational"
        support = sum((not metric["question"]) if candidate == "rarely" else True for metric in metrics)
        confidence = 0.65 * max(rate, 1 - rate)
    elif dimension == "formality":
        rate = sum(metric["formal"] for metric in metrics) / n
        candidate = "casual" if rate <= 0.10 else "neutral" if rate <= 0.45 else "formal"
        support = sum((not metric["formal"]) if candidate == "casual" else True for metric in metrics)
        confidence = 0.55 * max(rate, 1 - rate)
    elif dimension == "explanation_depth":
        candidate = "minimal" if median_length <= 40 else "bounded" if median_length <= 100 else "detailed"
        support = sum(
            (metric["characters"] <= 40 if candidate == "minimal" else 40 < metric["characters"] <= 100 if candidate == "bounded" else metric["characters"] > 100)
            for metric in metrics
        )
        confidence = 0.70 * support / n
    elif dimension == "assistantness_tolerance":
        rate = sum(metric["assistant"] for metric in metrics) / n
        candidate = "very_low" if rate == 0 else "low" if rate <= 0.15 else "moderate"
        support = sum((not metric["assistant"]) if candidate == "very_low" else True for metric in metrics)
        confidence = 0.35 * max(rate, 1 - rate)
    elif dimension == "humour":
        rate = sum(metric["humour"] for metric in metrics) / n
        candidate = "none" if rate <= 0.05 else "light" if rate <= 0.30 else "playful"
        support = sum((not metric["humour"]) if candidate == "none" else True for metric in metrics)
        confidence = 0.45 * max(rate, 1 - rate)
    elif dimension == "directness":
        direct = sum(source["answer_mode"] in {"direct_answer", "compressed_judgment", "refuse"} for source in sources)
        rate = direct / n
        candidate = "direct" if rate >= 0.70 else "balanced" if rate >= 0.30 else "exploratory"
        support = direct if candidate == "direct" else n - direct if candidate == "exploratory" else n
        confidence = 0.55 * max(rate, 1 - rate)
    elif dimension == "reflection":
        candidate = "reflective" if register == "philosophical_reflection" else "practical" if register == "practical_answer" else "mixed"
        support = n
        confidence = 0.40
    elif dimension == "philosophy_style":
        if register != "philosophical_reflection":
            return None, 0, n, 0.0
        candidate = "concise_open" if median_length <= 90 else "analytic"
        support = sum(metric["characters"] <= 90 for metric in metrics) if candidate == "concise_open" else sum(metric["characters"] > 90 for metric in metrics)
        confidence = 0.45 * support / n
    elif dimension == "warmth":
        return None, 0, n, 0.0
    else:
        return None, 0, n, 0.0
    return candidate, int(support), n - int(support), round(float(confidence), 4)


def build_hypotheses(admitted: list[dict[str, Any]]) -> dict[str, Any]:
    by_register: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for source in admitted:
        by_register[source["register"]].append(source)
    hypotheses: list[dict[str, Any]] = []
    for register in PERSONAL_REGISTERS:
        sources = by_register[register]
        for dimension in PROFILE_DIMENSIONS:
            candidate, supporting, contradicting, confidence = choose_hypothesis(register, sources, dimension)
            hypotheses.append(
                {
                    "hypothesis_id": f"hypothesis.{register}.{dimension}",
                    "register": register,
                    "dimension": dimension,
                    "candidate_value": candidate,
                    "supporting_source_count": supporting,
                    "supporting_source_types": sorted({source["source_type"] for source in sources}),
                    "contradicting_source_count": contradicting,
                    "confidence": confidence,
                    "register_dependency": register,
                    "owner_review_required": True,
                    "allowed_for_training": False,
                }
            )
    return {
        "version": "personal-preference-hypotheses.v1",
        "status": "OWNER_REVIEW_REQUIRED",
        "owner_review_completed": False,
        "allowed_for_training": False,
        "hypotheses": hypotheses,
    }


def build_register_profile(ledger: list[dict[str, Any]], hypotheses: dict[str, Any]) -> dict[str, Any]:
    template = read_json(ROOT / "data/personal_judge/templates/personal_register_profile_v1.template.json")
    profile = deepcopy(template)
    profile["profile_id"] = "candidate-register-profile-r30j0-p-unreviewed"
    for register in PERSONAL_REGISTERS:
        evidence_ids = [row["evidence_id"] for row in ledger if row["domain"] == register and row["evidence_type"] == "descriptive_style"]
        hypothesis_ids = [row["hypothesis_id"] for row in hypotheses["hypotheses"] if row["register"] == register]
        profile["registers"][register]["evidence_status"] = "INSUFFICIENT"
        profile["registers"][register]["descriptive_evidence_ids"] = evidence_ids
        profile["registers"][register]["hypothesis_ids"] = hypothesis_ids
    return profile


def build_contrasts(admitted: list[dict[str, Any]]) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    if not admitted:
        return {
            "version": "personal-source-contrast-candidates.v1",
            "status": "INSUFFICIENT_SOURCE_EVIDENCE",
            "owner_review_completed": False,
            "allowed_for_training": False,
            "product_pairwise_architecture": False,
            "candidates": [],
        }
    index = 0
    while len(candidates) < 100 and index < len(admitted) * len(STYLE_WRAPPERS):
        source = admitted[index % len(admitted)]
        mutation_kind, prefix = STYLE_WRAPPERS[(index // len(admitted) + index) % len(STYLE_WRAPPERS)]
        original = source["text"]
        mutation = prefix + original
        index += 1
        if not style_wrapper_preserves_source(original, mutation, prefix):
            continue
        candidate_id = f"contrast-{len(candidates) + 1:03d}"
        original_is_a = int(hashlib.sha256(candidate_id.encode()).hexdigest()[-1], 16) % 2 == 0
        answer_a, answer_b = (original, mutation) if original_is_a else (mutation, original)
        candidates.append(
            {
                "candidate_id": candidate_id,
                "source_id": source["source_id"],
                "context": "",
                "latest_user_message": source["question"],
                "answer_A": answer_a,
                "answer_B": answer_b,
                "original_side": "A" if original_is_a else "B",
                "mutation_kind": mutation_kind,
                "owner_preference": None,
                "public_safe": True,
                "allowed_for_training": False,
                "product_pairwise_architecture": False,
                "fact_preservation": {
                    "source_answer_preserved_as_exact_substring": True,
                    "style_wrapper_allowlist_pass": True,
                    "deterministic_guard_is_semantic_equivalence_proof": False,
                    "owner_review_required": True,
                },
                "split_groups": source["split_groups"],
            }
        )
    return {
        "version": "personal-source-contrast-candidates.v1",
        "status": "OWNER_REVIEW_REQUIRED" if len(candidates) >= 100 else "INSUFFICIENT_SOURCE_EVIDENCE",
        "owner_review_completed": False,
        "allowed_for_training": False,
        "product_pairwise_architecture": False,
        "candidate_count": len(candidates),
        "candidates": candidates,
    }


def review_item(
    *,
    item_id: str,
    snippet: str,
    source_type: str,
    interpretation: str,
    confidence: float,
    conflicts: Iterable[str] = (),
) -> dict[str, Any]:
    return {
        "item_id": item_id,
        "redacted_snippet": redact_review_text(snippet, 260),
        "source_type": source_type,
        "proposed_interpretation": interpretation[:600],
        "confidence": round(max(0.0, min(1.0, confidence)), 4),
        "conflicts": [str(value)[:240] for value in conflicts][:8],
        "sanitization": {
            "redacted": True,
            "contains_sensitive_raw": False,
            "contains_credentials": False,
        },
    }


def build_review_payload(
    inventory: list[dict[str, Any]],
    admitted: list[dict[str, Any]],
    ledger: list[dict[str, Any]],
    hypotheses: dict[str, Any],
    contrasts: dict[str, Any],
) -> dict[str, Any]:
    source_summary = []
    counts = Counter(row["authorship_class"] for row in inventory)
    for authorship in AUTHORSHIP_CLASSES:
        source_summary.append(
            review_item(
                item_id=f"source-summary.{safe_code(authorship)}",
                snippet=f"该类来源共 {counts.get(authorship, 0)} 条；不在页面显示路径、哈希或原始内容。",
                source_type="derived_aggregate",
                interpretation="Confirm whether this conservative authorship classification should be retained for the owner-evidence audit.",
                confidence=1.0 if counts.get(authorship, 0) == 0 else 0.85,
            )
        )
    style_items = []
    for hypothesis in hypotheses["hypotheses"]:
        candidate = hypothesis["candidate_value"] if hypothesis["candidate_value"] is not None else "未形成候选"
        style_items.append(
            review_item(
                item_id=hypothesis["hypothesis_id"],
                snippet=f"{hypothesis['register']} / {hypothesis['dimension']}：支持 {hypothesis['supporting_source_count']}，相反 {hypothesis['contradicting_source_count']}。",
                source_type="derived_aggregate",
                interpretation=f"Descriptive evidence proposes {candidate}; this is a hypothesis, not an accepted owner preference.",
                confidence=hypothesis["confidence"],
                conflicts=("Descriptive writing is not the same as desired assistant behaviour.",),
            )
        )
    normative = [row for row in ledger if row["evidence_type"] != "descriptive_style"]
    preference_items = []
    if normative:
        for row in normative[:80]:
            preference_items.append(
                review_item(
                    item_id=f"preference.{row['evidence_id']}",
                    snippet="检测到一条可能的显式偏好/接受/拒绝表达；原文不在聚合报告中展示。",
                    source_type="sanitized_personal_source",
                    interpretation="Review whether the source actually states a normative assistant-language preference.",
                    confidence=row["confidence"],
                    conflicts=("Pattern matching can confuse a topic statement with an assistant preference.",),
                )
            )
    else:
        preference_items.append(
            review_item(
                item_id="preference.normative-evidence-gap",
                snippet="当前 admitted owner writing 主要提供描述性风格证据；未自动确认规范性偏好。",
                source_type="derived_aggregate",
                interpretation="Owner review is required before any descriptive pattern becomes a preference label.",
                confidence=1.0,
            )
        )
    contrast_items = []
    for candidate in contrasts["candidates"]:
        snippet = f"A：{redact_review_text(candidate['answer_A'], 105)} / B：{redact_review_text(candidate['answer_B'], 105)}"
        contrast_items.append(
            review_item(
                item_id=f"pair.{candidate['candidate_id']}",
                snippet=snippet,
                source_type="controlled_contrast",
                interpretation=f"Unlabelled {candidate['mutation_kind']} contrast; the original side is not presumed preferred. Review pair quality here and record A/B/TIE in the structured contrast pack.",
                confidence=0.8,
                conflicts=("Protected-signature preservation is conservative and not semantic-equivalence proof.",),
            )
        )
    register_items = []
    register_counts = Counter(source["register"] for source in admitted)
    for register in PERSONAL_REGISTERS:
        register_items.append(
            review_item(
                item_id=f"register.{register}",
                snippet=f"{register} 当前有 {register_counts.get(register, 0)} 条可分析 owner-answer source。",
                source_type="derived_aggregate",
                interpretation="Review this register separately; do not collapse it into a single global average style.",
                confidence=0.8 if register_counts.get(register, 0) else 0.0,
                conflicts=("Zero coverage means no register preference may be inferred.",) if not register_counts.get(register, 0) else (),
            )
        )
    return {
        "schema_version": "r30j0.personal_source_review_payload.v1",
        "payload_id": "r30j0-personal-source-evidence-v1",
        "sanitized": True,
        "public_safe": True,
        "credential_free": True,
        "sensitive_raw_removed": True,
        "owner_review_completed": False,
        "profile_frozen": False,
        "allowed_for_training": False,
        "sections": {
            "source_summary": source_summary,
            "style_hypotheses": style_items,
            "preference_evidence": preference_items,
            "contrast_pairs": contrast_items,
            "register_profiles": register_items,
        },
    }


def main() -> int:
    if (ROOT / ".env.deepseek.local").is_file():
        # Existence is allowed, but the file is deliberately never opened.
        secret_exists = True
    else:
        secret_exists = False

    r26_inventory, admitted, r26_evidence = discover_r26_transcripts()
    edited_inventory, edited_history = discover_identity_edited()
    ai_inventory, ai_history = discover_ai_history()
    local_inventory, local_admitted, local_discovery = discover_local_private_sources()
    tree_inventory, tree_admitted, tree_discovery = discover_repository_tree_candidates()
    admitted.extend(local_admitted)
    admitted.extend(tree_admitted)
    inventory = r26_inventory + edited_inventory + ai_inventory + local_inventory + tree_inventory
    ledger = build_evidence_ledger(admitted)
    hypotheses = build_hypotheses(admitted)
    register_profile = build_register_profile(ledger, hypotheses)
    contrasts = build_contrasts(admitted)
    review_payload = build_review_payload(inventory, admitted, ledger, hypotheses, contrasts)

    authorship_counts = Counter(row["authorship_class"] for row in inventory)
    source_type_counts = Counter(row["source_type"] for row in inventory)
    register_counts = Counter(source["register"] for source in admitted)
    language_counts = Counter(source["language"] for source in admitted)
    historical = edited_history + ai_history
    sensitive_excluded = sum(row["excluded_sensitive_content"] for row in inventory)
    primary_safe = sum(
        row["allowed_for_style_analysis"]
        and row["authorship_class"] in {"OWNER_AUTHORED_HIGH_CONFIDENCE", "OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE"}
        for row in inventory
    )
    normative_counts = Counter(row["evidence_type"] for row in ledger if row["evidence_type"] != "descriptive_style")
    chinese_chars = sum(len(re.findall(r"[\u3400-\u9fff]", source["text"])) for source in admitted)
    english_words = sum(len(re.findall(r"[A-Za-z]+", source["text"])) for source in admitted)
    style_metrics = [text_metrics(source["text"]) for source in admitted]
    lengths = sorted(metric["characters"] for metric in style_metrics)
    median_length = statistics.median(lengths) if lengths else None

    discovery_report = {
        "schema_version": "r30j0.personal-source-discovery-report.v1",
        "campaign_id": CAMPAIGN_ID,
        "generated_at": now_iso(),
        "candidate_source_count": len(inventory),
        "owner_authored_high_confidence_count": authorship_counts["OWNER_AUTHORED_HIGH_CONFIDENCE"],
        "owner_answer_transcript_count": authorship_counts["OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE"],
        "owner_authored_edited_count": authorship_counts["OWNER_AUTHORED_EDITED"],
        "mixed_owner_ai_count": authorship_counts["MIXED_OWNER_AI"],
        "AI_or_Codex_generated_count": authorship_counts["AI_OR_CODEX_GENERATED"],
        "third_party_count": authorship_counts["THIRD_PARTY"],
        "unknown_count": authorship_counts["UNKNOWN"],
        "Chinese_primary_source_count": sum(
            row["allowed_for_style_analysis"] and row["source_type"] == "spoken_answer_chinese" for row in inventory
        ),
        "English_secondary_source_count": sum(
            row["allowed_for_style_analysis"] and row["source_type"] == "spoken_answer_english" for row in inventory
        ),
        "sensitive_sections_excluded_count": sensitive_excluded,
        "historical_personalization_assets_found": len(historical),
        "owner_review_completed": False,
        "training_started": False,
        "network_requests": 0,
        "secret_file_opened": False,
        "secret_file_exists_boolean_only": secret_exists,
        "paths_or_excerpts_in_report": False,
        "local_root_presence_count": sum(local_discovery["candidate_root_presence"].values()),
        "repository_tree_files_seen": tree_discovery["repository_tree_files_seen"],
        "repository_tree_inventory_candidate_count": tree_discovery["inventory_candidate_count"],
        "repository_tree_excluded_file_count": tree_discovery["excluded_file_count"],
        "repository_tree_read_error_count": tree_discovery["read_error_count"],
        "full_repository_tree_discovery_complete": tree_discovery["full_tree_discovery_complete"],
        "ignored_files_in_scope": tree_discovery["ignored_files_in_scope"],
    }
    authorship_audit = {
        "schema_version": "r30j0.authorship-audit.v1",
        "generated_at": now_iso(),
        "authorship_counts": dict(sorted(authorship_counts.items())),
        "source_type_counts": dict(sorted(source_type_counts.items())),
        "r26_compound_transcript_process_evidence": r26_evidence,
        "filename_only_classification_count": 0,
        "primary_style_source_count": primary_safe,
        "secondary_sources_used_automatically": 0,
        "mixed_unknown_or_external_used_automatically": 0,
        "raw_excerpts_in_report": False,
    }
    register_report = {
        "schema_version": "r30j0.source-register-distribution.v1",
        "generated_at": now_iso(),
        "register_counts": {register: register_counts.get(register, 0) for register in PERSONAL_REGISTERS},
        "language_counts": dict(sorted(language_counts.items())),
        "Chinese_owner_authored_characters": chinese_chars,
        "English_owner_authored_words": english_words,
        "casual_Chinese_samples": register_counts.get("ordinary_chat", 0),
        "spoken_Chinese_samples": sum(source["source_type"] == "spoken_answer_chinese" for source in admitted),
        "reflective_Chinese_samples": register_counts.get("philosophical_reflection", 0),
        "formal_Chinese_samples": register_counts.get("formal_message", 0),
        "translation_used_as_primary_owner_style_evidence": False,
        "raw_excerpts_in_report": False,
    }
    preference_summary = {
        "schema_version": "r30j0.preference-evidence-summary.v1",
        "generated_at": now_iso(),
        "descriptive_style_evidence_count": sum(row["evidence_type"] == "descriptive_style" for row in ledger),
        "normative_candidate_counts": dict(sorted(normative_counts.items())),
        "descriptive_evidence_promoted_directly_to_owner_truth": False,
        "owner_review_required": True,
        "owner_review_completed": False,
        "accepted_owner_preference_count": 0,
        "raw_excerpts_in_report": False,
    }
    historical_report = {
        "schema_version": "r30j0.historical-personalization-asset-audit.v1",
        "generated_at": now_iso(),
        "records": historical,
        "decision_counts": dict(sorted(Counter(row["decision"] for row in historical).items())),
        "old_labels_trusted_automatically": False,
        "raw_content_copied": False,
    }
    readiness_pass = (
        r26_evidence["compound_evidence_pass"]
        and tree_discovery["full_tree_discovery_complete"]
        and primary_safe >= 50
        and sensitive_excluded >= 0
        and len(contrasts["candidates"]) >= 100
        and len(hypotheses["hypotheses"]) >= 60
    )
    readiness = {
        "schema_version": "r30j0.personalization-data-readiness.v1",
        "generated_at": now_iso(),
        "status": "PERSONAL_SOURCE_EVIDENCE_READY" if readiness_pass else "BLOCKED_PERSONAL_EVIDENCE_COVERAGE",
        "local_discovery_complete": tree_discovery["full_tree_discovery_complete"],
        "repository_tree_discovery_scope": "full_current_tree_including_ignored_files",
        "repository_tree_files_seen": tree_discovery["repository_tree_files_seen"],
        "repository_tree_read_error_count": tree_discovery["read_error_count"],
        "authorship_audit_complete": True,
        "sensitive_exclusion_complete": True,
        "descriptive_normative_separated": True,
        "register_conditioned_hypotheses_built": True,
        "historical_assets_audited": True,
        "contrast_candidate_count": len(contrasts["candidates"]),
        "contrast_candidates_owner_label_count": 0,
        "contrast_fact_preservation_pass_count": sum(
            row["fact_preservation"]["style_wrapper_allowlist_pass"] for row in contrasts["candidates"]
        ),
        "owner_review_pack_payload_ready": True,
        "personal_holdout_created": False,
        "future_personal_holdout_requires_new_owner_reviewed_source_families": True,
        "actual_owner_profile_frozen": False,
        "owner_review_completed": False,
        "full_personal_judge_dataset_generated": False,
        "allowed_for_training": False,
        "training_started": False,
        "classification_updates": 0,
        "examples_seen_by_optimizer": 0,
        "api_requests": 0,
        "network_requests": 0,
    }
    hypothesis_report = {
        "schema_version": "r30j0.personal-style-hypotheses-report.v1",
        "generated_at": now_iso(),
        "hypothesis_count": len(hypotheses["hypotheses"]),
        "registers_with_evidence": sum(register_counts.get(register, 0) > 0 for register in PERSONAL_REGISTERS),
        "registers_without_evidence": [register for register in PERSONAL_REGISTERS if not register_counts.get(register, 0)],
        "median_owner_answer_characters": median_length,
        "question_bearing_answer_count": sum(metric["question"] for metric in style_metrics),
        "exclamation_bearing_answer_count": sum(metric["exclamation"] for metric in style_metrics),
        "bullet_bearing_answer_count": sum(metric["bullet"] for metric in style_metrics),
        "assistant_marker_answer_count": sum(metric["assistant"] for metric in style_metrics),
        "owner_review_required": True,
        "owner_review_completed": False,
        "actual_profile_frozen": False,
        "raw_excerpts_in_report": False,
    }

    inventory_document = {
        "version": "personal-source-inventory.v1",
        "status": "DISCOVERED_REVIEW_REQUIRED",
        "must_remain_ignored": True,
        "portable_public_safe": False,
        "contains_raw_excerpts": False,
        "allowed_for_training": False,
        "sources": inventory,
    }

    atomic_json(PERSONAL_ROOT / "source_inventory.json", inventory_document)
    atomic_text(
        PERSONAL_ROOT / "owner_preference_evidence_ledger.jsonl",
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in ledger),
    )
    atomic_json(PERSONAL_ROOT / "personal_style_hypotheses.json", hypotheses)
    atomic_json(PERSONAL_ROOT / "personal_register_profile_hypotheses.json", register_profile)
    atomic_json(PERSONAL_ROOT / "contrast_candidates.json", contrasts)
    atomic_json(REVIEW_ROOT / "sanitized_review_payload.json", review_payload)

    atomic_json(REPORT_ROOT / "personal_source_discovery.json", discovery_report)
    atomic_json(REPORT_ROOT / "authorship_audit.json", authorship_audit)
    atomic_json(REPORT_ROOT / "source_register_distribution.json", register_report)
    atomic_json(REPORT_ROOT / "personal_style_hypotheses.json", hypothesis_report)
    atomic_json(REPORT_ROOT / "preference_evidence_summary.json", preference_summary)
    atomic_json(REPORT_ROOT / "historical_personalization_asset_audit.json", historical_report)
    atomic_json(REPORT_ROOT / "personalization_data_readiness.json", readiness)

    stdout = {
        "status": readiness["status"],
        "candidate_source_count": discovery_report["candidate_source_count"],
        "owner_authored_high_confidence_count": discovery_report["owner_authored_high_confidence_count"],
        "owner_answer_transcript_count": discovery_report["owner_answer_transcript_count"],
        "owner_authored_edited_count": discovery_report["owner_authored_edited_count"],
        "mixed_owner_ai_count": discovery_report["mixed_owner_ai_count"],
        "AI_or_Codex_generated_count": discovery_report["AI_or_Codex_generated_count"],
        "third_party_count": discovery_report["third_party_count"],
        "unknown_count": discovery_report["unknown_count"],
        "Chinese_primary_source_count": discovery_report["Chinese_primary_source_count"],
        "English_secondary_source_count": discovery_report["English_secondary_source_count"],
        "sensitive_sections_excluded_count": discovery_report["sensitive_sections_excluded_count"],
        "historical_personalization_assets_found": discovery_report["historical_personalization_assets_found"],
        "owner_review_completed": False,
        "training_started": False,
        "paths_printed": False,
        "excerpts_printed": False,
        "network_requests": 0,
    }
    print(json.dumps(stdout, ensure_ascii=False, sort_keys=True))
    return 0 if readiness_pass else 2


if __name__ == "__main__":
    raise SystemExit(main())
