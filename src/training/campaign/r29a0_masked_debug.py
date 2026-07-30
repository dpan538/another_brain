from __future__ import annotations

import json
import math
import os
import random
import shutil
import time
from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import NON_CLAIMS, ROOT, now_utc, read_json, write_json
from src.training.campaign.r28a13_controller import (
    PROBES,
    _generate,
    _load_model,
    _load_tokenizer,
    _probe_prompt,
    _read_jsonl_rows,
    _resolve_device,
    _resolve_tokenizer_path,
    _score_probe,
    resolve_a12_best_checkpoint,
)
from src.training.curriculum.r28a13_sft_mix import build_sft_mix
from src.training.model_lab.loss_accounting import (
    ASSISTANT_RESPONSE_ONLY,
    LossAccumulator,
    token_weighted_torch_loss,
)
from src.training.model_lab.r27a11_scale_catalog import params_for_r27a11


CAMPAIGN_ID = "r29a0_96m_assistant_mask_debug_v1"
SEED = 2901
ART = ROOT / "artifacts/r29a0"
REPORTS = ART / "reports"
CHECKPOINTS = ART / "model_lab/checkpoints"
RUNS = ART / "model_lab/runs"
MARKER = REPORTS / "campaign_marker.json"
LEDGER = REPORTS / "campaign_ledger.json"
HEARTBEAT = REPORTS / "heartbeat_latest.json"

CAMPAIGN_POLICY = {
    "campaign_id": CAMPAIGN_ID,
    "campaign_type": "bounded_mask_corrected_debug_microcycle",
    "selected_model": "new_96m",
    "loss_mask_policy": ASSISTANT_RESPONSE_ONLY,
    "seed": SEED,
    "learning_rate": 5e-6,
    "max_optimizer_tokens": 300_000,
    "evaluation_interval_optimizer_tokens": 50_000,
    "max_segments": 6,
    "max_checkpoint_count": 3,
    "wall_clock_cap_hours": 2,
    "batch_size": 2,
    "require_mps": True,
    "stop_on_heldout_regression": True,
    "stop_on_probe_regression": True,
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


def _display_path(path: Path | str) -> str:
    value = Path(path)
    try:
        return str(value.relative_to(ROOT))
    except ValueError:
        return str(value)


def format_prompt(row: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"用户：{row.get('input', '')}",
            f"类别：{row.get('category', '')}",
            f"长度：{row.get('length_target', '')}",
            f"证据边界：{row.get('evidence_policy', '')}",
            "回答：",
        ]
    )


def encode_masked_row(row: dict[str, Any], tokenizer, context_length: int) -> dict[str, list[int] | int]:
    """Encode one SFT row while masking every prompt/role token from loss."""

    bos = int(getattr(tokenizer, "bos", 2))
    eos = int(getattr(tokenizer, "eos", 3))
    prompt_ids = list(tokenizer.encode(format_prompt(row)))
    target_ids = list(tokenizer.encode(str(row.get("target", ""))))
    if prompt_ids and prompt_ids[-1] == eos:
        prompt_ids.pop()
    if not prompt_ids or prompt_ids[0] != bos:
        prompt_ids.insert(0, bos)
    if target_ids and target_ids[0] == bos:
        target_ids.pop(0)
    if not target_ids or target_ids[-1] != eos:
        target_ids.append(eos)

    max_sequence = int(context_length) + 1
    if len(target_ids) >= max_sequence:
        target_ids = target_ids[: max_sequence - 1] + [eos]
    prompt_budget = max(1, max_sequence - len(target_ids))
    if len(prompt_ids) > prompt_budget:
        if prompt_budget == 1:
            prompt_ids = [bos]
        else:
            prompt_ids = [bos] + prompt_ids[-(prompt_budget - 1) :]

    target_start = len(prompt_ids)
    sequence = prompt_ids + target_ids
    x = sequence[:-1]
    y = sequence[1:]
    mask = [1 if index + 1 >= target_start else 0 for index in range(len(x))]
    loss_tokens = sum(mask)
    if loss_tokens <= 0:
        raise ValueError("assistant_target_tokens_missing")

    pad_count = int(context_length) - len(x)
    if pad_count < 0:
        raise ValueError("masked_sequence_over_context")
    x.extend([eos] * pad_count)
    y.extend([eos] * pad_count)
    mask.extend([0] * pad_count)
    return {"input_ids": x, "target_ids": y, "loss_mask": mask, "loss_tokens": loss_tokens}


