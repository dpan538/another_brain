#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PRIMARY_REPO = Path("/Users/jarlgiovanni/Desktop/another_brain")
TRAIN_A12_REPO = Path("/Users/jarlgiovanni/Desktop/another_brain_train_r27a12")
MODEL_CONFIG = ROOT / "web/another_brain/model_assets/r28m1/model.config.json"
COMMITTED_TOKENIZER_DIR = ROOT / "web/another_brain/model_assets/r28m1/tokenizer"
RUNTIME_TOKENIZER = COMMITTED_TOKENIZER_DIR / "runtime_tokenizer.json"
METADATA_TOKENIZER = COMMITTED_TOKENIZER_DIR / "tokenizer.json"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def maybe_read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return read_json(path)
    except Exception:
        return None


def dig_tokenizer_paths(value: Any) -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if "tokenizer" in str(key).lower() and isinstance(item, str):
                found.append(item)
            found.extend(dig_tokenizer_paths(item))
    elif isinstance(value, list):
        for item in value:
            found.extend(dig_tokenizer_paths(item))
    return found


def tokenizer_summary(path: Path, source_kind: str) -> dict[str, Any]:
    data = read_json(path)
    model = data.get("model") if isinstance(data.get("model"), dict) else {}
    vocab = data.get("vocab") if isinstance(data.get("vocab"), dict) else model.get("vocab")
    merges = data.get("merges") if isinstance(data.get("merges"), list) else model.get("merges")
    vocab_size = int(data.get("vocab_size") or (len(vocab) if isinstance(vocab, dict) else 0) or 0)
    tokenizer_type = data.get("tokenizer_kind") or data.get("tokenizer_type") or data.get("type") or model.get("type") or "unknown"
    has_vocab = isinstance(vocab, dict) and bool(vocab)
    has_merges = isinstance(merges, list)
    exact = (
        (tokenizer_type in {"BPE", "exact_runtime_bpe", "exact_runtime_tokenizer"} or data.get("exact_runtime_tokenizer") is True)
        and vocab_size == 16_000
        and has_vocab
        and has_merges
    )
    return {
        "path": str(path),
        "source_kind": source_kind,
        "exact": exact,
        "tokenizer_type": tokenizer_type,
        "vocab_size": vocab_size,
        "merge_count": len(merges) if isinstance(merges, list) else 0,
        "has_vocab": has_vocab,
        "has_merges": has_merges,
        "has_encode": exact,
        "has_decode": exact,
        "can_commit_runtime_asset": exact and ("artifacts" in path.parts or path == RUNTIME_TOKENIZER),
    }


def handoff_candidates() -> list[Path]:
    candidates: list[Path] = []
    handoffs = [
        PRIMARY_REPO / "artifacts/r27a12/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json",
        TRAIN_A12_REPO / "artifacts/r27a12/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json",
        ROOT / "artifacts/r27a12/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json",
    ]
    for handoff in handoffs:
        data = maybe_read_json(handoff)
        if not data:
            continue
        for raw in dig_tokenizer_paths(data):
            path = Path(raw)
            if not path.is_absolute():
                path = handoff.parent / path
            candidates.append(path)
    return candidates


def artifact_candidates() -> list[tuple[str, Path]]:
    repos = [TRAIN_A12_REPO, PRIMARY_REPO, ROOT]
    ordered: list[tuple[str, Path]] = []
    for root in repos:
        ordered.append(("r27a12_model_lab_tokenizer", root / "artifacts/r27a12/model_lab/tokenizer/tokenizer.json"))
    for stage in ["r27a11", "r27a7", "r27a4"]:
        for root in [PRIMARY_REPO, ROOT, TRAIN_A12_REPO]:
            ordered.append((f"{stage}_model_lab_tokenizer", root / f"artifacts/{stage}/model_lab/tokenizer/tokenizer.json"))
    return ordered


def discover_exact_tokenizer() -> dict[str, Any]:
    model_config = read_json(MODEL_CONFIG)
    model_vocab_size = int(model_config.get("architecture", {}).get("vocab_size") or 0)
    checked: list[dict[str, Any]] = []
    ordered: list[tuple[str, Path]] = []
    ordered.extend(("a12_handoff_tokenizer_path", path) for path in handoff_candidates())
    ordered.extend(artifact_candidates())
    ordered.append(("r28m1_runtime_tokenizer_asset", RUNTIME_TOKENIZER))
    ordered.append(("committed_r28m1_tokenizer_metadata", METADATA_TOKENIZER))

    seen: set[Path] = set()
    for source_kind, path in ordered:
        if path in seen:
            continue
        seen.add(path)
        if not path.exists():
            checked.append({"path": str(path), "source_kind": source_kind, "exists": False})
            continue
        try:
            summary = tokenizer_summary(path, source_kind)
        except Exception as exc:
            checked.append({"path": str(path), "source_kind": source_kind, "exists": True, "error": str(exc)})
            continue
        summary["exists"] = True
        checked.append(summary)
        if summary["exact"] and summary["vocab_size"] == model_vocab_size:
            return {
                "ok": True,
                "exact_tokenizer_found": True,
                "source_path": summary["path"],
                "source_kind": summary["source_kind"],
                "tokenizer_type": summary["tokenizer_type"],
                "vocab_size": summary["vocab_size"],
                "merge_count": summary["merge_count"],
                "has_encode": summary["has_encode"],
                "has_decode": summary["has_decode"],
                "can_commit_runtime_asset": summary["can_commit_runtime_asset"],
                "blocker": None,
                "checked": checked,
                "non_claims": {
                    "training": False,
                    "product_admission": False,
                    "browser_admission": False,
                    "release_checkpoint_admission": False,
                },
            }

    return {
        "ok": False,
        "exact_tokenizer_found": False,
        "source_path": "",
        "tokenizer_type": "unknown",
        "vocab_size": model_vocab_size,
        "has_encode": False,
        "has_decode": False,
        "can_commit_runtime_asset": False,
        "blocker": "exact_tokenizer_artifact_missing",
        "checked": checked,
        "non_claims": {
            "training": False,
            "product_admission": False,
            "browser_admission": False,
            "release_checkpoint_admission": False,
        },
    }


def main() -> int:
    report = discover_exact_tokenizer()
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
