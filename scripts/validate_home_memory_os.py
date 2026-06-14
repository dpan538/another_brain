#!/usr/bin/env python3
"""Validate Home memory OS artifacts without exposing source content."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)")
LONG_NUMBER_RE = re.compile(r"(?<![\d.])\d{8,}(?![\d.])")
NOISY_RE = re.compile(r"endstream|startxref|xref|trailer|klvpacket|/Users/[^\\s\"'<>]+|/Volumes/[^\\s\"'<>]+", re.I)
HTML_NOISE_RE = re.compile(r"<!doctype html|<html\b|/_next/static|<script\b|<link\b", re.I)
PATH_TOKEN_RE = re.compile(r"(?:<PATH>|<REL_PATH>|<URL>|(?:src|docs|raw|outputs|scripts|pages|app|public|dist|build)/)", re.I)
FORBIDDEN_COPY_EXTS = {".ai", ".indd", ".pdf", ".psd", ".jpg", ".jpeg", ".png", ".heic", ".mov", ".mp4", ".m4v"}
CONTENT_KEYS = {"summary", "excerpt", "ocr_excerpt", "method", "examples", "answer", "themes", "topics", "label"}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def iter_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8") as fp:
        for line in fp:
            if not line.strip():
                continue
            rows.append(json.loads(line))
    return rows


def iter_content_text(value: Any, key: str | None = None) -> list[str]:
    if isinstance(value, str):
        return [value] if key in CONTENT_KEYS else []
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            result.extend(iter_content_text(item, key))
        return result
    if isinstance(value, dict):
        result = []
        for child_key, child in value.items():
            result.extend(iter_content_text(child, child_key))
        return result
    return []


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Home memory OS artifacts.")
    parser.add_argument("--out-dir", default="artifacts/memory_os_home")
    parser.add_argument("--eval-report", default="artifacts/home_eval_report.md")
    parser.add_argument("--project-root", default=".")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    project_root = Path(args.project_root)
    required = [
        "event_atoms.jsonl",
        "method_cards.home.generated.json",
        "answer_candidates.generated.json",
        "home_reflection_cards.json",
        "validation_summary.json",
        "core_summary.json",
    ]
    violations: list[dict[str, Any]] = []
    for name in required:
        if not (out_dir / name).exists():
            violations.append({"check": "required_file", "marker": f"missing:{name}"})

    atoms = iter_jsonl(out_dir / "event_atoms.jsonl")
    validation = read_json(out_dir / "validation_summary.json") if (out_dir / "validation_summary.json").exists() else {}
    answers = read_json(out_dir / "answer_candidates.generated.json") if (out_dir / "answer_candidates.generated.json").exists() else {}
    core = read_json(out_dir / "core_summary.json") if (out_dir / "core_summary.json").exists() else {}
    text_payloads: list[str] = []
    for path in [
        out_dir / "event_atoms.jsonl",
        out_dir / "method_cards.home.generated.json",
        out_dir / "answer_candidates.generated.json",
        out_dir / "home_reflection_cards.json",
        out_dir / "core_summary.json",
    ]:
        if path.suffix == ".jsonl":
            for row in iter_jsonl(path):
                text_payloads.extend(iter_content_text(row))
        elif path.exists():
            text_payloads.extend(iter_content_text(read_json(path)))
    eval_report = Path(args.eval_report)
    if eval_report.exists():
        text_payloads.append(eval_report.read_text(encoding="utf-8", errors="ignore"))
    content_text = "\n".join(text_payloads)

    if validation.get("ok") is not True:
        violations.append({"check": "validation_summary", "marker": "not_ok"})
    if core.get("source_id") != "home":
        violations.append({"check": "core_summary", "marker": "source_id_not_home"})
    if not atoms:
        violations.append({"check": "event_atoms", "marker": "empty"})
    if not answers.get("candidates"):
        violations.append({"check": "answer_candidates", "marker": "empty"})
    if answers.get("policy", {}).get("runtime_integrated") is not False:
        violations.append({"check": "answer_candidates", "marker": "runtime_integrated"})

    for regex, label in ((EMAIL_RE, "email"), (PHONE_RE, "phone"), (LONG_NUMBER_RE, "long_number"), (NOISY_RE, "raw_path_or_noise")):
        if regex.search(content_text):
            violations.append({"check": "content_redaction", "marker": label})

    for index, atom in enumerate(atoms[:100]):
        content = "\n".join(iter_content_text(atom))
        if not content.strip():
            violations.append({"check": "atom_quality", "marker": "empty_content", "index": index})
        path_token_count = len(PATH_TOKEN_RE.findall(content))
        if NOISY_RE.search(content) or HTML_NOISE_RE.search(content) or path_token_count >= 8:
            violations.append({"check": "atom_quality", "marker": "path_or_noise_like", "index": index})

    copied = []
    for root_name in ("artifacts", "web"):
        root = project_root / root_name
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or "models" in path.parts:
                continue
            if path.suffix.lower() in FORBIDDEN_COPY_EXTS:
                copied.append(path.relative_to(project_root).as_posix())
    if copied:
        violations.append({"check": "source_copy", "sample": copied[:20]})

    object_table = project_root / "artifacts/object_table.json"
    if object_table.exists() and read_json(object_table).get("objects"):
        violations.append({"check": "object_table", "marker": "objects_present"})

    result = {
        "ok": not violations,
        "event_atoms": len(atoms),
        "answer_candidates": len(answers.get("candidates", [])) if isinstance(answers, dict) else 0,
        "validation_ok": validation.get("ok"),
        "violations": violations[:50],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not violations else 2


if __name__ == "__main__":
    raise SystemExit(main())
