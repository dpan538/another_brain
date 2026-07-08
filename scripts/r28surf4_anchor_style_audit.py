#!/usr/bin/env python3
"""R28SURF4 style audit from approved tracked summaries and manifests only."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "data" / "training_registry" / "r28surf4_style_profile.json"
SURF2_SUMMARY_PATH = ROOT / "data" / "training_registry" / "r28surf2_anchor_surface_summary.json"

FORBIDDEN_PREFIXES = (
    "data/public_ingestion/",
    "evals/",
)

STYLE_PROFILE = {
    "voice": ["short", "bounded", "non_service", "evidence_aware", "stance_allowed"],
    "daily_surface_rules": {
        "default_length": "one_or_two_short_sentences",
        "customer_service_tone": False,
        "product_architecture_explanation": "only_when_user_asks_runtime_status",
        "evidence_boundary": "say_insufficient_when_insufficient",
        "ordinary_open_questions": "fall_through_to_q4_rag_router",
    },
    "variation": {
        "method": "deterministic_input_hash",
        "scope": "narrow_micro_intents_only",
        "broad_answer_bank": False,
    },
    "surface_examples": {
        "greeting": ["你好，我在。", "你好，直接问。", "在。你问。"],
        "identity_who_are_you": ["我是鳄鱼，另一个大脑界面。", "我是鳄鱼。这里是另一个大脑界面。"],
        "identity_are_you_crocodile": ["可以这么叫我，鳄鱼。", "是，你可以叫我鳄鱼。"],
        "origin_where_from": ["从本地静态网页、小模型和轻量检索里来。"],
        "capability_what_can_you_do": ["能做边界判断、证据整理、拒答；证据不足时停住。"],
    },
}


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def assert_allowed(path: Path) -> None:
    relative = rel(path)
    if relative.startswith(FORBIDDEN_PREFIXES):
        raise RuntimeError(f"forbidden_input_path:{relative}")
    if path.parent == ROOT and path.suffix.lower() in {".docx", ".pdf"}:
        raise RuntimeError(f"root_docx_pdf_input_rejected:{relative}")
    if "question_pack_001" in relative and any(marker in relative for marker in ("51", "52", "53", "54", "55", "100")):
        raise RuntimeError(f"old_question_pack_rows_input_rejected:{relative}")


def read_json(path: Path) -> dict[str, Any]:
    assert_allowed(path)
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    assert_allowed(path)
    return path.read_text(encoding="utf-8")


def tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def tracked_manifest_inputs() -> list[str]:
    allowed: list[str] = []
    for item in tracked_files():
        path = ROOT / item
        name = path.name.lower()
        if path.suffix.lower() != ".json":
            continue
        if not any(marker in name for marker in ("manifest", "registry", "policy")):
            continue
        if item.startswith(FORBIDDEN_PREFIXES):
            continue
        if "question_pack_001" in item:
            continue
        assert_allowed(path)
        allowed.append(item)
    return sorted(allowed)


def doc_inputs() -> list[str]:
    docs: list[str] = []
    for folder in (ROOT / "docs" / "r27", ROOT / "docs" / "r28"):
        for path in sorted(folder.glob("*.md")):
            assert_allowed(path)
            docs.append(rel(path))
    return docs


def registry_inputs() -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for path in sorted((ROOT / "data" / "training_registry").glob("*.json")):
        if path == OUTPUT_PATH:
            continue
        output[rel(path)] = read_json(path)
    return output


def build_style_profile(write: bool = True) -> dict[str, Any]:
    registry = registry_inputs()
    surf2 = registry.get(rel(SURF2_SUMMARY_PATH), {})
    docs = doc_inputs()
    manifests = tracked_manifest_inputs()
    docs_with_anchor_policy = [
        item for item in docs
        if item.endswith("R28SURF2_ANCHOR_INVENTORY.md")
        or item.endswith("R28SURF2_NO_BROAD_ANSWER_BANK.md")
        or item.endswith("R28ROUT1_NO_BROAD_ANSWER_BANK.md")
        or item.endswith("R27B3_NO_ANSWER_BANK_BOUNDARY.md")
    ]
    for item in docs_with_anchor_policy:
        read_text(ROOT / item)
    for item in manifests:
        read_json(ROOT / item)

    approved_anchor_count = int(
        surf2.get("train_anchor_count")
        or surf2.get("relation_index_anchor_count")
        or surf2.get("router_surface_candidate_count")
        or 0
    )
    router_surface_candidates = int(surf2.get("router_surface_candidate_count") or approved_anchor_count)
    source_policy = surf2.get("source_policy", {})
    output = {
        "schema_version": 1,
        "phase": "R28SURF4",
        "approved_anchor_count": approved_anchor_count,
        "router_surface_candidates": router_surface_candidates,
        "excluded_eval": bool(surf2.get("eval_holdout_excluded", True)),
        "excluded_old_pack_51_100": bool(
            surf2.get("old_pack_51_100_excluded", True)
            and source_policy.get("old_question_pack_001_rows_51_100_used") is False
        ),
        "private_raw_data_used": bool(surf2.get("private_raw_data_used", False)),
        "style_profile": STYLE_PROFILE,
        "style_anchors": surf2.get("style_anchors", ["compressed", "bounded", "non-service voice", "evidence-aware"]),
        "value_anchors": surf2.get("value_anchors", []),
        "surface_categories": surf2.get("surface_categories", []),
        "source_policy": {
            "only_tracked_summaries_and_manifests_used": True,
            "root_docx_pdf_parsed": False,
            "data_public_ingestion_parsed": False,
            "eval_prompts_used": False,
            "old_question_pack_001_rows_51_100_used": False,
            "training_ran": False,
            "model_weights_changed": False,
            "broad_answer_bank": False,
        },
        "registry_inputs": sorted(registry),
        "approved_doc_inputs": docs_with_anchor_policy,
        "docs_r27_r28_scanned_count": len(docs),
        "tracked_manifest_inputs": manifests,
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
    if approved_anchor_count <= 0:
        output.setdefault("warnings", []).append("approved_anchor_count_missing")
    if write:
        OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return output


def main() -> int:
    output = build_style_profile(write=True)
    print(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if (
        output["approved_anchor_count"] > 0
        and output["router_surface_candidates"] > 0
        and output["excluded_eval"] is True
        and output["excluded_old_pack_51_100"] is True
        and output["private_raw_data_used"] is False
        and output["source_policy"]["broad_answer_bank"] is False
    ) else 2


if __name__ == "__main__":
    raise SystemExit(main())
