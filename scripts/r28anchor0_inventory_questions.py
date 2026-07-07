#!/usr/bin/env python3
"""R28ANCHOR0 question anchor inventory.

Audit only: no training, no model changes, no root DOCX/PDF parsing, no
data/public_ingestion parsing, no external LLM/Doubao calls.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "training_registry" / "r28anchor0_question_anchor_summary.json"

OLD_PACK_ID = "another_brain_question_pack_001"
REPLACEMENT_PACK_ID = "another_brain_question_pack_002_abstract_values"
USER_ANSWERED_FILES = [
    ROOT / "training/llm_corpus/r26e_user_answered_train.jsonl",
    ROOT / "training/llm_corpus/r26e_user_answered_dev.jsonl",
    ROOT / "training/llm_corpus/r26e_user_answered_heldout.jsonl",
    ROOT / "training/llm_corpus/r26g_user_answered_train.jsonl",
    ROOT / "training/llm_corpus/r26g_user_answered_dev.jsonl",
    ROOT / "training/llm_corpus/r26g_user_answered_heldout.jsonl",
]
POLICY_FILES = [
    ROOT / "training/current/question_pack_100_manifest.r26c.json",
    ROOT / "training/current/question_pack_001_manifest.r26d.json",
    ROOT / "training/current/question_pack_policy.r26c.json",
    ROOT / "training/current/question_pack_policy.r26d.json",
    ROOT / "training/current/r26e_first50_promotion_policy.json",
    ROOT / "training/current/corpus_manifest.json",
    ROOT / "training/llm_corpus/registry.json",
    ROOT / "docs/R26G_USER_ANSWERED_CORPUS_SUMMARY.md",
    ROOT / "docs/R26H_USER_ANSWER_CORPUS_READINESS.md",
]
RUNTIME_SCAN_PATHS = [
    ROOT / "web",
    ROOT / "src/browser_runtime",
]
IDENTITY_SCAN_CANDIDATES = [
    ROOT / "src/browser_runtime/router/identity_route.ts",
    ROOT / "src/browser_runtime/router/route_classifier.ts",
    ROOT / "web/another_brain_chat/browser_runtime.js",
]

FORBIDDEN_TEXT_MARKERS = [
    "chain-of-thought",
    "chain of thought",
    "hidden prompt",
    "developer message",
    "system prompt",
    "<hidden",
    "api_key",
    "secret",
]


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        row = json.loads(line)
        row["__file"] = path.name
        row["__line"] = line_no
        rows.append(row)
    return rows


def normalize_text(text: Any) -> str:
    return re.sub(r"[\s\-＿_—–~～`\"'“”‘’.,，。!?！？:：;；、()[\]{}<>《》「」『』]+", "", str(text or "").lower()).strip()


def text_hash(text: Any) -> str:
    normalized = normalize_text(text)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16] if normalized else ""


def row_texts(row: dict[str, Any]) -> list[str]:
    texts: list[str] = []
    for key in ["question", "target_answer", "user_answer_clean", "user_answer_raw", "answer_target_note"]:
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            texts.append(value)
    for message in row.get("messages") or []:
        if isinstance(message, dict) and isinstance(message.get("content"), str):
            texts.append(message["content"])
    return texts


def extract_eval_texts_from_obj(obj: Any) -> list[str]:
    texts: list[str] = []
    if isinstance(obj, dict):
        for key in ["prompt", "user_prompt", "question", "input", "text", "user_goal", "initial_context"]:
            value = obj.get(key)
            if isinstance(value, str) and value.strip():
                texts.append(value)
        for turn in obj.get("turns") or []:
            if isinstance(turn, dict):
                for key in ["user", "prompt", "text", "input"]:
                    value = turn.get(key)
                    if isinstance(value, str) and value.strip():
                        texts.append(value)
    return texts


def collect_eval_prompt_fingerprints() -> tuple[dict[str, str], dict[str, str]]:
    hashes: dict[str, str] = {}
    normalized_by_hash: dict[str, str] = {}
    eval_files = sorted((ROOT / "evals").rglob("*.jsonl")) if (ROOT / "evals").exists() else []
    extra_files = [ROOT / "training/long_horizon/heldout_tasks.jsonl"]
    for path in [*eval_files, *[item for item in extra_files if item.exists()]]:
        if "data/public_ingestion" in path.as_posix():
            continue
        for row in read_jsonl(path):
            for text in extract_eval_texts_from_obj(row):
                normalized = normalize_text(text)
                if len(normalized) >= 16:
                    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
                    hashes[digest] = rel(path)
                    normalized_by_hash[digest] = normalized
    return hashes, normalized_by_hash


def safe_row_metadata(row: dict[str, Any], classification: str) -> dict[str, Any]:
    return {
        "sample_id": row.get("sample_id"),
        "classification": classification,
        "pack_id": row.get("pack_id"),
        "source_row_id": row.get("source_row_id"),
        "display_id": row.get("display_id"),
        "replacement_for_pack_id": row.get("replacement_for_pack_id"),
        "replacement_for_display_id": row.get("replacement_for_display_id"),
        "split": row.get("split"),
        "answer_mode": row.get("answer_mode"),
        "question_intent": row.get("question_intent"),
        "review_status": row.get("review_status"),
        "training_allowed": row.get("training_allowed") is True,
        "contains_private_data": row.get("contains_private_data") is True,
        "source_row_range_policy": row.get("source_row_range_policy"),
        "provenance_source_type": (row.get("provenance") or {}).get("source_type"),
        "promotion_phase": (row.get("provenance") or {}).get("promotion_phase"),
        "content_hash": text_hash(" ".join(row_texts(row))),
    }


def is_router_surface_candidate(row: dict[str, Any]) -> bool:
    joined = " ".join(
        str(value or "")
        for value in [
            row.get("sample_id"),
            row.get("answer_mode"),
            row.get("question_intent"),
            row.get("scene"),
            row.get("module"),
            " ".join(row.get("tags") or []),
        ]
    ).lower()
    markers = [
        "identity",
        "boundary",
        "refuse",
        "partial_answer",
        "pressure_resistance",
        "unsupported",
        "private_boundary",
        "代理",
        "边界",
        "不答",
    ]
    return any(marker in joined for marker in markers)


def classify_row(row: dict[str, Any]) -> str:
    if row.get("pack_id") == OLD_PACK_ID and int(row.get("source_row_id") or 0) >= 51:
        return "exclude_old_pack"
    if row.get("split") in {"dev", "heldout"}:
        return "eval_holdout"
    if row.get("training_allowed") is True and row.get("split") == "train":
        return "train_anchor"
    if is_router_surface_candidate(row):
        return "router_surface"
    return "needs_review"


def count_by(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    return dict(sorted(Counter(str(row.get(key, "")) for row in rows).items()))


def collect_runtime_texts() -> dict[str, str]:
    files: list[Path] = []
    for root in RUNTIME_SCAN_PATHS:
        if root.is_file():
            files.append(root)
        elif root.exists():
            files.extend(path for path in root.rglob("*") if path.suffix in {".js", ".mjs", ".ts", ".html"})
    runtime: dict[str, str] = {}
    for path in sorted(set(files)):
        if "node_modules" in path.parts or "artifacts" in path.parts:
            continue
        runtime[rel(path)] = path.read_text(encoding="utf-8", errors="ignore")
    return runtime


def audit() -> dict[str, Any]:
    rows = [row for path in USER_ANSWERED_FILES if path.exists() for row in read_jsonl(path)]
    eval_hashes, eval_normalized = collect_eval_prompt_fingerprints()
    training_hashes: dict[str, dict[str, str]] = {}
    failures: list[dict[str, Any]] = []
    classifications: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for row in rows:
        classification = classify_row(row)
        metadata = safe_row_metadata(row, classification)
        classifications[classification].append(metadata)

        if row.get("pack_id") == OLD_PACK_ID and int(row.get("source_row_id") or 0) >= 51:
            failures.append({"code": "old_question_pack_001_rows_51_100_in_user_answered_corpus", "sample_id": row.get("sample_id")})
        if row.get("pack_id") == REPLACEMENT_PACK_ID:
            if not (1 <= int(row.get("source_row_id") or 0) <= 50):
                failures.append({"code": "replacement_source_row_not_new_pack_1_50", "sample_id": row.get("sample_id")})
            if not (51 <= int(row.get("display_id") or 0) <= 100):
                failures.append({"code": "replacement_display_id_not_51_100", "sample_id": row.get("sample_id")})
            if row.get("replacement_for_pack_id") != OLD_PACK_ID:
                failures.append({"code": "replacement_for_pack_mismatch", "sample_id": row.get("sample_id")})
        if row.get("contains_private_data") is not False or (row.get("provenance") or {}).get("contains_private_data") is not False:
            failures.append({"code": "private_data_flag_not_false", "sample_id": row.get("sample_id")})
        if (row.get("provenance") or {}).get("external_llm_used") is not False:
            failures.append({"code": "external_llm_used_not_false", "sample_id": row.get("sample_id")})

        lowered_blob = "\n".join(row_texts(row)).lower()
        for marker in FORBIDDEN_TEXT_MARKERS:
            if marker in lowered_blob:
                failures.append({"code": "forbidden_marker_in_user_answered_row", "marker": marker, "sample_id": row.get("sample_id")})

        for text in row_texts(row):
            normalized = normalize_text(text)
            if len(normalized) >= 16:
                digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
                training_hashes[digest] = {"sample_id": str(row.get("sample_id")), "file": str(row.get("__file"))}

    eval_overlaps = [
        {"sample_id": training_hashes[digest]["sample_id"], "training_file": training_hashes[digest]["file"], "eval_file": eval_file}
        for digest, eval_file in eval_hashes.items()
        if digest in training_hashes
    ]
    if eval_overlaps:
        failures.append({"code": "eval_prompt_exact_match_in_user_answered_training", "count": len(eval_overlaps)})

    runtime_texts = collect_runtime_texts()
    runtime_target_answer_copies: list[dict[str, str]] = []
    for row in rows:
        answer = str(row.get("target_answer") or "").strip()
        if len(answer) < 32:
            continue
        for file, text in runtime_texts.items():
            if answer and answer in text:
                runtime_target_answer_copies.append({"sample_id": str(row.get("sample_id")), "file": file})
    if runtime_target_answer_copies:
        failures.append({"code": "target_answer_copied_to_runtime_answer_bank", "count": len(runtime_target_answer_copies)})

    identity_files = [path for path in IDENTITY_SCAN_CANDIDATES if path.exists()]
    identity_text = "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in identity_files)
    identity_eval_overlap = False
    normalized_identity = normalize_text(identity_text)
    for normalized_prompt in eval_normalized.values():
        if normalized_prompt and normalized_prompt in normalized_identity:
            identity_eval_overlap = True
            break

    old_first50_promoted = sorted(
        {
            int(row.get("source_row_id") or 0)
            for row in rows
            if row.get("pack_id") == OLD_PACK_ID and 1 <= int(row.get("source_row_id") or 0) <= 50
        }
    )
    replacement_promoted = sorted(
        {
            int(row.get("display_id") or 0)
            for row in rows
            if row.get("pack_id") == REPLACEMENT_PACK_ID and 51 <= int(row.get("display_id") or 0) <= 100
        }
    )
    old_first50_needs_review = [row_id for row_id in range(1, 51) if row_id not in old_first50_promoted]

    docs_summary_text = (ROOT / "docs/R26G_USER_ANSWERED_CORPUS_SUMMARY.md").read_text(encoding="utf-8")
    docs_combined_match = re.search(r"combined user_answered rows after R26G:\s*(\d+)", docs_summary_text)
    docs_combined_count = int(docs_combined_match.group(1)) if docs_combined_match else None

    combined_counts = {
        "total": len(rows),
        "by_split": count_by(rows, "split"),
        "by_pack": count_by(rows, "pack_id"),
        "train_anchor_count": len(classifications["train_anchor"]),
        "eval_holdout_count": len(classifications["eval_holdout"]),
        "router_surface_candidate_count": len([row for row in rows if is_router_surface_candidate(row)]),
        "needs_review_count": len(old_first50_needs_review),
        "exclude_old_pack_count": 50,
    }

    rules = {
        "old_question_pack_001_rows_51_100_excluded": not any(
            row.get("pack_id") == OLD_PACK_ID and int(row.get("source_row_id") or 0) >= 51 for row in rows
        ),
        "replacement_51_100_allowed_only_from_new_pack": len(replacement_promoted) == 50 and all(51 <= row_id <= 100 for row_id in replacement_promoted),
        "user_answered_anchors_count_reconciled": docs_combined_count == len(rows) == 98,
        "no_eval_prompts_in_training": len(eval_overlaps) == 0,
        "no_cot_private_hidden_or_secret_markers": not any(failure["code"] in {"forbidden_marker_in_user_answered_row", "private_data_flag_not_false"} for failure in failures),
        "identity_route_templates_do_not_import_eval_prompts": not identity_eval_overlap,
        "runtime_does_not_copy_user_answer_targets_as_answer_bank": len(runtime_target_answer_copies) == 0,
    }

    if not all(rules.values()):
        for key, value in rules.items():
            if value is not True:
                failures.append({"code": f"rule_failed:{key}"})

    report = {
        "schema_version": "r28anchor0.question_anchor_summary.v1",
        "generated_by": "scripts/r28anchor0_inventory_questions.py",
        "audit_only": True,
        "training_ran": False,
        "external_llm_api": False,
        "doubao": False,
        "root_docx_pdf_parsed": False,
        "data_public_ingestion_parsed": False,
        "raw_private_data_written": False,
        "input_sources": [rel(path) for path in POLICY_FILES if path.exists()] + [rel(path) for path in USER_ANSWERED_FILES if path.exists()],
        "question_pack_policy": {
            "old_pack_id": OLD_PACK_ID,
            "old_rows_51_100_status": "permanently_excluded",
            "old_rows_51_100_count": 50,
            "old_rows_51_100_found_in_user_answered_corpus": 0 if rules["old_question_pack_001_rows_51_100_excluded"] else "failure",
            "old_rows_1_50_status": "candidate_review_or_promoted_user_answered",
            "old_rows_1_50_promoted_count": len(old_first50_promoted),
            "old_rows_1_50_needs_review_ids": old_first50_needs_review,
            "replacement_pack_id": REPLACEMENT_PACK_ID,
            "replacement_51_100_status": "allowed_only_as_new_pack_display_51_100",
            "replacement_rows_promoted_count": len(replacement_promoted),
        },
        "combined_user_answered": combined_counts,
        "classifications": {
            "train_anchor": classifications["train_anchor"],
            "eval_holdout": classifications["eval_holdout"],
            "router_surface": [safe_row_metadata(row, "router_surface") for row in rows if is_router_surface_candidate(row)],
            "exclude_old_pack": [
                {
                    "pack_id": OLD_PACK_ID,
                    "source_row_id_start": 51,
                    "source_row_id_end": 100,
                    "classification": "exclude_old_pack",
                    "reason": "old question_pack_001 rows 51-100 remain excluded permanently",
                }
            ],
            "needs_review": [
                {
                    "pack_id": OLD_PACK_ID,
                    "source_row_id": row_id,
                    "classification": "needs_review",
                    "reason": "old first-50 row not present in promoted user_answered corpus",
                }
                for row_id in old_first50_needs_review
            ],
        },
        "eval_leakage": {
            "eval_prompt_hashes_checked": len(eval_hashes),
            "training_text_hashes_checked": len(training_hashes),
            "exact_overlap_count": len(eval_overlaps),
            "overlap_locations": eval_overlaps,
        },
        "router_surface_audit": {
            "identity_route_files_present": [rel(path) for path in identity_files],
            "identity_route_template_eval_overlap": identity_eval_overlap,
            "target_answer_runtime_copy_count": len(runtime_target_answer_copies),
            "runtime_copy_locations": runtime_target_answer_copies,
            "note": "Router-surface candidates are metadata only; they are not final-answer templates or broad answer bank entries.",
        },
        "rules_assertions": rules,
        "release_readiness": "anchor_audit_passed" if not failures else "anchor_audit_blocked",
        "ok": not failures,
        "failures": failures,
    }
    return report


def main() -> int:
    report = audit()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"ok": report["ok"], "output": rel(OUT), "failures": report["failures"]}, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
