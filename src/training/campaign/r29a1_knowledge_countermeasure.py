from __future__ import annotations

import hashlib
import math
import os
import random
import shutil
import time
from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import NON_CLAIMS, ROOT, now_utc, read_json, write_json
from src.training.campaign.r28a13_controller import _generate, _load_model, _load_tokenizer, _resolve_device, _resolve_tokenizer_path
from src.training.campaign.r29a0_masked_debug import (
    _dataset_tensors,
    _evaluate_masked,
    encode_masked_dataset,
)
from src.training.model_lab.loss_accounting import ASSISTANT_RESPONSE_ONLY, LossAccumulator, token_weighted_torch_loss
from src.training.model_lab.r27a11_scale_catalog import params_for_r27a11


CAMPAIGN_ID = "r29a1_96m_knowledge_countermeasure_v1"
SEED = 2911
ART = ROOT / "artifacts/r29a1"
REPORTS = ART / "reports"
CHECKPOINTS = ART / "model_lab/checkpoints"
RUNS = ART / "model_lab/runs"
MIX = ART / "training_mix"
MARKER = REPORTS / "campaign_marker.json"
LEDGER = REPORTS / "campaign_ledger.json"
HEARTBEAT = REPORTS / "heartbeat_latest.json"

TONE_PROFILE = {
    "name": "clear_evidence_action_zh",
    "language": "zh-CN",
    "answer_order": ["结论", "依据与不确定性", "分级对策", "代价或边界"],
    "traits": ["direct", "evidence_honest", "non_customer_service", "actionable", "calibrated"],
    "prohibitions": ["空泛鼓励", "伪确定", "流程套话", "无依据的权威断言"],
}

CAMPAIGN_POLICY = {
    "campaign_id": CAMPAIGN_ID,
    "campaign_type": "controlled_knowledge_countermeasure_long_horizon",
    "selected_model": "new_96m",
    "loss_mask_policy": ASSISTANT_RESPONSE_ONLY,
    "seed": SEED,
    "learning_rate": 4e-6,
    "max_optimizer_tokens": 400_000,
    "evaluation_interval_optimizer_tokens": 50_000,
    "max_segments": 8,
    "max_checkpoint_count": 3,
    "wall_clock_cap_hours": 4,
    "batch_size": 2,
    "require_mps": True,
    "stop_on_heldout_regression": True,
    "stop_on_probe_regression": True,
    "stop_after_two_non_improving_segments": True,
    "allow_hyperparameter_sweep": False,
    "allow_remote_model_weights": False,
    "allow_external_llm_api": False,
    "allow_doubao": False,
    "allow_weight_commit": False,
    "allow_tokenizer_artifact_commit": False,
    "allow_raw_corpus_commit": False,
    "allow_clean_corpus_commit": False,
    "allow_processed_corpus_commit": False,
    "product_training": False,
    "formal_decoder_training": False,
    "phase_4": False,
    "product_model_admission": False,
    "browser_admission": False,
    "release_checkpoint": False,
    "active_approval_after_completion": 0,
}

