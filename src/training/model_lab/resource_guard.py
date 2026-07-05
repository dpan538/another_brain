from __future__ import annotations

import os
import shutil


CPU_SAFE_ENV = {
    "OMP_NUM_THREADS": "2",
    "MKL_NUM_THREADS": "2",
    "VECLIB_MAXIMUM_THREADS": "2",
}


def apply_cpu_safe_defaults():
    for key, value in CPU_SAFE_ENV.items():
        os.environ.setdefault(key, value)
    try:
        import torch

        torch.set_num_threads(2)
    except Exception:
        pass
    return dict(CPU_SAFE_ENV)


def disk_free_bytes(path=".") -> int:
    return int(shutil.disk_usage(path).free)


def disk_is_critical(path=".", threshold_bytes=5_000_000_000) -> bool:
    return disk_free_bytes(path) < int(threshold_bytes)
