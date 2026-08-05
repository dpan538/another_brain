#!/usr/bin/env python3
"""Small, stage-marked native probes used by the R29B1R foreground supervisor.

Each action deliberately contains one responsibility.  In particular,
``import-only`` never asks MPS anything, and ``cpu-smoke`` never touches MPS.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import os
import platform
import resource
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


def emit(stage: str, **detail: Any) -> None:
    print(json.dumps({"event": "marker", "stage": stage, **detail}, ensure_ascii=False, sort_keys=True), flush=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_environment() -> dict[str, Any]:
    prefixes = ("CODEX_", "PYTORCH_", "TORCH_", "MPS_", "OMP_", "MKL_", "DYLD_")
    result: dict[str, Any] = {}
    for key in sorted(os.environ):
        if key.startswith(prefixes):
            value = os.environ[key]
            result[key] = {
                "present": True,
                "value": "<redacted>" if any(token in key.upper() for token in ("TOKEN", "SECRET", "KEY", "PASSWORD")) else value,
            }
    return result


def command_text(command: list[str]) -> dict[str, Any]:
    try:
        completed = subprocess.run(command, text=True, capture_output=True, timeout=20, check=False)
        return {"command": command, "exit_code": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"command": command, "error": str(error)}


def package_discovery() -> dict[str, Any]:
    emit("before_find_spec")
    spec = importlib.util.find_spec("torch")
    emit("after_find_spec", found=spec is not None)
    locations = list(spec.submodule_search_locations or []) if spec else []
    package_bytes = 0
    package_byte_paths: list[str] = []
    for location in locations:
        root = Path(location)
        if root.exists():
            # A full recursive walk over a multi-gigabyte wheel is not a
            # package-discovery probe; it can itself dominate the timeout.
            # Record the native payload size, which is the relevant evidence
            # for this diagnostic, without importing the package.
            candidates = list(root.glob("_C*.so")) + list((root / "lib").glob("*.dylib"))
            package_bytes += sum(path.stat().st_size for path in candidates if path.is_file())
            package_byte_paths.extend(str(path) for path in candidates if path.is_file())
    distribution: dict[str, Any]
    try:
        dist = importlib.metadata.distribution("torch")
        distribution = {"version": dist.version, "metadata_path": str(dist._path)}
    except importlib.metadata.PackageNotFoundError:
        distribution = {"missing": True}
    return {
        "spec_origin": spec.origin if spec else None,
        "submodule_search_locations": locations,
        "package_bytes": package_bytes,
        "package_bytes_method": "native_payload_subset_no_recursive_walk",
        "package_byte_paths": package_byte_paths,
        "distribution": distribution,
    }


def python_baseline() -> dict[str, Any]:
    emit("python_started")
    payload = {
        "executable": sys.executable,
        "version": sys.version,
        "machine": platform.machine(),
        "platform": platform.platform(),
        "prefix": sys.prefix,
        "base_prefix": sys.base_prefix,
        "path": sys.path,
    }
    emit("python_baseline_complete")
    return payload


def import_torch_only() -> dict[str, Any]:
    """Import the package without querying any device backend or allocating tensors."""
    emit("before_torch_import")
    import torch  # noqa: PLC0415

    emit("after_torch_import", torch_file=torch.__file__, torch_version=torch.__version__)
    return {"torch_version": torch.__version__, "torch_file": torch.__file__}


def cpu_smoke() -> dict[str, Any]:
    emit("before_cpu_smoke")
    import torch  # noqa: PLC0415

    x = torch.arange(12, dtype=torch.float32).reshape(3, 4)
    y = x @ x.T
    softmax = torch.nn.functional.softmax(y, dim=-1)
    normalized = torch.nn.LayerNorm(3)(y)
    descriptor, state_path = tempfile.mkstemp(prefix="r29b1r_tiny_state_", suffix=".pt")
    os.close(descriptor)
    try:
        torch.save({"state": {"x": x}}, state_path)
        loaded = torch.load(state_path, map_location="cpu", weights_only=True)
    finally:
        Path(state_path).unlink(missing_ok=True)
    finite = bool(torch.isfinite(softmax).all() and torch.isfinite(normalized).all())
    result = {
        "torch_version": torch.__version__,
        "matmul_sum": float(y.sum()),
        "softmax_finite": finite,
        "layernorm_finite": finite,
        "loaded_shape": list(loaded["state"]["x"].shape),
    }
    emit("after_cpu_smoke", **result)
    return result


def mps_built() -> dict[str, Any]:
    emit("before_mps_built")
    import torch  # noqa: PLC0415

    value = bool(torch.backends.mps.is_built())
    emit("after_mps_built", mps_built=value)
    return {"mps_built": value}


def mps_available() -> dict[str, Any]:
    emit("before_mps_available")
    import torch  # noqa: PLC0415

    value = bool(torch.backends.mps.is_available())
    emit("after_mps_available", mps_available=value)
    return {"mps_available": value}


def mps_allocation() -> dict[str, Any]:
    emit("before_mps_allocation")
    import torch  # noqa: PLC0415

    value = torch.ones(1, device="mps")
    torch.mps.synchronize()
    result = {"mps_value": float(value.cpu().item())}
    emit("after_mps_allocation", **result)
    return result


def environment_snapshot(install_report: Path | None) -> dict[str, Any]:
    discovery = package_discovery()
    try:
        freeze = command_text([sys.executable, "-m", "pip", "freeze"])
    except OSError as error:
        freeze = {"error": str(error)}
    limits = {}
    for name in ("RLIMIT_AS", "RLIMIT_DATA", "RLIMIT_NOFILE", "RLIMIT_NPROC", "RLIMIT_STACK"):
        value = getattr(resource, name, None)
        if value is not None:
            try:
                limits[name] = list(resource.getrlimit(value))
            except OSError as error:
                limits[name] = {"error": str(error)}
    available_ram = None
    try:
        available_ram = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_AVPHYS_PAGES")
    except (AttributeError, OSError, ValueError):
        pass
    install: dict[str, Any] = {}
    if install_report and install_report.exists():
        raw = json.loads(install_report.read_text(encoding="utf-8"))
        install = {
            "wheel_entries": raw.get("wheel_entries", []),
            "recorded_venv_python": raw.get("venv_python"),
            "recorded_pip_freeze": raw.get("pip_freeze"),
        }
    return {
        "python": python_baseline(),
        "torch_package_discovery": discovery,
        "sw_vers": command_text(["/usr/bin/sw_vers"]),
        "uname": command_text(["/usr/bin/uname", "-a"]),
        "pip_freeze": freeze,
        "environment_variables": safe_environment(),
        "parent_process": command_text(["/bin/ps", "-p", str(os.getppid()), "-o", "pid=,ppid=,command="]),
        "codex_context": {
            key: os.environ.get(key)
            for key in ("CODEX_CI", "CODEX_SANDBOX", "CODEX_SANDBOX_NETWORK_DISABLED")
            if key in os.environ
        },
        "tmpdir": os.environ.get("TMPDIR"),
        "user_site_enabled": bool(getattr(__import__("site"), "ENABLE_USER_SITE", False)),
        "process_limits": limits,
        "disk_free": shutil.disk_usage("/").free,
        "available_ram": available_ram,
        "install_manifest": install,
    }


def dynamic_loader_inspection() -> dict[str, Any]:
    """Inspect Torch native files without importing Torch itself."""
    emit("before_dynamic_loader_inspection")
    spec = importlib.util.find_spec("torch")
    if spec is None or not spec.submodule_search_locations:
        raise RuntimeError("torch_package_not_found")
    package_root = Path(next(iter(spec.submodule_search_locations)))
    core_files = sorted(package_root.glob("_C*.so"))
    dylibs = sorted((package_root / "lib").glob("*.dylib"))
    inspected: list[dict[str, Any]] = []
    for path in core_files + dylibs:
        item: dict[str, Any] = {"path": str(path), "bytes": path.stat().st_size}
        item["file"] = command_text(["/usr/bin/file", str(path)])
        item["otool_l"] = command_text(["/usr/bin/otool", "-L", str(path)])
        item["codesign"] = command_text(["/usr/bin/codesign", "--verify", "--deep", "--strict", str(path)])
        item["xattr"] = command_text(["/usr/bin/xattr", "-l", str(path)])
        if path in core_files:
            item["otool_rpaths"] = command_text(["/usr/bin/otool", "-l", str(path)])
        inspected.append(item)
    payload = {"package_root": str(package_root), "core_files": [str(path) for path in core_files], "native_files": inspected}
    emit("after_dynamic_loader_inspection", native_files=len(inspected))
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("snapshot", "python-baseline", "package-discovery", "import-only", "cpu-smoke", "mps-built", "mps-available", "mps-allocation", "dynamic-loader-inspection"))
    parser.add_argument("--install-report", type=Path)
    args = parser.parse_args()
    actions = {
        "snapshot": lambda: environment_snapshot(args.install_report),
        "python-baseline": python_baseline,
        "package-discovery": package_discovery,
        "import-only": import_torch_only,
        "cpu-smoke": cpu_smoke,
        "mps-built": mps_built,
        "mps-available": mps_available,
        "mps-allocation": mps_allocation,
        "dynamic-loader-inspection": dynamic_loader_inspection,
    }
    result = actions[args.action]()
    emit("probe_complete", action=args.action, result=result)


if __name__ == "__main__":
    main()