# The cards intentionally contain project-authored, widely applicable reasoning patterns,
# not scraped prose or claims copied from an external source. Source URLs are provenance
# references only; the runtime corpus remains local and ignored under artifacts/.
TRAIN_CARDS = [
    ("correlation", "相关性只能说明变量一起变化，不能单独证明因果。", "先找可能的共同原因，再比较时间顺序和替代解释。", "https://www.openstax.org/"),
    ("sampling", "样本是否能代表总体，取决于抽样方式和覆盖范围，不只取决于样本数量。", "检查抽样框、缺失群体和选择偏差；必要时缩小结论范围。", "https://www.openstax.org/"),
    ("measurement", "测量值包含误差；小差异未必代表真实差异。", "报告测量方法与不确定性，优先复测或看误差区间。", "https://www.openstax.org/"),
    ("base_rate", "判断个案前要看基线率；忽略基线会高估罕见事件的意义。", "先估计基线，再把个案证据和基线一起更新。", "https://www.openstax.org/"),
    ("source_conflict", "来源冲突时，不能靠语气决定真假。", "按来源独立性、时间、方法和利益关系逐项核对，再保留未决部分。", "https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use"),
    ("versioning", "数据或文档的结论依赖版本和日期；旧结论可能不适用于当前。", "记录版本、检索日期和变更；关键决定前重新核验。", "https://ourworldindata.org/faqs"),
    ("risk_matrix", "风险不是只看概率，也要看影响和可逆性。", "把高影响且不可逆的事项前置，先做低成本的风险削减。", "https://www.openstax.org/"),
    ("experiment", "一个可检验的假设需要明确结果会如何改变判断。", "定义对照、指标和停止条件；结果不清楚时不要把试验当证明。", "https://www.openstax.org/"),
    ("tradeoff", "资源有限时，优先级是在目标之间做可解释的取舍。", "列出目标、约束和机会成本，先推进高价值且可逆的动作。", "https://ourworldindata.org/faqs"),
    ("feedback", "反馈有延迟时，马上根据噪声大幅调整常常会更差。", "设定观察窗口和阈值；区分短期波动与持续变化。", "https://www.openstax.org/"),
    ("security_boundary", "敏感信息一旦扩散很难完全收回。", "最小化收集和共享，先移除凭据与个人标识，再决定是否传播。", "https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use"),
    ("decision_log", "可复盘的决定要保留当时依据，而不是事后改写理由。", "记录假设、证据、选择和复查日期；新证据出现时更新而非掩盖。", "https://ourworldindata.org/faqs"),
]

HELDOUT_CARDS = [
    ("proxy", "代理指标便于测量，但不等于真正目标。", "先检查代理是否偏离目标，再配合直接观察或多个指标。"),
    ("confounding", "同时变化的因素可能让两个变量看起来有关。", "列出混杂因素，寻找对照或分层比较，不能排除时降低结论强度。"),
    ("reversibility", "不确定下的决策要区分可逆与不可逆后果。", "优先做可逆试点，为不可逆决定设更高证据门槛。"),
    ("distribution", "平均值会掩盖不同群体的差异。", "拆分关键群体和极端值，再决定措施是否需要差异化。"),
]


def _stable_index(key: str, modulo: int) -> int:
    return int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:10], 16) % modulo


def _row(card: tuple[str, str, str, str], index: int, split: str) -> dict[str, Any]:
    key, fact, action, source_url = card
    questions = [
        f"面对{key}这类问题，应该怎样判断和行动？",
        f"请给一个关于{key}的知识解释，并给出可执行对策。",
        f"团队在{key}上意见不一，先做什么？",
    ]
    question = questions[_stable_index(f"{key}:{index}:{split}", len(questions))]
    uncertainty = "现有信息不足时，只能给条件性判断，不能把推测说成事实。"
    target = f"结论：先把{key}当成需要核查的判断问题。依据：{fact}{uncertainty}对策：1. {action} 2. 记录依据和待验证项。边界：证据不足时先降级结论，不用确定语气替代证据。"
    return {
        "id": f"r29a1_{split}_{key}_{index:03d}",
        "campaign_id": CAMPAIGN_ID,
        "category": "knowledge_countermeasure",
        "input": question,
        "target": target,
        "length_target": "structured_brief",
        "evidence_policy": "state evidence, uncertainty, action, and boundary",
        "answer_mode": "clear_evidence_action_zh",
        "source_card": {"source_id": f"project_authored_{key}", "source_url": source_url, "source_type": "project_authored_pattern", "raw_source_ingested": False},
        "source_policy": {"raw_private_data_used": False, "raw_external_text_used": False, "eval_prompt_used": split == "heldout", "processed_corpus_committed": False},
    }


