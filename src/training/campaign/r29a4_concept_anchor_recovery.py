"""R29A4: short Chinese concept anchors before another long-horizon attempt."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import ROOT
from src.training.campaign import r29a3_cross_concept_generalization as engine

CAMPAIGN_ID = "r29a4_96m_chinese_concept_anchor_v1"
ART = ROOT / "artifacts/r29a4"
APPROVAL_KEY = "R29A4_CHINESE_CONCEPT_ANCHOR_ALLOWED"
TONE_PROFILE = {
    "name": "short_chinese_concept_anchor",
    "language": "zh-CN",
    "answer_order": ["概念", "为什么", "下一步"],
    "traits": ["short", "concrete", "concept_named", "evidence_honest"],
    "prohibitions": ["英文占位符", "套话", "伪确定", "空泛步骤"],
}
CAMPAIGN_POLICY = {
    **engine.CAMPAIGN_POLICY,
    "campaign_id": CAMPAIGN_ID,
    "campaign_type": "chinese_concept_anchor_recovery",
    "learning_rate": 2e-6,
    "max_optimizer_tokens": 120_000,
    "evaluation_interval_optimizer_tokens": 30_000,
    "max_segments": 4,
}

TRAIN_CARDS = [
    ("因果方向", "相关现象仍可能来自共同原因、反向因果或巧合。", "先比较时间顺序和候选机制，再找能排除替代解释的观察。", "project-authored"),
    ("样本代表性", "样本多不等于覆盖正确；缺席群体会限制结论。", "检查抽样框、缺失群体和结论范围。", "project-authored"),
    ("测量误差", "一个指标包含误差和口径边界，不等于对象本身。", "说明口径、复测或比较误差量级。", "project-authored"),
    ("基准率", "醒目的个案不自动代表总体概率。", "先给参考类和基线，再判断新证据改变多少。", "project-authored"),
    ("独立来源", "同一上游的多条消息不是多份独立证据。", "追溯共同来源和方法，再给可信度。", "project-authored"),
    ("可逆试点", "不确定时小而可逆的试验能保留选择权。", "设置试点、观察指标和停止条件。", "project-authored"),
    ("反事实", "反事实比较只能改变明确条件，其他约束不能偷偷消失。", "固定比较点并列出替代路径。", "project-authored"),
    ("反馈延迟", "延迟反馈会让最近动作看起来像原因。", "标出观察窗口，再决定是否归因。", "project-authored"),
]
HELDOUT_CARDS = [
    ("代理指标", "代理指标方便测量，却可能偏离真正目标。", "同时看直接结果和代理，偏离时调整或停止。"),
    ("混杂因素", "混杂因素能让两个变量看起来相关。", "列出共同变化因素，寻找对照或分层比较。"),
    ("分布差异", "平均数会掩盖不同群体的受益和受损。", "拆分群体和极端值，再决定差异化对策。"),
    ("证据阈值", "结论强度应匹配证据的质量和可复核性。", "区分观察与推断，并说明什么证据会改变结论。"),
]
QUESTION_MODES = [("meaning", "是什么意思？"), ("reason", "为什么不能直接下结论？"), ("action", "下一步先做什么？")]
PROBE_ANCHORS = {
    "代理指标": ("代理", "目标", "指标"), "混杂因素": ("混杂", "共同", "对照"),
    "分布差异": ("群体", "平均", "差异"), "证据阈值": ("证据", "推断", "结论"),
}


def _configure() -> None:
    engine.CAMPAIGN_ID, engine.ART, engine.APPROVAL_KEY = CAMPAIGN_ID, ART, APPROVAL_KEY
    engine.TONE_PROFILE, engine.CAMPAIGN_POLICY = TONE_PROFILE, CAMPAIGN_POLICY
    engine.TRAIN_CARDS, engine.HELDOUT_CARDS = TRAIN_CARDS, HELDOUT_CARDS
    engine.QUESTION_MODES, engine.PROBE_ANCHORS = QUESTION_MODES, PROBE_ANCHORS


def build_mix(root: Path = ROOT, *, write_artifacts: bool = True) -> dict[str, Any]:
    _configure()
    return engine.build_mix(root, write_artifacts=write_artifacts)


def create_campaign_marker(campaign_id: str = CAMPAIGN_ID) -> dict[str, Any]:
    _configure()
    return engine.create_campaign_marker(campaign_id)


def run_concept_anchor_recovery(campaign_id: str = CAMPAIGN_ID, *, prefer_device: str = "mps", resource_safe: bool = True) -> dict[str, Any]:
    _configure()
    return engine.run_cross_concept_generalization(campaign_id, prefer_device=prefer_device, resource_safe=resource_safe)
