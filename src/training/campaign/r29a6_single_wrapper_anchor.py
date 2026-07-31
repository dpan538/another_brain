"""R29A6 uses the masked encoder's single canonical chat wrapper."""
from __future__ import annotations
from pathlib import Path
from typing import Any
from src.training.campaign.r27a10_intake import ROOT
from src.training.campaign import r29a5_chat_format_anchor as prior

CAMPAIGN_ID = "r29a6_96m_single_wrapper_anchor_v1"
ART = ROOT / "artifacts/r29a6"
APPROVAL_KEY = "R29A6_SINGLE_WRAPPER_ANCHOR_ALLOWED"
TONE_PROFILE = {**prior.TONE_PROFILE, "name": "single_wrapper_concept_anchor"}
CAMPAIGN_POLICY = {**prior.CAMPAIGN_POLICY, "campaign_id": CAMPAIGN_ID, "campaign_type": "single_wrapper_anchor_recovery", "max_optimizer_tokens": 60_000}

def clean_row(card: tuple[str, str, str, str], index: int, split: str) -> dict[str, Any]:
    key, fact, action, source_type = card
    tail = prior.QUESTION_MODES[index % len(prior.QUESTION_MODES)][1]
    return {"id": f"r29a6_{split}_{key}_{index:03d}", "campaign_id": CAMPAIGN_ID,
      "category": "cross_concept_reasoning", "input": f"{key}{tail}",
      "target": f"{key}：{fact}下一步：{action}", "length_target": "short_concept_anchor",
      "evidence_policy": "name concept, give a reason, give one next step", "answer_mode": TONE_PROFILE["name"],
      "source_card": {"source_id": f"project_authored_{'heldout_' if split == 'heldout' else 'train_'}{key}", "source_type": source_type, "raw_source_ingested": False},
      "source_policy": {"raw_private_data_used": False, "raw_external_text_used": False, "eval_prompt_used": split == "heldout", "processed_corpus_committed": False}}

def _configure() -> None:
    prior.CAMPAIGN_ID, prior.ART, prior.APPROVAL_KEY = CAMPAIGN_ID, ART, APPROVAL_KEY
    prior.TONE_PROFILE, prior.CAMPAIGN_POLICY, prior.engine.ROW_BUILDER = TONE_PROFILE, CAMPAIGN_POLICY, clean_row
def build_mix(root: Path = ROOT, *, write_artifacts: bool = True) -> dict[str, Any]:
    _configure(); return prior.build_mix(root, write_artifacts=write_artifacts)
def create_campaign_marker(campaign_id: str = CAMPAIGN_ID) -> dict[str, Any]:
    _configure(); return prior.create_campaign_marker(campaign_id)
def run_single_wrapper_anchor(campaign_id: str = CAMPAIGN_ID, *, prefer_device: str = "mps", resource_safe: bool = True) -> dict[str, Any]:
    _configure(); return prior.run_chat_format_anchor(campaign_id, prefer_device=prefer_device, resource_safe=resource_safe)
