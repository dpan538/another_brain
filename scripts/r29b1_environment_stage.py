#!/usr/bin/env python3
"""Isolated R29B1 environment discovery, wheelhouse installation and probes."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


TORCH_DIRECT_REQUIREMENTS = [
    "filelock",
    "fsspec",
    "jinja2",
    "networkx",
    # torch 2.12's published wheel metadata has an upper bound here.  Keep the
    # resolver input aligned with the wheel rather than accidentally caching a
    # newer incompatible setuptools wheel during bootstrap.
    "setuptools<82",
    "sympy",
    "typing-extensions",
]
TEST_REQUIREMENTS = ["numpy", "pytest", "psutil"]


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def executable_info(path: str) -> dict[str, Any]:
    try:
        probe = subprocess.run(
            [path, "-c", "import json,platform,sys; print(json.dumps({'executable':sys.executable,'version':sys.version,'machine':platform.machine()}))"],
            capture_output=True,
            text=True,
            timeout=20,
            start_new_session=True,
        )
    except FileNotFoundError:
        return {"path": path, "exit_code": None, "stdout": "", "stderr": "", "blocker": "python_executable_missing"}
    except subprocess.TimeoutExpired as error:
        return {"path": path, "exit_code": None, "stdout": error.stdout or "", "stderr": error.stderr or "", "blocker": "python_identity_timeout"}
    info: dict[str, Any] = {"path": path, "exit_code": probe.returncode, "stdout": probe.stdout, "stderr": probe.stderr}
    if probe.returncode == 0:
        try:
            info.update(json.loads(probe.stdout))
        except json.JSONDecodeError:
            info["parse_error"] = "python_identity_not_json"
    return info


def discovery() -> dict[str, Any]:
    candidates = {name: shutil.which(name) for name in ("python3", "python3.12", "python3.11", "uv", "pyenv", "brew")}
    discovered = {name: executable_info(path) for name, path in candidates.items() if path and name.startswith("python")}
    return {
        "created_at_utc": utc_now(),
        "host_machine": platform.machine(),
        "host_platform": platform.platform(),
        "candidates": candidates,
        "python_details": discovered,
        "disk_usage": shutil.disk_usage("/")._asdict(),
        "xcode_select": shutil.which("xcode-select"),
    }


def run(command: list[str], *, timeout: int = 1800) -> dict[str, Any]:
    started = time.monotonic()
    print("+", " ".join(command), flush=True)
    try:
        completed = subprocess.run(command, text=True, timeout=timeout, start_new_session=True)
        code = completed.returncode
        timed_out = False
    except subprocess.TimeoutExpired:
        code = None
        timed_out = True
    return {"command": command, "exit_code": code, "stdout": "", "stderr": "", "elapsed_seconds": round(time.monotonic() - started, 3), "timed_out": timed_out}


def wheel_entries(wheelhouse: Path) -> list[dict[str, Any]]:
    return [
        {"filename": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)}
        for path in sorted(wheelhouse.glob("*.whl"))
    ]


def install(*, python: str, environment: Path, wheelhouse: Path, torch_version: str, torch_index: str) -> dict[str, Any]:
    source = executable_info(python)
    if source.get("machine") != "arm64" or not str(source.get("version", "")).startswith(("3.12", "3.11")):
        return {"ok": False, "blocker": "python_not_approved_arm64_cpython", "python": source}
    commands: list[dict[str, Any]] = []
    wheelhouse.mkdir(parents=True, exist_ok=True)
    commands.append(run([python, "-m", "venv", "--clear", str(environment)]))
    venv_python = str(environment / "bin" / "python")
    # Do not upgrade setuptools before resolving the downloaded torch wheel:
    # torch 2.12.0 requires setuptools<82.  The constrained wheel is fetched
    # below and installed from the audited local wheelhouse.
    commands.append(run([venv_python, "-m", "pip", "install", "--upgrade", "pip", "wheel"]))
    commands.append(run([venv_python, "-m", "pip", "download", "--only-binary=:all:", "--no-deps", "--dest", str(wheelhouse), "--index-url", torch_index, f"torch=={torch_version}"]))
    commands.append(run([venv_python, "-m", "pip", "download", "--only-binary=:all:", "--dest", str(wheelhouse), *TORCH_DIRECT_REQUIREMENTS, *TEST_REQUIREMENTS]))
    if any(entry["exit_code"] != 0 for entry in commands):
        return {"ok": False, "blocker": "wheel_download_or_venv_setup_failed", "python": source, "commands": commands, "wheel_entries": wheel_entries(wheelhouse)}
    commands.append(run([venv_python, "-m", "pip", "install", "--no-index", "--find-links", str(wheelhouse), "--only-binary=:all:", f"torch=={torch_version}", *TEST_REQUIREMENTS]))
    freeze_completed = subprocess.run([venv_python, "-m", "pip", "freeze"], text=True, capture_output=True, timeout=120, start_new_session=True)
    freeze = {"exit_code": freeze_completed.returncode, "stdout": freeze_completed.stdout, "stderr": freeze_completed.stderr}
    check = run([venv_python, "-m", "pip", "check"])
    return {
        "ok": all(entry["exit_code"] == 0 for entry in commands) and check["exit_code"] == 0,
        "python": source,
        "venv_python": venv_python,
        "commands": commands,
        "wheel_entries": wheel_entries(wheelhouse),
        "pip_freeze": freeze["stdout"],
        "pip_check": check,
    }


def isolated_probe(python: str, code: str, *, timeout: int = 45) -> dict[str, Any]:
    started = time.monotonic()
    try:
        completed = subprocess.run([python, "-X", "faulthandler", "-c", code], text=True, capture_output=True, timeout=timeout, start_new_session=True)
        return {"exit_code": completed.returncode, "signal": -completed.returncode if completed.returncode < 0 else None, "stdout": completed.stdout, "stderr": completed.stderr, "elapsed_seconds": round(time.monotonic() - started, 3), "timed_out": False}
    except subprocess.TimeoutExpired as error:
        return {"exit_code": None, "signal": None, "stdout": error.stdout or "", "stderr": error.stderr or "", "elapsed_seconds": round(time.monotonic() - started, 3), "timed_out": True}


IMPORT_CODE = "import json,platform,sys,torch; print(json.dumps({'executable':sys.executable,'python':sys.version,'machine':platform.machine(),'torch':torch.__version__,'torch_file':torch.__file__,'mps_built':torch.backends.mps.is_built(),'mps_available':torch.backends.mps.is_available()}))"
CPU_CODE = "import json,torch; x=torch.arange(12,dtype=torch.float32).reshape(3,4); y=x@x.T; z=torch.nn.functional.softmax(y,dim=-1); n=torch.nn.LayerNorm(3)(y); p='/tmp/r29b1_tiny_state.pt'; torch.save({'state':{'x':x}},p); loaded=torch.load(p,map_location='cpu',weights_only=True); print(json.dumps({'matmul_sum':float(y.sum()),'softmax_finite':bool(torch.isfinite(z).all()),'layernorm_finite':bool(torch.isfinite(n).all()),'loaded_shape':list(loaded['state']['x'].shape)}))"
MPS_CODE = "import json,torch; available=torch.backends.mps.is_available(); result={'mps_built':torch.backends.mps.is_built(),'mps_available':available};\nif available:\n x=torch.arange(12,dtype=torch.float32,device='mps').reshape(3,4); y=x@x.T; torch.mps.synchronize(); result['mps_sum']=float(y.cpu().sum()); result['transfer_ok']=bool(torch.isfinite(y.cpu()).all());\nprint(json.dumps(result))"


def validate(python: str, diagnostic_roots: list[Path]) -> dict[str, Any]:
    imports = [isolated_probe(python, IMPORT_CODE) for _ in range(5)]
    import_ok = all(item["exit_code"] == 0 and not item["timed_out"] for item in imports)
    cpu = isolated_probe(python, CPU_CODE) if import_ok else {"skipped": "import_failed"}
    mps = isolated_probe(python, MPS_CODE) if import_ok else {"skipped": "import_failed"}
    reports = []
    now = time.time()
    for root in diagnostic_roots:
        if root.exists():
            reports.extend(str(path) for path in root.glob("python*.ips") if now - path.stat().st_mtime <= 3600)
    return {
        "validated_at_utc": utc_now(),
        "python": executable_info(python),
        "repeated_imports": imports,
        "cpu_smoke": cpu,
        "mps_smoke": mps,
        "diagnostic_reports": sorted(reports),
        "passed": bool(import_ok and cpu.get("exit_code") == 0),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("discover", "install", "validate"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--python")
    parser.add_argument("--environment", type=Path)
    parser.add_argument("--wheelhouse", type=Path)
    parser.add_argument("--torch-version")
    parser.add_argument("--torch-index", default="https://download.pytorch.org/whl/cpu")
    args = parser.parse_args()
    if args.action == "discover":
        result = discovery()
    elif args.action == "install":
        if not all((args.python, args.environment, args.wheelhouse, args.torch_version)):
            raise SystemExit("install_arguments_missing")
        result = install(python=args.python, environment=args.environment, wheelhouse=args.wheelhouse, torch_version=args.torch_version, torch_index=args.torch_index)
    else:
        if not args.python:
            raise SystemExit("validate_python_missing")
        result = validate(args.python, [Path.home() / "Library/Logs/DiagnosticReports", Path("/Library/Logs/DiagnosticReports")])
    atomic_json(args.output, result)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True), flush=True)
    raise SystemExit(0 if result.get("ok", result.get("passed", True)) else 2)


if __name__ == "__main__":
    main()
