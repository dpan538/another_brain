#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

from src.training.model_lab.mps_probe import run_mps_probe


def main():
    report = run_mps_probe(ROOT)
    out = ROOT / "artifacts/r27a7/reports/mps_device_probe.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    measured = [b for b in report["benchmarks"] if b.get("ok")]
    doc = ROOT / "docs/r27/R27A7_MPS_DEVICE_THROUGHPUT.md"
    doc.write_text(
        "# R27A7 MPS Device Throughput\n\n"
        f"- Python: `{report.get('python_version')}`\n"
        f"- PyTorch: `{report.get('torch_version')}`\n"
        f"- MPS built: `{report.get('mps_is_built')}`\n"
        f"- MPS available: `{report.get('mps_is_available')}`\n"
        f"- CUDA available: `{report.get('cuda_is_available')}`\n"
        f"- Selected probe device: `{report.get('device')}`\n"
        f"- CPU fallback: `{report.get('cpu_fallback')}`\n"
        f"- Fallback reason: `{report.get('fallback_reason')}`\n"
        f"- Measured forward/backward candidates: `{len(measured)}`\n\n"
        "Large CPU probes are skipped when MPS is unavailable to avoid repeated instability. This is a measured fallback, not a GPU claim.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