def build_mix(root: Path = ROOT, *, write_artifacts: bool = True) -> dict[str, Any]:
    root = Path(root)
    rows = {"train": [], "dev": [], "heldout": []}
    for index in range(10):
        for card in TRAIN_CARDS:
            split = "dev" if _stable_index(f"{card[0]}:{index}", 7) == 0 else "train"
            rows[split].append(_row(card, index, split))
    for index in range(8):
        for key, fact, action in HELDOUT_CARDS:
            rows["heldout"].append(_row((key, fact, action, "project-authored-heldout"), index, "heldout"))
    source_ids = {split: {r["source_card"]["source_id"] for r in items} for split, items in rows.items()}
    report = {
        "ok": bool(rows["train"] and rows["dev"] and rows["heldout"]),
        "campaign_id": CAMPAIGN_ID,
        "counts": {split: len(items) for split, items in rows.items()},
        "split_source_overlap": sorted((source_ids["train"] | source_ids["dev"]) & source_ids["heldout"]),
        "tone_profile": TONE_PROFILE,
        "raw_external_text_ingested": False,
        "processed_corpus_committed": False,
    }
    report["ok"] = report["ok"] and not report["split_source_overlap"]
    if write_artifacts:
        output = root / "artifacts/r29a1/training_mix"
        output.mkdir(parents=True, exist_ok=True)
        for split, items in rows.items():
            path = output / f"{split}.jsonl"
            path.write_text("".join(f"{__import__('json').dumps(item, ensure_ascii=False, sort_keys=True)}\n" for item in items), encoding="utf-8")
        write_json(root / "artifacts/r29a1/reports/training_mix_report.json", report)
    return report


