import platform
import time
from pathlib import Path

from src.training.model_lab.model_ladder import MODEL_LADDER, browser_size_estimates, choose_model
from src.training.model_lab.mini_decoder import build_tiny_gpt


PROBE_CANDIDATES = [
    ("mini_8m", [256, 384, 512]),
    ("mps_30m", [256, 384, 512]),
    ("mps_60m", [256, 384]),
    ("mps_100m", [256]),
    ("mps_120m", [256]),
]


def torch_device_info():
    try:
        import torch
        return {
            "torch_available": True,
            "torch_version": torch.__version__,
            "mps_is_available": bool(torch.backends.mps.is_available()),
            "mps_is_built": bool(torch.backends.mps.is_built()),
            "cuda_is_available": bool(torch.cuda.is_available()),
        }
    except Exception as exc:
        return {
            "torch_available": False,
            "torch_version": "",
            "mps_is_available": False,
            "mps_is_built": False,
            "cuda_is_available": False,
            "torch_error": repr(exc),
        }


def detect_total_memory_bytes():
    try:
        import os
        if hasattr(os, "sysconf"):
            return int(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES"))
    except Exception:
        return None
    return None


def _bench_matmul(device):
    import torch
    size = 512 if device != "cpu" else 384
    a = torch.randn(size, size, device=device)
    b = torch.randn(size, size, device=device)
    start = time.perf_counter()
    c = a @ b
    if device == "mps":
        torch.mps.synchronize()
    return {"ok": True, "seconds": time.perf_counter() - start, "shape": [size, size], "checksum": float(c[0, 0].detach().cpu())}


def _bench_model(model_size, context_length, device, vocab_size=16000):
    import torch
    cfg = choose_model(model_size, device, vocab_size, context_length)
    batch_size = 1 if model_size in {"mps_100m", "mps_120m"} else (2 if device == "mps" else 1)
    start = time.perf_counter()
    model = build_tiny_gpt(vocab_size, cfg["context_length"], cfg["n_layer"], cfg["n_head"], cfg["n_embd"], cfg["dropout"]).to(device)
    x = torch.randint(0, vocab_size, (batch_size, cfg["context_length"]), device=device)
    y = torch.randint(0, vocab_size, (batch_size, cfg["context_length"]), device=device)
    _, loss = model(x, y)
    loss.backward()
    if device == "mps":
        torch.mps.synchronize()
    seconds = time.perf_counter() - start
    tokens = batch_size * cfg["context_length"]
    return {
        "ok": True,
        "device": device,
        "model_size": model_size,
        "context_length": cfg["context_length"],
        "batch_size": batch_size,
        "estimated_params": cfg["estimated_params"],
        "seconds": seconds,
        "tokens_per_second": tokens / max(seconds, 1e-9),
        "browser_size_estimates": browser_size_estimates(cfg["estimated_params"]),
    }


def run_mps_probe(root="."):
    info = torch_device_info()
    import torch
    device = "mps" if info["mps_is_available"] else ("cuda" if info["cuda_is_available"] else "cpu")
    out = {
        "ok": True,
        "python_version": platform.python_version(),
        **info,
        "device": device,
        "cpu_fallback": device == "cpu",
        "total_memory_bytes": detect_total_memory_bytes(),
        "benchmarks": [],
        "stable_candidates": [],
        "fallback_reason": "" if device != "cpu" else "mps_unavailable_cuda_unavailable",
        "notes": [],
    }
    for dev in ["cpu"] + ([device] if device not in {"cpu"} else []):
        try:
            out[f"{dev}_matmul"] = _bench_matmul(dev)
        except Exception as exc:
            out[f"{dev}_matmul"] = {"ok": False, "error": repr(exc)}
    for model_size, contexts in PROBE_CANDIDATES:
        for ctx in contexts:
            if device == "cpu" and (model_size != "mini_8m" or ctx > 256):
                cfg = choose_model(model_size, "cpu", 16000, ctx)
                out["benchmarks"].append({
                    "ok": False,
                    "model_size": model_size,
                    "context_length": min(ctx, MODEL_LADDER[model_size]["context_length"]),
                    "device": "cpu",
                    "skipped": True,
                    "skip_reason": "mps_unavailable_large_cpu_probe_skipped_to_avoid_instability",
                    "estimated_params": cfg["estimated_params"],
                    "browser_size_estimates": browser_size_estimates(cfg["estimated_params"]),
                })
                continue
            try:
                result = _bench_model(model_size, ctx, device)
                out["benchmarks"].append(result)
                if result["ok"]:
                    out["stable_candidates"].append(result)
            except RuntimeError as exc:
                msg = repr(exc)
                out["benchmarks"].append({"ok": False, "device": device, "model_size": model_size, "context_length": ctx, "error": msg, "oom_like": "out of memory" in msg.lower()})
            except Exception as exc:
                out["benchmarks"].append({"ok": False, "device": device, "model_size": model_size, "context_length": ctx, "error": repr(exc)})
    if not out["stable_candidates"]:
        out["notes"].append("No accelerator candidate was measured stable; use R27A6 mini8m fallback only.")
    return out
