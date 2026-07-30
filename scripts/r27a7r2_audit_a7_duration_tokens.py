#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.duration_audit_v2 import audit_r27a7_duration_tokens


def main():
    report = audit_r27a7_duration_tokens()
    out = ROOT / "artifacts/r27a7r2/reports/a7_duration_token_audit.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A7R2_A7_DURATION_TOKEN_AUDIT.md").write_text(
        "# R27A7R2 A7 Duration Token Audit\n\n"
        f"- Campaign id: `{report.get('campaign_id')}`\n"
        f"- Stop reason: `{report.get('stop_reason')}`\n"
        f"- Segment count: `{report.get('segment_count')}`\n"
        f"- Wall clock seconds: `{report.get('wall_clock_seconds')}`\n"
        f"- Planned tokens: `{report.get('planned_tokens')}`\n"
        f"- Streamed tokens: `{report.get('streamed_tokens')}`\n"
        f"- Optimizer tokens: `{report.get('optimizer_tokens')}`\n"
        f"- Effective tokens: `{report.get('effective_tokens')}`\n"
        f"- Optimizer steps: `{report.get('optimizer_steps')}`\n"
        f"- Planned tokens/sec: `{report.get('tokens_per_second_planned')}`\n"
        f"- Optimizer tokens/sec: `{report.get('tokens_per_second_optimizer')}`\n"
        f"- Token accounting trust: `{report.get('token_accounting_trust')}`\n"
        f"- Suspected issue: `{report.get('suspected_issue')}`\n"
        f"- A7 tokens are optimizer-consumed: `{report.get('r27a7_tokens_are_optimizer_consumed')}`\n\n"
        "A7's reported 18M train tokens are treated as planned/streamed, not trusted optimizer-consumed tokens. A8B must use `optimizer_tokens` as the primary budget metric.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
