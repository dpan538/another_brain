from __future__ import annotations

import platform
import subprocess
import sys
import time
from pathlib import Path

from src.training.model_lab.resource_guard import apply_cpu_safe_defaults, disk_free_bytes, disk_is_critical


def python_arch() -> str:
    try:
        return subprocess.check_output(["/usr/bin/arch"], text=True).strip()
    except Exception:
        return platform.machine()


def tiny_smoke(torch, device: str) -> dict:
    from src.training.model_lab.mini_decoder import build_tiny_gpt

    start = time.perf_counter()
    model = build_tiny_gpt(16000, 64, 1, 2, 64, 0.0).to(device)
    x = torch.randint(0, 16000, (1, 64), device=device)
    y = torch.randint(0, 16000, (1, 64), device=device)
    _, loss = model(x, y)
    loss.backward()
    if device == "mps":
        torch.mps.synchronize()
    seconds = time.perf_counter() - start
    return {"ok": True, "seconds": seconds, "optimizer_tokens": 64, "tokens_per_second_optimizer": 64 / max(seconds, 1e-9)}


def run_safe_device_probe(root: Path | None = None) -> dict:
    root = root or Path.cwd()
    env = apply_cpu_safe_defaults()
    report = {
        "ok": True,
        "uname_machine": platform.uname().machine,
        "python_executable": sys.executable,
        "python_arch": python_arch(),
        "platform_machine": platform.machine(),
        "cpu_safe_env": env,
        "disk_free_bytes": disk_free_bytes(root),
        "disk_space_critical": disk_is_critical(root),
        "memory_detected_bytes": None,
        "torch_available": False,
        "torch_version": "",
        "mps_is_built": False,
        "mps_is_available": False,
        "cuda_is_available": False,
        "cpu_fallback": True,
        "selected_device": "cpu",
        "cpu_smoke": {"ok": False},
        "mps_smoke": {"ok": False, "skipped": True},
        "mps_repair_loop_attempted": False,
    }
    try:
        import torch
    except Exception as exc:
        report["torch_error"] = repr(exc)
        return report
    report.update({
        "torch_available": True,
        "torch_version": torch.__version__,
        "mps_is_built": bool(torch.backends.mps.is_built()),
        "mps_is_available": bool(torch.backends.mps.is_available()),
        "cuda_is_available": bool(torch.cuda.is_available()),
    })
    report["selected_device"] = "mps" if report["mps_is_available"] else ("cuda" if report["cuda_is_available"] else "cpu")
    report["cpu_fallback"] = report["selected_device"] == "cpu"
    try:
        report["cpu_smoke"] = tiny_smoke(torch, "cpu")
    except Exception as exc:
        report["cpu_smoke"] = {"ok": False, "error": repr(exc)}
        report["ok"] = False
    if report["mps_is_available"]:
        try:
            report["mps_smoke"] = tiny_smoke(torch, "mps")
        except Exception as exc:
            report["mps_smoke"] = {"ok": False, "error": repr(exc)}
            report["selected_device"] = "cpu"
            report["cpu_fallback"] = True
    return report
