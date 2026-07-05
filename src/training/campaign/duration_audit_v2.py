from __future__ import annotations

import json
from pathlib import Path

from src.training.campaign.token_accounting_v2 import optimizer_tokens_for_run, summarize_token_accounting


ROOT = Path(__file__).resolve().parents[3]


def read_json(path: Path, default=None):
    path = Path(path)
    if not path.exists():
        return {} if default is None else default
    return json.loads(path.read_text(encoding="utf-8"))


def sibling_roots() -> list[Path]:
    desktop = ROOT.parent
    names = [
        ROOT.name,
        "another_brain",
        "another_brain_train_r27a7r",
        "another_brain_train_r27a8",
    ]
    roots = []
    for name in names:
        path = desktop / name
        if path.exists() and path not in roots:
            roots.append(path)
    return roots


def discover_metrics(run_id: str) -> dict:
    for root in sibling_roots():
        path = root / "artifacts/r27a7/model_lab/runs" / run_id / "metrics.json"
        if path.exists():
            data = read_json(path)
            data["_metrics_source"] = str(path)
            return data
    return {}


def infer_context_and_batch(stage: dict, metrics: dict) -> tuple[int, int, int, str]:
    cfg = metrics.get("model_config", {})
    context = int(metrics.get("context_length") or cfg.get("context_length") or 0)
    batch = int(cfg.get("batch_size") or 0)
    grad = int(cfg.get("gradient_accumulation_steps") or 1)
    source = "metrics"
    if not context:
        context = 256
        source = "ledger_inferred_continue_mini8m_cpu"
    if not batch:
        device = stage.get("device") or "cpu"
        selected = stage.get("selected_scale") or ""
        batch = 4 if device == "cpu" else (1 if selected in {"new_100m", "new_125m", "new_150m"} else 8)
        source = "ledger_inferred_continue_mini8m_cpu"
    return context, batch, grad, source


def audit_r27a7_duration_tokens() -> dict:
    ledger = read_json(ROOT / "data/training_registry/r27a7_campaign_ledger.json")
    stages = []
    planned = streamed = optimizer = steps = 0
    ledger_complete = bool(ledger.get("stages"))
    for stage in ledger.get("stages", []):
        run_id = Path(stage.get("checkpoint_path", "")).stem
        metrics = discover_metrics(run_id)
        stage_steps = int(metrics.get("total_steps") or stage.get("steps") or 0)
        context, batch, grad, source = infer_context_and_batch(stage, metrics)
        opt = optimizer_tokens_for_run(stage_steps, context, batch, grad)
        planned_tokens = int(stage.get("train_tokens") or metrics.get("planned_tokens") or metrics.get("total_train_tokens") or 0)
        streamed_tokens = int(metrics.get("streamed_tokens") or metrics.get("total_train_tokens") or planned_tokens)
        planned += planned_tokens
        streamed += streamed_tokens
        optimizer += opt
        steps += stage_steps
        stages.append({
            "stage_id": stage.get("stage_id"),
            "run_id": run_id,
            "planned_tokens": planned_tokens,
            "streamed_tokens": streamed_tokens,
            "optimizer_tokens": opt,
            "optimizer_steps": stage_steps,
            "context_length": context,
            "batch_size": batch,
            "gradient_accumulation_steps": grad,
            "accounting_source": source,
            "metrics_found": bool(metrics),
            "dev_loss": stage.get("dev_loss"),
            "heldout_loss": stage.get("stratified_heldout_loss"),
        })
    summary = summarize_token_accounting(planned, streamed, optimizer, steps, float(ledger.get("observed_wall_clock_seconds") or 0.0), ledger_complete)
    report = summary.to_dict()
    report.update({
        "ok": ledger_complete,
        "campaign_id": ledger.get("campaign_id"),
        "segment_count": ledger.get("segment_count"),
        "stop_reason": ledger.get("stop_reason"),
        "selected_scale": ledger.get("selected_scale"),
        "device_result": ledger.get("device_result"),
        "r27a7_tokens_are_optimizer_consumed": report["token_accounting_trust"] == "high",
        "future_primary_metric": "optimizer_tokens",
        "stages": stages,
    })
    return report
