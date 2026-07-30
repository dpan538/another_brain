#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.lineage import inspect_r27a4_lineage


def main():
    report = inspect_r27a4_lineage()
    out = ROOT / "artifacts/r27a5/reports/lineage_decision.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    doc = ROOT / "docs/r27/R27A5_LINEAGE_DECISION.md"
    doc.parent.mkdir(parents=True, exist_ok=True)
    doc.write_text(
        "# R27A5 Lineage Decision\n\n"
        f"- R27A4 checkpoint found: `{report['r27a4_checkpoint_found']}`.\n"
        f"- R27A4 tokenizer found: `{report['r27a4_tokenizer_found']}`.\n"
        f"- Compatible for resume: `{report['compatible_for_resume']}`.\n"
        f"- Decision: `{report['lineage_decision']}`.\n"
        f"- Reason: `{report['decision_reason']}`.\n"
        f"- Checkpoint: `{report['checkpoint_path']}`.\n"
        f"- Tokenizer: `{report['tokenizer_path']}`.\n\n"
        "If R27A4 is resumed, tokenizer type, vocab size, context length, and model dimensions are fixed; R27A5 must not train a replacement tokenizer for that checkpoint.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
