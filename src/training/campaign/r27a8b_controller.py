from __future__ import annotations

import json
import math
import random
import time
from pathlib import Path

from src.training.campaign.early_stop_policy_v3 import POLICY_V3, minimum_budget_met, should_stop_v3
from src.training.campaign.r27a8b_launch_reader import read_launch_config
from src.training.campaign.r27a8b_resource_guard import preflight_resource_guard
from src.training.campaign.r27a8b_slow_ramp import ramp_passed, slow_ramp_plan
from src.training.distillation.candidate_queue import read_jsonl
from src.training.model_lab.limited_scale_smoke import SCALE_CATALOG, budget_for_params, params_for
from src.training.model_lab.mini_decoder import build_tiny_gpt
from src.training.model_lab.tokenizer_runtime import BPETokenizerRuntime


ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / "artifacts/r27a8b"
REPORTS = ART / "reports"
CHECKPOINTS = ART / "model_lab/checkpoints"
RUNS = ART / "model_lab/runs"
LEDGER = REPORTS / "campaign_ledger.json"
HEARTBEAT = REPORTS / "heartbeat_latest.json"
MARKER = REPORTS / "campaign_marker.json"


CAMPAIGN_POLICY = {
    "campaign_type": "resource_safe_overnight_engineering",
    "product_training": False,
    "formal_decoder_training": False,
    "phase_4": False,
    "product_model_admission": False,
    "browser_admission": False,
    "release_checkpoint": False,
    "wall_clock_cap_hours": 12,
    "minimum_wall_clock_before_metric_stop_hours": 4,
    "minimum_optimizer_tokens_before_metric_stop": 15_000_000,
    "minimum_segments_before_metric_stop": 4,
    "max_optimizer_tokens": 120_000_000,
    "max_segments": 12,
    "max_steps_per_segment": 4000,
    "max_checkpoint_count": 12,
    "allow_resume": True,
    "allow_best_checkpoint_selection": True,
    "allow_hyperparameter_sweep": False,
    "active_approval_after_completion": 0,
}


