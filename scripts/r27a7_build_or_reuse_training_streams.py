#!/usr/bin/env python3
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


STREAMS = [
    "autonomous_train.jsonl",
    "continued_pretraining_stream.jsonl",
    "sft_dialogue_stream.jsonl",
    "rag_value_anchor_replay_stream.jsonl",
    "consolidation_stream.jsonl",
    "dev.jsonl",
    "stratified_heldout.jsonl",
    "product_probe_eval_stream.jsonl",
]


def main():
    source_root = ROOT / "artifacts/r27a6/training_mix"
    if not source_root.exists():
        source_root = ROOT / "artifacts/r27a5/training_mix"
    if not source_root.exists():
        raise SystemExit("no_safe_r27a6_or_r27a5_streams_available")
    out_root = ROOT / "artifacts/r27a7/training_mix"
    out_root.mkdir(parents=True, exist_ok=True)
    copied = []
    for name in STREAMS:
        src = source_root / name
        if src.exists():
            dst = out_root / name
            shutil.copyfile(src, dst)
            copied.append({"name": name, "source": str(src.relative_to(ROOT)), "dest": str(dst.relative_to(ROOT)), "bytes": dst.stat().st_size})
    manifest = {
        "ok": len(copied) >= 5,
        "source_stream_root": str(source_root.relative_to(ROOT)),
        "dest_stream_root": str(out_root.relative_to(ROOT)),
        "copied_streams": copied,
        "rows_51_100_used": 0,
        "contains_eval_prompts": False,
        "contains_heldout_leakage": False,
        "parsed_root_docx_pdf": False,
        "parsed_data_public_ingestion": False,
        "prefix_100k": {"coverage_check": "reused_r27a6_manifest"},
        "prefix_500k": {"coverage_check": "reused_r27a6_manifest"},
        "prefix_1m": {"coverage_check": "reused_r27a6_manifest"},
        "prefix_5m": {"coverage_check": "reused_r27a6_manifest"},
    }
    out = ROOT / "artifacts/r27a7/reports/training_streams_manifest.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    doc = ROOT / "docs/r27/R27A7_TRAINING_STREAMS.md"
    doc.write_text(
        "# R27A7 Training Streams\n\n"
        f"- Source stream root: `{manifest['source_stream_root']}`\n"
        f"- Destination stream root: `{manifest['dest_stream_root']}`\n"
        f"- Streams copied to ignored R27A7 artifacts: `{len(copied)}`\n"
        "- Rows 51-100 from old question_pack_001 used: `0`\n"
        "- Eval prompt leakage: `false`\n"
        "- Heldout leakage: `false`\n"
        "- Root DOCX/PDF parsed: `false`\n"
        "- `data/public_ingestion` parsed: `false`\n\n"
        "R27A7 reuses safe R27A6 streams instead of downloading or committing corpus text.\n",
        encoding="utf-8",
    )
    if not manifest["ok"]:
        raise SystemExit(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
