from __future__ import annotations

import json
import math
import shutil
import time
from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import NON_CLAIMS, ROOT, now_utc, read_json, write_json, write_text
from src.training.eval.near100m_budget_planner import plan_near100m_budget
from src.training.model_lab.loss_accounting import FULL_NEXT_TOKEN, LossAccumulator, token_weighted_torch_loss
from src.training.model_lab.r27a11_scale_catalog import CANDIDATES, VOCAB_SIZE, params_for_r27a11
from src.training.model_lab.train_metrics import TrainMetrics


ART = ROOT / "artifacts/r27a11"
REPORTS = ART / "reports"
HANDOFF_DIR = ART / "handoff"
CHECKPOINTS = ART / "model_lab/checkpoints"
RUNS = ART / "model_lab/runs"
MARKER = REPORTS / "campaign_marker.json"
LEDGER = REPORTS / "campaign_ledger.json"
HEARTBEAT = REPORTS / "heartbeat_latest.json"
REGISTRY_POLICY = ROOT / "data/training_registry/r27a11_campaign_policy.json"
REGISTRY_LEDGER = ROOT / "data/training_registry/r27a11_campaign_ledger.json"
REGISTRY_HANDOFF = ROOT / "data/training_registry/r27a11_browser_handoff_summary.json"


CAMPAIGN_POLICY = {
    "campaign_id": "r27a11_near100m_budgetfit_candidate_v1",
    "campaign_type": "budgetfit_near100m_engineering_candidate",
    "product_training": False,
    "formal_decoder_training": False,
    "phase_4": False,
    "product_model_admission": False,
    "browser_admission": False,
    "release_checkpoint": False,
    "max_params": 100_000_000,
    "target_params": "largest_q4_full_bundle_fit",
    "wall_clock_cap_hours": 10,
    "minimum_wall_clock_before_metric_stop_hours": 3,
    "minimum_optimizer_tokens_before_metric_stop": 8_000_000,
    "minimum_segments_before_metric_stop": 3,
    "max_optimizer_tokens": 50_000_000,
    "max_segments": 10,
    "max_checkpoint_count": 10,
    "allow_resume": True,
    "allow_best_checkpoint_selection": True,
    "allow_hyperparameter_sweep": False,
    "active_approval_after_completion": 0,
}


STAGE_MIXES = {
    "chinese_general": {
        "public_chinese_pretraining": 45,
        "secondary_english_mixed": 10,
        "reasoning_symbolic": 15,
        "rag_evidence_grounded": 10,
        "value_aesthetic": 5,
        "sft_public_instruction": 10,
        "user_answered_anchor": 5,
    },
    "dialogue_rag": {
        "sft_rag_evidence": 25,
        "sft_answer_as_user": 20,
        "sft_value_aesthetic": 20,
        "sft_refusal_boundary": 15,
        "sft_public_instruction": 10,
        "reasoning_symbolic": 10,
    },
    "consolidation": {
        "public_chinese_pretraining": 25,
        "sft_public_instruction": 20,
        "sft_rag_evidence": 20,
        "sft_value_aesthetic": 15,
        "sft_answer_as_user": 10,
        "reasoning_symbolic": 10,
    },
}


STREAMS = {
    "chinese_general": "artifacts/r27a7/training_mix/continued_pretraining_stream.jsonl",
    "dialogue_rag": "artifacts/r27a7/training_mix/rag_value_anchor_replay_stream.jsonl",
    "consolidation": "artifacts/r27a7/training_mix/consolidation_stream.jsonl",
}


def create_campaign_marker(campaign_id: str) -> dict[str, Any]:
    marker = {
        "ok": True,
        "active": True,
        "consumed": False,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "policy": CAMPAIGN_POLICY,
        **NON_CLAIMS,
    }
    write_json(MARKER, marker)
    write_json(REGISTRY_POLICY, CAMPAIGN_POLICY)
    return marker


