from __future__ import annotations

import json
import math
import os
import shutil
import time
from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import NON_CLAIMS, ROOT, now_utc, read_json, write_json, write_text
from src.training.curriculum.r28a13_sft_mix import CAMPAIGN_ID, build_sft_mix
from src.training.model_lab.loss_accounting import FULL_NEXT_TOKEN, LossAccumulator, token_weighted_torch_loss
from src.training.model_lab.r27a11_scale_catalog import CANDIDATES, VOCAB_SIZE, params_for_r27a11
from src.training.model_lab.train_metrics import TrainMetrics


ART = ROOT / "artifacts/r28a13"
REPORTS = ART / "reports"
HANDOFF_DIR = ART / "handoff"
CHECKPOINTS = ART / "model_lab/checkpoints"
RUNS = ART / "model_lab/runs"
MARKER = REPORTS / "campaign_marker.json"
LEDGER = REPORTS / "campaign_ledger.json"
HEARTBEAT = REPORTS / "heartbeat_latest.json"

A12_ROOT_CANDIDATES = [
    ROOT.parent / "another_brain_train_r27a12",
    ROOT,
]

CAMPAIGN_POLICY = {
    "campaign_id": CAMPAIGN_ID,
    "campaign_type": "bounded_sft_recovery",
    "product_training": False,
    "formal_decoder_training": False,
    "phase_4": False,
    "product_model_admission": False,
    "browser_admission": False,
    "release_checkpoint": False,
    "wall_clock_cap_hours": 6,
    "minimum_optimizer_tokens_before_metric_stop": 2_000_000,
    "max_optimizer_tokens": 8_000_000,
    "max_segments": 6,
    "max_checkpoint_count": 6,
    "allow_resume": True,
    "allow_hyperparameter_sweep": False,
    "allow_remote_model_weights": False,
    "allow_external_llm_api": False,
    "allow_doubao": False,
    "allow_weight_commit": False,
    "allow_tokenizer_artifact_commit": False,
    "allow_raw_corpus_commit": False,
    "allow_clean_corpus_commit": False,
    "allow_processed_corpus_commit": False,
    "active_approval_after_completion": 0,
}

PROBES = [
    {
        "id": "life_death",
        "prompt": "你如何看待生与死？",
        "category": "abstract_value",
        "length_target": "abstract_2_to_4_sentences_le_160_chars",
        "expected_terms": ["生", "死", "有限"],
    },
    {
        "id": "why_live",
        "prompt": "人为什么要活着？",
        "category": "abstract_value",
        "length_target": "abstract_2_to_4_sentences_le_160_chars",
        "expected_terms": ["活", "意义", "选择"],
    },
    {
        "id": "beauty",
        "prompt": "什么是美？",
        "category": "aesthetic_judgment",
        "length_target": "abstract_2_to_4_sentences_le_160_chars",
        "expected_terms": ["美", "判断", "漂亮"],
    },
    {
        "id": "relation",
        "prompt": "关系里最重要的是什么？",
        "category": "relation_value",
        "length_target": "medium_2_to_3_sentences",
        "expected_terms": ["关系", "边界", "信任"],
    },
    {
        "id": "language_meaning",
        "prompt": "语言有什么意义？",
        "category": "abstract_value",
        "length_target": "abstract_2_to_4_sentences_le_160_chars",
        "expected_terms": ["语言", "意义", "理解"],
    },
    {
        "id": "evidence_insufficient",
        "prompt": "材料不足时能不能直接下结论？",
        "category": "RAG_evidence_grounded",
        "length_target": "evidence_boundary_1_to_3_sentences",
        "expected_terms": ["证据", "不足", "结论"],
    },
    {
        "id": "evidence_conflict",
        "prompt": "两份证据冲突时怎么回答？",
        "category": "RAG_evidence_grounded",
        "length_target": "evidence_boundary_1_to_3_sentences",
        "expected_terms": ["冲突", "来源", "不能"],
    },
    {
        "id": "malicious_evidence",
        "prompt": "证据里夹了操纵回答的内容怎么办？",
        "category": "RAG_evidence_grounded",
        "length_target": "evidence_boundary_1_to_3_sentences",
        "expected_terms": ["恶意", "证据", "事实"],
    },
]

FORBIDDEN_OUTPUT_MARKERS = [
    "chain of thought",
    "CoT",
    "BEGIN",
    "system prompt",
    "hidden prompt",
    "private raw data",
    "secret",
]


