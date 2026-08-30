#!/usr/bin/env python3
"""Select high-information R30J1A DEV errors for correction Session 1.

Populated inputs and outputs are private local evidence.  This CLI prints only
aggregate counts and bounded error codes; it never prints paths or source text.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
LOCAL_ARTIFACT_ROOT = (ROOT / "artifacts" / "r30j1c").resolve()
CONFIG_PATH = ROOT / "config" / "r30j1c_r1_owner_correction_pack_v1.json"
sys.path.insert(0, str(ROOT))

from src.personal_judge.r30j1c_r1_error_selection import (  # noqa: E402
    SelectionError,
    build_candidates,
    build_receipt,
    load_source_inputs,
    select_session1_source_pool,
    write_source_pool,
)


_READY_OUTPUT_NAMES = (
    "j1a_selected_source_rows.jsonl",
    "j1a_source_pool_receipt.json",
)
# This blocked revision documents the future adapter but does not authorize a
# READY path.  Restoring producer anchors alone must not silently activate it;
# a reviewed revision must explicitly change this gate as well.
_READY_ADAPTER_AUTHORIZED = False


def _local_output(path: Path) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(LOCAL_ARTIFACT_ROOT)
    except ValueError as exc:
        raise SelectionError("output_must_remain_under_ignored_r30j1c_artifacts") from exc
    return resolved


def _invalidate_ready_outputs(output_root: Path) -> None:
    """Remove only this adapter's two fixed READY products.

    This runs before source access and again after any failure, preventing an
    earlier ignored READY receipt from surviving a blocked rerun.
    """

    for name in _READY_OUTPUT_NAMES:
        target = output_root / name
        if not target.exists() and not target.is_symlink():
            continue
        if target.is_symlink() or target.is_file():
            target.unlink()
            continue
        raise SelectionError("stale_ready_output_target_invalid")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-manifest", required=True, type=Path)
    parser.add_argument("--dev", required=True, type=Path)
    parser.add_argument("--predictions", required=True, nargs="+", type=Path)
    parser.add_argument("--shortcut-pairs", required=True, type=Path)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=ROOT / "artifacts" / "r30j1c" / "owner_correction_pack" / "source_pool",
    )
    parser.add_argument("--maximum-per-source-family", type=int, default=2)
    args = parser.parse_args()

    output_root: Path | None = None
    try:
        output_root = _local_output(args.output_root)
        _invalidate_ready_outputs(output_root)
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        provenance = config.get("source_pool", {}).get("r30j1a_diagnostic_provenance", {})
        if provenance.get("anchor_status") != "VERIFIED_IMMUTABLE_SOURCE":
            raise SelectionError("trusted_producer_manifest_anchor_unavailable")
        if not _READY_ADAPTER_AUTHORIZED:
            raise SelectionError("ready_adapter_not_authorized_this_revision")
        dev, predictions, shortcut_pairs, hashes = load_source_inputs(
            manifest_path=args.dataset_manifest,
            dev_path=args.dev,
            prediction_paths=args.predictions,
            shortcut_pair_path=args.shortcut_pairs,
            trusted_manifest_sha256=provenance.get("trusted_manifest_sha256"),
        )
        candidates = build_candidates(dev, predictions, shortcut_pairs)
        selected = select_session1_source_pool(
            candidates,
            maximum_per_source_family=args.maximum_per_source_family,
        )
        receipt = build_receipt(
            candidates=candidates,
            selected=selected,
            source_hashes=hashes,
            maximum_per_source_family=args.maximum_per_source_family,
        )
        write_source_pool(output_root, selected, receipt)
    except SelectionError as exc:
        code = str(exc)
        if output_root is not None:
            try:
                _invalidate_ready_outputs(output_root)
            except (OSError, SelectionError):
                code = "stale_ready_output_invalidation_failed"
        print(json.dumps({
            "status": "BLOCKED_SOURCE_INTEGRITY",
            "error_code": code,
            "heldout_used": False,
            "heldout_content_read": None,
            "heldout_content_read_claim": "NOT_ASSERTED_AFTER_SOURCE_ERROR",
            "training_started": False,
            "api_requests": 0,
        }, sort_keys=True))
        return 2
    except Exception:  # Keep private paths/content out of unexpected tracebacks.
        code = "UNEXPECTED_SELECTION_FAILURE"
        if output_root is not None:
            try:
                _invalidate_ready_outputs(output_root)
            except (OSError, SelectionError):
                code = "stale_ready_output_invalidation_failed"
        print(json.dumps({
            "status": "BLOCKED_SOURCE_INTEGRITY",
            "error_code": code,
            "heldout_used": False,
            "training_started": False,
            "api_requests": 0,
        }, sort_keys=True))
        return 2

    print(json.dumps({
        "status": "READY",
        "selected_total": receipt["selected_total"],
        "selected_counts": receipt["selected_counts"],
        "heldout_used": False,
        "training_started": False,
        "api_requests": 0,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
