#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.model_lab.device_probe_safe import run_safe_device_probe


def main():
    report = run_safe_device_probe(ROOT)
    out = ROOT / "artifacts/r27a7r2/reports/device_probe_safe.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A7R2_RESOURCE_SAFE_DEVICE_PROBE.md").write_text(
        "# R27A7R2 Resource Safe Device Probe\n\n"
        f"- uname machine: `{report.get('uname_machine')}`\n"
        f"- Python executable: `{report.get('python_executable')}`\n"
        f"- Python arch: `{report.get('python_arch')}`\n"
        f"- PyTorch version: `{report.get('torch_version')}`\n"
        f"- MPS built: `{report.get('mps_is_built')}`\n"
        f"- MPS available: `{report.get('mps_is_available')}`\n"
        f"- CUDA available: `{report.get('cuda_is_available')}`\n"
        f"- CPU fallback: `{report.get('cpu_fallback')}`\n"
        f"- Selected device: `{report.get('selected_device')}`\n"
        f"- Disk free bytes: `{report.get('disk_free_bytes')}`\n"
        f"- Disk critical: `{report.get('disk_space_critical')}`\n"
        f"- CPU smoke ok: `{report.get('cpu_smoke', {}).get('ok')}`\n"
        f"- MPS smoke ok: `{report.get('mps_smoke', {}).get('ok')}`\n\n"
        "The probe applies CPU-safe defaults and does not create a venv, install PyTorch, or enter a repeated MPS repair loop.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
