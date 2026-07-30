import json
import math
from collections import Counter
from pathlib import Path

from src.training.curriculum.token_budget import record_tokens
from src.training.distillation.candidate_queue import read_jsonl
from src.training.model_lab.model_ladder import choose_model
from src.training.model_lab.tokenizer_runtime import BPETokenizerRuntime
from src.training.model_lab.train_engineering import train_tiny_gpt


def detect_device():
    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def encode_rows(path, tokenizer, token_cap):
    rows = read_jsonl(path)
    tokens = []
    by_curr = Counter()
    for row in rows:
        ids = tokenizer.encode(row.get("text", ""))
        if len(tokens) + len(ids) > token_cap:
            ids = ids[: max(0, token_cap - len(tokens))]
        tokens.extend(ids)
        by_curr[row.get("curriculum", "unknown")] += len(ids)
        if len(tokens) >= token_cap:
            break
    return tokens, dict(by_curr), rows


def run_campaign(campaign_id, model_size, tokenizer_path, train_stream, dev_stream, heldout_stream, max_total_steps, max_total_train_tokens, context_length, run_label, artifact_root="artifacts/r27a4", resume_checkpoint=None, lineage_decision="new_lineage", learning_rate=0.0006):
    tokenizer = BPETokenizerRuntime.from_file(tokenizer_path)
    vocab_size = tokenizer.tokenizer.get_vocab_size()
    tokenizer_report_path = Path(tokenizer_path).with_name("tokenizer_report.json")
    tokenizer_report = {}
    if tokenizer_report_path.exists():
        tokenizer_report = json.loads(tokenizer_report_path.read_text(encoding="utf-8"))
    device = detect_device()
    cpu_downgrade_reason = ""
    if device == "cpu" and (max_total_steps > 6000 or max_total_train_tokens > 10000000):
        max_total_steps = min(max_total_steps, 6000)
        max_total_train_tokens = min(max_total_train_tokens, 10000000)
        cpu_downgrade_reason = "cpu_only_fallback_caps_6000_steps_10000000_tokens"
    chosen = choose_model(model_size, device, vocab_size, context_length)
    downgrade_reason = ""
    if device == "cpu" and model_size == "auto":
        max_total_steps = min(max_total_steps, 2500)
        max_total_train_tokens = min(max_total_train_tokens, 4000000)
        chosen = choose_model("mini_8m", device, vocab_size, min(context_length, 256))
        downgrade_reason = "cpu_only_auto_downgrade_to_mini_8m"
    if cpu_downgrade_reason:
        downgrade_reason = cpu_downgrade_reason if not downgrade_reason else f"{downgrade_reason};{cpu_downgrade_reason}"
    train_tokens, train_mix, train_rows = encode_rows(train_stream, tokenizer, max_total_train_tokens)
    dev_tokens, _, dev_rows = encode_rows(dev_stream, tokenizer, min(200000, max_total_train_tokens))
    heldout_tokens, _, heldout_rows = encode_rows(heldout_stream, tokenizer, min(200000, max_total_train_tokens))
    config = {
        **chosen,
        "batch_size": 8 if device != "cpu" else 4,
        "learning_rate": learning_rate,
        "max_steps": int(max_total_steps),
        "max_train_tokens": int(max_total_train_tokens),
        "phase_4": False,
        "product_model": False,
        "release_checkpoint": False,
    }
    model, metrics = train_tiny_gpt(train_tokens, dev_tokens, heldout_tokens, vocab_size, config, device, resume_checkpoint=resume_checkpoint)
    import torch
    art = Path(artifact_root) / "model_lab"
    ckpt_dir = art / "checkpoints"
    run_dir = art / "runs" / run_label
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    run_dir.mkdir(parents=True, exist_ok=True)
    ckpt = ckpt_dir / f"{run_label}.pt"
    torch.save({"model_state_dict": model.state_dict(), "config": config}, ckpt)
    report = {
        "ok": True,
        "campaign_id": campaign_id,
        "run_id": run_label,
        "device": device,
        "model_size": chosen["model_size"],
        "downgrade_reason": downgrade_reason,
        "model_config": config,
        "parameter_count": sum(p.numel() for p in model.parameters()),
        "tokenizer_type": tokenizer_report.get("tokenizer_type", "unknown_bpe"),
        "tokenizer_vocab_size": vocab_size,
        "context_length": config["context_length"],
        "total_steps": metrics["steps"],
        "total_train_tokens": len(train_tokens),
        "train_records": len(train_rows),
        "dev_records": len(dev_rows),
        "heldout_records": len(heldout_rows),
        "actual_curriculum_token_mix": train_mix,
        "lineage_decision": lineage_decision,
        "resumed_from_checkpoint": bool(resume_checkpoint),
        "checkpoint_input_path": str(resume_checkpoint or ""),
        "checkpoint_path": str(ckpt),
        "weights_committed": False,
        "product_model": False,
        "formal_decoder_training": False,
        "phase_4": False,
        "release_checkpoint": False,
        **metrics,
    }
    report["train_perplexity"] = math.exp(report["train_loss_end"]) if report["train_loss_end"] < 20 else None
    (run_dir / "metrics.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    (art / "latest_campaign.json").write_text(json.dumps({"campaign_id": campaign_id, "metrics_path": str(run_dir / "metrics.json")}, indent=2), encoding="utf-8")
    return report