def encode_masked_dataset(rows: list[dict[str, Any]], tokenizer, context_length: int) -> list[dict[str, Any]]:
    return [encode_masked_row(row, tokenizer, context_length) for row in rows]


def _dataset_tensors(torch, encoded: list[dict[str, Any]], device: str):
    return (
        torch.tensor([row["input_ids"] for row in encoded], dtype=torch.long, device=device),
        torch.tensor([row["target_ids"] for row in encoded], dtype=torch.long, device=device),
        torch.tensor([row["loss_mask"] for row in encoded], dtype=torch.float32, device=device),
    )


def _evaluate_masked(torch, model, tensors, split: str, batch_size: int = 2) -> dict[str, Any]:
    inputs, targets, masks = tensors
    accumulator = LossAccumulator(split=split, mask_policy=ASSISTANT_RESPONSE_ONLY)
    model.eval()
    with torch.no_grad():
        for start in range(0, int(inputs.shape[0]), int(batch_size)):
            x = inputs[start : start + batch_size]
            y = targets[start : start + batch_size]
            mask = masks[start : start + batch_size]
            logits, _ = model(x)
            _, loss_tokens, average = token_weighted_torch_loss(torch, logits, y, mask)
            accumulator.add(float(average.detach().cpu()), loss_tokens, split)
    model.train()
    return accumulator.to_report()


def _probe_model(torch, model, tokenizer, device: str, context_length: int) -> dict[str, Any]:
    probes = []
    for probe in PROBES:
        output = _generate(torch, model, tokenizer, _probe_prompt(probe), device, context_length, max_new_tokens=64)
        score = _score_probe(output, probe)
        probes.append({"id": probe["id"], "prompt": probe["prompt"], "output": output, "score": score})
    average = sum(item["score"]["score"] for item in probes) / max(1, len(probes))
    role_prefix_leaks = [
        item["id"]
        for item in probes
        if str(item.get("output", "")).startswith(("用户:", "用户：", "回答:", "回答："))
    ]
    below_threshold = [item["id"] for item in probes if float(item["score"]["score"]) < 0.70]
    expected_terms_missing = [item["id"] for item in probes if int(item["score"]["expected_hits"]) == 0]
    return {
        "probe_average_score": round(average, 4),
        "role_prefix_leaks": role_prefix_leaks,
        "below_threshold": below_threshold,
        "expected_terms_missing": expected_terms_missing,
        "probes": probes,
    }


def _resource_guard(selected_model: str) -> dict[str, Any]:
    params = params_for_r27a11(selected_model)
    checkpoint_estimate = int(params * 4.2)
    required = checkpoint_estimate * int(CAMPAIGN_POLICY["max_checkpoint_count"]) + 8_000_000_000
    disk = shutil.disk_usage(ROOT.parent)
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


def _prune_checkpoints(segments: list[dict[str, Any]]) -> None:
    existing = [
        (segment, ROOT / segment["checkpoint_path"])
        for segment in segments
        if segment.get("checkpoint_path") and (ROOT / segment["checkpoint_path"]).exists()
    ]
    max_count = int(CAMPAIGN_POLICY["max_checkpoint_count"])
    if len(existing) <= max_count:
        return
    best = min(existing, key=lambda item: float(item[0].get("heldout_loss", math.inf)))
    keep = {best[1], existing[-1][1], existing[-2][1]}
    for segment, checkpoint in existing:
        if checkpoint not in keep and checkpoint.exists():
            checkpoint.unlink()
            segment["checkpoint_pruned"] = True


def create_campaign_marker(campaign_id: str = CAMPAIGN_ID) -> dict[str, Any]:
    marker = {
        "ok": True,
        "active": True,
        "consumed": False,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "approval": {"R29A0_96M_MASKED_DEBUG_ALLOWED": True},
        "policy": CAMPAIGN_POLICY,
        **NON_CLAIMS,
    }
    write_json(MARKER, marker)
    return marker


