#!/usr/bin/env python3
"""Bounded continued-pretraining preflight over an admitted external shard.

All corpus and checkpoint outputs must be placed under ignored ``artifacts``.
This is a readiness experiment, never a product-admission path.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.training.campaign.r27a10_intake import NON_CLAIMS, now_utc, write_json
from src.training.campaign.r28a13_controller import _load_model, _load_tokenizer, _resolve_device, _resolve_tokenizer_path
from src.training.campaign.r29a8_foundation_source_gate import validate_source_manifest
from src.training.model_lab.loss_accounting import FULL_NEXT_TOKEN, LossAccumulator, token_weighted_torch_loss


CAMPAIGN_ID = "r29a8_foundation_preflight_v1"
POLICY = {"campaign_id": CAMPAIGN_ID, "selected_model": "new_96m", "max_optimizer_tokens": 120_000, "context_length": 256, "batch_size": 1, "learning_rate": 2e-6, "require_mps": True, "allow_weight_commit": False, "allow_processed_corpus_commit": False, "product_model_admission": False, "browser_admission": False}


def read_split_tokens(path: Path, split: str, tokenizer, cap: int) -> list[int]:
    tokens: list[int] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        if row.get("split") != split:
            continue
        remaining = cap - len(tokens)
        if remaining <= 0:
            break
        ids = list(tokenizer.encode(str(row.get("text", ""))))
        if ids and ids[0] == getattr(tokenizer, "bos", 2):
            ids = ids[1:]
        tokens.extend(ids[:remaining])
    return tokens


def evaluate(torch, model, tokens: list[int], device: str, context: int, split: str) -> dict:
    acc = LossAccumulator(split=split, mask_policy=FULL_NEXT_TOKEN)
    model.eval()
    with torch.no_grad():
        for start in range(0, min(len(tokens) - context - 1, context * 24), context):
            x = torch.tensor(tokens[start:start + context], dtype=torch.long, device=device)[None, :]
            y = torch.tensor(tokens[start + 1:start + context + 1], dtype=torch.long, device=device)[None, :]
            if x.shape[1] != context or y.shape[1] != context:
                continue
            logits, _ = model(x); _, count, loss = token_weighted_torch_loss(torch, logits, y); acc.add(float(loss.detach().cpu()), count, split)
    model.train()
    return acc.to_report()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--raw-source", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--campaign-id", default=CAMPAIGN_ID)
    parser.add_argument("--max-optimizer-tokens", type=int, default=POLICY["max_optimizer_tokens"])
    args = parser.parse_args()
    import torch

    if not 1 <= args.max_optimizer_tokens <= 480_000:
        raise SystemExit("max_optimizer_tokens must be between 1 and 480000")
    policy = {**POLICY, "campaign_id": args.campaign_id, "max_optimizer_tokens": args.max_optimizer_tokens}
    report_dir = args.artifact_root / "reports"; report_dir.mkdir(parents=True, exist_ok=True)
    source_manifest = {"source_id": "zhwiki_20260701_articles_part1", "snapshot_url": "https://dumps.wikimedia.org/zhwiki/latest/zhwiki-latest-pages-articles1.xml-p1p187712.bz2", "license": "CC-BY-SA-4.0", "license_url": "https://creativecommons.org/licenses/by-sa/4.0/", "retrieved_at_utc": "2026-07-31T05:43:00Z", "sha256": hashlib.sha256(args.raw_source.read_bytes()).hexdigest(), "declared_clean_tokens": 8_357_600, "reviewed": True, "heldout_exclusion": {"enabled": True, "method": "exact project R29 heldout phrase exclusion plus deterministic title split"}, "raw_external_text_committed": False, "processed_corpus_committed": False}
    admission = validate_source_manifest(source_manifest)
    if not admission["ok"]:
        write_json(report_dir / "preflight_ledger.json", {"ok": False, "campaign_id": args.campaign_id, "stop_reason": "source_admission_failed", "admission": admission, **NON_CLAIMS}); return
    device = _resolve_device("mps")
    if POLICY["require_mps"] and device != "mps":
        write_json(report_dir / "preflight_ledger.json", {"ok": False, "campaign_id": args.campaign_id, "stop_reason": "mps_required_but_unavailable", **NON_CLAIMS}); return
    tokenizer_path = _resolve_tokenizer_path()
    if tokenizer_path is None:
        write_json(report_dir / "preflight_ledger.json", {"ok": False, "campaign_id": args.campaign_id, "stop_reason": "tokenizer_missing", **NON_CLAIMS}); return
    tokenizer = _load_tokenizer(tokenizer_path); context = POLICY["context_length"]
    train = read_split_tokens(args.candidate, "train", tokenizer, 1_000_000); dev = read_split_tokens(args.candidate, "dev", tokenizer, 120_000); heldout = read_split_tokens(args.candidate, "heldout", tokenizer, 120_000)
    if min(len(train), len(dev), len(heldout)) <= context + 1:
        write_json(report_dir / "preflight_ledger.json", {"ok": False, "campaign_id": args.campaign_id, "stop_reason": "candidate_split_too_small", "token_counts": {"train": len(train), "dev": len(dev), "heldout": len(heldout)}, **NON_CLAIMS}); return
    model, spec = _load_model(torch, args.checkpoint, policy["selected_model"], device)
    baseline = {"dev": evaluate(torch, model, dev, device, context, "foundation_dev_baseline"), "heldout": evaluate(torch, model, heldout, device, context, "foundation_heldout_baseline")}
    ledger = {"ok": True, "campaign_id": args.campaign_id, "created_at_utc": now_utc(), "train_started": True, "training_ran": True, "selected_device": device, "resume_from": str(args.checkpoint), "token_counts": {"train": len(train), "dev": len(dev), "heldout": len(heldout)}, "baseline": baseline, "admission": admission, "policy": policy, "optimizer_tokens": 0, "optimizer_steps": 0, "segments": [], **NON_CLAIMS}; write_json(report_dir / "preflight_ledger.json", ledger)
    tensor = torch.tensor(train, dtype=torch.long, device=device); optimizer = torch.optim.AdamW(model.parameters(), lr=policy["learning_rate"], weight_decay=.01); acc = LossAccumulator(split="foundation_preflight_train", mask_policy=FULL_NEXT_TOKEN); started = time.time()
    while ledger["optimizer_tokens"] < policy["max_optimizer_tokens"]:
        start = int(torch.randint(0, tensor.numel() - context - 1, (1,), device=device).item()); x = tensor[start:start + context][None, :]; y = tensor[start + 1:start + context + 1][None, :]
        logits, _ = model(x); _, count, loss = token_weighted_torch_loss(torch, logits, y); value = float(loss.detach().cpu())
        if not math.isfinite(value): ledger.update({"ok": False, "stop_reason": "nan_loss", "blockers": ["nan_loss"]}); break
        optimizer.zero_grad(set_to_none=True); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); optimizer.step(); acc.add(value, count, FULL_NEXT_TOKEN); ledger["optimizer_tokens"] += int(count); ledger["optimizer_steps"] += 1
        if ledger["optimizer_steps"] % 25 == 0: write_json(report_dir / "heartbeat_latest.json", {"ok": True, "campaign_id": args.campaign_id, "optimizer_tokens": ledger["optimizer_tokens"], "optimizer_steps": ledger["optimizer_steps"], "phase": "continued_pretraining"})
    if device == "mps": torch.mps.synchronize()
    final = {"dev": evaluate(torch, model, dev, device, context, "foundation_dev_final"), "heldout": evaluate(torch, model, heldout, device, context, "foundation_heldout_final")}
    checkpoint = args.artifact_root / "checkpoints" / f"{args.campaign_id}_last.pt"
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"model_state_dict": model.state_dict(), "config": {**spec, "campaign_id": args.campaign_id, "source_manifest_sha256": source_manifest["sha256"], "mask_policy": FULL_NEXT_TOKEN, **NON_CLAIMS}}, checkpoint)
    ledger.update({"completed_at_utc": now_utc(), "wall_clock_seconds": round(time.time() - started, 3), "running_train_loss": acc.to_report(), "final": final, "stop_reason": ledger.get("stop_reason", "optimizer_token_cap_reached")})
    improved = float(final["heldout"].get("average_loss", math.inf)) < float(baseline["heldout"].get("average_loss", math.inf))
    ledger["checkpoint_path"] = str(checkpoint)
    ledger["foundation_gate"] = {"passed": bool(ledger["ok"] and improved), "heldout_improved": improved, "product_model_admission": False, "browser_admission": False}; write_json(report_dir / "preflight_ledger.json", ledger); print(json.dumps(ledger, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
