from __future__ import annotations

from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import ROOT, now_utc, read_json, write_json
from src.training.eval.full_static_budget import audit_full_static_budget
from src.training.model_lab.r27a11_scale_catalog import CANDIDATES


CAMPAIGN_ID = "r29a2_knowledge_addon_150m_readiness_v1"
ART = ROOT / "artifacts/r29a2"
REPORT = ART / "reports/readiness.json"
SOURCE_POLICY_PATH = ROOT / "data/training_registry/r29a2_knowledge_addon_source_policy.json"
Q4_RUNTIME_PATH = ROOT / "web/another_brain_chat/q4_worker_runtime.js"

KNOWLEDGE_ADDON_FORMS = [
    {
        "id": "same_origin_static_pack",
        "purpose": "factual recall and cited evidence",
        "delivery": "lazy-loaded static knowledge shards with source metadata",
        "training_use": "only reviewed project-authored cards or explicitly licensed summaries; raw source text stays out of git",
        "privacy": "no backend, no remote inference, no private source ingestion",
    },
    {
        "id": "local_session_context",
        "purpose": "user-provided context for the current conversation",
        "delivery": "manual JSON import through the existing browser context bridge",
        "training_use": "never included in training without a separate explicit approval",
        "privacy": "memory-only, user-cleared, no persistence by default",
    },
    {
        "id": "knowledge_countermeasure_curriculum",
        "purpose": "teach answer structure: conclusion, evidence calibration, actions, tradeoffs",
        "delivery": "locally generated, split-separated training artifacts",
        "training_use": "project-authored templates plus reviewed source cards only",
        "privacy": "artifacts ignored; raw, clean, processed corpus and weights are not committed",
    },
]


def _q4_forward_status(path: Path = Q4_RUNTIME_PATH) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    start = text.find("export async function generateStaticQ4Draft")
    body = text[start : start + 6000] if start >= 0 else ""
    has_transformer_execution = "transformerForwardOneToken(store, architecture" in text and "single_token_causal_qkv" in text
    contextual_attention = "context_attention_supported: true" in text
    return {
        "runtime_found": bool(body),
        "uses_embedding_head_shortcut": all(token in body for token in ("token_emb.weight", "pos_emb.weight", "lm_head.weight", "topCandidatesForLinear")),
        "transformer_blocks_executed": has_transformer_execution,
        "single_token_transformer_only": has_transformer_execution and not contextual_attention,
        "contextual_attention_supported": contextual_attention,
        "ready_for_scale_comparison": bool(body) and has_transformer_execution,
    }


def evaluate_readiness(root: Path = ROOT) -> dict[str, Any]:
    root = Path(root)
    budget = audit_full_static_budget(root)
    rows = {row["label"]: row for row in budget["candidates"]}
    candidate = rows["new_150m_q4_estimate"]
    q4 = _q4_forward_status(root / "web/another_brain_chat/q4_worker_runtime.js")
    source_policy = read_json(root / "data/training_registry/r29a2_knowledge_addon_source_policy.json", {})
    blockers: list[str] = []
    if CANDIDATES["new_150m_estimate"].get("estimate_only"):
        blockers.append("150m_architecture_not_selected")
    if not candidate["fits_full_static_100mb"]:
        blockers.append("150m_exceeds_full_static_100mb_budget")
    if not q4["ready_for_scale_comparison"]:
        blockers.append("q4_transformer_forward_not_implemented")
    if not q4["contextual_attention_supported"]:
        blockers.append("q4_contextual_transformer_forward_not_implemented")
    if source_policy.get("review_required_before_training") is not True:
        blockers.append("knowledge_source_review_policy_missing")
    report = {
        "ok": not blockers,
        "campaign_id": CAMPAIGN_ID,
        "created_at_utc": now_utc(),
        "knowledge_addon_forms": KNOWLEDGE_ADDON_FORMS,
        "source_policy_path": str(SOURCE_POLICY_PATH.relative_to(root)),
        "source_policy_loaded": bool(source_policy),
        "q4_forward_status": q4,
        "scale_candidate": {
            "id": "new_150m_estimate",
            "estimate_only": bool(CANDIDATES["new_150m_estimate"].get("estimate_only")),
            "parameter_estimate": int(CANDIDATES["new_150m_estimate"]["params"]),
            "q4_model_bytes": candidate["model_bytes"],
            "full_static_bundle_estimate_bytes": candidate["full_static_bundle_estimate_bytes"],
            "remaining_bytes_under_100mb": candidate["remaining_bytes_under_100mb"],
            "static_product_eligible": candidate["fits_full_static_100mb"],
        },
        "decision": "research_only_after_forward_and_architecture_gates" if blockers else "eligible_for_bounded_research_smoke_only",
        "blockers": blockers,
        "product_model": False,
        "browser_admission": False,
        "release_checkpoint": False,
        "weights_committed": False,
        "raw_external_text_ingested": False,
    }
    return report


def write_readiness(root: Path = ROOT) -> dict[str, Any]:
    report = evaluate_readiness(root)
    write_json(Path(root) / "artifacts/r29a2/reports/readiness.json", report)
    return report
