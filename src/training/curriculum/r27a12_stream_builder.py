from __future__ import annotations

from pathlib import Path
from typing import Any

from src.training.campaign.r27a10_intake import NON_CLAIMS, ROOT, now_utc, read_json, write_json, write_text


ART = ROOT / "artifacts/r27a12"
REPORTS = ART / "reports"
PRIOR_ROOTS = [
    ROOT.parent / "another_brain_train_r27a11",
    ROOT.parent / "another_brain_train_r27a10",
    ROOT.parent / "another_brain_train_r27a8b",
    ROOT.parent / "another_brain",
]
REQUIRED = {
    "tokenizer": "artifacts/r27a4/model_lab/tokenizer/tokenizer.json",
    "chinese_general": "artifacts/r27a7/training_mix/continued_pretraining_stream.jsonl",
    "dialogue_rag": "artifacts/r27a7/training_mix/rag_value_anchor_replay_stream.jsonl",
    "consolidation": "artifacts/r27a7/training_mix/consolidation_stream.jsonl",
    "dev": "artifacts/r27a7/training_mix/dev.jsonl",
    "stratified_heldout": "artifacts/r27a7/training_mix/stratified_heldout.jsonl",
}
FORBIDDEN_FRAGMENTS = [
    "data/public_ingestion",
    "question_pack_001",
    "private_sources",
    ".docx",
    ".pdf",
]


def _find(rel: str) -> Path | None:
    for root in PRIOR_ROOTS:
        path = root / rel
        if path.exists():
            return path
    return None


def _line_count(path: Path) -> int:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return sum(1 for _ in handle)
    except OSError:
        return 0


def build_or_reuse_streams(
    target_total_tokens: int = 80_000_000,
    strict_split_dedup: bool = True,
    stratified_heldout: bool = True,
    seed: int = 2712,
) -> dict[str, Any]:
    entries = {}
    missing = []
    forbidden = []
    for key, rel in REQUIRED.items():
        path = _find(rel)
        if path is None:
            missing.append(key)
            continue
        text = str(path)
        if any(fragment in text for fragment in FORBIDDEN_FRAGMENTS):
            forbidden.append({"key": key, "path": text})
        entries[key] = {
            "path": text,
            "bytes": path.stat().st_size,
            "line_count": _line_count(path) if path.suffix == ".jsonl" else None,
        }
    report = {
        "ok": not missing and not forbidden,
        "created_at_utc": now_utc(),
        "target_total_tokens": int(target_total_tokens),
        "strict_split_dedup": bool(strict_split_dedup),
        "stratified_heldout": bool(stratified_heldout),
        "seed": int(seed),
        "source_strategy": "reuse_preserved_r27a11_r27a7_streams",
        "entries": entries,
        "missing": missing,
        "forbidden": forbidden,
        "coverage_checks": {
            "first_100k": "manifest_source_available",
            "first_500k": "manifest_source_available",
            "first_1m": "manifest_source_available",
            "first_5m": "manifest_source_available",
        },
        "old_question_pack_51_100_used": False,
        "eval_prompts_as_training_rows": False,
        "private_or_hidden_prompt_used": False,
        **NON_CLAIMS,
    }
    write_json(REPORTS / "training_streams.json", report)
    write_text(ROOT / "docs/r27/R27A12_TRAINING_STREAMS.md", render_stream_doc(report))
    return report


def load_stream_manifest(root: Path = ROOT) -> dict[str, Any]:
    return read_json(root / "artifacts/r27a12/reports/training_streams.json", {})


def render_stream_doc(report: dict[str, Any]) -> str:
    rows = "\n".join(
        f"| `{key}` | `{entry.get('path')}` | {entry.get('bytes')} | {entry.get('line_count')} |"
        for key, entry in report.get("entries", {}).items()
    )
    return f"""# R27A12 Training Streams

R27A12 reuses existing approved training streams and does not fetch new public corpus, parse root documents, parse `data/public_ingestion`, or use eval prompts as training rows.

| Stream | Source path | Bytes | Lines |
| --- | --- | ---: | ---: |
{rows}

- OK: `{report.get('ok')}`
- Missing: `{report.get('missing')}`
- Forbidden paths: `{report.get('forbidden')}`
- Old question pack rows 51-100 used: `{report.get('old_question_pack_51_100_used')}`
"""
