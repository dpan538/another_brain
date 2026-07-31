"""Independent, post-EOS R29A7 recovery controller.

This deliberately does not import an earlier R29 campaign controller: those
controllers configured one another by mutating module globals, which made the
effective policy depend on import order.  R29A7 keeps all run state in one
immutable-by-convention configuration object and records a contract fingerprint
before a checkpoint can be written.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import NON_CLAIMS, ROOT, now_utc, read_json, write_json
from src.training.campaign.r28a13_controller import _generate, _load_model, _load_tokenizer, _resolve_device, _resolve_tokenizer_path
from src.training.campaign.r29a0_masked_debug import _dataset_tensors, _evaluate_masked, encode_masked_dataset
from src.training.model_lab.loss_accounting import ASSISTANT_RESPONSE_ONLY, LossAccumulator, token_weighted_torch_loss
from src.training.model_lab.r27a11_scale_catalog import params_for_r27a11

CAMPAIGN_ID = "r29a7_96m_post_eos_rebaseline_v1"
APPROVAL_KEY = "R29A7_POST_EOS_REBASELINE_ALLOWED"
ART = ROOT / "artifacts/r29a7"
TONE_PROFILE = {"name": "post_eos_natural_concept_anchor", "language": "zh-CN", "answer_order": ["概念", "依据", "下一步", "边界"], "traits": ["short", "specific", "evidence_honest", "actionable"], "prohibitions": ["套话", "复读提示", "伪确定"]}
POLICY = {"campaign_id": CAMPAIGN_ID, "campaign_type": "independent_post_eos_rebaseline", "selected_model": "new_96m", "loss_mask_policy": ASSISTANT_RESPONSE_ONLY, "seed": 2917, "learning_rate": 1e-6, "max_optimizer_tokens": 20_000, "evaluation_interval_optimizer_tokens": 10_000, "max_segments": 2, "max_checkpoint_count": 2, "wall_clock_cap_hours": 1, "batch_size": 2, "require_mps": True, "allow_weight_commit": False, "allow_tokenizer_artifact_commit": False, "allow_raw_corpus_commit": False, "allow_processed_corpus_commit": False, "product_model_admission": False, "browser_admission": False, "release_checkpoint": False, "active_approval_after_completion": 0}
TRAIN_CARDS = [("因果方向", "相关不等于因果，也可能有共同原因或反向因果。", "先比较时间顺序和替代机制。"), ("样本代表性", "样本数量不能弥补覆盖范围错误。", "检查抽样框和缺失群体。"), ("测量误差", "指标有误差和口径边界。", "说明口径并在必要时复测。"), ("基准率", "显眼个案不自动代表总体概率。", "先看参考类和基线。"), ("可逆试点", "不确定时可逆试点能保留选择权。", "设置观察指标和停止条件。"), ("独立来源", "同一上游的多条消息不是独立证据。", "追溯共同来源和方法。")]
HELDOUT_CARDS = [("代理指标", "代理指标便于测量，却可能偏离真正目标。", "同时看直接结果，偏离时调整。", ("代理", "目标", "指标")), ("混杂因素", "混杂因素会制造表面相关。", "寻找对照或分层比较。", ("混杂", "对照", "共同")), ("分布差异", "平均数会掩盖群体间的不同结果。", "拆分群体和极端值。", ("分布", "群体", "平均")), ("证据阈值", "结论强度应匹配证据质量。", "区分观察和推断。", ("证据", "推断", "结论"))]


@dataclass(frozen=True)
class RunConfig:
    campaign_id: str = CAMPAIGN_ID
    approval_key: str = APPROVAL_KEY
    artifact_root: Path = ART
    policy: dict[str, Any] | None = None

    def paths(self) -> dict[str, Path]:
        reports = self.artifact_root / "reports"
        return {"reports": reports, "marker": reports / "campaign_marker.json", "ledger": reports / "campaign_ledger.json", "heartbeat": reports / "heartbeat_latest.json", "mix": self.artifact_root / "training_mix", "checkpoints": self.artifact_root / "model_lab/checkpoints", "runs": self.artifact_root / "model_lab/runs"}


CONFIG = RunConfig(policy=POLICY)


def _contract(config: RunConfig = CONFIG) -> dict[str, Any]:
    policy = dict(config.policy or {})
    report = {"campaign_id": config.campaign_id, "policy_campaign_id": policy.get("campaign_id"), "artifact_root": str(config.artifact_root), "approval_key": config.approval_key}
    report["fingerprint"] = hashlib.sha256(json.dumps(report, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    report["ok"] = report["campaign_id"] == report["policy_campaign_id"] and config.artifact_root.name == "r29a7"
    return report


def _row(card: tuple[str, str, str], index: int, split: str) -> dict[str, Any]:
    key, fact, action = card
    suffix = ("是什么意思？", "应该怎样判断？", "为什么不能立刻下结论？")[index % 3]
    return {"id": f"r29a7_{split}_{key}_{index:03d}", "campaign_id": CAMPAIGN_ID, "category": "cross_concept_reasoning", "input": f"{key}{suffix}", "target": f"{key}：{fact}下一步：{action}边界：信息不足时先给条件性判断。", "length_target": "short_concept_anchor", "evidence_policy": "name concept, give reason, reversible next step, boundary", "answer_mode": TONE_PROFILE["name"], "source_card": {"source_id": f"project_authored_{'heldout_' if split == 'heldout' else 'train_'}{key}", "source_type": "project-authored", "raw_source_ingested": False}, "source_policy": {"raw_private_data_used": False, "raw_external_text_used": False, "eval_prompt_used": split == "heldout", "processed_corpus_committed": False}}


def build_mix(root: Path = ROOT, *, write_artifacts: bool = True, config: RunConfig = CONFIG) -> dict[str, Any]:
    rows = {"train": [], "dev": [], "heldout": []}
    for index in range(16):
        for card in TRAIN_CARDS:
            rows["dev" if index % 6 == 0 else "train"].append(_row(card, index, "dev" if index % 6 == 0 else "train"))
    for index in range(12):
        rows["heldout"].extend(_row((key, fact, action), index, "heldout") for key, fact, action, _ in HELDOUT_CARDS)
    source_ids = {split: {r["source_card"]["source_id"] for r in values} for split, values in rows.items()}
    report = {"ok": bool(rows["train"] and rows["dev"] and rows["heldout"]), "campaign_id": config.campaign_id, "counts": {k: len(v) for k, v in rows.items()}, "split_source_overlap": sorted((source_ids["train"] | source_ids["dev"]) & source_ids["heldout"]), "tone_profile": TONE_PROFILE, "raw_external_text_ingested": False, "processed_corpus_committed": False, "control_contract": _contract(config)}
    report["ok"] = report["ok"] and not report["split_source_overlap"] and report["control_contract"]["ok"]
    if write_artifacts:
        for split, values in rows.items():
            path = config.paths()["mix"] / f"{split}.jsonl"; path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in values), encoding="utf-8")
        write_json(config.paths()["reports"] / "training_mix_report.json", report)
    return report


def create_campaign_marker(config: RunConfig = CONFIG) -> dict[str, Any]:
    contract = _contract(config)
    marker = {"ok": contract["ok"], "active": contract["ok"], "consumed": False, "campaign_id": config.campaign_id, "created_at_utc": now_utc(), "approval": {config.approval_key: contract["ok"]}, "policy": config.policy, "control_contract": contract, **NON_CLAIMS}
    write_json(config.paths()["marker"], marker)
    return marker


def _blocked(config: RunConfig, blockers: list[str]) -> dict[str, Any]:
    ledger = {"ok": False, "campaign_id": config.campaign_id, "train_started": False, "training_ran": False, "blockers": blockers, "stop_reason": blockers[0], "policy": config.policy, "control_contract": _contract(config), "active_approval_after_completion": 0, **NON_CLAIMS}
    write_json(config.paths()["ledger"], ledger); return ledger


def _read_rows(path: Path) -> list[dict[str, Any]]: return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def _lineage() -> dict[str, Any]:
    for candidate in (ROOT, ROOT.parent / "another_brain_train_r29a0"):
        ledger = read_json(candidate / "artifacts/r29a0/reports/campaign_ledger.json", {})
        checkpoint = candidate / str(ledger.get("best_checkpoint", ""))
        if ledger.get("ok") is True and checkpoint.exists(): return {"ok": True, "checkpoint_path": str(checkpoint), "selected_model": ledger.get("selected_model"), "source_campaign": ledger.get("campaign_id")}
    return {"ok": False, "blockers": ["r29a0_best_checkpoint_unavailable"]}


def _probe(torch, model, tokenizer, device: str, context_length: int) -> dict[str, Any]:
    probes = []
    for key, _, _, anchors in HELDOUT_CARDS:
        prompt = f"用户：{key}是什么意思？请说明依据、下一步和边界。\n类别：cross_concept_reasoning\n回答："
        output = _generate(torch, model, tokenizer, prompt, device, context_length, max_new_tokens=96)
        evidence = any(word in output for word in ("依据", "证据", "观察", "条件", "推断")); action = any(word in output for word in ("下一步", "检查", "对照", "比较", "试点")); concept = any(word in output for word in anchors)
        score = round(0.1 + .3 * evidence + .3 * action + .2 * concept + .1 * (len(output) >= 24), 3)
        probes.append({"id": key, "prompt": prompt, "output": output, "score": score, "evidence_hits": int(evidence), "action_hits": int(action), "concept_hits": int(concept)})
    return {"probe_average_score": round(sum(p["score"] for p in probes) / len(probes), 4), "role_prefix_leaks": [p["id"] for p in probes if p["output"].startswith(("用户：", "回答："))], "below_threshold": [p["id"] for p in probes if p["score"] < .7], "probes": probes}


def run(*, prefer_device: str = "mps", resource_safe: bool = True, config: RunConfig = CONFIG) -> dict[str, Any]:
    import torch
    contract = _contract(config); paths = config.paths(); marker = read_json(paths["marker"], {})
    if not contract["ok"]: return _blocked(config, ["control_contract_invalid"])
    if marker.get("active") is not True or marker.get("campaign_id") != config.campaign_id or marker.get("control_contract", {}).get("fingerprint") != contract["fingerprint"]: return _blocked(config, ["campaign_marker_missing_inactive_or_mismatched"])
    lineage = _lineage()
    if not lineage.get("ok"): return _blocked(config, lineage["blockers"])
    if lineage.get("selected_model") != config.policy["selected_model"]: return _blocked(config, ["selected_model_mismatch"])
    device = _resolve_device(prefer_device)
    if config.policy["require_mps"] and device != "mps": return _blocked(config, ["mps_required_but_unavailable"])
    required = int(params_for_r27a11(config.policy["selected_model"]) * 4.2) * config.policy["max_checkpoint_count"] + 8_000_000_000
    free = shutil.disk_usage(ROOT.parent).free; guard = {"ok": free >= required, "disk_free_bytes": free, "required_free_bytes": required}
    write_json(paths["reports"] / "resource_guard.json", guard)
    if resource_safe and not guard["ok"]: return _blocked(config, ["disk_space_critical"])
    mix = build_mix(config=config)
    if not mix["ok"]: return _blocked(config, ["training_mix_invalid"])
    os.environ.setdefault("OMP_NUM_THREADS", "2"); torch.set_num_threads(2); random.seed(config.policy["seed"]); torch.manual_seed(config.policy["seed"])
    tokenizer_path = _resolve_tokenizer_path()
    if tokenizer_path is None: return _blocked(config, ["tokenizer_missing"])
    tokenizer = _load_tokenizer(tokenizer_path); model, spec = _load_model(torch, Path(lineage["checkpoint_path"]), config.policy["selected_model"], device); context_length = int(spec["context_length"])
    train, dev, heldout = (_dataset_tensors(torch, encode_masked_dataset(_read_rows(paths["mix"] / f"{split}.jsonl"), tokenizer, context_length), device) for split in ("train", "dev", "heldout")); batch = config.policy["batch_size"]
    baseline = {"dev": _evaluate_masked(torch, model, dev, "r29a7_dev_baseline", batch), "heldout": _evaluate_masked(torch, model, heldout, "r29a7_heldout_baseline", batch), "probe": _probe(torch, model, tokenizer, device, context_length)}
    ledger = {"ok": True, "campaign_id": config.campaign_id, "created_at_utc": now_utc(), "train_started": True, "training_ran": True, "selected_model": config.policy["selected_model"], "selected_device": device, "context_length": context_length, "resume_from": lineage, "baseline": baseline, "optimizer_tokens": 0, "optimizer_steps": 0, "segments": [], "policy": config.policy, "control_contract": contract, "active_approval_after_completion": 0, **NON_CLAIMS}; write_json(paths["ledger"], ledger)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.policy["learning_rate"], weight_decay=.01); inputs, targets, masks = train; best_probe = baseline["probe"]["probe_average_score"]; deadline = time.time() + config.policy["wall_clock_cap_hours"] * 3600
    for index in range(1, config.policy["max_segments"] + 1):
        acc = LossAccumulator(split=f"r29a7_train_segment_{index}", mask_policy=ASSISTANT_RESPONSE_ONLY); tokens = steps = 0
        while tokens < config.policy["evaluation_interval_optimizer_tokens"] and ledger["optimizer_tokens"] + tokens < config.policy["max_optimizer_tokens"] and time.time() < deadline:
            indices = torch.randint(0, inputs.shape[0], (batch,), device=device); logits, _ = model(inputs[indices]); _, loss_tokens, loss = token_weighted_torch_loss(torch, logits, targets[indices], masks[indices]); value = float(loss.detach().cpu())
            if not math.isfinite(value): ledger.update({"ok": False, "stop_reason": "nan_loss", "blockers": ["nan_loss"]}); break
            optimizer.zero_grad(set_to_none=True); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), .7); optimizer.step(); acc.add(value, loss_tokens, ASSISTANT_RESPONSE_ONLY); tokens += int(loss_tokens); steps += 1
        if ledger.get("stop_reason"): break
        if device == "mps": torch.mps.synchronize()
        dev_eval = _evaluate_masked(torch, model, dev, "r29a7_dev", batch); heldout_eval = _evaluate_masked(torch, model, heldout, "r29a7_heldout", batch); probe = _probe(torch, model, tokenizer, device, context_length)
        checkpoint = paths["checkpoints"] / f"{config.campaign_id}_seg{index:02d}.pt"; checkpoint.parent.mkdir(parents=True, exist_ok=True); torch.save({"model_state_dict": model.state_dict(), "config": {**spec, "campaign_id": config.campaign_id, "control_contract": contract, **NON_CLAIMS}}, checkpoint)
        segment = {"segment_index": index, "optimizer_tokens": tokens, "optimizer_steps": steps, "running_train_loss": acc.to_report(), "dev_loss": dev_eval.get("average_loss"), "heldout_loss": heldout_eval.get("average_loss"), "probe": probe, "checkpoint_path": str(checkpoint.relative_to(ROOT)), "control_contract": contract}; ledger["segments"].append(segment); ledger["optimizer_tokens"] += tokens; ledger["optimizer_steps"] += steps; write_json(paths["runs"] / config.campaign_id / f"segment_{index:02d}.json", segment); write_json(paths["heartbeat"], {"ok": True, "campaign_id": config.campaign_id, "segment_index": index, "optimizer_tokens": ledger["optimizer_tokens"], "probe_average_score": probe["probe_average_score"], "control_contract": contract})
        if index > 1 and (probe["probe_average_score"] < best_probe - .05 or probe["below_threshold"] or probe["role_prefix_leaks"]): ledger["stop_reason"] = "probe_regression_stop"; break
        best_probe = max(best_probe, probe["probe_average_score"])
    ledger.update({"completed_at_utc": now_utc(), "segment_count": len(ledger["segments"]), "stop_reason": ledger.get("stop_reason", "bounded_schedule_complete")}); best = max(ledger["segments"], key=lambda s: s["probe"]["probe_average_score"], default=None); ledger["best_checkpoint"] = "" if best is None else best["checkpoint_path"]; ledger["promotion_gate"] = {"passed": bool(best and not best["probe"]["below_threshold"] and not best["probe"]["role_prefix_leaks"] and best["probe"]["probe_average_score"] >= .8), "browser_admission": False, "release_checkpoint": False}; write_json(paths["ledger"], ledger)
    marker.update({"active": False, "consumed": True, "consumed_at_utc": now_utc(), "active_approval_after_completion": 0}); write_json(paths["marker"], marker); return ledger
