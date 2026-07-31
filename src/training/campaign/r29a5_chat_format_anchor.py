"""R29A5 aligns supervised inputs with the exact chat-format probe contract."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import ROOT
from src.training.campaign import r29a3_cross_concept_generalization as engine

CAMPAIGN_ID = "r29a5_96m_chat_format_anchor_v1"
ART = ROOT / "artifacts/r29a5"
APPROVAL_KEY = "R29A5_CHAT_FORMAT_ANCHOR_ALLOWED"
TONE_PROFILE = {"name": "chat_format_concept_anchor", "language": "zh-CN", "answer_order": ["概念", "依据", "下一步"], "traits": ["short", "concept_named", "chat_format_matched"], "prohibitions": ["套话", "英文占位符", "伪确定"]}
CAMPAIGN_POLICY = {**engine.CAMPAIGN_POLICY, "campaign_id": CAMPAIGN_ID, "campaign_type": "chat_format_anchor_recovery", "max_optimizer_tokens": 60_000, "evaluation_interval_optimizer_tokens": 20_000, "max_segments": 3, "learning_rate": 2e-6}
TRAIN_CARDS = [
    ("因果方向", "相关不等于因果，还可能有共同原因或反向因果。", "先比较时间顺序和替代机制。", "project-authored"),
    ("样本代表性", "样本数量不能弥补覆盖范围错误。", "检查抽样框和缺失群体。", "project-authored"),
    ("测量误差", "指标有误差和口径边界，不等于对象本身。", "说明口径并在必要时复测。", "project-authored"),
    ("基准率", "显眼个案不自动代表总体概率。", "先看参考类和基线。", "project-authored"),
    ("可逆试点", "不确定时可逆试点能保留选择权。", "设置观察指标和停止条件。", "project-authored"),
    ("独立来源", "同一上游的多条消息不是独立证据。", "追溯共同来源和方法。", "project-authored"),
]
HELDOUT_CARDS = [
    ("代理指标", "代理指标便于测量，却可能偏离真正目标。", "同时看直接结果，偏离时调整。"),
    ("混杂因素", "混杂因素会制造表面相关。", "寻找对照或分层比较。"),
    ("分布差异", "平均数会掩盖群体间的不同结果。", "拆分群体和极端值。"),
    ("证据阈值", "结论强度应匹配证据质量。", "区分观察和推断。"),
]
QUESTION_MODES = [("meaning", "是什么意思？"), ("action", "应该怎样判断？")]
PROBE_ANCHORS = {"代理指标": ("代理", "目标", "指标"), "混杂因素": ("混杂", "对照", "共同"), "分布差异": ("分布", "群体", "平均"), "证据阈值": ("证据", "推断", "结论")}

def chat_row(card: tuple[str, str, str, str], index: int, split: str) -> dict[str, Any]:
    key, fact, action, source_type = card
    tail = QUESTION_MODES[index % len(QUESTION_MODES)][1]
    return {
        "id": f"r29a5_{split}_{key}_{index:03d}", "campaign_id": CAMPAIGN_ID, "category": "cross_concept_reasoning",
        "input": f"用户：{key}{tail}\n类别：cross_concept_reasoning\n回答：",
        "target": f"{key}：{fact}下一步：{action}", "length_target": "short_concept_anchor",
        "evidence_policy": "name concept, give a reason, give one next step", "answer_mode": TONE_PROFILE["name"],
        "source_card": {"source_id": f"project_authored_{'heldout_' if split == 'heldout' else 'train_'}{key}", "source_type": source_type, "raw_source_ingested": False},
        "source_policy": {"raw_private_data_used": False, "raw_external_text_used": False, "eval_prompt_used": split == "heldout", "processed_corpus_committed": False},
    }

def _configure() -> None:
    engine.CAMPAIGN_ID, engine.ART, engine.APPROVAL_KEY = CAMPAIGN_ID, ART, APPROVAL_KEY
    engine.TONE_PROFILE, engine.CAMPAIGN_POLICY = TONE_PROFILE, CAMPAIGN_POLICY
    engine.TRAIN_CARDS, engine.HELDOUT_CARDS, engine.QUESTION_MODES, engine.PROBE_ANCHORS = TRAIN_CARDS, HELDOUT_CARDS, QUESTION_MODES, PROBE_ANCHORS
    engine.ROW_BUILDER = chat_row

def build_mix(root: Path = ROOT, *, write_artifacts: bool = True) -> dict[str, Any]:
    _configure(); return engine.build_mix(root, write_artifacts=write_artifacts)
def create_campaign_marker(campaign_id: str = CAMPAIGN_ID) -> dict[str, Any]:
    _configure(); return engine.create_campaign_marker(campaign_id)
def run_chat_format_anchor(campaign_id: str = CAMPAIGN_ID, *, prefer_device: str = "mps", resource_safe: bool = True) -> dict[str, Any]:
    _configure(); return engine.run_cross_concept_generalization(campaign_id, prefer_device=prefer_device, resource_safe=resource_safe)
