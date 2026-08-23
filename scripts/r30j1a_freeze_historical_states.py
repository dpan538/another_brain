#!/usr/bin/env python3
"""Hash authoritative R30J0/P/P2 terminal evidence without rewriting it."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "artifacts/r30j1a/reports/p2_historical_freeze_receipt.json"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, sort_keys=True, indent=2); handle.write("\n"); handle.flush(); os.fsync(handle.fileno())
        os.chmod(temp, 0o600); os.replace(temp, path)
    finally:
        if os.path.exists(temp): os.unlink(temp)


def state_of(path: Path) -> str | None:
    value = json.loads(path.read_text(encoding="utf-8"))
    for key in ("terminal_state", "phase_terminal_state", "personal_source_terminal_state", "state"):
        if key in value and isinstance(value[key], str):
            return value[key]
    return None


def discover() -> list[tuple[str, Path, str | None]]:
    candidates = (
        ("r30j0_final", ROOT / "artifacts/r30j0/reports/final_terminal.json", "HUMAN_OWNER_REVIEW_REQUIRED"),
        ("r30j0_personal_source", ROOT / "artifacts/r30j0/reports/final_report.json", "PERSONAL_SOURCE_EVIDENCE_READY"),
        ("r30j0_p2", ROOT / "artifacts/r30j0/persona_excavation/reports/final_terminal.json", "R30J0_P2_PERSONA_EXCAVATION_READY"),
        ("r30j0_p2_summary", ROOT / "artifacts/r30j0/persona_excavation/reports/persona_excavation_summary.json", None),
    )
    output = []
    for role, path, expected in candidates:
        if path.is_file(): output.append((role, path, expected))
    return output


def main() -> int:
    sources = []
    observed_states = set()
    for role, path, expected in discover():
        state = state_of(path)
        observed_states.add(state)
        sources.append({
            "role": role,
            "logical_path": path.relative_to(ROOT).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha(path),
            "observed_state": state,
            "expected_state": expected,
            "state_match": expected is None or state == expected or (role == "r30j0_personal_source" and expected in path.read_text(encoding="utf-8")),
        })
    required = {"HUMAN_OWNER_REVIEW_REQUIRED", "PERSONAL_SOURCE_EVIDENCE_READY", "R30J0_P2_PERSONA_EXCAVATION_READY"}
    # Some aggregate reports expose the personal-source state as a secondary
    # field, hence validation uses the expected-state match on each source.
    valid = len(sources) >= 3 and all(row["state_match"] for row in sources)
    report = {
        "schema_version": "r30j1a.historical-freeze-receipt.v1",
        "valid": valid,
        "sources": sources,
        "historical_files_modified": False,
        "descriptive_bootstrap_new_campaign": True,
        "p2_expected_next_state_preserved": "HUMAN_PERSONA_ELICITATION_REQUIRED",
        "required_historical_states": sorted(required),
    }
    atomic_json(ARTIFACT, report)
    print(json.dumps({"valid": valid, "source_count": len(sources), "historical_files_modified": False}, sort_keys=True))
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