def _read_rows(path: Path) -> list[dict[str, Any]]:
    import json
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _display(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def _resource_guard(selected_model: str) -> dict[str, Any]:
    estimate = int(params_for_r27a11(selected_model) * 4.2)
    required = estimate * int(CAMPAIGN_POLICY["max_checkpoint_count"]) + 8_000_000_000
    free = int(shutil.disk_usage(ROOT.parent).free)
    report = {"ok": free >= required, "disk_free_bytes": free, "required_free_bytes": required, "checkpoint_bytes_estimate": estimate, "blockers": []}
    if not report["ok"]:
        report["blockers"].append("disk_space_critical")
    write_json(REPORTS / "resource_guard.json", report)
    return report


def resolve_r29a0_checkpoint() -> dict[str, Any]:
    candidates = [ROOT, ROOT.parent / "another_brain_train_r29a0"]
    for candidate_root in candidates:
        ledger = read_json(candidate_root / "artifacts/r29a0/reports/campaign_ledger.json", {})
        checkpoint = ledger.get("best_checkpoint", "")
        path = candidate_root / checkpoint if checkpoint else None
        if ledger.get("ok") is True and path and path.exists():
            return {"ok": True, "checkpoint_path": str(path), "selected_model": ledger.get("selected_model", "new_96m"), "source_campaign": ledger.get("campaign_id")}
    return {"ok": False, "blockers": ["r29a0_best_checkpoint_unavailable"]}


def _probe_model(torch, model, tokenizer, device: str, context_length: int) -> dict[str, Any]:
    probes = []
    for key, fact, action in HELDOUT_CARDS:
        prompt = f"用户：{key}是什么意思，怎样应对？\\n类别：knowledge_countermeasure\\n长度：structured_brief\\n证据边界：说明依据和不确定性\\n回答："
        output = _generate(torch, model, tokenizer, prompt, device, context_length, max_new_tokens=96)
        evidence_hits = sum(term in output for term in ("依据", "证据", "不确定", "条件"))
        action_hits = sum(term in output for term in ("对策", "先", "检查", "记录", "比较", "试点"))
        score = 0.2 + (0.35 if evidence_hits else 0) + (0.35 if action_hits else 0) + (0.1 if len(output) >= 24 else 0)
        probes.append({"id": key, "prompt": prompt, "output": output, "score": round(score, 3), "evidence_hits": evidence_hits, "action_hits": action_hits})
    leaks = [item["id"] for item in probes if item["output"].startswith(("用户：", "用户:", "回答：", "回答:"))]
    average = sum(item["score"] for item in probes) / max(1, len(probes))
    return {"probe_average_score": round(average, 4), "role_prefix_leaks": leaks, "below_threshold": [item["id"] for item in probes if item["score"] < 0.7], "probes": probes}


def create_campaign_marker(campaign_id: str = CAMPAIGN_ID) -> dict[str, Any]:
    marker = {"ok": True, "active": True, "consumed": False, "campaign_id": campaign_id, "created_at_utc": now_utc(), "approval": {"R29A1_KNOWLEDGE_COUNTERMEASURE_ALLOWED": True}, "policy": CAMPAIGN_POLICY, **NON_CLAIMS}
    write_json(MARKER, marker)
    return marker


def _consume_marker(campaign_id: str) -> None:
    marker = read_json(MARKER, {})
    if marker.get("campaign_id") == campaign_id:
        marker.update({"active": False, "consumed": True, "consumed_at_utc": now_utc(), "active_approval_after_completion": 0})
        write_json(MARKER, marker)


def _blocked(campaign_id: str, blockers: list[str]) -> dict[str, Any]:
    ledger = {"ok": False, "campaign_id": campaign_id, "train_started": False, "training_ran": False, "blockers": blockers, "stop_reason": blockers[0], "policy": CAMPAIGN_POLICY, "active_approval_after_completion": 0, **NON_CLAIMS}
    write_json(LEDGER, ledger)
    return ledger


def _prune_checkpoints(segments: list[dict[str, Any]]) -> None:
    existing = [(segment, ROOT / segment["checkpoint_path"]) for segment in segments if segment.get("checkpoint_path") and (ROOT / segment["checkpoint_path"]).exists()]
    if len(existing) <= int(CAMPAIGN_POLICY["max_checkpoint_count"]):
        return
    best = min(existing, key=lambda pair: float(pair[0].get("heldout_loss", math.inf)))
    keep = {best[1], existing[-1][1], existing[-2][1]}
    for segment, checkpoint in existing:
        if checkpoint not in keep:
            checkpoint.unlink()
            segment["checkpoint_pruned"] = True


def run_knowledge_countermeasure(campaign_id: str = CAMPAIGN_ID, *, prefer_device: str = "mps", resource_safe: bool = True) -> dict[str, Any]:
    import torch
    os.environ.setdefault("OMP_NUM_THREADS", "2")
    torch.set_num_threads(2)
    random.seed(SEED)
    torch.manual_seed(SEED)
    if read_json(MARKER, {}).get("active") is not True:
        return _blocked(campaign_id, ["campaign_marker_missing_or_inactive"])
    lineage = resolve_r29a0_checkpoint()
    if not lineage.get("ok"):
        return _blocked(campaign_id, list(lineage.get("blockers", [])))
    selected_model = str(lineage["selected_model"])
    if selected_model != CAMPAIGN_POLICY["selected_model"]:
        return _blocked(campaign_id, ["selected_model_mismatch"])
    device = _resolve_device(prefer_device)
    if CAMPAIGN_POLICY["require_mps"] and device != "mps":
        return _blocked(campaign_id, ["mps_required_but_unavailable"])
    guard = _resource_guard(selected_model)
    if resource_safe and not guard["ok"]:
        return _blocked(campaign_id, guard["blockers"])
    mix = build_mix(ROOT, write_artifacts=True)
    if not mix["ok"]:
        return _blocked(campaign_id, ["knowledge_mix_invalid"])
    train_rows, dev_rows, heldout_rows = (_read_rows(MIX / f"{split}.jsonl") for split in ("train", "dev", "heldout"))
    tokenizer_path = _resolve_tokenizer_path()
    if tokenizer_path is None:
        return _blocked(campaign_id, ["tokenizer_missing"])
    tokenizer = _load_tokenizer(tokenizer_path)
    model, spec = _load_model(torch, Path(lineage["checkpoint_path"]), selected_model, device)
    context_length = int(spec.get("context_length", 256))
    train_tensors = _dataset_tensors(torch, encode_masked_dataset(train_rows, tokenizer, context_length), device)
    dev_tensors = _dataset_tensors(torch, encode_masked_dataset(dev_rows, tokenizer, context_length), device)
    heldout_tensors = _dataset_tensors(torch, encode_masked_dataset(heldout_rows, tokenizer, context_length), device)
    batch_size = int(CAMPAIGN_POLICY["batch_size"])
    baseline = {"dev": _evaluate_masked(torch, model, dev_tensors, "knowledge_dev_baseline", batch_size), "heldout": _evaluate_masked(torch, model, heldout_tensors, "knowledge_heldout_baseline", batch_size), "probe": _probe_model(torch, model, tokenizer, device, context_length)}
    ledger: dict[str, Any] = {"ok": True, "campaign_id": campaign_id, "created_at_utc": now_utc(), "train_started": True, "training_ran": True, "selected_model": selected_model, "selected_device": device, "parameter_count": params_for_r27a11(selected_model), "context_length": context_length, "batch_size": batch_size, "learning_rate": CAMPAIGN_POLICY["learning_rate"], "seed": SEED, "mask_policy": ASSISTANT_RESPONSE_ONLY, "tone_profile": TONE_PROFILE, "resume_from": lineage, "baseline": baseline, "optimizer_tokens": 0, "optimizer_steps": 0, "segments": [], "policy": CAMPAIGN_POLICY, "active_approval_after_completion": 0, **NON_CLAIMS}
    write_json(LEDGER, ledger)
    optimizer = torch.optim.AdamW(model.parameters(), lr=float(CAMPAIGN_POLICY["learning_rate"]), weight_decay=0.01)
    inputs, targets, masks = train_tensors
    deadline = time.time() + float(CAMPAIGN_POLICY["wall_clock_cap_hours"]) * 3600
    best_heldout, best_probe, non_improving = math.inf, float(baseline["probe"]["probe_average_score"]), 0
    for segment_index in range(1, int(CAMPAIGN_POLICY["max_segments"]) + 1):
        if time.time() >= deadline or ledger["optimizer_tokens"] >= int(CAMPAIGN_POLICY["max_optimizer_tokens"]):
            break
        accumulator = LossAccumulator(split=f"knowledge_train_segment_{segment_index}", mask_policy=ASSISTANT_RESPONSE_ONLY)
        segment_tokens = segment_steps = 0
        while segment_tokens < int(CAMPAIGN_POLICY["evaluation_interval_optimizer_tokens"]) and ledger["optimizer_tokens"] + segment_tokens < int(CAMPAIGN_POLICY["max_optimizer_tokens"]) and time.time() < deadline:
            indices = torch.randint(0, int(inputs.shape[0]), (batch_size,), device=device)
            logits, _ = model(inputs[indices])
            _, loss_tokens, average = token_weighted_torch_loss(torch, logits, targets[indices], masks[indices])
            value = float(average.detach().cpu())
            if not math.isfinite(value):
                ledger.update({"ok": False, "stop_reason": "nan_loss", "blockers": ["nan_loss"]})
                break
            optimizer.zero_grad(set_to_none=True); average.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 0.7); optimizer.step()
            accumulator.add(value, loss_tokens, "assistant_response_only"); segment_tokens += int(loss_tokens); segment_steps += 1
            if segment_steps % 100 == 0:
                write_json(HEARTBEAT, {"ok": True, "campaign_id": campaign_id, "segment_index": segment_index, "segment_steps": segment_steps, "optimizer_tokens": ledger["optimizer_tokens"] + segment_tokens, "mask_policy": ASSISTANT_RESPONSE_ONLY, "active_approval_after_completion": 0})
        if device == "mps": torch.mps.synchronize()
        dev = _evaluate_masked(torch, model, dev_tensors, "knowledge_dev", batch_size)
        heldout = _evaluate_masked(torch, model, heldout_tensors, "knowledge_heldout", batch_size)
        probe = _probe_model(torch, model, tokenizer, device, context_length)
        checkpoint = CHECKPOINTS / f"{campaign_id}_seg{segment_index:02d}.pt"; checkpoint.parent.mkdir(parents=True, exist_ok=True)
        torch.save({"model_state_dict": model.state_dict(), "config": {"selected_model": selected_model, "campaign_id": campaign_id, "mask_policy": ASSISTANT_RESPONSE_ONLY, "tone_profile": TONE_PROFILE, **spec, **NON_CLAIMS}}, checkpoint)
        segment = {"segment_index": segment_index, "optimizer_tokens": segment_tokens, "optimizer_steps": segment_steps, "running_train_loss": accumulator.to_report(), "dev_loss_report": dev, "heldout_loss_report": heldout, "dev_loss": dev.get("average_loss"), "heldout_loss": heldout.get("average_loss"), "probe": probe, "checkpoint_path": _display(checkpoint), "mask_policy": ASSISTANT_RESPONSE_ONLY}
        ledger["segments"].append(segment); ledger["optimizer_tokens"] += segment_tokens; ledger["optimizer_steps"] += segment_steps; _prune_checkpoints(ledger["segments"]); write_json(RUNS / campaign_id / f"segment_{segment_index:02d}.json", segment); write_json(LEDGER, ledger)
        write_json(HEARTBEAT, {"ok": True, "campaign_id": campaign_id, "segment_index": segment_index, "optimizer_tokens": ledger["optimizer_tokens"], "heldout_loss": segment["heldout_loss"], "probe_average_score": probe["probe_average_score"], "mask_policy": ASSISTANT_RESPONSE_ONLY, "active_approval_after_completion": 0})
        improved = float(segment["heldout_loss"] or math.inf) <= best_heldout * 1.05 and float(probe["probe_average_score"]) >= best_probe - 0.05
        non_improving = 0 if improved else non_improving + 1
        if segment_index > 1 and float(segment["heldout_loss"] or math.inf) > best_heldout * 1.05:
            ledger["stop_reason"] = "heldout_regression_stop"; break
        if segment_index > 1 and float(probe["probe_average_score"]) < best_probe - 0.05:
            ledger["stop_reason"] = "probe_regression_stop"; break
        if non_improving >= 2:
            ledger["stop_reason"] = "two_non_improving_segments"; break
        best_heldout = min(best_heldout, float(segment["heldout_loss"] or math.inf)); best_probe = max(best_probe, float(probe["probe_average_score"]))
    ledger.update({"completed_at_utc": now_utc(), "segment_count": len(ledger["segments"]), "stop_reason": ledger.get("stop_reason", "optimizer_token_cap_reached" if ledger["optimizer_tokens"] >= int(CAMPAIGN_POLICY["max_optimizer_tokens"]) else "wall_clock_cap_reached")})
    best = max(ledger["segments"], key=lambda item: (float(item["probe"]["probe_average_score"]), -float(item["heldout_loss"] or math.inf)), default=None)
    ledger["best_checkpoint"] = "" if best is None else best["checkpoint_path"]
    ledger["promotion_gate"] = {"passed": bool(best and not best["probe"]["role_prefix_leaks"] and not best["probe"]["below_threshold"] and best["probe"]["probe_average_score"] >= 0.8), "required_average_probe_score": 0.8, "required_minimum_category_score": 0.7, "role_prefix_leaks": [] if best is None else best["probe"]["role_prefix_leaks"], "below_threshold": [] if best is None else best["probe"]["below_threshold"], "browser_admission": False, "release_checkpoint": False}
    write_json(LEDGER, ledger); _consume_marker(campaign_id)
    return ledger