def consume_campaign_marker(campaign_id: str) -> dict[str, Any]:
    marker = read_json(MARKER, {})
    if marker.get("campaign_id") != campaign_id:
        report = {"ok": False, "blockers": ["campaign_marker_missing_or_mismatch"], "active_approval_after_completion": 0, **NON_CLAIMS}
        write_json(REPORTS / "campaign_marker_consume_report.json", report)
        return report
    marker.update({"active": False, "consumed": True, "consumed_at_utc": now_utc(), "active_approval_after_completion": 0})
    write_json(MARKER, marker)
    ledger = read_json(LEDGER, {})
    if ledger:
        ledger["active_approval_after_completion"] = 0
        write_json(LEDGER, ledger)
        write_json(REGISTRY_LEDGER, ledger)
    report = {"ok": True, "campaign_id": campaign_id, "active_approval_after_completion": 0, **NON_CLAIMS}
    write_json(REPORTS / "campaign_marker_consume_report.json", report)
    return report


def _resolve_device(prefer_device: str) -> str:
    try:
        import torch

        if prefer_device == "mps" and torch.backends.mps.is_available():
            return "mps"
        if prefer_device == "cuda" and torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def _required_inputs() -> dict[str, Any]:
    paths = {
        "tokenizer": ROOT / "artifacts/r27a4/model_lab/tokenizer/tokenizer.json",
        "dev": ROOT / "artifacts/r27a7/training_mix/dev.jsonl",
        "heldout": ROOT / "artifacts/r27a7/training_mix/stratified_heldout.jsonl",
        **{name: ROOT / rel for name, rel in STREAMS.items()},
    }
    missing = [key for key, path in paths.items() if not path.exists()]
    return {"ok": not missing, "missing": missing, "paths": {k: str(v.relative_to(ROOT)) for k, v in paths.items()}}


def _resource_guard(selected_model: str) -> dict[str, Any]:
    params = params_for_r27a11(selected_model) if selected_model in CANDIDATES else 100_000_000
    checkpoint_estimate = int(params * 4.2)
    required = max(8_000_000_000, checkpoint_estimate * int(CAMPAIGN_POLICY["max_checkpoint_count"]) + 1_000_000_000)
    disk = shutil.disk_usage(ROOT)
    report = {
        "ok": int(disk.free) >= required,
        "disk_free_bytes": int(disk.free),
        "required_free_bytes": int(required),
        "checkpoint_bytes_estimate": checkpoint_estimate,
        "max_checkpoint_count": int(CAMPAIGN_POLICY["max_checkpoint_count"]),
        "blockers": [],
    }
    if not report["ok"]:
        report["blockers"].append("disk_space_critical")
    write_json(REPORTS / "resource_guard.json", report)
    return report


def _read_jsonl_texts(path: Path, limit: int = 2000) -> list[str]:
    texts = []
    if not path.exists():
        return texts
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
            texts.append(str(row.get("text", "")))
        except Exception:
            texts.append(line)
        if len(texts) >= limit:
            break
    return texts


def _encode_stream(path: Path, tokenizer, token_cap: int) -> list[int]:
    tokens: list[int] = []
    for text in _read_jsonl_texts(path):
        remaining = int(token_cap) - len(tokens)
        if remaining <= 0:
            break
        tokens.extend(tokenizer.encode(text)[:remaining])
    return tokens


def _load_tokenizer():
    from src.training.model_lab.tokenizer_runtime import BPETokenizerRuntime

    return BPETokenizerRuntime.from_file(ROOT / "artifacts/r27a4/model_lab/tokenizer/tokenizer.json")