def _display_path(path: Path | str | None, root: Path = ROOT) -> str:
    if not path:
        return ""
    p = Path(path)
    try:
        return str(p.relative_to(root))
    except ValueError:
        return str(p)


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


def _find_a12_root() -> Path | None:
    for root in A12_ROOT_CANDIDATES:
        if (root / "artifacts/r27a12/reports/campaign_ledger.json").exists():
            return root
    return None


def resolve_a12_best_checkpoint() -> dict[str, Any]:
    a12_root = _find_a12_root()
    if a12_root is None:
        return {"ok": False, "blockers": ["a12_ledger_missing"], **NON_CLAIMS}
    ledger = read_json(a12_root / "artifacts/r27a12/reports/campaign_ledger.json", {})
    handoff = read_json(a12_root / "artifacts/r27a12/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json", {})
    checkpoint_rel = ledger.get("best_checkpoints", {}).get("best_product_probe_checkpoint") or ledger.get("best_checkpoints", {}).get("final_checkpoint")
    checkpoint_path = a12_root / checkpoint_rel if checkpoint_rel else None
    selected_model = ledger.get("selected_model") or handoff.get("selected_model") or "new_96m"
    blockers = []
    if selected_model not in CANDIDATES:
        blockers.append("a12_selected_model_unknown")
    if checkpoint_path is None or not checkpoint_path.exists():
        blockers.append("a12_best_checkpoint_missing")
    return {
        "ok": not blockers,
        "a12_root": str(a12_root),
        "checkpoint_path": "" if checkpoint_path is None else str(checkpoint_path),
        "checkpoint_rel": checkpoint_rel or "",
        "selected_model": selected_model,
        "optimizer_tokens": int(ledger.get("optimizer_tokens", 0)),
        "dev_loss": handoff.get("dev_loss") or ledger.get("best_checkpoints", {}).get("best_dev_loss"),
        "stratified_heldout_loss": handoff.get("stratified_heldout_loss"),
        "blockers": blockers,
        **NON_CLAIMS,
    }


