from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / "artifacts/r27a8b"
MIN_DISK_FREE_BYTES = 8_000_000_000


def apply_thread_limits() -> dict:
    env = {
        "OMP_NUM_THREADS": "2",
        "MKL_NUM_THREADS": "2",
        "VECLIB_MAXIMUM_THREADS": "2",
    }
    os.environ.update(env)
    torch_threads_set = False
    try:
        import torch

        torch.set_num_threads(2)
        torch_threads_set = True
    except Exception:
        torch_threads_set = False
    return {"env": env, "torch_threads_set": torch_threads_set}


def memory_pressure() -> dict:
    try:
        proc = subprocess.run(["/usr/bin/vm_stat"], capture_output=True, text=True, timeout=3, check=False)
        if proc.returncode != 0:
            return {"available": False, "reason": "vm_stat_failed"}
        text = proc.stdout[-2000:]
        return {"available": True, "summary_tail": text}
    except Exception as exc:
        return {"available": False, "reason": repr(exc)}


def checkpoint_write_probe(path: Path | None = None) -> dict:
    path = path or ART / "reports/checkpoint_write_probe.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"ok": True, "purpose": "small_metadata_write_probe_not_a_checkpoint"}
    try:
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return {"ok": True, "path": str(path.relative_to(ROOT)), "bytes": path.stat().st_size}
    except Exception as exc:
        return {"ok": False, "path": str(path), "error": repr(exc)}


def preflight_resource_guard(root: Path = ROOT, min_disk_free_bytes: int = MIN_DISK_FREE_BYTES) -> dict:
    thread_report = apply_thread_limits()
    disk = shutil.disk_usage(root)
    write_probe = checkpoint_write_probe()
    report = {
        "ok": True,
        "resource_safe": True,
        "thread_limits": thread_report,
        "clipped_logs": True,
        "disk_free_bytes": int(disk.free),
        "disk_space_critical": disk.free < int(min_disk_free_bytes),
        "disk_min_free_bytes": int(min_disk_free_bytes),
        "checkpoint_write_check": write_probe,
        "memory_pressure": memory_pressure(),
        "blockers": [],
    }
    if report["disk_space_critical"]:
        report["blockers"].append("disk_space_critical")
    if not write_probe.get("ok"):
        report["blockers"].append("checkpoint_write_check_failed")
    report["ok"] = not report["blockers"]
    return report
