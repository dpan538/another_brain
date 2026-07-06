from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import NON_CLAIMS, ROOT, now_utc, write_json, write_text
from src.training.eval.near100m_budget_planner import b4_bundle_bytes, budget_row
from src.training.model_lab.device_probe_safe import run_safe_device_probe
from src.training.model_lab.r27a11_scale_catalog import CANDIDATES, VOCAB_SIZE, params_for_r27a11, trainable_candidates


def resolve_device(prefer_device: str) -> tuple[str, dict[str, Any]]:
    probe = run_safe_device_probe()
    device = "cpu"
    if prefer_device == "mps" and probe.get("mps_is_available"):
        device = "mps"
    return device, probe


def run_candidate(candidate: str, device: str, steps: int, context_length: int, allow_cpu_large: bool = False) -> dict[str, Any]:
    import torch

    from src.training.model_lab.mini_decoder import build_tiny_gpt

    spec = dict(CANDIDATES[candidate])
    params = params_for_r27a11(candidate)
    base = {
        "candidate": candidate,
        "model_size": spec.get("model_size"),
        "context_length": int(context_length),
        "params": params,
        "device": device,
    }
    if spec.get("estimate_only"):
        return {**base, "ok": False, "skipped": True, "skip_reason": "estimate_only"}
    if device == "cpu" and params >= 75_000_000 and not allow_cpu_large:
        return {**base, "ok": False, "skipped": True, "skip_reason": "cpu_large_smoke_guard"}
    started = time.perf_counter()
    try:
        model = build_tiny_gpt(VOCAB_SIZE, int(context_length), int(spec["n_layer"]), int(spec["n_head"]), int(spec["n_embd"]), 0.0).to(device)
        optimizer = torch.optim.AdamW(model.parameters(), lr=0.0001)
        last_loss = None
        for _ in range(int(steps)):
            x = torch.randint(0, VOCAB_SIZE, (1, int(context_length)), device=device)
            y = torch.randint(0, VOCAB_SIZE, (1, int(context_length)), device=device)
            logits, _ = model(x)
            loss = torch.nn.functional.cross_entropy(logits.reshape(-1, logits.size(-1)), y.reshape(-1))
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            last_loss = float(loss.detach().cpu())
        if device == "mps":
            torch.mps.synchronize()
        seconds = time.perf_counter() - started
        tokens = int(steps) * int(context_length)
        return {
            **base,
            "ok": True,
            "optimizer_steps": int(steps),
            "optimizer_tokens": tokens,
            "wall_clock_seconds": seconds,
            "tokens_per_second_optimizer": tokens / max(seconds, 1e-9),
            "loss": last_loss,
        }
    except RuntimeError as exc:
        text = repr(exc)
        return {**base, "ok": False, "error": text[-1000:], "oom_like": "out of memory" in text.lower()}
    except Exception as exc:
        return {**base, "ok": False, "error": repr(exc)[-1000:]}


def run_scale_smoke(candidates: list[str], prefer_device: str = "mps", context_length: int = 256, max_smoke_steps: int = 20) -> dict[str, Any]:
    device, probe = resolve_device(prefer_device)
    b4, _ = b4_bundle_bytes(ROOT)
    budget_by_label = {name: budget_row(name, params_for_r27a11(name), b4, 4.0, True) for name in CANDIDATES if name.startswith("new_")}
    results = []
    for candidate in candidates:
        if candidate not in CANDIDATES:
            results.append({"candidate": candidate, "ok": False, "skipped": True, "skip_reason": "unknown_candidate"})
            continue
        if candidate not in trainable_candidates():
            results.append({"candidate": candidate, "ok": False, "skipped": True, "skip_reason": "estimate_only", "params": params_for_r27a11(candidate)})
            continue
        result = run_candidate(candidate, device, max_smoke_steps, context_length)
        result["full_static_budget"] = budget_by_label.get(candidate)
        results.append(result)
    viable = [
        row for row in results
        if row.get("ok") and row.get("full_static_budget", {}).get("fits_full_static_100mb") and row.get("candidate") != "new_100m_research"
    ]
    viable.sort(key=lambda row: int(row.get("params", 0)), reverse=True)
    selected = viable[0] if viable else None
    report = {
        "ok": True,
        "created_at_utc": now_utc(),
        "selected_device": device,
        "device_probe": probe,
        "context_length": int(context_length),
        "max_smoke_steps": int(max_smoke_steps),
        "results": results,
        "selected_product_path_model": None if selected is None else selected["candidate"],
        "selected_product_path_params": None if selected is None else selected["params"],
        "selected_product_path_smoke_ok": bool(selected),
        "research_model": "new_100m_research",
        "research_model_product_path": "research_only_not_product_budget_fit",
        **NON_CLAIMS,
    }
    return report


def write_scale_smoke_report(candidates: list[str], prefer_device: str = "mps", context_length: int = 256, max_smoke_steps: int = 20) -> dict[str, Any]:
    report = run_scale_smoke(candidates, prefer_device, context_length, max_smoke_steps)
    write_json(ROOT / "artifacts/r27a11/reports/scale_smoke.json", report)
    write_text(ROOT / "docs/r27/R27A11_SCALE_SMOKE.md", render_scale_smoke_doc(report))
    return report


def render_scale_smoke_doc(report: dict[str, Any]) -> str:
    rows = []
    for row in report.get("results", []):
        budget = row.get("full_static_budget") or {}
        rows.append(
            f"| `{row.get('candidate')}` | {row.get('params')} | `{row.get('device')}` | `{row.get('ok')}` | {row.get('optimizer_tokens', 0)} | {row.get('tokens_per_second_optimizer', '')} | `{budget.get('classification', row.get('skip_reason', ''))}` |"
        )
    return f"""# R27A11 Scale Smoke

R27A11 smoke checks are real instantiate/forward/backward/optimizer-step probes when the local device/resource guard allows them.

| Candidate | Params | Device | OK | Optimizer tokens | Optimizer tokens/sec | Budget/result |
| --- | ---: | --- | --- | ---: | ---: | --- |
{chr(10).join(rows)}

Selected product-path model after smoke: `{report.get('selected_product_path_model')}`.
"""