def consume_campaign_marker(campaign_id: str = CAMPAIGN_ID) -> dict[str, Any]:
    marker = read_json(MARKER, {})
    ok = marker.get("campaign_id") == campaign_id
    if ok:
        marker.update(
            {
                "active": False,
                "consumed": True,
                "consumed_at_utc": now_utc(),
                "active_approval_after_completion": 0,
            }
        )
        write_json(MARKER, marker)
    report = {
        "ok": ok,
        "campaign_id": campaign_id,
        "blockers": [] if ok else ["campaign_marker_missing_or_mismatch"],
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(REPORTS / "campaign_marker_consume_report.json", report)
    return report


def _blocked(campaign_id: str, blockers: list[str]) -> dict[str, Any]:
    ledger = {
        "ok": False,
        "campaign_id": campaign_id,
        "train_started": False,
        "training_ran": False,
        "blockers": blockers,
        "stop_reason": blockers[0] if blockers else "blocked",
        "policy": CAMPAIGN_POLICY,
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(LEDGER, ledger)
    return ledger


def run_masked_debug(
    campaign_id: str = CAMPAIGN_ID,
    *,
    prefer_device: str = "mps",
    resource_safe: bool = True,
) -> dict[str, Any]:
    import torch

    os.environ.setdefault("OMP_NUM_THREADS", "2")
    os.environ.setdefault("MKL_NUM_THREADS", "2")
    os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "2")
    torch.set_num_threads(2)
    random.seed(SEED)
    torch.manual_seed(SEED)

    started = time.time()
    marker = read_json(MARKER, {})
    if marker.get("campaign_id") != campaign_id or marker.get("active") is not True:
        return _blocked(campaign_id, ["campaign_marker_missing_or_inactive"])

    a12 = resolve_a12_best_checkpoint()
    if not a12.get("ok"):
        return _blocked(campaign_id, list(a12.get("blockers") or ["a12_best_checkpoint_unavailable"]))
    selected_model = str(a12.get("selected_model") or "new_96m")
    if selected_model != CAMPAIGN_POLICY["selected_model"]:
        return _blocked(campaign_id, [f"selected_model_mismatch:{selected_model}"])

    device = _resolve_device(prefer_device)
    if CAMPAIGN_POLICY["require_mps"] and device != "mps":
        return _blocked(campaign_id, ["mps_required_but_unavailable"])
    guard = _resource_guard(selected_model)
    if resource_safe and not guard.get("ok"):
        return _blocked(campaign_id, list(guard.get("blockers") or ["resource_guard_failed"]))

    mix_report = ROOT / "artifacts/r28a13/reports/sft_mix_report.json"
    if not mix_report.exists():
        build_sft_mix(root=ROOT, write_artifacts=True)
    train_rows = _read_jsonl_rows(ROOT / "artifacts/r28a13/training_mix/train.jsonl")
    dev_rows = _read_jsonl_rows(ROOT / "artifacts/r28a13/training_mix/dev.jsonl")
    heldout_rows = _read_jsonl_rows(ROOT / "artifacts/r28a13/training_mix/heldout.jsonl")
    if not train_rows or not dev_rows or not heldout_rows:
        return _blocked(campaign_id, ["masked_debug_splits_missing"])

    tokenizer_path = _resolve_tokenizer_path()
    if tokenizer_path is None:
        return _blocked(campaign_id, ["tokenizer_missing"])
    tokenizer = _load_tokenizer(tokenizer_path)
    model, spec = _load_model(torch, Path(a12["checkpoint_path"]), selected_model, device)
    context_length = int(spec.get("context_length", 256))
    train_encoded = encode_masked_dataset(train_rows, tokenizer, context_length)
    dev_encoded = encode_masked_dataset(dev_rows, tokenizer, context_length)
    heldout_encoded = encode_masked_dataset(heldout_rows, tokenizer, context_length)
    train_tensors = _dataset_tensors(torch, train_encoded, device)
    dev_tensors = _dataset_tensors(torch, dev_encoded, device)
    heldout_tensors = _dataset_tensors(torch, heldout_encoded, device)

    batch_size = int(CAMPAIGN_POLICY["batch_size"])
    learning_rate = float(CAMPAIGN_POLICY["learning_rate"])
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=0.01)
    baseline_dev = _evaluate_masked(torch, model, dev_tensors, "masked_dev_baseline", batch_size)
    baseline_heldout = _evaluate_masked(torch, model, heldout_tensors, "masked_heldout_baseline", batch_size)
    baseline_probe = _probe_model(torch, model, tokenizer, device, context_length)

    ledger: dict[str, Any] = {
        "ok": True,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "train_started": True,
        "training_ran": True,
        "selected_model": selected_model,
        "selected_device": device,
        "parameter_count": params_for_r27a11(selected_model),
        "context_length": context_length,
        "batch_size": batch_size,
        "learning_rate": learning_rate,
        "seed": SEED,
        "mask_policy": ASSISTANT_RESPONSE_ONLY,
        "resume_from": {
            "source": "r27a12_best_product_probe",
            "checkpoint_path": str(a12["checkpoint_path"]),
            "optimizer_tokens": a12.get("optimizer_tokens"),
        },
        "baseline": {
            "dev": baseline_dev,
            "heldout": baseline_heldout,
            "probe": baseline_probe,
        },
        "optimizer_tokens": 0,
        "optimizer_steps": 0,
        "segments": [],
        "policy": CAMPAIGN_POLICY,
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(LEDGER, ledger)

    deadline = started + float(CAMPAIGN_POLICY["wall_clock_cap_hours"]) * 3600
    max_tokens = int(CAMPAIGN_POLICY["max_optimizer_tokens"])
    interval = int(CAMPAIGN_POLICY["evaluation_interval_optimizer_tokens"])
    inputs, targets, masks = train_tensors
    best_heldout = math.inf
    best_probe = float(baseline_probe.get("probe_average_score", 0.0))

    for segment_index in range(1, int(CAMPAIGN_POLICY["max_segments"]) + 1):
        if time.time() >= deadline or int(ledger["optimizer_tokens"]) >= max_tokens:
            break
        segment_accumulator = LossAccumulator(
            split=f"masked_train_segment_{segment_index}",
            mask_policy=ASSISTANT_RESPONSE_ONLY,
        )
        segment_tokens = 0
        segment_steps = 0
        while (
            segment_tokens < interval
            and int(ledger["optimizer_tokens"]) + segment_tokens < max_tokens
            and time.time() < deadline
        ):
            indices = torch.randint(0, int(inputs.shape[0]), (batch_size,), device=device)
            x = inputs[indices]
            y = targets[indices]
            mask = masks[indices]
            logits, _ = model(x)
            _, loss_tokens, average = token_weighted_torch_loss(torch, logits, y, mask)
            value = float(average.detach().cpu())
            if not math.isfinite(value):
                ledger["ok"] = False
                ledger["stop_reason"] = "nan_loss"
                ledger["blockers"] = ["nan_loss"]
                break
            optimizer.zero_grad(set_to_none=True)
            average.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 0.7)
            optimizer.step()
            segment_accumulator.add(value, loss_tokens, "assistant_response_only")
            segment_tokens += int(loss_tokens)
            segment_steps += 1
            if segment_steps % 100 == 0:
                write_json(
                    HEARTBEAT,
                    {
                        "ok": True,
                        "campaign_id": campaign_id,
                        "segment_index": segment_index,
                        "segment_steps": segment_steps,
                        "optimizer_tokens": int(ledger["optimizer_tokens"]) + segment_tokens,
                        "mask_policy": ASSISTANT_RESPONSE_ONLY,
                        "active_approval_after_completion": 0,
                    },
                )
        if device == "mps":
            torch.mps.synchronize()

        dev = _evaluate_masked(torch, model, dev_tensors, "masked_dev", batch_size)
        heldout = _evaluate_masked(torch, model, heldout_tensors, "masked_heldout", batch_size)
        probe = _probe_model(torch, model, tokenizer, device, context_length)
        checkpoint = CHECKPOINTS / f"{campaign_id}_seg{segment_index:02d}.pt"
        checkpoint.parent.mkdir(parents=True, exist_ok=True)
        torch.save(
            {
                "model_state_dict": model.state_dict(),
                "config": {
                    "selected_model": selected_model,
                    "campaign_id": campaign_id,
                    "mask_policy": ASSISTANT_RESPONSE_ONLY,
                    **spec,
                    **NON_CLAIMS,
                },
            },
            checkpoint,
        )

        segment = {
            "segment_index": segment_index,
            "optimizer_tokens": segment_tokens,
            "optimizer_steps": segment_steps,
            "running_train_loss": segment_accumulator.to_report(),
            "dev_loss_report": dev,
            "heldout_loss_report": heldout,
            "dev_loss": dev.get("average_loss"),
            "heldout_loss": heldout.get("average_loss"),
            "probe": probe,
            "checkpoint_path": _display_path(checkpoint),
            "mask_policy": ASSISTANT_RESPONSE_ONLY,
        }
        ledger["segments"].append(segment)
        ledger["optimizer_tokens"] += segment_tokens
        ledger["optimizer_steps"] += segment_steps
        ledger["wall_clock_seconds"] = round(time.time() - started, 3)
        _prune_checkpoints(ledger["segments"])
        write_json(RUNS / campaign_id / f"segment_{segment_index:02d}.json", segment)
        write_json(LEDGER, ledger)
        write_json(
            HEARTBEAT,
            {
                "ok": True,
                "campaign_id": campaign_id,
                "segment_index": segment_index,
                "optimizer_tokens": ledger["optimizer_tokens"],
                "heldout_loss": segment["heldout_loss"],
                "probe_average_score": probe["probe_average_score"],
                "mask_policy": ASSISTANT_RESPONSE_ONLY,
                "active_approval_after_completion": 0,
            },
        )
        print(
            json.dumps(
                {
                    "ok": True,
                    "segment": segment_index,
                    "optimizer_tokens": ledger["optimizer_tokens"],
                    "heldout_loss": segment["heldout_loss"],
                    "probe_average_score": probe["probe_average_score"],
                }
            ),
            flush=True,
        )

        current_heldout = float(segment["heldout_loss"] or math.inf)
        current_probe = float(probe["probe_average_score"])
        if segment_index > 1 and CAMPAIGN_POLICY["stop_on_heldout_regression"] and current_heldout > best_heldout * 1.05:
            ledger["stop_reason"] = "heldout_regression_stop"
            break
        if segment_index > 1 and CAMPAIGN_POLICY["stop_on_probe_regression"] and current_probe < best_probe - 0.05:
            ledger["stop_reason"] = "probe_regression_stop"
            break
        best_heldout = min(best_heldout, current_heldout)
        best_probe = max(best_probe, current_probe)

    ledger["completed_at_utc"] = now_utc()
    ledger["wall_clock_seconds"] = round(time.time() - started, 3)
    ledger["segment_count"] = len(ledger["segments"])
    ledger.setdefault(
        "stop_reason",
        "optimizer_token_cap_reached"
        if int(ledger["optimizer_tokens"]) >= max_tokens
        else "wall_clock_cap_reached",
    )
    best = max(
        ledger["segments"],
        key=lambda item: (
            float(item.get("probe", {}).get("probe_average_score", 0.0)),
            -float(item.get("heldout_loss") or math.inf),
        ),
        default=None,
    )
    ledger["best_checkpoint"] = "" if best is None else best.get("checkpoint_path", "")
    ledger["promotion_gate"] = {
        "passed": bool(
            best
            and not best["probe"]["role_prefix_leaks"]
            and not best["probe"]["below_threshold"]
            and float(best["probe"]["probe_average_score"]) >= 0.80
        ),
        "required_average_probe_score": 0.80,
        "required_minimum_category_score": 0.70,
        "role_prefix_leaks": [] if best is None else best["probe"]["role_prefix_leaks"],
        "below_threshold": [] if best is None else best["probe"]["below_threshold"],
        "browser_admission": False,
        "release_checkpoint": False,
    }
    write_json(LEDGER, ledger)
    consume_campaign_marker(campaign_id)
    return ledger
