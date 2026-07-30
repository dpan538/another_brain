from __future__ import annotations

import time

from src.training.model_lab.device_probe_safe import run_safe_device_probe
from src.training.model_lab.model_ladder import estimate_params


VOCAB_SIZE = 16000
STATIC_BUDGET_BYTES = 100_000_000
TOKENIZER_BYTES = 4_000_000
RUNTIME_OVERHEAD_BYTES = 30_000_000
SAFETY_MARGIN_BYTES = 8_000_000


SCALE_CATALOG = {
    "continue_best_mini8m": {"model_size": "mini_8m", "context_length": 256, "n_layer": 3, "n_head": 4, "n_embd": 192},
    "new_30m": {"model_size": "mps_30m", "context_length": 256, "n_layer": 8, "n_head": 8, "n_embd": 512},
    "new_60m": {"model_size": "mps_60m", "context_length": 256, "n_layer": 6, "n_head": 8, "n_embd": 704},
    "new_100m": {"model_size": "mps_100m", "context_length": 256, "n_layer": 8, "n_head": 14, "n_embd": 896},
    "new_125m": {"model_size": "mps_125m", "context_length": 256, "n_layer": 8, "n_head": 16, "n_embd": 1024},
    "new_150m": {"model_size": "mps_150m", "context_length": 256, "n_layer": 8, "n_head": 16, "n_embd": 1152},
    "200m_estimate_only": {"estimate_only": True, "params": 200_000_000},
    "0.5b_estimate_only": {"estimate_only": True, "params": 500_000_000},
    "2b_estimate_only": {"estimate_only": True, "params": 2_000_000_000},
}


def budget_for_params(params: int) -> dict:
    params = int(params)
    q4_model = int(params * 0.5)
    total = q4_model + TOKENIZER_BYTES + RUNTIME_OVERHEAD_BYTES + SAFETY_MARGIN_BYTES
    risk = "low" if total <= 80_000_000 else ("medium" if total <= STATIC_BUDGET_BYTES else ("high" if total <= 112_000_000 else "impossible"))
    return {
        "params": params,
        "q4_model_bytes": q4_model,
        "q4_total_estimate_bytes": total,
        "fits_100mb_q4": total <= STATIC_BUDGET_BYTES,
        "budget_risk": risk,
    }


def params_for(candidate: str) -> int:
    spec = SCALE_CATALOG[candidate]
    if spec.get("estimate_only"):
        return int(spec["params"])
    return estimate_params(VOCAB_SIZE, spec["context_length"], spec["n_layer"], spec["n_embd"])


def run_candidate(candidate: str, device: str, steps: int, cpu_safe: bool) -> dict:
    import torch

    from src.training.model_lab.mini_decoder import build_tiny_gpt

    spec = SCALE_CATALOG[candidate]
    params = params_for(candidate)
    budget = budget_for_params(params)
    base = {
        "candidate": candidate,
        "model_size": spec.get("model_size"),
        "context_length": spec.get("context_length", 256),
        "params": params,
        "budget": budget,
        "device": device,
    }
    if spec.get("estimate_only"):
        return {**base, "ok": False, "estimate_only": True, "skip_reason": "estimate_only"}
    if cpu_safe and device == "cpu" and candidate in {"new_100m", "new_125m", "new_150m"}:
        return {**base, "ok": False, "skipped": True, "skip_reason": "cpu_safe_large_training_not_recommended"}
    if candidate == "new_150m" and device != "mps":
        return {**base, "ok": False, "skipped": True, "skip_reason": "150m_requires_stable_mps_headroom"}
    start = time.perf_counter()
    try:
        model = build_tiny_gpt(VOCAB_SIZE, spec["context_length"], spec["n_layer"], spec["n_head"], spec["n_embd"], 0.0).to(device)
        optimizer = torch.optim.AdamW(model.parameters(), lr=0.0001)
        for _ in range(int(steps)):
            x = torch.randint(0, VOCAB_SIZE, (1, spec["context_length"]), device=device)
            y = torch.randint(0, VOCAB_SIZE, (1, spec["context_length"]), device=device)
            _, loss = model(x, y)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
        if device == "mps":
            torch.mps.synchronize()
        seconds = time.perf_counter() - start
        tokens = int(steps) * int(spec["context_length"])
        return {
            **base,
            "ok": True,
            "optimizer_steps": int(steps),
            "optimizer_tokens": tokens,
            "wall_clock_seconds": seconds,
            "tokens_per_second_optimizer": tokens / max(seconds, 1e-9),
            "loss": float(loss.detach().cpu()),
        }
    except RuntimeError as exc:
        return {**base, "ok": False, "error": repr(exc), "oom_like": "out of memory" in repr(exc).lower()}
    except Exception as exc:
        return {**base, "ok": False, "error": repr(exc)}


def select_for_a8b(results: list[dict], device: str) -> dict:
    viable = [r for r in results if r.get("ok") and r.get("budget", {}).get("fits_100mb_q4")]
    if device == "cpu":
        preferred = [r for r in viable if r["candidate"] in {"continue_best_mini8m", "new_30m"}]
    else:
        preferred = [r for r in viable if r["candidate"] in {"new_60m", "new_100m", "new_125m"}]
        if not preferred:
            preferred = viable
    preferred.sort(key=lambda r: int(r.get("params", 0)), reverse=True)
    return preferred[0] if preferred else {"candidate": "continue_best_mini8m", "ok": False}


def run_limited_scale_smoke(candidates: list[str], max_params: int, max_smoke_steps: int, prefer_device: str = "mps", cpu_safe: bool = True) -> dict:
    probe = run_safe_device_probe()
    device = "mps" if prefer_device == "mps" and probe.get("mps_is_available") else "cpu"
    results = []
    for candidate in candidates:
        if candidate not in SCALE_CATALOG:
            continue
        params = params_for(candidate)
        if params > int(max_params):
            results.append({"candidate": candidate, "ok": False, "params": params, "skipped": True, "skip_reason": "over_max_params"})
            continue
        results.append(run_candidate(candidate, device, max_smoke_steps, cpu_safe))
    selected = select_for_a8b(results, device)
    return {
        "ok": True,
        "selected_device": device,
        "device_probe": probe,
        "max_smoke_steps": int(max_smoke_steps),
        "cpu_safe": bool(cpu_safe),
        "results": results,
        "selected_candidate": selected,
        "estimate_only": {
            "200m_estimate_only": budget_for_params(200_000_000),
            "0.5b_estimate_only": budget_for_params(500_000_000),
            "2b_estimate_only": budget_for_params(2_000_000_000),
        },
    }
