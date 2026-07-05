#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.a8b_launch_config import build_a8b_launch_config


def load(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


def main():
    salvage = load("artifacts/r27a7r2/reports/previous_a7r_salvage.json")
    audit = load("artifacts/r27a7r2/reports/a7_duration_token_audit.json")
    device = load("artifacts/r27a7r2/reports/device_probe_safe.json")
    smoke = load("artifacts/r27a7r2/reports/limited_scale_smoke.json")
    checkpoint = load("artifacts/r27a7r2/reports/safe_checkpoint_selection.json")
    report = build_a8b_launch_config(salvage, audit, device, smoke, checkpoint)
    out_name = "R27A8B_READY.json" if report["ready"] else "R27A8B_BLOCKED.json"
    out = ROOT / "artifacts/r27a7r2/go" / out_name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A7R2_A8B_LAUNCH_CONFIG.md").write_text(
        "# R27A7R2 A8B Launch Config\n\n"
        f"- Output: `artifacts/r27a7r2/go/{out_name}`\n"
        f"- Ready: `{report.get('ready')}`\n"
        f"- Recommended next: `{report.get('recommended_next')}`\n"
        f"- Primary token metric: `{report.get('primary_token_metric')}`\n"
        f"- Selected model: `{report.get('selected_model')}`\n"
        f"- Selected device: `{report.get('selected_device')}`\n"
        f"- Selected checkpoint: `{report.get('selected_checkpoint')}`\n"
        f"- Context length: `{report.get('selected_context_length')}`\n"
        f"- Capacity risk: `{report.get('capacity_risk')}`\n"
        f"- Blockers: `{report.get('blockers')}`\n\n"
        "This is a launch plan only. R27A7R2 does not start A8B and does not approve product training, formal decoder training, phase_4, product admission, browser admission, or release checkpointing.\n",
        encoding="utf-8",
    )
    (ROOT / "docs/r27/R27A7R2_SAFE_CONTROLLER_REPAIR.md").write_text(
        "# R27A7R2 Safe Controller Repair\n\n"
        "- R27A7R2 audits why R27A7 stopped early and repairs the controller policy for the next launch plan.\n"
        "- `optimizer_tokens` is the primary future budget metric.\n"
        "- Ordinary metric no-improvement is deferred until the minimum budget is met.\n"
        "- Device probing is resource-safe and avoids repeated repair loops.\n"
        "- Limited scale smoke uses at most five optimizer steps per candidate.\n"
        "- A8B launch config is generated but not executed.\n",
        encoding="utf-8",
    )
    (ROOT / "docs/r27/R27A7R2_NON_CLAIMS.md").write_text(
        "# R27A7R2 Non-Claims\n\n"
        "- not product training\n"
        "- not formal decoder training\n"
        "- not phase_4\n"
        "- not product model\n"
        "- not product admission\n"
        "- not browser admission\n"
        "- not release checkpoint\n"
        "- no weights committed\n"
        "- no tokenizer artifacts committed\n"
        "- no raw/clean/processed corpus committed\n"
        "- no runtime external dependency\n"
        "- no external LLM API\n"
        "- no Doubao\n"
        "- A8B_READY is not product admission\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
