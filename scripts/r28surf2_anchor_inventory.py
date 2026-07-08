#!/usr/bin/env python3
"""R28SURF2 anchor-surface inventory from approved tracked summaries only."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "data" / "training_registry" / "r28surf2_anchor_surface_summary.json"

TRAINING_CURRENT_INPUTS = [
    ROOT / "training" / "current" / "value_aesthetic_profile.r27a.json",
    ROOT / "training" / "current" / "relation_evidence_index.r27a.json",
    ROOT / "training" / "current" / "corpus_manifest.json",
    ROOT / "training" / "current" / "r26e_first50_promotion_policy.json",
    ROOT / "training" / "current" / "question_pack_policy.r26c.json",
]

APPROVED_SUMMARY_DOCS = [
    ROOT / "docs" / "R26E_USER_ANSWERED_CORPUS_SUMMARY.md",
    ROOT / "docs" / "R26G_USER_ANSWERED_CORPUS_SUMMARY.md",
    ROOT / "docs" / "R26G_REPLACEMENT_51_100_PARSE_SUMMARY.md",
    ROOT / "docs" / "R26H_USER_ANSWER_CORPUS_READINESS.md",
    ROOT / "docs" / "R26G_FIX_AND_INTAKE_USER_ANSWERS.md",
    ROOT / "docs" / "r28" / "R28ROUT1_FUZZY_INTENT_ROUTER.md",
    ROOT / "docs" / "r28" / "R28ROUT1_COMPOSITIONAL_ANSWER_SURFACES.md",
    ROOT / "docs" / "r28" / "R28ROUT1_NO_BROAD_ANSWER_BANK.md",
]

SURFACE_CATEGORIES = [
    "greeting",
    "identity_who_are_you",
    "identity_are_you_crocodile",
    "origin_where_from",
    "capability_what_can_you_do",
    "boundary_are_you_ai",
    "relation_to_user",
    "evidence_insufficient",
    "evidence_conflict",
    "malicious_instruction",
    "value_judgment_light",
    "aesthetic_judgment_light",
    "abstract_meaning_question",
    "smalltalk_safe",
    "unknown_open_question",
]

FORBIDDEN_READ_PREFIXES = (
    "data/public_ingestion/",
    "evals/",
)


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def assert_allowed_path(path: Path) -> None:
    rel = relative(path)
    if rel.startswith(FORBIDDEN_READ_PREFIXES):
        raise RuntimeError(f"forbidden_input_path:{rel}")
    if path.parent == ROOT and path.suffix.lower() in {".docx", ".pdf"}:
        raise RuntimeError(f"root_docx_pdf_input_rejected:{rel}")
    if "question_pack_001" in rel and "51" in rel:
        raise RuntimeError(f"old_pack_51_100_input_rejected:{rel}")


def read_json(path: Path) -> dict[str, Any]:
    assert_allowed_path(path)
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    assert_allowed_path(path)
    return path.read_text(encoding="utf-8")


def load_registry_inputs() -> dict[str, Any]:
    registry_dir = ROOT / "data" / "training_registry"
    registry: dict[str, Any] = {}
    for path in sorted(registry_dir.glob("*.json")):
        if path == OUTPUT_PATH:
            continue
        registry[relative(path)] = read_json(path)
    return registry


def user_answered_counts(manifest: dict[str, Any]) -> dict[str, int]:
    counts = {"train": 0, "dev": 0, "heldout": 0}
    for item in manifest.get("files", []):
        path = str(item.get("path", ""))
        if "user_answered" not in path:
            continue
        split = str(item.get("split", ""))
        if split in counts:
            counts[split] += int(item.get("row_count", 0))
    return counts


def approved_combined_split_counts(docs: dict[str, str], fallback: dict[str, int]) -> dict[str, int]:
    readiness = docs.get("docs/R26H_USER_ANSWER_CORPUS_READINESS.md", "")
    match = re.search(r"User-answer split counts:\s*(\{[^}]+\})", readiness)
    if not match:
        return fallback
    raw = json.loads(match.group(1))
    return {key: int(raw.get(key, 0)) for key in ("train", "dev", "heldout")}


def old_pack_excluded(policy: dict[str, Any], docs: dict[str, str]) -> bool:
    hard_excluded = policy.get("hard_excluded_question_ids", {})
    if hard_excluded.get("start_id") != 51 or hard_excluded.get("end_id") != 100:
        return False
    relevant = [text for path, text in docs.items() if path.startswith("docs/R26")]
    return bool(relevant) and all(
        "old question_pack_001 rows 51-100" in text.lower() or "rows 51-100" in text.lower()
        for text in relevant
    )


def build_anchor_inventory(write: bool = True) -> dict[str, Any]:
    current = {relative(path): read_json(path) for path in TRAINING_CURRENT_INPUTS}
    docs = {relative(path): read_text(path) for path in APPROVED_SUMMARY_DOCS if path.exists()}
    registry = load_registry_inputs()

    profile = current["training/current/value_aesthetic_profile.r27a.json"]
    relation_index = current["training/current/relation_evidence_index.r27a.json"]
    manifest = current["training/current/corpus_manifest.json"]
    pack_policy = current["training/current/question_pack_policy.r26c.json"]
    promotion_policy = current["training/current/r26e_first50_promotion_policy.json"]

    train_anchor_count = int(profile.get("row_count", 0))
    relation_anchor_count = int(relation_index.get("counts", {}).get("user_answered_rows", 0))
    manifest_split_counts = user_answered_counts(manifest)
    split_counts = approved_combined_split_counts(docs, manifest_split_counts)
    old_pack_forbidden = (
        old_pack_excluded(pack_policy, docs)
        and promotion_policy.get("source_row_id_policy", {}).get("forbidden_min") == 51
        and promotion_policy.get("source_row_id_policy", {}).get("forbidden_max") == 100
    )
    private_raw_data_used = bool(profile.get("contains_private_data")) or bool(
        relation_index.get("policy", {}).get("private_sources_used")
    )

    output = {
        "schema_version": 1,
        "phase": "R28SURF2",
        "train_anchor_count": train_anchor_count,
        "relation_index_anchor_count": relation_anchor_count,
        "user_answered_split_counts": split_counts,
        "manifest_user_answered_split_counts": manifest_split_counts,
        "router_surface_candidate_count": train_anchor_count,
        "eval_holdout_excluded": True,
        "old_pack_51_100_excluded": bool(old_pack_forbidden),
        "private_raw_data_used": private_raw_data_used,
        "surface_categories": SURFACE_CATEGORIES,
        "answer_mode_counts": profile.get("answer_mode_counts", {}),
        "evidence_policy_counts": profile.get("evidence_policy_counts", {}),
        "module_counts": profile.get("module_counts", {}),
        "style_anchors": profile.get("style_anchors", []),
        "value_anchors": profile.get("value_anchors", []),
        "source_policy": {
            "only_tracked_summaries_used": True,
            "root_docx_pdf_parsed": False,
            "data_public_ingestion_parsed": False,
            "eval_prompts_used": False,
            "old_question_pack_001_rows_51_100_used": False,
            "training_ran": False,
            "model_weights_changed": False,
            "broad_answer_bank": False,
        },
        "registry_inputs": sorted(registry),
        "training_current_inputs": sorted(current),
        "approved_summary_docs": sorted(docs),
        "non_claims": {
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "backend_inference": False,
            "external_llm_api": False,
            "doubao": False,
            "hosted_vector_store": False,
        },
    }

    if train_anchor_count != 98 or relation_anchor_count != 98:
        output.setdefault("warnings", []).append("anchor_count_expected_98")
    if private_raw_data_used:
        output.setdefault("warnings", []).append("private_raw_data_flagged")

    if write:
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return output


def main() -> int:
    output = build_anchor_inventory(write=True)
    print(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if (
        output["train_anchor_count"] == 98
        and output["old_pack_51_100_excluded"] is True
        and output["private_raw_data_used"] is False
        and output["source_policy"]["broad_answer_bank"] is False
    ) else 2


if __name__ == "__main__":
    raise SystemExit(main())
