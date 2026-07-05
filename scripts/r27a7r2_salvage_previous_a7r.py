#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a7r2_salvage import salvage_previous_a7r


def write(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def main():
    report = salvage_previous_a7r()
    out = ROOT / "artifacts/r27a7r2/reports/previous_a7r_salvage.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    write(
        ROOT / "docs/r27/R27A7R2_PREVIOUS_A7R_CRASH_SALVAGE.md",
        "# R27A7R2 Previous A7R Crash Salvage\n\n"
        f"- Previous A7R artifacts exist: `{report['previous_a7r_artifacts_exist']}`\n"
        f"- Previous A8 artifacts exist: `{report['previous_a8_artifacts_exist']}`\n"
        f"- Active training approval: `{report['active_training_approval']}`\n"
        f"- Needs manual marker cleanup: `{report['needs_manual_marker_cleanup']}`\n"
        f"- Partial checkpoints found: `{len(report['partial_checkpoints'])}`\n"
        f"- Corrupted checkpoints found: `{len(report['corrupted_checkpoints'])}`\n"
        f"- Incomplete ledgers/reports found: `{len(report['incomplete_ledgers'])}`\n"
        f"- Blockers: `{report['blockers']}`\n\n"
        "Old partial A7R/A8 artifacts are evidence only and are not selected as default resume targets. R27A7R2 does not delete artifacts and does not continue old A7R training.\n",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
