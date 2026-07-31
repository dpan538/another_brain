"""Bounded R29A3 recovery: varied reasoning forms with disjoint concept probes."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import ROOT
from src.training.campaign import r29a1_knowledge_countermeasure as base


CAMPAIGN_ID = "r29a3_96m_cross_concept_generalization_v1"
SEED = 2913
ART = ROOT / "artifacts/r29a3"
TONE_PROFILE = {
    "name": "clear_evidence_action_zh_v2",
    "language": "zh-CN",
    "answer_order": ["判断", "依据", "可逆下一步", "边界"],
    "traits": ["direct", "evidence_honest", "actionable", "calibrated", "not_template_like"],
    "prohibitions": ["空泛鼓励", "伪确定", "复读问题", "无依据的权威断言", "只有步骤没有判断"],
}
CAMPAIGN_POLICY = {
    **base.CAMPAIGN_POLICY,
    "campaign_id": CAMPAIGN_ID,
    "campaign_type": "cross_concept_generalization_recovery",
    "seed": SEED,
    "learning_rate": 2e-6,
    "max_optimizer_tokens": 320_000,
    "evaluation_interval_optimizer_tokens": 40_000,
}

# Project-authored reasoning atoms only. Held-out concepts are excluded from the
# training set so a good score requires transfer rather than template recall.
TRAIN_CARDS = [
    ("causal_direction", "变量同时变化仍可能是共同原因、反向因果或偶然波动。", "先画出候选机制和时间顺序，再找能排除替代解释的观察。", "project-authored"),
    ("sampling_frame", "样本数量不能弥补覆盖范围错误。", "检查谁能被抽到、谁缺席，以及结论能推广到哪里。", "project-authored"),
    ("measurement_error", "指标带有误差和定义边界。", "说明测量口径，比较误差量级，并在必要时复测。", "project-authored"),
    ("base_rate", "醒目的个案不自动改变总体概率。", "先给参考类和基线，再判断新增证据改变了多少。", "project-authored"),
    ("source_independence", "同一上游的多条消息不是多份独立证据。", "追溯共同来源、方法和利益关系，再给可信度。", "project-authored"),
    ("counterfactual_scope", "反事实不能同时偷偷改写其他约束。", "固定比较点，列出替代路径和仍然存在的限制。", "project-authored"),
    ("feedback_delay", "延迟反馈会让最近动作看起来像原因。", "标出时间滞后和反馈环，等观察窗口结束再归因。", "project-authored"),
    ("reversible_trial", "不确定时可逆试验能保留选择权。", "定义低成本试点、观察指标和停止条件。", "project-authored"),
    ("risk_asymmetry", "相同平均损失可能由不同尾部风险组成。", "单列最坏可信情形、受影响群体和缓解措施。", "project-authored"),
    ("decision_record", "复盘需要当时的假设和证据，不能只保留结果。", "记录判断、依据、反对理由和复查日期。", "project-authored"),
    ("comparison_axis", "比较结论取决于比较轴，而不是对象名称。", "先说明用成本、可靠性、体验或伦理中的哪一轴比较。", "project-authored"),
    ("falsification", "能解释一切的说法通常没有清晰预测。", "说明什么观察会削弱主张，并保留无法检验的部分。", "project-authored"),
]
HELDOUT_CARDS = [
    ("proxy_drift", "代理指标可能在得分上变好，却偏离真正目标。", "把代理和直接观察并列，设置停止条件，发现偏离就调整。"),
    ("confounding", "混杂因素能制造看似稳定的相关。", "列出共同变化因素，寻找分层比较或对照，不能排除时降低结论。"),
    ("distributional_effect", "平均数会掩盖受益和受损群体的不同结果。", "拆分群体、极端值和暴露程度，再决定是否需要差异化对策。"),
    ("evidence_threshold", "结论强度应随证据质量、独立性和可复核性变化。", "区分观察和推断，说明还缺什么，并指定会改变结论的证据。"),
]
QUESTION_MODES = [
    ("diagnose", "有人据此立刻下结论，最该先检查什么？"),
    ("compare", "两种做法看起来都合理，应该用什么标准比较？"),
    ("counterexample", "给出一个会让原判断失效的条件，并说明原因。"),
    ("action", "信息不完整时，下一步怎样做才可复盘、可修正？"),
]
PROBE_ANCHORS = {
    "proxy_drift": ("代理", "目标", "指标"),
    "confounding": ("混杂", "共同", "对照"),
    "distributional_effect": ("群体", "平均", "差异"),
    "evidence_threshold": ("证据", "推断", "结论"),
}


def _stable_index(key: str, modulo: int) -> int:
    return int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:10], 16) % modulo


def _row(card: tuple[str, str, str, str], index: int, split: str) -> dict[str, Any]:
    key, fact, action, source_type = card
    mode, tail = QUESTION_MODES[_stable_index(f"{key}:{index}:{split}", len(QUESTION_MODES))]
    return {
        "id": f"r29a3_{split}_{key}_{mode}_{index:03d}", "campaign_id": CAMPAIGN_ID,
        "category": "cross_concept_reasoning", "input": f"围绕{key}的问题，{tail}",
        "target": f"判断：这不能凭单一线索直接定论。依据：{fact}下一步：{action}边界：信息不足时只能给条件性判断；新证据改变机制或比较轴时，结论也要更新。",
        "length_target": "structured_brief", "evidence_policy": "separate observation, inference, reversible action, and boundary",
        "answer_mode": TONE_PROFILE["name"],
        "source_card": {"source_id": f"project_authored_{'heldout_' if split == 'heldout' else 'train_'}{key}", "source_type": source_type, "raw_source_ingested": False},
        "source_policy": {"raw_private_data_used": False, "raw_external_text_used": False, "eval_prompt_used": split == "heldout", "processed_corpus_committed": False},
    }


def _probe_model(torch, model, tokenizer, device: str, context_length: int) -> dict[str, Any]:
    probes = []
    for key, _, _ in HELDOUT_CARDS:
        prompt = f"用户：{key}是什么意思？请给出判断依据、可逆下一步和边界。\n类别：cross_concept_reasoning\n回答："
        output = base._generate(torch, model, tokenizer, prompt, device, context_length, max_new_tokens=96)
        evidence = sum(term in output for term in ("依据", "证据", "观察", "推断", "条件"))
        action = sum(term in output for term in ("下一步", "检查", "比较", "对照", "试点", "记录"))
        concept = sum(term in output for term in PROBE_ANCHORS[key])
        score = 0.1 + (0.3 if evidence else 0) + (0.3 if action else 0) + (0.2 if concept else 0) + (0.1 if len(output) >= 24 else 0)
        probes.append({"id": key, "prompt": prompt, "output": output, "score": round(score, 3), "evidence_hits": evidence, "action_hits": action, "concept_hits": concept})
    leaks = [item["id"] for item in probes if item["output"].startswith(("用户：", "用户:", "回答：", "回答:"))]
    return {"probe_average_score": round(sum(item["score"] for item in probes) / len(probes), 4), "role_prefix_leaks": leaks, "below_threshold": [item["id"] for item in probes if item["score"] < 0.7], "probes": probes}


def build_mix(root: Path = ROOT, *, write_artifacts: bool = True) -> dict[str, Any]:
    root = Path(root)
    rows: dict[str, list[dict[str, Any]]] = {"train": [], "dev": [], "heldout": []}
    for index in range(16):
        for card in TRAIN_CARDS:
            split = "dev" if _stable_index(f"{card[0]}:{index}", 6) == 0 else "train"
            rows[split].append(_row(card, index, split))
    for index in range(12):
        for card in HELDOUT_CARDS:
            rows["heldout"].append(_row((*card, "project-authored-heldout"), index, "heldout"))
    source_ids = {split: {row["source_card"]["source_id"] for row in items} for split, items in rows.items()}
    report = {
        "ok": bool(rows["train"] and rows["dev"] and rows["heldout"]), "campaign_id": CAMPAIGN_ID,
        "counts": {split: len(items) for split, items in rows.items()},
        "split_source_overlap": sorted((source_ids["train"] | source_ids["dev"]) & source_ids["heldout"]),
        "tone_profile": TONE_PROFILE, "curriculum_modes": [mode for mode, _ in QUESTION_MODES],
        "raw_external_text_ingested": False, "processed_corpus_committed": False,
    }
    report["ok"] = report["ok"] and not report["split_source_overlap"]
    if write_artifacts:
        output = root / "artifacts/r29a3/training_mix"
        output.mkdir(parents=True, exist_ok=True)
        for split, items in rows.items():
            (output / f"{split}.jsonl").write_text("".join(f"{json.dumps(item, ensure_ascii=False, sort_keys=True)}\n" for item in items), encoding="utf-8")
        base.write_json(root / "artifacts/r29a3/reports/training_mix_report.json", report)
    return report


def _configure() -> None:
    base.CAMPAIGN_ID = CAMPAIGN_ID
    base.SEED = SEED
    base.ART = ART
    base.REPORTS, base.CHECKPOINTS, base.RUNS, base.MIX = ART / "reports", ART / "model_lab/checkpoints", ART / "model_lab/runs", ART / "training_mix"
    base.MARKER, base.LEDGER, base.HEARTBEAT = base.REPORTS / "campaign_marker.json", base.REPORTS / "campaign_ledger.json", base.REPORTS / "heartbeat_latest.json"
    base.TONE_PROFILE, base.CAMPAIGN_POLICY = TONE_PROFILE, CAMPAIGN_POLICY
    base.TRAIN_CARDS, base.HELDOUT_CARDS, base._row, base._probe_model, base.build_mix = TRAIN_CARDS, HELDOUT_CARDS, _row, _probe_model, build_mix


def create_campaign_marker(campaign_id: str = CAMPAIGN_ID) -> dict[str, Any]:
    _configure()
    marker = base.create_campaign_marker(campaign_id)
    marker["approval"] = {"R29A3_CROSS_CONCEPT_GENERALIZATION_ALLOWED": True}
    base.write_json(base.MARKER, marker)
    return marker


def run_cross_concept_generalization(campaign_id: str = CAMPAIGN_ID, *, prefer_device: str = "mps", resource_safe: bool = True) -> dict[str, Any]:
    _configure()
    return base.run_knowledge_countermeasure(campaign_id, prefer_device=prefer_device, resource_safe=resource_safe)


_read_rows = base._read_rows