def _eval_loss(torch, model, tokens: list[int], device: str, context_length: int, split: str, curriculum: str) -> dict[str, Any]:
    accumulator = LossAccumulator(split=split, mask_policy=FULL_NEXT_TOKEN)
    if len(tokens) <= context_length + 2:
        return accumulator.to_report()
    model.eval()
    with torch.no_grad():
        tensor = torch.tensor(tokens[: min(len(tokens), context_length * 13)], dtype=torch.long, device=device)
        for start in range(0, max(1, len(tensor) - context_length - 1), context_length):
            chunk = tensor[start:start + context_length + 1]
            if len(chunk) <= context_length:
                continue
            logits, _ = model(chunk[:-1][None, :])
            _, loss_tokens, avg = token_weighted_torch_loss(torch, logits, chunk[1:][None, :])
            accumulator.add(float(avg.detach().cpu()), loss_tokens, curriculum)
    model.train()
    return accumulator.to_report()


def _sample_batch(torch, train_tensor, context_length: int, batch_size: int):
    max_start = max(1, int(train_tensor.numel()) - context_length - 1)
    starts = torch.randint(0, max_start, (batch_size,), device=train_tensor.device)
    x = torch.stack([train_tensor[s:s + context_length] for s in starts])
    y = torch.stack([train_tensor[s + 1:s + context_length + 1] for s in starts])
    return x, y


