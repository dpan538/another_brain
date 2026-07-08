#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "training_registry" / "r28surf3_surface_profile.json"

INPUT_PATHS = [
    ROOT / "docs" / "R26E_USER_ANSWERED_CORPUS_SUMMARY.md",
    ROOT / "docs" / "R26G_FIX_AND_INTAKE_USER_ANSWERS.md",
    ROOT / "docs" / "R26G_REPLACEMENT_51_100_PARSE_SUMMARY.md",
    ROOT / "docs" / "R26G_USER_ANSWERED_CORPUS_SUMMARY.md",
    ROOT / "docs" / "R26H_USER_ANSWER_CORPUS_READINESS.md",
    ROOT / "docs" / "R27A_VALUE_AESTHETIC_PROFILE_SUMMARY.md",
    ROOT / "docs" / "R27A_RELATION_EVIDENCE_INDEX_SUMMARY.md",
    ROOT / "training" / "current" / "corpus_manifest.json",
    ROOT / "training" / "current" / "source_policy.json",
]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def first_int(pattern: str, text: str, default: int = 0) -> int:
    match = re.search(pattern, text)
    return int(match.group(1)) if match else default


def load_manifest_counts() -> dict:
    manifest = json.loads(read_text(ROOT / "training" / "current" / "corpus_manifest.json"))
    rows = [
        item for item in manifest.get("files", [])
        if "r26e_user_answered_" in item.get("path", "")
    ]
    return {
        "r26e_current_manifest_rows": sum(int(item.get("row_count", 0)) for item in rows),
        "r26e_current_manifest_split_counts": {
            item.get("split", "unknown"): int(item.get("row_count", 0)) for item in rows
        },
        "manifest_total_user_answered": int(manifest.get("totals", {}).get("provenance_counts", {}).get("user_answered", 0)),
        "current_manifest_inputs": [item.get("path") for item in rows]
    }


def build_profile() -> dict:
    texts = {path.name: read_text(path) for path in INPUT_PATHS}
    combined = "\n".join(texts.values())
    manifest_counts = load_manifest_counts()

    r26h = texts["R26H_USER_ANSWER_CORPUS_READINESS.md"]
    r27a = texts["R27A_VALUE_AESTHETIC_PROFILE_SUMMARY.md"]
    r26g = texts["R26G_FIX_AND_INTAKE_USER_ANSWERS.md"]

    profile = {
        "schema_version": 1,
        "phase": "R28SURF3",
        "source_policy": {
            "only_tracked_summaries_used": True,
            "root_docx_pdf_parsed": False,
            "data_public_ingestion_parsed": False,
            "old_question_pack_001_rows_51_100_used": False,
            "eval_prompts_used": False,
            "private_raw_data_used": False,
            "cot_hidden_prompt_used": False,
            "training_ran": False,
            "model_weights_changed": False,
            "broad_answer_bank": False
        },
        "approved_summary_inputs": [
            path.relative_to(ROOT).as_posix() for path in INPUT_PATHS
            if path.suffix == ".md"
        ],
        "tracked_manifest_inputs": [
            "training/current/corpus_manifest.json",
            "training/current/source_policy.json"
        ],
        "approved_anchor_summary_count": first_int(r"User-answer rows:\s*(\d+)", r26h, 0)
            or first_int(r"combined user_answered rows after R26G:\s*(\d+)", r26g, 0),
        "r26e_r26g_counts": {
            "r26e": first_int(r'"r26e":\s*(\d+)', r26h, 45),
            "r26g": first_int(r'"r26g":\s*(\d+)', r26h, 53)
        },
        "user_answer_split_counts": {
            "train": first_int(r'"train":\s*(\d+)', r26h, 78),
            "dev": first_int(r'"dev":\s*(\d+)', r26h, 10),
            "heldout": first_int(r'"heldout":\s*(\d+)', r26h, 10)
        },
        **manifest_counts,
        "style_traits": {
            "concise": {
                "present": "compression_judgment" in r27a,
                "evidence": "compression_judgment: 27 rows; short answer is valid when it preserves the judgment axis"
            },
            "boundary_first": {
                "present": "refusal_boundary" in r27a and "unsupported_challenge_resistance" in r27a,
                "evidence": "refusal_boundary: 11 rows; unsupported_challenge_resistance: 10 rows"
            },
            "anti_customer_service_tone": {
                "present": "non_assistant_voice" in r27a,
                "evidence": "non_assistant_voice: 98 rows; answer_as=user_self instead of service persona"
            },
            "evidence_honesty": {
                "present": "evidence_based_correction" in r27a,
                "evidence": "correction requires evidence; absence of evidence is not defeat"
            },
            "aesthetic_value_judgment": {
                "present": "aesthetic_judgment" in r27a and "value_judgment" in r27a,
                "evidence": "aesthetic_judgment: 13 rows; value_judgment: 50 rows"
            },
            "refusal_shape": {
                "present": "Allowed answer modes" in r27a and "refuse" in r27a,
                "evidence": "allowed answer modes include refuse, partial_answer, compressed_judgment, abstract_reframe"
            }
        },
        "exclusions_confirmed": {
            "old_question_pack_001_rows_51_100_present": first_int(r"Old question_pack_001 rows 51-100 present:\s*(\d+)", r26h, 0),
            "chain_of_thought_hidden_prompt_local_path_risks": first_int(r"Chain-of-thought / hidden prompt / local path risks:\s*(\d+)", r26h, 0),
            "private_data_true_rows": first_int(r"Private-data true rows:\s*(\d+)", r26h, 0),
            "eval_prompt_training": False,
            "root_docx_pdf_parsing": False,
            "data_public_ingestion_parsing": False
        },
        "surface_rules": {
            "daily_micro_intents_only": True,
            "open_questions_fall_through": True,
            "deterministic_variation_by_input_hash": True,
            "short_answer_target": True,
            "answer_bank": False,
            "broad_answer_bank": False
        },
        "non_claims": {
            "product_model": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint": False,
            "backend_inference": False,
            "external_llm_api": False,
            "doubao": False,
            "hosted_vector_store": False
        }
    }

    combined_lower = combined.lower()
    forbidden_hits = []
    marker_groups = {
        "old question_pack_001 rows 51-100 excluded": ["old question_pack_001 rows 51-100", "excluded"],
        "no training": ["does not train"],
        "no doubao": ["doubao"]
    }
    for label, markers in marker_groups.items():
        if not all(marker in combined_lower for marker in markers):
            forbidden_hits.append(f"missing_summary_marker:{label}")
    profile["audit_ok"] = (
        profile["approved_anchor_summary_count"] == 98
        and profile["exclusions_confirmed"]["old_question_pack_001_rows_51_100_present"] == 0
        and profile["exclusions_confirmed"]["chain_of_thought_hidden_prompt_local_path_risks"] == 0
        and not forbidden_hits
    )
    profile["audit_warnings"] = forbidden_hits
    return profile


def main() -> int:
    missing = [path.relative_to(ROOT).as_posix() for path in INPUT_PATHS if not path.exists()]
    if missing:
      print(json.dumps({"ok": False, "missing": missing}, ensure_ascii=False, indent=2))
      return 1
    profile = build_profile()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": profile["audit_ok"],
        "output": OUT.relative_to(ROOT).as_posix(),
        "approved_anchor_summary_count": profile["approved_anchor_summary_count"],
        "current_manifest_user_answered": profile["r26e_current_manifest_rows"],
        "style_traits": sorted(profile["style_traits"].keys()),
        "warnings": profile["audit_warnings"]
    }, ensure_ascii=False, indent=2))
    return 0 if profile["audit_ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
