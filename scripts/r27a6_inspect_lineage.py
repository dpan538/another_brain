#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.lineage import inspect_r27a5_lineage


def main():
    report = inspect_r27a5_lineage(ROOT)
    out = ROOT / "artifacts/r27a6/reports/lineage_decision.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A6_LINEAGE_DECISION.md").write_text(
        "# R27A6 Lineage Decision\n\n"
        f"Checkpoint found: `{report['r27a5_checkpoint_found']}`. Tokenizer found: `{report['r27a5_tokenizer_found']}`. "
        f"Vocab size: `{report['vocab_size']}`. Decision: `{report['lineage_decision']}`.\n\n"
        "If compatible, R27A6 resumes the R27A5 mini_8m checkpoint and reuses the R27A4/R27A5 tokenizer without changing vocabulary or model dimensions. No remote model weights are used and no checkpoint/tokenizer artifacts are committed.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
