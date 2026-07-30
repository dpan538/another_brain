#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.model_lab.device_probe import probe_device


def main():
    report = probe_device()
    out = ROOT / "artifacts/r27a6/reports/device_probe.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A6_DEVICE_AND_THROUGHPUT.md").write_text(
        "# R27A6 Device And Throughput\n\n"
        f"Selected device: `{report['device']}`. CUDA available: `{report['cuda_available']}`. MPS available: `{report['mps_available']}`. "
        f"Torch: `{report.get('torch_version', '')}`. Recommendation: `{report['recommendation']}`.\n\n"
        "The decision is recorded explicitly; R27A6 does not silently downgrade. Training dependencies remain training-only and are not browser runtime dependencies.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
