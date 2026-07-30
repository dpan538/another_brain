#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.checkpoint_selector_v2 import select_safe_checkpoint


def main():
    report = select_safe_checkpoint()
    out = ROOT / "artifacts/r27a7r2/reports/safe_checkpoint_selection.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A7R2_SAFE_CHECKPOINT_SELECTION.md").write_text(
        "# R27A7R2 Safe Checkpoint Selection\n\n"
        f"- Selected checkpoint: `{report.get('selected_checkpoint')}`\n"
        f"- Selected kind: `{report.get('selected_kind')}`\n"
        f"- Exists in local artifacts: `{report.get('selected_exists_in_local_artifacts')}`\n"
        f"- Final checkpoint: `{report.get('final_checkpoint')}`\n"
        f"- Final checkpoint selected: `{report.get('final_checkpoint_selected')}`\n"
        f"- Worse final checkpoint rejected: `{report.get('worse_final_checkpoint_rejected')}`\n"
        f"- Tokenizer path: `{report.get('tokenizer_path')}`\n\n"
        + "\n".join(f"- {reason}" for reason in report.get("reasons", []))
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
