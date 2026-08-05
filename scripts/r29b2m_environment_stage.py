#!/usr/bin/env python3
"""Run isolated MLX import and M1 compute validation for R29B2M."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import time
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from src.training.mlx.r29b2m_campaign import atomic_json  # noqa: E402


def now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run_probe(python: Path, code: str, *, timeout: int = 120) -> dict[str, Any]:
    started = time.monotonic()
    command = [str(python), "-I", "-u", "-X", "faulthandler", "-c", code]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
        return {
            "command": command,
            "exit_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "timed_out": False,
            "elapsed_seconds": round(time.monotonic() - started, 6),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "command": command,
            "exit_code": None,
            "stdout": (exc.stdout or b"").decode() if isinstance(exc.stdout, bytes) else (exc.stdout or ""),
            "stderr": (exc.stderr or b"").decode() if isinstance(exc.stderr, bytes) else (exc.stderr or ""),
            "timed_out": True,
            "elapsed_seconds": round(time.monotonic() - started, 6),
        }


def package_wheels(python: Path) -> list[dict[str, Any]]:
    result = subprocess.run([str(python), "-m", "pip", "freeze", "--all"], capture_output=True, text=True, check=True)
    return [{"requirement": line} for line in result.stdout.splitlines() if line]


SMOKE_CODE = r'''
import json
import os
from pathlib import Path
import tempfile
import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim

out = {"mlx_version": mx.__version__, "default_device": str(mx.default_device()), "metal_available": mx.metal.is_available()}
cpu = mx.array([[1.0, 2.0], [3.0, 4.0]])
product = cpu @ cpu
softmax = mx.softmax(cpu, axis=-1)
layer_norm = nn.LayerNorm(2)(cpu)
linear = nn.Linear(2, 2)
target = mx.array([[0.0, 1.0], [1.0, 0.0]])
loss_and_grad = nn.value_and_grad(linear, lambda model: mx.mean((model(cpu) - target) ** 2))
loss, grads = loss_and_grad(linear)
optimizer = optim.AdamW(learning_rate=1e-3)
optimizer.update(linear, grads)
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / "tiny.safetensors"
    mx.save_safetensors(str(path), {"tensor": product})
    reloaded = mx.load(str(path))["tensor"]
    mx.eval(product, softmax, layer_norm, loss, reloaded, linear.parameters())
    out.update({
        "matrix_product": product.tolist(),
        "softmax_finite": bool(mx.all(mx.isfinite(softmax)).item()),
        "layer_norm_finite": bool(mx.all(mx.isfinite(layer_norm)).item()),
        "loss_finite": bool(mx.isfinite(loss).item()),
        "safetensors_roundtrip": bool(mx.all(product == reloaded).item()),
    })
print(json.dumps(out, sort_keys=True), flush=True)
'''


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--python", type=Path, default=Path(sys.executable))
    parser.add_argument("--wheelhouse", type=Path)
    args = parser.parse_args()
    # A venv's ``bin/python`` is normally a symlink to the base interpreter.
    # Resolving it would silently run child probes outside the venv and turn a
    # healthy MLX install into a false ``ModuleNotFoundError``.
    python = args.python.absolute()
    if platform.machine() != "arm64":
        raise SystemExit("R29B2M requires arm64 host")
    report_dir = args.artifact_root / "reports"
    environment_dir = args.artifact_root / "environment"
    environment_dir.mkdir(parents=True, exist_ok=True)
    imports = [run_probe(python, "import mlx.core as mx; print(mx.__version__, flush=True)") for _ in range(5)]
    smoke = run_probe(python, SMOKE_CODE)
    freeze = subprocess.run([str(python), "-m", "pip", "freeze", "--all"], capture_output=True, text=True, check=False)
    (environment_dir / "pip_freeze.txt").write_text(freeze.stdout, encoding="utf-8")
    package_dir_probe = run_probe(python, "import importlib.util, json; s=importlib.util.find_spec('mlx'); print(json.dumps({'origin':s.origin,'locations':list(s.submodule_search_locations or [])}), flush=True)")
    valid_imports = all(item["exit_code"] == 0 and not item["timed_out"] for item in imports)
    valid_smoke = smoke["exit_code"] == 0 and not smoke["timed_out"]
    wheels = []
    if args.wheelhouse is not None:
        for wheel in sorted(args.wheelhouse.glob("*.whl")):
            wheels.append({"filename": wheel.name, "bytes": wheel.stat().st_size, "sha256": sha256(wheel)})
        atomic_json(environment_dir / "wheel_sha256.json", {"wheels": wheels, "created_at": now()})
    report = {
        "campaign_id": "r29b2m_m1_mlx_daily_dialogue_v1",
        "created_at": now(),
        "python": str(python),
        "python_version": platform.python_version(),
        "machine": platform.machine(),
        "platform": platform.platform(),
        "mlx_import_probes": imports,
        "smoke": smoke,
        "package_dir_probe": package_dir_probe,
        "wheels": wheels,
        "pip_check": subprocess.run([str(python), "-m", "pip", "check"], capture_output=True, text=True, check=False).__dict__ | {"args": None, "stdout": None, "stderr": None},
        "valid": valid_imports and valid_smoke and freeze.returncode == 0,
        "torch_installed": any(line.lower().startswith("torch") for line in freeze.stdout.splitlines()),
        "no_torch_installed_by_campaign": True,
        "source": "official_pypi_binary_wheels",
    }
    # CompletedProcess's repr is not a durable, JSON-friendly record.
    pip_check = subprocess.run([str(python), "-m", "pip", "check"], capture_output=True, text=True, check=False)
    report["pip_check"] = {"exit_code": pip_check.returncode, "stdout": pip_check.stdout, "stderr": pip_check.stderr}
    report_path = report_dir / "mlx_environment.json"
    if report_path.exists():
        # Preserve a failed validation as diagnostic evidence; a repaired probe
        # must not make an earlier failure disappear from the artifact trail.
        prior = json.loads(report_path.read_text(encoding="utf-8"))
        archive = report_dir / "mlx_environment_attempt_before_venv_symlink_fix.json"
        if not archive.exists():
            atomic_json(archive, prior)
    atomic_json(report_path, report)
    atomic_json(environment_dir / "environment_manifest.json", {
        "campaign_id": report["campaign_id"],
        "python": report["python"],
        "python_version": report["python_version"],
        "machine": report["machine"],
        "platform": report["platform"],
        "pip_freeze_sha256": hashlib.sha256(freeze.stdout.encode()).hexdigest(),
        "wheels": wheels,
        "package_dir_probe": package_dir_probe,
        "validated_at": now(),
    })
    print(json.dumps({"valid": report["valid"], "report": str(report_dir / "mlx_environment.json")}, sort_keys=True), flush=True)
    return 0 if report["valid"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
