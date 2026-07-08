#!/usr/bin/env python3
"""R28SURF5 style profile from approved tracked summaries only."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
INPUT_SUMMARY = ROOT / "data" / "training_registry" / "r28surf2_anchor_surface_summary.json"
OUTPUT_PROFILE = ROOT / "data" / "training_registry" / "r28surf5_style_profile.json"
OUTPUT_DOC = ROOT / "docs" / "r28" / "R28SURF5_ANCHOR_STYLE_AUDIT.md"

STYLE_TRAITS = [
    "concise",
    "boundary_first",
    "anti_customer_service",
    "evidence_honest",
    "allows_judgment",
    "aesthetic_value_sensitive",
]

SURFACE_CATEGORIES = [
    "greeting",
    "identity",
    "origin",
    "capability",
    "model_status",
    "evidence_insufficient",
    "evidence_conflict",
    "malicious_evidence",
    "abstract_value_fallback",
    "aesthetic_fallback",
    "relation_fallback",
    "language_meaning_fallback",
    "q4_timeout_fallback",
    "q4_unavailable_fallback",
    "smalltalk_safe",
    "refusal_boundary",
]

FORBIDDEN_PREFIXES = (
    "data/public_ingestion/",
    "evals/",
)


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def assert_allowed(path: Path) -> None:
    path = path.resolve()
    if ROOT not in path.parents and path != ROOT:
        raise RuntimeError(f"path_outside_repo:{path}")
    relative = rel(path)
    if relative.startswith(FORBIDDEN_PREFIXES):
        raise RuntimeError(f"forbidden_input_path:{relative}")
    if path.parent == ROOT and path.suffix.lower() in {".docx", ".pdf"}:
        raise RuntimeError(f"root_docx_pdf_input_rejected:{relative}")
    if "question_pack_001" in relative:
        raise RuntimeError(f"old_question_pack_001_input_rejected:{relative}")


def read_json(path: Path) -> dict[str, Any]:
    assert_allowed(path)
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    assert_allowed(path)
    return path.read_text(encoding="utf-8")


def load_approved_docs(summary: dict[str, Any]) -> dict[str, str]:
    docs: dict[str, str] = {}
    for item in summary.get("approved_summary_docs", []):
        path = ROOT / item
        if path.exists():
            docs[item] = read_text(path)
    return docs


def build_style_profile(write: bool = True) -> dict[str, Any]:
    summary = read_json(INPUT_SUMMARY)
    docs = load_approved_docs(summary)
    approved_count = int(summary.get("router_surface_candidate_count") or summary.get("train_anchor_count") or 0)
    profile = {
        "schema_version": 1,
        "phase": "R28SURF5",
        "approved_anchor_count": approved_count,
        "old_pack_51_100_excluded": summary.get("old_pack_51_100_excluded") is True,
        "eval_prompts_excluded": summary.get("eval_holdout_excluded") is True
        and summary.get("source_policy", {}).get("eval_prompts_used") is False,
        "private_raw_data_used": summary.get("private_raw_data_used") is True,
        "style_traits": STYLE_TRAITS,
        "style_basis": {
            "style_anchors": summary.get("style_anchors", []),
            "value_anchors": summary.get("value_anchors", []),
            "answer_mode_counts": summary.get("answer_mode_counts", {}),
            "evidence_policy_counts": summary.get("evidence_policy_counts", {}),
            "module_counts": summary.get("module_counts", {}),
            "approved_summary_docs": sorted(docs),
        },
        "surface_categories": SURFACE_CATEGORIES,
        "surface_policy": {
            "compositional_fragments": True,
            "broad_answer_bank": False,
            "micro_intent_only_for_entry_surfaces": True,
            "open_questions_still_attempt_q4_rag": True,
            "deterministic_variation_by_normalized_input_hash": True,
        },
        "source_policy": {
            "only_tracked_summaries_used": True,
            "root_docx_pdf_parsed": False,
            "data_public_ingestion_parsed": False,
            "eval_prompts_used": False,
            "old_question_pack_001_rows_51_100_used": False,
            "training_ran": False,
            "model_weights_changed": False,
            "q4_assets_added": False,
            "private_raw_data_saved": False,
        },
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
    profile["ok"] = (
        profile["approved_anchor_count"] > 0
        and profile["old_pack_51_100_excluded"] is True
        and profile["eval_prompts_excluded"] is True
        and profile["private_raw_data_used"] is False
    )
    if write:
        OUTPUT_PROFILE.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_PROFILE.write_text(json.dumps(profile, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        OUTPUT_DOC.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_DOC.write_text(render_audit_doc(profile), encoding="utf-8")
    return profile


def render_audit_doc(profile: dict[str, Any]) -> str:
    traits = "\n".join(f"- `{trait}`" for trait in profile["style_traits"])
    categories = "\n".join(f"- `{category}`" for category in profile["surface_categories"])
    return f"""# R28SURF5 Anchor Style Audit

R28SURF5 uses approved tracked summaries only. It does not parse root DOCX/PDF files, `data/public_ingestion`, eval prompts, old `question_pack_001` rows 51-100, private raw data, or secrets.

## Result

- approved_anchor_count: `{profile["approved_anchor_count"]}`
- old_pack_51_100_excluded: `{str(profile["old_pack_51_100_excluded"]).lower()}`
- eval_prompts_excluded: `{str(profile["eval_prompts_excluded"]).lower()}`
- private_raw_data_used: `{str(profile["private_raw_data_used"]).lower()}`
- broad_answer_bank: `false`
- training_ran: `false`

## Style Traits

{traits}

## Surface Categories

{categories}

## Boundary

The library is a compositional surface layer for micro-intents, evidence boundaries, abstract/value fallback, and q4 timeout/unavailable fallback. Ordinary open questions still attempt q4/RAG when ready.
"""


def main() -> int:
    profile = build_style_profile(write=True)
    print(json.dumps(profile, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if profile["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