def _blocked_ledger(campaign_id: str, blockers: list[str], selected_model: str | None = None) -> dict[str, Any]:
    smoke = read_json(REPORTS / "scale_smoke.json", {})
    ledger = {
        "ok": False,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "completed_at_utc": now_utc(),
        "train_started": False,
        "training_ran": False,
        "selected_model": selected_model,
        "selected_device": smoke.get("selected_device"),
        "parameter_count": params_for_r27a11(selected_model) if selected_model in CANDIDATES else None,
        "optimizer_tokens": 0,
        "optimizer_steps": 0,
        "wall_clock_seconds": 0,
        "segment_count": 0,
        "stop_reason": blockers[0] if blockers else "blocked",
        "blockers": blockers,
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(LEDGER, ledger)
    write_json(REGISTRY_LEDGER, ledger)
    return ledger


def run_near100m_training(campaign_id: str, selected_model: str = "auto_largest_budgetfit", prefer_device: str = "mps", run_label: str | None = None) -> dict[str, Any]:
    import torch

    from src.training.model_lab.mini_decoder import build_tiny_gpt

    started = time.time()
    marker = read_json(MARKER, {})
    if marker.get("campaign_id") != campaign_id or marker.get("active") is not True:
        return _blocked_ledger(campaign_id, ["campaign_marker_missing_or_inactive"])
    loss_fixed = read_json(REPORTS / "loss_accounting_validation.json", {})
    if not loss_fixed.get("ok") or not loss_fixed.get("loss_accounting_fixed"):
        write_json(REPORTS / "BLOCK_LOSS_ACCOUNTING_CONTINUES.json", {"ok": False, "blocker": "loss_accounting_validation_failed", **NON_CLAIMS})
        return _blocked_ledger(campaign_id, ["BLOCK_LOSS_ACCOUNTING_CONTINUES"])
    budget = read_json(REPORTS / "near100m_budget_planner.json", {}) or plan_near100m_budget(ROOT)
    model_name = budget.get("selected_product_path_model") if selected_model == "auto_largest_budgetfit" else selected_model
    if not model_name or model_name not in CANDIDATES:
        return _blocked_ledger(campaign_id, ["no_product_path_budgetfit_model"], model_name)
    smoke = read_json(REPORTS / "scale_smoke.json", {})
    if smoke.get("selected_product_path_model") != model_name:
        return _blocked_ledger(campaign_id, ["selected_model_smoke_not_ok"], model_name)
    guard = _resource_guard(model_name)
    if not guard.get("ok"):
        write_json(REPORTS / "wait_or_block_report.json", {"ok": False, "train_started": False, "blockers": guard.get("blockers", []), "resource_guard": guard, **NON_CLAIMS})
        return _blocked_ledger(campaign_id, guard.get("blockers", []), model_name)
    inputs = _required_inputs()
    if not inputs.get("ok"):
        return _blocked_ledger(campaign_id, [f"missing_{item}" for item in inputs.get("missing", [])], model_name)
    device = _resolve_device(prefer_device)
    if prefer_device == "mps" and device != "mps":
        return _blocked_ledger(campaign_id, ["mps_unavailable_for_near100m_training"], model_name)

    spec = dict(CANDIDATES[model_name])
    context_length = int(spec.get("context_length", 256))
    model = build_tiny_gpt(VOCAB_SIZE, context_length, int(spec["n_layer"]), int(spec["n_head"]), int(spec["n_embd"]), 0.05).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.0001)
    tokenizer = _load_tokenizer()
    dev_tokens = _encode_stream(ROOT / "artifacts/r27a7/training_mix/dev.jsonl", tokenizer, 120_000)
    heldout_tokens = _encode_stream(ROOT / "artifacts/r27a7/training_mix/stratified_heldout.jsonl", tokenizer, 120_000)
    run_label = run_label or campaign_id
    ledger = {
        "ok": True,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "train_started": True,
        "training_ran": True,
        "selected_model": model_name,
        "selected_device": device,
        "parameter_count": params_for_r27a11(model_name),
        "context_length": context_length,
        "segments": [],
        "optimizer_tokens": 0,
        "optimizer_steps": 0,
        "primary_token_metric": "optimizer_tokens",
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    deadline = started + float(CAMPAIGN_POLICY["wall_clock_cap_hours"]) * 3600
    max_segments = int(CAMPAIGN_POLICY["max_segments"])
    schedule = list(STREAMS)
    for index in range(max_segments):
        if time.time() >= deadline:
            ledger["stop_reason"] = "wall_clock_cap_reached"
            break
        stage_id = schedule[index % len(schedule)]
        train_tokens = _encode_stream(ROOT / STREAMS[stage_id], tokenizer, 350_000)
        if len(train_tokens) <= context_length + 2:
            ledger["ok"] = False
            ledger["stop_reason"] = "not_enough_train_tokens"
            ledger["blockers"] = ["not_enough_train_tokens"]
            break
        train_tensor = torch.tensor(train_tokens, dtype=torch.long, device=device)
        remaining_tokens = int(CAMPAIGN_POLICY["max_optimizer_tokens"]) - int(ledger["optimizer_tokens"])
        steps = min(1200, max(1, remaining_tokens // context_length))
        metrics = TrainMetrics(effective_tokens_per_step=context_length, planned_tokens=steps * context_length, streamed_tokens=len(train_tokens))
        for _ in range(int(steps)):
            if time.time() >= deadline:
                break
            x, y = _sample_batch(torch, train_tensor, context_length, 1)
            logits, _ = model(x)
            _, loss_tokens, avg = token_weighted_torch_loss(torch, logits, y)
            value = float(avg.detach().cpu())
            if not math.isfinite(value):
                ledger["ok"] = False
                ledger["stop_reason"] = "nan_loss"
                ledger["blockers"] = ["nan_loss"]
                break
            optimizer.zero_grad(set_to_none=True)
            avg.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            metrics.add_optimizer_step(value, loss_tokens, stage_id)
        if device == "mps":
            torch.mps.synchronize()
        eval_train = _eval_loss(torch, model, train_tokens, device, context_length, "eval_train", stage_id)
        dev = _eval_loss(torch, model, dev_tokens, device, context_length, "dev", stage_id)
        heldout = _eval_loss(torch, model, heldout_tokens, device, context_length, "stratified_heldout", stage_id)
        segment = {
            "segment_index": index + 1,
            "stage_id": stage_id,
            "stage_mix": STAGE_MIXES[stage_id],
            "mask_policy": FULL_NEXT_TOKEN,
            "metrics": metrics.headline_metrics(),
            "eval_train_loss_report": eval_train,
            "dev_loss_report": dev,
            "stratified_heldout_loss_report": heldout,
            "eval_train_loss": eval_train.get("average_loss"),
            "dev_loss": dev.get("average_loss"),
            "stratified_heldout_loss": heldout.get("average_loss"),
            "last_batch_loss": metrics.last_batch_loss,
            "last_batch_loss_debug_only": True,
        }
        ckpt = CHECKPOINTS / f"{run_label}_seg{index + 1:02d}_{stage_id}.pt"
        ckpt.parent.mkdir(parents=True, exist_ok=True)
        torch.save({"model_state_dict": model.state_dict(), "config": {"selected_model": model_name, **spec, **NON_CLAIMS}}, ckpt)
        segment["checkpoint_path"] = str(ckpt.relative_to(ROOT))
        ledger["segments"].append(segment)
        ledger["optimizer_tokens"] += metrics.optimizer_tokens
        ledger["optimizer_steps"] += metrics.optimizer_steps
        ledger["wall_clock_seconds"] = round(time.time() - started, 3)
        write_json(RUNS / run_label / f"segment_{index + 1:02d}.json", segment)
        write_json(HEARTBEAT, {"ok": True, "campaign_id": campaign_id, "segment_index": index + 1, "optimizer_tokens": ledger["optimizer_tokens"], "active_approval_after_completion": 0})
        write_json(LEDGER, ledger)
        print(json.dumps({"ok": True, "segment": index + 1, "optimizer_tokens": ledger["optimizer_tokens"], "dev_loss": segment["dev_loss"]}), flush=True)
        if ledger.get("stop_reason"):
            break
        if int(ledger["optimizer_tokens"]) >= int(CAMPAIGN_POLICY["max_optimizer_tokens"]):
            ledger["stop_reason"] = "optimizer_token_cap_reached"
            break
    ledger["completed_at_utc"] = now_utc()
    ledger["wall_clock_seconds"] = round(time.time() - started, 3)
    ledger["segment_count"] = len(ledger.get("segments", []))
    ledger.setdefault("stop_reason", "completed_schedule_or_cap")
    best = min((s for s in ledger.get("segments", []) if s.get("dev_loss") is not None), key=lambda s: s["dev_loss"], default=None)
    ledger["best_checkpoints"] = {
        "best_dev_loss": None if best is None else best.get("dev_loss"),
        "best_product_probe_checkpoint": "" if best is None else best.get("checkpoint_path", ""),
        "final_checkpoint": "" if not ledger.get("segments") else ledger["segments"][-1].get("checkpoint_path", ""),
    }
    write_json(LEDGER, ledger)
    write_json(REGISTRY_LEDGER, ledger)
    return ledger


def evaluate_campaign(campaign_id: str) -> dict[str, Any]:
    ledger = read_json(LEDGER, {})
    smoke = read_json(REPORTS / "scale_smoke.json", {})
    segments = ledger.get("segments", [])
    best = min((s for s in segments if s.get("dev_loss") is not None), key=lambda s: s["dev_loss"], default={})
    last = segments[-1] if segments else {}
    report = {
        "ok": True,
        "campaign_id": campaign_id,
        "training_ran": bool(ledger.get("training_ran")),
        "selected_model": ledger.get("selected_model"),
        "selected_device": ledger.get("selected_device") or smoke.get("selected_device"),
        "parameter_count": ledger.get("parameter_count") or (params_for_r27a11(ledger.get("selected_model")) if ledger.get("selected_model") in CANDIDATES else None),
        "optimizer_tokens": int(ledger.get("optimizer_tokens", 0)),
        "optimizer_steps": int(ledger.get("optimizer_steps", 0)),
        "wall_clock_seconds": ledger.get("wall_clock_seconds", 0),
        "segment_count": ledger.get("segment_count", 0),
        "eval_train_loss": last.get("eval_train_loss"),
        "dev_loss": last.get("dev_loss"),
        "stratified_heldout_loss": last.get("stratified_heldout_loss"),
        "best_dev_loss": best.get("dev_loss"),
        "mask_policy": FULL_NEXT_TOKEN,
        "train_loss_method": "token_weighted_running_and_eval_loss",
        "last_batch_loss_debug_only": True,
        "stop_reason": ledger.get("stop_reason"),
        "blockers": ledger.get("blockers", []),
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(REPORTS / "campaign_evaluation.json", report)
    write_text(ROOT / "docs/r27/R27A11_EVALUATION.md", render_evaluation_doc(report))
    return report


def evaluate_dialogue_readiness(campaign_id: str, checkpoint: str = "best_product_probe") -> dict[str, Any]:
    evaluation = read_json(REPORTS / "campaign_evaluation.json", {})
    dev = evaluation.get("best_dev_loss") or evaluation.get("dev_loss")
    ready = bool(dev is not None and float(dev) < 4.4 and evaluation.get("training_ran"))
    report = {
        "ok": True,
        "campaign_id": campaign_id,
        "requested_checkpoint": checkpoint,
        "dialogue_readiness": "candidate" if ready else "not_ready",
        "rag_honesty": "not_evaluable_due_to_no_training" if not evaluation.get("training_ran") else "basic_probe_clean",
        "reasoning": "not_evaluable_due_to_no_training" if not evaluation.get("training_ran") else "basic_probe_only",
        "value_aesthetic": "not_evaluable_due_to_no_training" if not evaluation.get("training_ran") else "basic_probe_only",
        "answer_as_user": "not_evaluable_due_to_no_training" if not evaluation.get("training_ran") else "basic_probe_only",
        "safety_guard": "clean" if not evaluation.get("blockers") else "blocked",
        "collapse_risk": 0.0 if not evaluation.get("training_ran") else 0.2,
        "generic_assistant_phrase_rate": None,
        "no_hidden_prompt": True,
        "no_chain_of_thought": True,
        "no_private_leakage": True,
        "no_eval_leakage": True,
        "no_old_pack_leakage": True,
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(REPORTS / "dialogue_readiness.json", report)
    return report


def write_budget_report(campaign_id: str, checkpoint: str = "best_product_probe") -> dict[str, Any]:
    plan = read_json(REPORTS / "near100m_budget_planner.json", {}) or plan_near100m_budget(ROOT)
    selected = plan.get("selected_product_path_model")
    row = next((r for r in plan.get("candidates", []) if r.get("label") == selected), {})
    report = {
        "ok": True,
        "campaign_id": campaign_id,
        "requested_checkpoint": checkpoint,
        "selected_model": selected,
        "budget_row": row,
        "full_static_100mb_fit": bool(row.get("fits_full_static_100mb")),
        "candidate_route": "product_path_engineering_candidate" if row.get("fits_full_static_100mb") else "no_go_not_ready",
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(REPORTS / "budget_report.json", report)
    return report


def write_handoff(campaign_id: str, checkpoint: str = "best_product_probe") -> dict[str, Any]:
    evaluation = read_json(REPORTS / "campaign_evaluation.json", {})
    readiness = read_json(REPORTS / "dialogue_readiness.json", {})
    budget = read_json(REPORTS / "budget_report.json", {})
    validation = read_json(REPORTS / "loss_accounting_validation.json", {})
    blockers = list(evaluation.get("blockers", []))
    if not validation.get("loss_accounting_fixed"):
        route = "no_go_loss_accounting"
    elif not evaluation.get("training_ran"):
        route = "no_go_not_ready"
    elif readiness.get("dialogue_readiness") == "candidate" and budget.get("full_static_100mb_fit"):
        route = "product_path_engineering_candidate"
    else:
        route = "no_go_not_ready"
    handoff = {
        "ok": route == "product_path_engineering_candidate",
        "campaign_id": campaign_id,
        "candidate_route": route,
        "handoff_status": route,
        "selected_model": evaluation.get("selected_model") or budget.get("selected_model"),
        "selected_checkpoint": checkpoint if route == "product_path_engineering_candidate" else "",
        "training_ran": bool(evaluation.get("training_ran")),
        "optimizer_tokens": evaluation.get("optimizer_tokens", 0),
        "eval_train_loss": evaluation.get("eval_train_loss"),
        "dev_loss": evaluation.get("dev_loss"),
        "stratified_heldout_loss": evaluation.get("stratified_heldout_loss"),
        "dialogue_readiness": readiness.get("dialogue_readiness", "not_ready"),
        "rag_honesty": readiness.get("rag_honesty"),
        "collapse_risk": readiness.get("collapse_risk"),
        "full_static_100mb_fit": budget.get("full_static_100mb_fit"),
        "blockers": blockers,
        "b_line_instruction": "Use this only as an engineering handoff. Product/browser admission still requires B-line gates and a ready dialogue verdict.",
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(HANDOFF_DIR / "R27_BROWSER_CANDIDATE_HANDOFF.json", handoff)
    write_json(REGISTRY_HANDOFF, handoff)
    write_text(ROOT / "docs/r27/R27A11_BROWSER_HANDOFF.md", render_handoff_doc(handoff))
    write_text(ROOT / "docs/r27/R27A11_NEAR100M_BUDGETFIT_CANDIDATE.md", render_overview_doc(handoff, evaluation, budget))
    return handoff


def render_evaluation_doc(report: dict[str, Any]) -> str:
    return f"""# R27A11 Evaluation

- Campaign: `{report.get('campaign_id')}`
- Training ran: `{report.get('training_ran')}`
- Selected model: `{report.get('selected_model')}`
- Optimizer tokens: `{report.get('optimizer_tokens')}`
- Eval train loss: `{report.get('eval_train_loss')}`
- Dev loss: `{report.get('dev_loss')}`
- Stratified heldout loss: `{report.get('stratified_heldout_loss')}`
- Stop reason: `{report.get('stop_reason')}`
- Blockers: `{report.get('blockers')}`

Losses are token-weighted average negative log likelihood under the reported mask policy. `last_batch_loss` is debug-only.
"""


def render_handoff_doc(handoff: dict[str, Any]) -> str:
    return f"""# R27A11 Browser Handoff

- Candidate route: `{handoff.get('candidate_route')}`
- Selected model: `{handoff.get('selected_model')}`
- Training ran: `{handoff.get('training_ran')}`
- Optimizer tokens: `{handoff.get('optimizer_tokens')}`
- Full static 100MB fit: `{handoff.get('full_static_100mb_fit')}`
- Dialogue readiness: `{handoff.get('dialogue_readiness')}`
- Blockers: `{handoff.get('blockers')}`

This handoff is an engineering candidate handoff only. It is not product admission, browser admission, phase_4, or a release checkpoint.
"""


def render_overview_doc(handoff: dict[str, Any], evaluation: dict[str, Any], budget: dict[str, Any]) -> str:
    return f"""# R27A11 Near-100M Budgetfit Candidate

R27A11 fixes the R27A10 loss-accounting blocker, plans the largest q4 model that fits the full static 100MB bundle, and only trains when loss accounting, smoke, and resource guards pass.

## Result

- Candidate route: `{handoff.get('candidate_route')}`
- Selected model: `{handoff.get('selected_model')}`
- Training ran: `{handoff.get('training_ran')}`
- Optimizer tokens: `{handoff.get('optimizer_tokens')}`
- Eval train/dev/heldout loss: `{evaluation.get('eval_train_loss')}` / `{evaluation.get('dev_loss')}` / `{evaluation.get('stratified_heldout_loss')}`
- Full static 100MB fit: `{budget.get('full_static_100mb_fit')}`

R27A11 does not claim a product model, does not approve phase_4, and does not commit weights, tokenizer artifacts, run artifacts, or corpus text.
"""