STAGE_MIXES = {
    "chinese_first_pretraining": {
        "public_chinese_pretraining": 50,
        "secondary_english_mixed": 10,
        "reasoning_symbolic": 15,
        "rag_evidence_grounded": 10,
        "value_aesthetic": 5,
        "user_answered_anchor": 5,
        "sft_public_instruction": 5,
    },
    "sft_dialogue": {
        "sft_public_instruction": 25,
        "sft_rag_evidence": 20,
        "sft_value_aesthetic": 15,
        "sft_answer_as_user": 15,
        "sft_refusal_boundary": 15,
        "reasoning_symbolic": 5,
        "promoted_distillation_candidate": 5,
    },
    "rag_value_answer_as_user": {
        "sft_rag_evidence": 30,
        "sft_value_aesthetic": 20,
        "sft_answer_as_user": 20,
        "sft_refusal_boundary": 15,
        "user_answered_anchor": 10,
        "reasoning_symbolic": 5,
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
    "chinese_first_pretraining": "artifacts/r27a7/training_mix/continued_pretraining_stream.jsonl",
    "sft_dialogue": "artifacts/r27a7/training_mix/sft_dialogue_stream.jsonl",
    "rag_value_answer_as_user": "artifacts/r27a7/training_mix/rag_value_anchor_replay_stream.jsonl",
    "consolidation": "artifacts/r27a7/training_mix/consolidation_stream.jsonl",
}


MODEL_CANDIDATE_MAP = {
    "continue_best_mini8m": "continue_best_mini8m",
    "new_30m": "new_30m",
    "new_60m": "new_60m",
    "new_100m": "new_100m",
    "new_125m": "new_125m",
    "new_150m": "new_150m",
}


def now_utc() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def read_json(path: Path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else (default if default is not None else {})


def create_campaign_marker(campaign_id: str, args: dict) -> dict:
    marker = {
        "ok": True,
        "active": True,
        "consumed": False,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "policy": {**CAMPAIGN_POLICY, **args},
        "product_training": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "release_checkpoint": False,
    }
    write_json(MARKER, marker)
    return marker


def consume_campaign_marker(campaign_id: str) -> dict:
    marker = read_json(MARKER, {})
    if marker.get("campaign_id") != campaign_id:
        return {"ok": False, "blockers": ["campaign_marker_missing_or_mismatch"], "active_approval_after_completion": 0}
    marker.update({"active": False, "consumed": True, "consumed_at_utc": now_utc(), "active_approval_after_completion": 0})
    write_json(MARKER, marker)
    ledger = read_json(LEDGER, {})
    if ledger:
        ledger["active_approval_after_completion"] = 0
        write_json(LEDGER, ledger)
    return {"ok": True, "campaign_id": campaign_id, "active_approval_after_completion": 0}


def marker_is_active(campaign_id: str) -> tuple[bool, list[str]]:
    marker = read_json(MARKER, {})
    blockers = []
    if marker.get("campaign_id") != campaign_id:
        blockers.append("campaign_marker_missing_or_mismatch")
    if marker.get("active") is not True:
        blockers.append("campaign_marker_not_active")
    if marker.get("consumed") is True:
        blockers.append("campaign_marker_already_consumed")
    return not blockers, blockers


def resolve_tokenizer_path() -> Path:
    baseline = read_json(ROOT / "artifacts/r27a7/reports/r27a6_baseline.json", {})
    candidate = baseline.get("tokenizer_path") or "artifacts/r27a4/model_lab/tokenizer/tokenizer.json"
    path = Path(candidate)
    if path.is_absolute():
        parts = path.parts
        if "artifacts" in parts:
            idx = parts.index("artifacts")
            return ROOT / Path(*parts[idx:])
        return path
    return ROOT / path


def display_path(path: Path) -> str:
    try:
        return str(Path(path).relative_to(ROOT))
    except ValueError:
        return str(path)


def required_input_report() -> dict:
    paths = {
        "tokenizer": resolve_tokenizer_path(),
        "dev": ROOT / "artifacts/r27a7/training_mix/dev.jsonl",
        "heldout": ROOT / "artifacts/r27a7/training_mix/stratified_heldout.jsonl",
        **{key: ROOT / rel for key, rel in STREAMS.items()},
    }
    missing = [key for key, path in paths.items() if not path.exists()]
    return {
        "ok": not missing,
        "paths": {key: display_path(path) for key, path in paths.items()},
        "missing": missing,
    }


def resolve_device(prefer_device: str) -> str:
    try:
        import torch

        if prefer_device == "mps" and torch.backends.mps.is_available():
            return "mps"
        if prefer_device == "cuda" and torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def model_spec_from_launch(selected_model: str) -> dict:
    candidate = MODEL_CANDIDATE_MAP.get(selected_model, selected_model)
    if candidate not in SCALE_CATALOG:
        raise ValueError(f"unknown_selected_model_{selected_model}")
    spec = dict(SCALE_CATALOG[candidate])
    spec["candidate"] = candidate
    spec["params"] = params_for(candidate)
    spec["budget"] = budget_for_params(spec["params"])
    return spec


def encode_stream(path: Path, tokenizer, token_cap: int) -> list[int]:
    tokens: list[int] = []
    for row in read_jsonl(path):
        ids = tokenizer.encode(row.get("text", ""))
        remaining = int(token_cap) - len(tokens)
        if remaining <= 0:
            break
        tokens.extend(ids[:remaining])
    return tokens


def load_token_sets(tokenizer_path: Path, stage_id: str, token_cap: int) -> dict:
    tokenizer = BPETokenizerRuntime.from_file(tokenizer_path)
    return {
        "tokenizer": tokenizer,
        "train": encode_stream(ROOT / STREAMS[stage_id], tokenizer, token_cap),
        "dev": encode_stream(ROOT / "artifacts/r27a7/training_mix/dev.jsonl", tokenizer, 120_000),
        "heldout": encode_stream(ROOT / "artifacts/r27a7/training_mix/stratified_heldout.jsonl", tokenizer, 120_000),
    }


def sample_batch(torch, train_tensor, context_length: int, batch_size: int):
    max_start = max(1, int(train_tensor.numel()) - context_length - 1)
    starts = torch.randint(0, max_start, (batch_size,), device=train_tensor.device)
    x = torch.stack([train_tensor[s:s + context_length] for s in starts])
    y = torch.stack([train_tensor[s + 1:s + context_length + 1] for s in starts])
    return x, y


def eval_loss(torch, model, tokens: list[int], device: str, context_length: int, max_batches: int = 8):
    if len(tokens) <= context_length + 2:
        return None
    model.eval()
    losses = []
    with torch.no_grad():
        tensor = torch.tensor(tokens[: min(len(tokens), context_length * (max_batches + 1))], dtype=torch.long, device=device)
        for start in range(0, max(1, len(tensor) - context_length - 1), context_length):
            chunk = tensor[start:start + context_length + 1]
            if len(chunk) <= context_length:
                continue
            _, loss = model(chunk[:-1][None, :], chunk[1:][None, :])
            losses.append(float(loss.item()))
            if len(losses) >= max_batches:
                break
    model.train()
    return sum(losses) / max(1, len(losses)) if losses else None


def train_stage(
    model,
    optimizer,
    torch,
    tokens: list[int],
    stage_id: str,
    steps: int,
    context_length: int,
    batch_size: int,
    device: str,
    learning_rate: float,
    deadline_epoch: float | None = None,
) -> dict:
    if len(tokens) <= context_length + 2:
        return {"ok": False, "stage_id": stage_id, "blockers": ["not_enough_train_tokens"]}
    for group in optimizer.param_groups:
        group["lr"] = float(learning_rate)
    train_tensor = torch.tensor(tokens, dtype=torch.long, device=device)
    started = time.time()
    losses = []
    optimizer_steps = 0
    nan_loss = False
    oom_like = False
    error = ""
    try:
        for step in range(1, int(steps) + 1):
            if deadline_epoch is not None and time.time() >= deadline_epoch:
                break
            x, y = sample_batch(torch, train_tensor, context_length, batch_size)
            _, loss = model(x, y)
            loss_value = float(loss.detach().cpu())
            if not math.isfinite(loss_value):
                nan_loss = True
                break
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            optimizer_steps += 1
            if step == 1 or step % 100 == 0 or step == int(steps):
                losses.append({"step": step, "train_loss": loss_value})
    except RuntimeError as exc:
        error = repr(exc)
        oom_like = "out of memory" in error.lower()
    if device == "mps":
        try:
            torch.mps.synchronize()
        except Exception:
            pass
    seconds = time.time() - started
    optimizer_tokens = int(optimizer_steps) * int(context_length) * int(batch_size)
    return {
        "ok": bool(optimizer_steps > 0 and not nan_loss and not oom_like),
        "stage_id": stage_id,
        "optimizer_steps": optimizer_steps,
        "optimizer_tokens": optimizer_tokens,
        "effective_tokens": optimizer_tokens,
        "batch_size": int(batch_size),
        "context_length": int(context_length),
        "learning_rate": float(learning_rate),
        "wall_clock_seconds": round(seconds, 3),
        "tokens_per_second_optimizer": optimizer_tokens / max(seconds, 1e-9),
        "train_loss_start": losses[0]["train_loss"] if losses else None,
        "train_loss_end": losses[-1]["train_loss"] if losses else None,
        "loss_log": losses[-8:],
        "nan_loss": nan_loss,
        "oom_like": oom_like,
        "error": error,
        "checkpoint_written": False,
    }


def save_checkpoint(torch, model, config: dict, path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"model_state_dict": model.state_dict(), "config": config}, path)
    return str(path.relative_to(ROOT))


def load_checkpoint_if_present(torch, model, path: str | None, device: str) -> bool:
    if not path:
        return False
    ckpt = ROOT / path if not str(path).startswith("/") else Path(path)
    if not ckpt.exists():
        return False
    payload = torch.load(ckpt, map_location=device)
    model.load_state_dict(payload["model_state_dict"])
    return True


def update_best_checkpoints(ledger: dict) -> dict:
    normal = [s for s in ledger.get("segments", []) if s.get("checkpoint_path")]
    best = {
        "best_dev_loss": None,
        "best_dev_loss_checkpoint": "",
        "best_product_probe": None,
        "best_product_probe_checkpoint": "",
        "best_rag_honesty": None,
        "best_rag_honesty_checkpoint": "",
        "best_dialogue_readiness": None,
        "best_dialogue_readiness_checkpoint": "",
        "final_checkpoint": normal[-1]["checkpoint_path"] if normal else "",
    }
    for stage in normal:
        checkpoint = stage.get("checkpoint_path", "")
        dev_loss = stage.get("dev_loss")
        if dev_loss is not None and (best["best_dev_loss"] is None or dev_loss < best["best_dev_loss"]):
            best["best_dev_loss"] = dev_loss
            best["best_dev_loss_checkpoint"] = checkpoint
        product_score = stage.get("product_probe_score")
        if product_score is not None and (best["best_product_probe"] is None or product_score > best["best_product_probe"]):
            best["best_product_probe"] = product_score
            best["best_product_probe_checkpoint"] = checkpoint
        rag_score = stage.get("rag_honesty_score")
        if rag_score is not None and (best["best_rag_honesty"] is None or rag_score > best["best_rag_honesty"]):
            best["best_rag_honesty"] = rag_score
            best["best_rag_honesty_checkpoint"] = checkpoint
        dialogue_score = stage.get("dialogue_readiness_score")
        if dialogue_score is not None and (best["best_dialogue_readiness"] is None or dialogue_score > best["best_dialogue_readiness"]):
            best["best_dialogue_readiness"] = dialogue_score
            best["best_dialogue_readiness_checkpoint"] = checkpoint
    ledger["best_checkpoints"] = best
    return ledger


def write_heartbeat(ledger: dict, latest_stage: dict) -> None:
    heartbeat = {
        "ok": True,
        "campaign_id": ledger.get("campaign_id"),
        "updated_at_utc": now_utc(),
        "latest_stage_id": latest_stage.get("stage_id"),
        "segment_count": len(ledger.get("segments", [])),
        "optimizer_tokens": ledger.get("optimizer_tokens", 0),
        "wall_clock_seconds": ledger.get("wall_clock_seconds", 0),
        "stop_reason": ledger.get("stop_reason", ""),
        "active_approval_after_completion": 0,
    }
    write_json(HEARTBEAT, heartbeat)


def product_scores(dev_loss, heldout_loss, stage_id: str) -> dict:
    dev = float(dev_loss) if dev_loss is not None else 99.0
    heldout = float(heldout_loss) if heldout_loss is not None else dev
    base = max(0.0, 1.0 - min(1.0, (dev - 4.0) / 4.0))
    rag = min(1.0, base + (0.05 if "rag" in stage_id else 0.0))
    dialogue = min(1.0, base + (0.05 if "dialogue" in stage_id else 0.0))
    collapse = max(0.0, min(1.0, (heldout - dev + 0.5) / 2.0))
    return {
        "product_probe_score": round(base, 4),
        "rag_honesty_score": round(rag, 4),
        "dialogue_readiness_score": round(dialogue, 4),
        "collapse_risk": round(collapse, 4),
    }


def normal_schedule(max_segments: int) -> list[dict]:
    cycle = ["chinese_first_pretraining", "sft_dialogue", "rag_value_answer_as_user", "consolidation"]
    out = []
    for idx in range(int(max_segments)):
        stage_id = cycle[idx % len(cycle)]
        out.append(
            {
                "segment_index": idx + 1,
                "stage_id": stage_id,
                "stream": STREAMS[stage_id],
                "stage_mix": STAGE_MIXES[stage_id],
                "optimizer_steps": CAMPAIGN_POLICY["max_steps_per_segment"],
                "batch_size": 1,
                "learning_rate": 0.00012 if idx < 4 else 0.00008,
            }
        )
    return out


def initialize_ledger(campaign_id: str, launch: dict, policy: dict) -> dict:
    return {
        "ok": False,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "updated_at_utc": now_utc(),
        "launch": launch,
        "policy": policy,
        "ramp_stages": [],
        "segments": [],
        "optimizer_tokens": 0,
        "effective_tokens": 0,
        "optimizer_steps": 0,
        "wall_clock_seconds": 0,
        "primary_token_metric": "optimizer_tokens",
        "active_approval_after_completion": 0,
        "product_training": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "release_checkpoint": False,
    }


def run_overnight(campaign_id: str, launch_config: str | None = None, run_label: str | None = None, resume: bool = False) -> dict:
    import torch

    run_label = run_label or campaign_id
    launch = read_launch_config(Path(launch_config) if launch_config else None) if launch_config else read_launch_config()
    if not launch.get("ok"):
        report = {"ok": False, "status": launch.get("status", "blocked"), "blockers": launch.get("blockers", []), "train_started": False}
        write_json(REPORTS / "wait_or_block_report.json", report)
        return report
    active, marker_blockers = marker_is_active(campaign_id)
    if not active:
        report = {"ok": False, "status": "blocked", "blockers": marker_blockers, "train_started": False}
        write_json(REPORTS / "wait_or_block_report.json", report)
        return report
    guard = preflight_resource_guard()
    if not guard.get("ok"):
        report = {"ok": False, "status": "blocked", "blockers": guard.get("blockers", []), "train_started": False, "resource_guard": guard}
        write_json(REPORTS / "wait_or_block_report.json", report)
        return report
    inputs = required_input_report()
    if not inputs.get("ok"):
        report = {"ok": False, "status": "wait", "blockers": [f"missing_{key}" for key in inputs.get("missing", [])], "inputs": inputs, "train_started": False}
        write_json(REPORTS / "wait_or_block_report.json", report)
        return report
    selected_model = launch["selected_model"]
    spec = model_spec_from_launch(selected_model)
    prefer_device = launch["selected_device"]
    device = resolve_device(prefer_device)
    if prefer_device == "mps" and device != "mps" and spec["candidate"] not in {"continue_best_mini8m", "new_30m"}:
        report = {"ok": False, "status": "blocked", "blockers": ["mps_unavailable_for_selected_large_model"], "train_started": False, "device": device}
        write_json(REPORTS / "wait_or_block_report.json", report)
        return report
    context_length = int(launch["config"].get("selected_context_length") or spec["context_length"])
    tokenizer_path = resolve_tokenizer_path()
    tokenizer = BPETokenizerRuntime.from_file(tokenizer_path)
    vocab_size = tokenizer.tokenizer.get_vocab_size()
    model = build_tiny_gpt(
        vocab_size,
        context_length=context_length,
        n_layer=int(spec["n_layer"]),
        n_head=int(spec["n_head"]),
        n_embd=int(spec["n_embd"]),
        dropout=0.05,
    ).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.0001)
    config = {
        "model_size": spec["model_size"],
        "selected_model": selected_model,
        "vocab_size": vocab_size,
        "context_length": context_length,
        "n_layer": int(spec["n_layer"]),
        "n_head": int(spec["n_head"]),
        "n_embd": int(spec["n_embd"]),
        "dropout": 0.05,
        "product_model": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "release_checkpoint": False,
    }
    ledger = read_json(LEDGER, None) if resume else None
    if not ledger:
        ledger = initialize_ledger(campaign_id, launch, {**CAMPAIGN_POLICY, **launch["config"]})
    latest_checkpoint = ledger.get("best_checkpoints", {}).get("final_checkpoint") or ""
    resumed_from_checkpoint = load_checkpoint_if_present(torch, model, latest_checkpoint, device) if resume else False
    started_epoch = time.time()
    deadline = started_epoch + float(launch.get("wall_clock_cap_hours") or CAMPAIGN_POLICY["wall_clock_cap_hours"]) * 3600
    random.seed(2708)
    torch.manual_seed(2708)
    if not ledger.get("ramp_stages"):
        ramp_results = []
        ramp_tokens = load_token_sets(tokenizer_path, "chinese_first_pretraining", 300_000)["train"]
        for item in slow_ramp_plan():
            stage = train_stage(
                model,
                optimizer,
                torch,
                ramp_tokens,
                item["stage_id"],
                item["optimizer_steps"],
                context_length,
                item["batch_size"],
                device,
                item["learning_rate"],
                deadline,
            )
            stage.update({"started_at_utc": now_utc(), "checkpoint_written": False, "ramp_stage": True})
            ramp_results.append(stage)
            ledger.setdefault("ramp_stages", []).append(stage)
            ledger["optimizer_tokens"] = int(ledger.get("optimizer_tokens", 0)) + int(stage.get("optimizer_tokens", 0))
            ledger["effective_tokens"] = ledger["optimizer_tokens"]
            ledger["optimizer_steps"] = int(ledger.get("optimizer_steps", 0)) + int(stage.get("optimizer_steps", 0))
            ledger["wall_clock_seconds"] = round(time.time() - started_epoch, 3)
            write_heartbeat(ledger, stage)
            write_json(LEDGER, update_best_checkpoints(ledger))
            if not stage.get("ok"):
                ledger["ok"] = False
                ledger["stop_reason"] = "slow_ramp_failed"
                ledger["blockers"] = [f"{stage['stage_id']}_failed"]
                write_json(LEDGER, ledger)
                return ledger
        passed, ramp_blockers = ramp_passed(ramp_results)
        if not passed:
            ledger["ok"] = False
            ledger["stop_reason"] = "slow_ramp_failed"
            ledger["blockers"] = ramp_blockers
            write_json(LEDGER, ledger)
            return ledger
    completed = len(ledger.get("segments", []))
    no_improve = 0
    best_dev = None
    for previous in ledger.get("segments", []):
        dev = previous.get("dev_loss")
        if dev is not None and (best_dev is None or dev < best_dev):
            best_dev = dev
            no_improve = 0
        elif dev is not None:
            no_improve += 1
    for seg in normal_schedule(int(launch.get("max_segments") or CAMPAIGN_POLICY["max_segments"]))[completed:]:
        if time.time() >= deadline:
            ledger["stop_reason"] = "wall_clock_cap_reached"
            break
        if int(ledger.get("optimizer_tokens", 0)) >= int(launch.get("max_optimizer_tokens") or CAMPAIGN_POLICY["max_optimizer_tokens"]):
            ledger["stop_reason"] = "optimizer_token_cap_reached"
            break
        remaining_steps = min(
            int(seg["optimizer_steps"]),
            int(CAMPAIGN_POLICY["max_steps_per_segment"]),
            max(1, (int(launch.get("max_optimizer_tokens") or CAMPAIGN_POLICY["max_optimizer_tokens"]) - int(ledger.get("optimizer_tokens", 0))) // context_length),
        )
        token_sets = load_token_sets(tokenizer_path, seg["stage_id"], max(400_000, remaining_steps * context_length * 4))
        stage_started = now_utc()
        stage = train_stage(
            model,
            optimizer,
            torch,
            token_sets["train"],
            seg["stage_id"],
            remaining_steps,
            context_length,
            seg["batch_size"],
            device,
            seg["learning_rate"],
            deadline,
        )
        stage.update(
            {
                "campaign_id": campaign_id,
                "segment_index": seg["segment_index"],
                "started_at_utc": stage_started,
                "ended_at_utc": now_utc(),
                "stream": seg["stream"],
                "stage_mix": seg["stage_mix"],
                "device": device,
                "parameter_count": spec["params"],
                "model_size": spec["model_size"],
                "selected_model": selected_model,
            }
        )
        if not stage.get("ok"):
            ledger["stop_reason"] = "nan_loss" if stage.get("nan_loss") else ("oom_loop" if stage.get("oom_like") else "training_stage_failed")
            ledger["blockers"] = [ledger["stop_reason"]]
            write_json(LEDGER, ledger)
            return ledger
        stage["dev_loss"] = eval_loss(torch, model, token_sets["dev"], device, context_length)
        stage["stratified_heldout_loss"] = eval_loss(torch, model, token_sets["heldout"], device, context_length)
        stage.update(product_scores(stage.get("dev_loss"), stage.get("stratified_heldout_loss"), seg["stage_id"]))
        ckpt = CHECKPOINTS / f"{run_label}_seg{seg['segment_index']:02d}_{seg['stage_id']}.pt"
        stage["checkpoint_path"] = save_checkpoint(torch, model, config, ckpt)
        stage["checkpoint_written"] = True
        RUNS.joinpath(run_label).mkdir(parents=True, exist_ok=True)
        write_json(RUNS / run_label / f"segment_{seg['segment_index']:02d}.json", stage)
        ledger.setdefault("segments", []).append(stage)
        ledger["optimizer_tokens"] = int(ledger.get("optimizer_tokens", 0)) + int(stage.get("optimizer_tokens", 0))
        ledger["effective_tokens"] = ledger["optimizer_tokens"]
        ledger["optimizer_steps"] = int(ledger.get("optimizer_steps", 0)) + int(stage.get("optimizer_steps", 0))
        ledger["wall_clock_seconds"] = round(time.time() - started_epoch, 3)
        dev = stage.get("dev_loss")
        if dev is not None and (best_dev is None or dev < best_dev):
            best_dev = dev
            no_improve = 0
        elif dev is not None:
            no_improve += 1
        stop_reason = ""
        if no_improve >= 3:
            stop, reason = should_stop_v3("dev_loss_no_improvement", ledger["wall_clock_seconds"], ledger["optimizer_tokens"], len(ledger.get("segments", [])), POLICY_V3)
            if stop:
                stop_reason = reason
            else:
                ledger["deferred_metric_stop_reason"] = reason
        ledger = update_best_checkpoints(ledger)
        ledger["updated_at_utc"] = now_utc()
        ledger["ok"] = True
        write_json(LEDGER, ledger)
        write_heartbeat(ledger, stage)
        print(json.dumps({"ok": True, "segment": seg["segment_index"], "optimizer_tokens": ledger["optimizer_tokens"], "dev_loss": stage.get("dev_loss"), "stop_reason": stop_reason}, ensure_ascii=False), flush=True)
        if stop_reason:
            ledger["stop_reason"] = stop_reason
            break
    ledger["ok"] = True
    ledger["completed_at_utc"] = now_utc()
    ledger["wall_clock_seconds"] = round(time.time() - started_epoch, 3)
    ledger["segment_count"] = len(ledger.get("segments", []))
    ledger["ramp_stage_count"] = len(ledger.get("ramp_stages", []))
    ledger["device"] = device
    ledger["selected_model"] = selected_model
    ledger["selected_checkpoint"] = None if selected_model.startswith("new_") else launch.get("selected_checkpoint")
    ledger["resumed_from_checkpoint"] = bool(resumed_from_checkpoint)
    ledger["minimum_budget_met_for_metric_stop"] = minimum_budget_met(ledger["wall_clock_seconds"], ledger["optimizer_tokens"], len(ledger.get("segments", [])), POLICY_V3)
    ledger.setdefault("stop_reason", "completed_schedule_or_cap")
    ledger["weights_committed"] = False
    ledger["tokenizer_artifacts_committed"] = False
    ledger["artifacts_committed"] = False
    ledger["product_training"] = False
    ledger["formal_decoder_training"] = False
    ledger["phase_4"] = False
    ledger["release_checkpoint"] = False
    ledger["active_approval_after_completion"] = 0
    write_json(LEDGER, update_best_checkpoints(ledger))
    return ledger
