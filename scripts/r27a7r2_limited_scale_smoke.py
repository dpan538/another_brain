#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.model_lab.limited_scale_smoke import run_limited_scale_smoke


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidates", default="continue_best_mini8m,new_30m,new_60m,new_100m,new_125m,new_150m")
    ap.add_argument("--max-params", type=int, default=200_000_000)
    ap.add_argument("--max-smoke-steps", type=int, default=5)
    ap.add_argument("--prefer-device", default="mps")
    ap.add_argument("--cpu-safe", action="store_true")
    args = ap.parse_args()
    candidates = [item.strip() for item in args.candidates.split(",") if item.strip()]
    report = run_limited_scale_smoke(candidates, args.max_params, args.max_smoke_steps, args.prefer_device, args.cpu_safe)
    out = ROOT / "artifacts/r27a7r2/reports/limited_scale_smoke.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    rows = [
        "| Candidate | OK | Device | Params | Tok/s optimizer | Fits 100MB q4 | Risk | Note |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for result in report["results"]:
        budget = result.get("budget", {})
        rows.append(
            f"| `{result.get('candidate')}` | `{result.get('ok')}` | `{result.get('device', '')}` | `{result.get('params', '')}` | `{result.get('tokens_per_second_optimizer', '')}` | `{budget.get('fits_100mb_q4')}` | `{budget.get('budget_risk')}` | `{result.get('skip_reason', result.get('error', ''))}` |"
        )
    (ROOT / "docs/r27/R27A7R2_LIMITED_SCALE_SMOKE.md").write_text(
        "# R27A7R2 Limited Scale Smoke\n\n"
        + "\n".join(rows)
        + "\n\n"
        f"- Selected candidate for A8B config: `{report['selected_candidate'].get('candidate')}`\n"
        f"- Selected device: `{report.get('selected_device')}`\n"
        f"- Max optimizer steps per trainable candidate: `{report.get('max_smoke_steps')}`\n"
        "- 0.5B and 2B are estimate-only.\n"
        "- R27A7R2 does not run long training and does not launch A8.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