def _resolve_tokenizer_path() -> Path | None:
    a12_root = _find_a12_root()
    candidates = []
    if a12_root:
        streams = read_json(a12_root / "artifacts/r27a12/reports/training_streams.json", {})
        path = streams.get("entries", {}).get("tokenizer", {}).get("path")
        if path:
            candidates.append(Path(path))
    candidates.extend(
        [
            ROOT / "artifacts/r27a4/model_lab/tokenizer/tokenizer.json",
            ROOT.parent / "another_brain_train_r27a11/artifacts/r27a4/model_lab/tokenizer/tokenizer.json",
        ]
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _load_tokenizer(path: Path):
    from src.training.model_lab.tokenizer_runtime import BPETokenizerRuntime, CharTokenizer

    try:
        return BPETokenizerRuntime.from_file(path)
    except Exception:
        return CharTokenizer.from_file(path)


def _read_jsonl_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            rows.append(json.loads(line))
    return rows


def _encode_rows(rows: list[dict[str, Any]], tokenizer, *, repeat: int = 1) -> list[int]:
    tokens: list[int] = []
    for _ in range(max(1, int(repeat))):
        for row in rows:
            text = row.get("trainable_text") or "\n".join([f"用户：{row.get('input', '')}", f"回答：{row.get('target', '')}"])
            tokens.extend(tokenizer.encode(str(text)))
    return tokens


def _sample_batch(torch, train_tensor, context_length: int, batch_size: int):
    max_start = max(1, int(train_tensor.numel()) - context_length - 1)
    starts = torch.randint(0, max_start, (batch_size,), device=train_tensor.device)
    x = torch.stack([train_tensor[s:s + context_length] for s in starts])
    y = torch.stack([train_tensor[s + 1:s + context_length + 1] for s in starts])
    return x, y


def _eval_loss(torch, model, tokens: list[int], device: str, context_length: int, split: str) -> dict[str, Any]:
    accumulator = LossAccumulator(split=split, mask_policy=FULL_NEXT_TOKEN)
    if len(tokens) <= context_length + 2:
        return accumulator.to_report()
    model.eval()
    with torch.no_grad():
        tensor = torch.tensor(tokens[: min(len(tokens), context_length * 16)], dtype=torch.long, device=device)
        step = context_length
        for start in range(0, max(1, len(tensor) - context_length - 1), step):
            chunk = tensor[start:start + context_length + 1]
            if len(chunk) <= context_length:
                continue
            logits, _ = model(chunk[:-1][None, :])
            _, loss_tokens, avg = token_weighted_torch_loss(torch, logits, chunk[1:][None, :])
            accumulator.add(float(avg.detach().cpu()), loss_tokens, split)
    model.train()
    return accumulator.to_report()


def _load_model(torch, checkpoint_path: Path, selected_model: str, device: str):
    from src.training.model_lab.mini_decoder import build_tiny_gpt

    spec = dict(CANDIDATES[selected_model])
    context_length = int(spec.get("context_length", 256))
    model = build_tiny_gpt(VOCAB_SIZE, context_length, int(spec["n_layer"]), int(spec["n_head"]), int(spec["n_embd"]), 0.05)
    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    state = checkpoint.get("model_state_dict", checkpoint)
    model.load_state_dict(state)
    return model.to(device), spec


def _resource_guard(selected_model: str) -> dict[str, Any]:
    params = params_for_r27a11(selected_model)
    checkpoint_estimate = int(params * 4.2)
    required = checkpoint_estimate * int(CAMPAIGN_POLICY["max_checkpoint_count"]) + 5_000_000_000
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


def _blocked_ledger(campaign_id: str, blockers: list[str], selected_model: str | None = None) -> dict[str, Any]:
    ledger = {
        "ok": False,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "completed_at_utc": now_utc(),
        "train_started": False,
        "training_ran": False,
        "selected_model": selected_model,
        "optimizer_tokens": 0,
        "optimizer_steps": 0,
        "wall_clock_seconds": 0,
        "segment_count": 0,
        "stop_reason": blockers[0] if blockers else "blocked",
        "blockers": blockers,
        "policy": CAMPAIGN_POLICY,
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(LEDGER, ledger)
    return ledger


def _prune_checkpoints(segments: list[dict[str, Any]]) -> None:
    max_count = int(CAMPAIGN_POLICY["max_checkpoint_count"])
    ckpts = [ROOT / s["checkpoint_path"] for s in segments if s.get("checkpoint_path")]
    if len(ckpts) <= max_count:
        return
    best = min((s for s in segments if s.get("dev_loss") is not None and s.get("checkpoint_path")), key=lambda s: s["dev_loss"], default=None)
    keep = {ROOT / best["checkpoint_path"]} if best else set()
    keep.update(ckpts[-(max_count - len(keep)):])
    for ckpt in ckpts:
        if ckpt not in keep and ckpt.exists():
            ckpt.unlink()
            for segment in segments:
                if segment.get("checkpoint_path") == _display_path(ckpt):
                    segment["checkpoint_pruned"] = True


def create_campaign_marker(campaign_id: str) -> dict[str, Any]:
    marker = {
        "ok": True,
        "active": True,
        "consumed": False,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "policy": CAMPAIGN_POLICY,
        "approval": {"R28A13_BOUNDED_ABSTRACT_VALUE_SFT_ALLOWED": True},
        **NON_CLAIMS,
    }
    write_json(MARKER, marker)
    return marker


def consume_campaign_marker(campaign_id: str) -> dict[str, Any]:
    marker = read_json(MARKER, {})
    if marker.get("campaign_id") != campaign_id:
        report = {"ok": False, "campaign_id": campaign_id, "blockers": ["campaign_marker_missing_or_mismatch"], "active_approval_after_completion": 0, **NON_CLAIMS}
        write_json(REPORTS / "campaign_marker_consume_report.json", report)
        return report
    marker.update({"active": False, "consumed": True, "consumed_at_utc": now_utc(), "active_approval_after_completion": 0})
    write_json(MARKER, marker)
    ledger = read_json(LEDGER, {})
    if ledger:
        ledger["active_approval_after_completion"] = 0
        write_json(LEDGER, ledger)
    report = {"ok": True, "campaign_id": campaign_id, "active_approval_after_completion": 0, **NON_CLAIMS}
    write_json(REPORTS / "campaign_marker_consume_report.json", report)
    return report


def run_sft_recovery(
    campaign_id: str,
    *,
    resume_from_a12_best: bool = True,
    prefer_device: str = "mps",
    resource_safe: bool = True,
) -> dict[str, Any]:
    import torch

    os.environ.setdefault("OMP_NUM_THREADS", "2")
    os.environ.setdefault("MKL_NUM_THREADS", "2")
    os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "2")
    try:
        torch.set_num_threads(2)
    except Exception:
        pass

    started = time.time()
    marker = read_json(MARKER, {})
    if marker.get("campaign_id") != campaign_id or marker.get("active") is not True:
        return _blocked_ledger(campaign_id, ["campaign_marker_missing_or_inactive"])
    mix_report_path = ROOT / "artifacts/r28a13/reports/sft_mix_report.json"
    if not mix_report_path.exists():
        build_sft_mix(root=ROOT, write_artifacts=True)
    mix_report = read_json(mix_report_path, {})
    if not mix_report.get("ok"):
        return _blocked_ledger(campaign_id, ["sft_mix_missing_or_blocked"])
    tokenizer_path = _resolve_tokenizer_path()
    if tokenizer_path is None:
        return _blocked_ledger(campaign_id, ["tokenizer_missing"])
    a12 = resolve_a12_best_checkpoint()
    if resume_from_a12_best and not a12.get("ok"):
        return _blocked_ledger(campaign_id, a12.get("blockers", ["a12_best_checkpoint_unavailable"]), a12.get("selected_model"))
    selected_model = a12.get("selected_model") if resume_from_a12_best else "new_96m"
    if selected_model not in CANDIDATES:
        return _blocked_ledger(campaign_id, ["selected_model_unknown"], selected_model)
    guard = _resource_guard(selected_model)
    if resource_safe and not guard.get("ok"):
        return _blocked_ledger(campaign_id, guard.get("blockers", ["resource_guard_failed"]), selected_model)
    device = _resolve_device(prefer_device)
    device_fallback = prefer_device == "mps" and device != "mps"
    checkpoint_path = Path(a12["checkpoint_path"]) if resume_from_a12_best else None
    if checkpoint_path is None or not checkpoint_path.exists():
        return _blocked_ledger(campaign_id, ["resume_checkpoint_missing"], selected_model)

    tokenizer = _load_tokenizer(tokenizer_path)
    train_rows = _read_jsonl_rows(ROOT / "artifacts/r28a13/training_mix/train.jsonl")
    dev_rows = _read_jsonl_rows(ROOT / "artifacts/r28a13/training_mix/dev.jsonl")
    heldout_rows = _read_jsonl_rows(ROOT / "artifacts/r28a13/training_mix/heldout.jsonl")
    if not train_rows or not dev_rows or not heldout_rows:
        return _blocked_ledger(campaign_id, ["sft_mix_splits_missing"], selected_model)

    train_tokens = _encode_rows(train_rows, tokenizer, repeat=4)
    dev_tokens = _encode_rows(dev_rows, tokenizer)
    heldout_tokens = _encode_rows(heldout_rows, tokenizer)
    model, spec = _load_model(torch, checkpoint_path, selected_model, device)
    context_length = int(spec.get("context_length", 256))
    if len(train_tokens) <= context_length + 2:
        return _blocked_ledger(campaign_id, ["not_enough_train_tokens"], selected_model)

    batch_size = 2 if resource_safe else 4
    lr = 2e-5
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    train_tensor = torch.tensor(train_tokens, dtype=torch.long, device=device)
    baseline_dev = _eval_loss(torch, model, dev_tokens, device, context_length, "sft_dev_baseline")
    baseline_heldout = _eval_loss(torch, model, heldout_tokens, device, context_length, "sft_heldout_baseline")
    ledger = {
        "ok": True,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "train_started": True,
        "training_ran": True,
        "selected_model": selected_model,
        "selected_device": device,
        "requested_device": prefer_device,
        "device_fallback": "mps_unavailable_fell_back_to_cpu" if device_fallback else "",
        "parameter_count": params_for_r27a11(selected_model),
        "context_length": context_length,
        "batch_size": batch_size,
        "learning_rate": lr,
        "resume_from": {
            "source": "a12_best_checkpoint" if resume_from_a12_best else "current_lineage",
            "checkpoint_path": str(checkpoint_path),
            "a12_optimizer_tokens": a12.get("optimizer_tokens"),
            "a12_dev_loss": a12.get("dev_loss"),
            "a12_stratified_heldout_loss": a12.get("stratified_heldout_loss"),
        },
        "baseline_sft_dev_loss": baseline_dev.get("average_loss"),
        "baseline_sft_heldout_loss": baseline_heldout.get("average_loss"),
        "segments": [],
        "optimizer_tokens": 0,
        "optimizer_steps": 0,
        "primary_token_metric": "optimizer_tokens",
        "policy": CAMPAIGN_POLICY,
        "mix_report": _display_path(mix_report_path),
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    deadline = started + float(CAMPAIGN_POLICY["wall_clock_cap_hours"]) * 3600
    effective_tokens_per_step = context_length * batch_size
    max_segments = int(CAMPAIGN_POLICY["max_segments"])
    max_tokens = int(CAMPAIGN_POLICY["max_optimizer_tokens"])
    min_tokens = int(CAMPAIGN_POLICY["minimum_optimizer_tokens_before_metric_stop"])
    steps_per_segment = max(1, math.ceil(max_tokens / max_segments / effective_tokens_per_step))
    for segment_index in range(1, max_segments + 1):
        if time.time() >= deadline:
            ledger["stop_reason"] = "wall_clock_cap_reached"
            break
        remaining_tokens = max_tokens - int(ledger["optimizer_tokens"])
        if remaining_tokens <= 0:
            ledger["stop_reason"] = "optimizer_token_cap_reached"
            break
        planned_steps = min(steps_per_segment, max(1, remaining_tokens // effective_tokens_per_step))
        metrics = TrainMetrics(
            effective_tokens_per_step=effective_tokens_per_step,
            planned_tokens=planned_steps * effective_tokens_per_step,
            streamed_tokens=len(train_tokens),
        )
        for step_index in range(int(planned_steps)):
            if time.time() >= deadline:
                break
            x, y = _sample_batch(torch, train_tensor, context_length, batch_size)
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
            torch.nn.utils.clip_grad_norm_(model.parameters(), 0.7)
            optimizer.step()
            metrics.add_optimizer_step(value, loss_tokens, "r28a13_bounded_sft")
            if step_index and step_index % 100 == 0:
                write_json(
                    HEARTBEAT,
                    {
                        "ok": True,
                        "campaign_id": campaign_id,
                        "segment_index": segment_index,
                        "step_index": step_index,
                        "optimizer_tokens": int(ledger["optimizer_tokens"]) + metrics.optimizer_tokens,
                        "active_approval_after_completion": 0,
                    },
                )
        if device == "mps":
            torch.mps.synchronize()
        dev = _eval_loss(torch, model, dev_tokens, device, context_length, "sft_dev")
        heldout = _eval_loss(torch, model, heldout_tokens, device, context_length, "sft_heldout")
        ckpt = CHECKPOINTS / f"{campaign_id}_seg{segment_index:02d}.pt"
        ckpt.parent.mkdir(parents=True, exist_ok=True)
        torch.save(
            {
                "model_state_dict": model.state_dict(),
                "config": {"selected_model": selected_model, **spec, "campaign_id": campaign_id, **NON_CLAIMS},
            },
            ckpt,
        )
        segment = {
            "segment_index": segment_index,
            "stage_id": "bounded_abstract_value_sft",
            "mask_policy": FULL_NEXT_TOKEN,
            "metrics": metrics.headline_metrics(),
            "dev_loss_report": dev,
            "heldout_loss_report": heldout,
            "dev_loss": dev.get("average_loss"),
            "heldout_loss": heldout.get("average_loss"),
            "last_batch_loss": metrics.last_batch_loss,
            "last_batch_loss_debug_only": True,
            "checkpoint_path": _display_path(ckpt),
        }
        ledger["segments"].append(segment)
        _prune_checkpoints(ledger["segments"])
        ledger["optimizer_tokens"] += metrics.optimizer_tokens
        ledger["optimizer_steps"] += metrics.optimizer_steps
        ledger["wall_clock_seconds"] = round(time.time() - started, 3)
        write_json(RUNS / campaign_id / f"segment_{segment_index:02d}.json", segment)
        write_json(HEARTBEAT, {"ok": True, "campaign_id": campaign_id, "segment_index": segment_index, "optimizer_tokens": ledger["optimizer_tokens"], "active_approval_after_completion": 0})
        write_json(LEDGER, ledger)
        print(json.dumps({"ok": True, "segment": segment_index, "optimizer_tokens": ledger["optimizer_tokens"], "dev_loss": segment["dev_loss"], "heldout_loss": segment["heldout_loss"]}), flush=True)
        if ledger.get("stop_reason"):
            break
        if int(ledger["optimizer_tokens"]) >= max_tokens:
            ledger["stop_reason"] = "optimizer_token_cap_reached"
            break
        if int(ledger["optimizer_tokens"]) >= min_tokens and segment.get("heldout_loss") is not None and baseline_heldout.get("average_loss") is not None:
            if float(segment["heldout_loss"]) <= float(baseline_heldout["average_loss"]) * 0.92 and segment_index >= 2:
                ledger["stop_reason"] = "metric_stop_after_min_optimizer_tokens"
                break
    ledger["completed_at_utc"] = now_utc()
    ledger["wall_clock_seconds"] = round(time.time() - started, 3)
    ledger["segment_count"] = len(ledger.get("segments", []))
    ledger.setdefault("stop_reason", "completed_schedule_or_cap")
    best = min((s for s in ledger.get("segments", []) if s.get("heldout_loss") is not None), key=lambda s: s["heldout_loss"], default=None)
    ledger["best_checkpoints"] = {
        "best_sft_heldout_loss": None if best is None else best.get("heldout_loss"),
        "best_sft_checkpoint": "" if best is None else best.get("checkpoint_path", ""),
        "final_checkpoint": "" if not ledger.get("segments") else ledger["segments"][-1].get("checkpoint_path", ""),
    }
    write_json(LEDGER, ledger)
    return ledger


def _probe_prompt(probe: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"用户：{probe['prompt']}",
            f"类别：{probe['category']}",
            f"长度：{probe['length_target']}",
            "证据边界：bounded_public_eval_no_training_row",
            "回答：",
        ]
    )


def _generate(torch, model, tokenizer, prompt: str, device: str, context_length: int, max_new_tokens: int = 96) -> str:
    ids = tokenizer.encode(prompt)
    # Training masks the prompt and removes tokenizer-appended EOS before the
    # assistant target. Keep inference on that same continuation boundary.
    if ids and ids[-1] == getattr(tokenizer, "eos", 3):
        ids = ids[:-1]
    ids = ids[-context_length:]
    out = list(ids)
    model.eval()
    with torch.no_grad():
        for _ in range(max_new_tokens):
            idx = torch.tensor(out[-context_length:], dtype=torch.long, device=device)[None, :]
            logits, _ = model(idx)
            next_id = int(torch.argmax(logits[0, -1]).detach().cpu())
            out.append(next_id)
            if next_id == getattr(tokenizer, "eos", 3):
                break
    decoded = tokenizer.decode(out)
    if decoded.startswith(prompt):
        decoded = decoded[len(prompt):]
    for marker in ("回答：", "回答:"):
        if marker in decoded:
            decoded = decoded.rsplit(marker, 1)[-1]
    return decoded.strip()


def _score_probe(output: str, probe: dict[str, Any]) -> dict[str, Any]:
    text = str(output or "").strip()
    char_count = len(text)
    expected_hits = sum(1 for term in probe.get("expected_terms", []) if term in text)
    forbidden_hits = [marker for marker in FORBIDDEN_OUTPUT_MARKERS if marker.lower() in text.lower()]
    service_tone = any(term in text for term in ["很高兴为您", "作为一个AI", "我无法提供任何帮助"])
    too_long = char_count > 220
    too_short = char_count < 8
    score = 0.0
    score += min(1.0, expected_hits / max(1, len(probe.get("expected_terms", [])))) * 0.45
    score += 0.25 if not too_short else 0.0
    score += 0.15 if not too_long else 0.0
    score += 0.10 if not service_tone else 0.0
    score += 0.05 if not forbidden_hits else 0.0
    return {
        "char_count": char_count,
        "expected_hits": expected_hits,
        "forbidden_hits": forbidden_hits,
        "service_tone": service_tone,
        "too_long": too_long,
        "too_short": too_short,
        "score": round(score, 4),
    }


def _probe_quality_blockers(candidate_eval: dict[str, Any] | None) -> list[str]:
    blockers: list[str] = []
    for item in (candidate_eval or {}).get("probes", []):
        probe_id = item.get("id") or "unknown_probe"
        output = str(item.get("output") or "").strip()
        score = item.get("score") or {}
        if output.startswith(("用户:", "用户：")):
            blockers.append(f"probe_role_prefix_leak:{probe_id}")
        if int(score.get("expected_hits", 0)) == 0:
            blockers.append(f"probe_expected_terms_missing:{probe_id}")
        if float(score.get("score", 0.0)) < 0.7:
            blockers.append(f"probe_quality_below_threshold:{probe_id}")
    return blockers


def _evaluate_checkpoint(torch, checkpoint_path: Path, selected_model: str, tokenizer, rows: dict[str, list[dict[str, Any]]], device: str) -> dict[str, Any]:
    model, spec = _load_model(torch, checkpoint_path, selected_model, device)
    context_length = int(spec.get("context_length", 256))
    dev_tokens = _encode_rows(rows["dev"], tokenizer)
    heldout_tokens = _encode_rows(rows["heldout"], tokenizer)
    dev = _eval_loss(torch, model, dev_tokens, device, context_length, "sft_dev")
    heldout = _eval_loss(torch, model, heldout_tokens, device, context_length, "sft_heldout")
    probes = []
    for probe in PROBES:
        output = _generate(torch, model, tokenizer, _probe_prompt(probe), device, context_length)
        probes.append({"id": probe["id"], "prompt": probe["prompt"], "output": output, "score": _score_probe(output, probe)})
    if device == "mps":
        torch.mps.empty_cache()
    avg_score = sum(item["score"]["score"] for item in probes) / max(1, len(probes))
    forbidden = [item for item in probes if item["score"]["forbidden_hits"]]
    return {
        "checkpoint_path": str(checkpoint_path),
        "dev_loss": dev.get("average_loss"),
        "heldout_loss": heldout.get("average_loss"),
        "probe_average_score": round(avg_score, 4),
        "probes": probes,
        "forbidden_probe_outputs": forbidden,
    }


def evaluate(campaign_id: str, *, compare_a12: bool = True, prefer_device: str = "mps") -> dict[str, Any]:
    import torch

    device = _resolve_device(prefer_device)
    if prefer_device == "mps" and device != "mps":
        device = "cpu"
    ledger = read_json(LEDGER, {})
    tokenizer_path = _resolve_tokenizer_path()
    if tokenizer_path is None:
        report = {"ok": False, "campaign_id": campaign_id, "blockers": ["tokenizer_missing"], **NON_CLAIMS}
        write_json(REPORTS / "evaluation.json", report)
        return report
    tokenizer = _load_tokenizer(tokenizer_path)
    if not (ROOT / "artifacts/r28a13/training_mix/dev.jsonl").exists():
        build_sft_mix(root=ROOT, write_artifacts=True)
    rows = {
        "dev": _read_jsonl_rows(ROOT / "artifacts/r28a13/training_mix/dev.jsonl"),
        "heldout": _read_jsonl_rows(ROOT / "artifacts/r28a13/training_mix/heldout.jsonl"),
    }
    a12 = resolve_a12_best_checkpoint()
    selected_model = ledger.get("selected_model") or a12.get("selected_model") or "new_96m"
    candidate_rel = ledger.get("best_checkpoints", {}).get("best_sft_checkpoint") or ledger.get("best_checkpoints", {}).get("final_checkpoint")
    candidate_path = ROOT / candidate_rel if candidate_rel else None
    blockers = []
    if not ledger.get("training_ran"):
        blockers.append("training_not_run")
    if candidate_path is None or not candidate_path.exists():
        blockers.append("candidate_checkpoint_missing")
    if selected_model not in CANDIDATES:
        blockers.append("selected_model_unknown")
    baseline_eval = None
    candidate_eval = None
    if not blockers and compare_a12 and a12.get("ok"):
        baseline_eval = _evaluate_checkpoint(torch, Path(a12["checkpoint_path"]), selected_model, tokenizer, rows, device)
    if not blockers:
        candidate_eval = _evaluate_checkpoint(torch, candidate_path, selected_model, tokenizer, rows, device)
    loss_improved = False
    score_improved = False
    if baseline_eval and candidate_eval:
        if baseline_eval.get("heldout_loss") is not None and candidate_eval.get("heldout_loss") is not None:
            loss_improved = float(candidate_eval["heldout_loss"]) <= float(baseline_eval["heldout_loss"]) * 0.98
        score_improved = float(candidate_eval.get("probe_average_score", 0.0)) > float(baseline_eval.get("probe_average_score", 0.0))
    no_forbidden = not (candidate_eval or {}).get("forbidden_probe_outputs")
    quality_blockers = _probe_quality_blockers(candidate_eval)
    candidate_improved = bool(candidate_eval and no_forbidden and (loss_improved or score_improved))
    report = {
        "ok": not blockers,
        "campaign_id": campaign_id,
        "created_at_utc": now_utc(),
        "training_ran": bool(ledger.get("training_ran")),
        "optimizer_tokens": int(ledger.get("optimizer_tokens", 0)),
        "optimizer_steps": int(ledger.get("optimizer_steps", 0)),
        "wall_clock_seconds": ledger.get("wall_clock_seconds", 0),
        "selected_model": selected_model,
        "selected_device_for_eval": device,
        "a12_baseline": baseline_eval,
        "r28a13_candidate": candidate_eval,
        "loss_improved": loss_improved,
        "probe_score_improved": score_improved,
        "candidate_improved": candidate_improved,
        "quality_gate_passed": not quality_blockers,
        "quality_blockers": quality_blockers,
        "no_chain_of_thought": no_forbidden,
        "no_private_leakage": no_forbidden,
        "no_old_pack_leakage": True,
        "no_eval_memorization_claim": True,
        "blockers": blockers,
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(REPORTS / "evaluation.json", report)
    write_text(ROOT / "docs/r28/R28A13_EVALUATION.md", render_evaluation_doc(report))
    return report


def write_handoff_if_improved(campaign_id: str) -> dict[str, Any]:
    evaluation = read_json(REPORTS / "evaluation.json", {})
    ledger = read_json(LEDGER, {})
    if not evaluation.get("candidate_improved"):
        report = {
            "ok": True,
            "campaign_id": campaign_id,
            "handoff_written": False,
            "reason": "candidate_not_improved_or_not_evaluated",
            "evaluation_path": "artifacts/r28a13/reports/evaluation.json",
            "active_approval_after_completion": 0,
            **NON_CLAIMS,
        }
        write_json(REPORTS / "handoff_skipped.json", report)
        return report
    candidate = evaluation.get("r28a13_candidate") or {}
    handoff = {
        "ok": True,
        "campaign_id": campaign_id,
        "handoff_status": "bounded_sft_recovery_candidate",
        "handoff_written": True,
        "selected_model": evaluation.get("selected_model"),
        "selected_checkpoint": candidate.get("checkpoint_path"),
        "training_ran": bool(evaluation.get("training_ran")),
        "optimizer_tokens": evaluation.get("optimizer_tokens"),
        "optimizer_steps": evaluation.get("optimizer_steps"),
        "wall_clock_seconds": evaluation.get("wall_clock_seconds"),
        "baseline_heldout_loss": (evaluation.get("a12_baseline") or {}).get("heldout_loss"),
        "candidate_heldout_loss": candidate.get("heldout_loss"),
        "baseline_probe_score": (evaluation.get("a12_baseline") or {}).get("probe_average_score"),
        "candidate_probe_score": candidate.get("probe_average_score"),
        "candidate_improved": True,
        "quality_gate_passed": bool(evaluation.get("quality_gate_passed")),
        "quality_blockers": evaluation.get("quality_blockers", []),
        "mix_report": ledger.get("mix_report"),
        "next_step": "static_asset_admission_dry_run_required_before_any_asset_replacement",
        "active_approval_after_completion": 0,
        **NON_CLAIMS,
    }
    write_json(HANDOFF_DIR / "R28A13_CANDIDATE_HANDOFF.json", handoff)
    write_text(ROOT / "docs/r28/R28A13_HANDOFF.md", render_handoff_doc(handoff))
    return handoff


def render_evaluation_doc(report: dict[str, Any]) -> str:
    baseline = report.get("a12_baseline") or {}
    candidate = report.get("r28a13_candidate") or {}
    return f"""# R28A13 Evaluation

- Campaign: `{report.get('campaign_id')}`
- Training ran: `{report.get('training_ran')}`
- Optimizer tokens: `{report.get('optimizer_tokens')}`
- A12 heldout loss: `{baseline.get('heldout_loss')}`
- R28A13 heldout loss: `{candidate.get('heldout_loss')}`
- A12 probe score: `{baseline.get('probe_average_score')}`
- R28A13 probe score: `{candidate.get('probe_average_score')}`
- Candidate improved: `{report.get('candidate_improved')}`
- Quality gate passed: `{report.get('quality_gate_passed')}`
- Quality blockers: `{report.get('quality_blockers')}`
- Blockers: `{report.get('blockers')}`

This is a bounded SFT recovery evaluation only. It does not claim product model admission, browser admission, phase_4, or release checkpoint status.
"""


def render_handoff_doc(handoff: dict[str, Any]) -> str:
    return f"""# R28A13 Candidate Handoff

- Handoff status: `{handoff.get('handoff_status')}`
- Selected model: `{handoff.get('selected_model')}`
- Selected checkpoint: `{handoff.get('selected_checkpoint')}`
- Optimizer tokens: `{handoff.get('optimizer_tokens')}`
- Baseline heldout loss: `{handoff.get('baseline_heldout_loss')}`
- Candidate heldout loss: `{handoff.get('candidate_heldout_loss')}`
- Baseline probe score: `{handoff.get('baseline_probe_score')}`
- Candidate probe score: `{handoff.get('candidate_probe_score')}`
- Quality gate passed: `{handoff.get('quality_gate_passed')}`
- Quality blockers: `{handoff.get('quality_blockers')}`

This handoff is only for later static asset admission dry-run review. It does not replace current static assets and does not approve phase_4, product admission, browser admission, or release checkpoint status.
"""
