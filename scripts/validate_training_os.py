#!/usr/bin/env python3
"""Validate long-cycle training artifacts before runtime integration."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Iterable


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<![\d:])(?:\+?\d[\d\s().-]{7,}\d)(?![\d:])")
LONG_NUMBER_RE = re.compile(r"(?<!\d)\d{8,}(?!\d)")
RAW_PATH_RE = re.compile(r"/Users/[^\\s\"'<>]+|/Volumes/[^\\s\"'<>]+")
FORBIDDEN_TERMS = [
    "\u4ea6\u821f",
    "Another" + " Brain",
    "another" + " brain",
    "\u7b2c\u4e8c\u8111",
    "\u53e6\u4e00\u4e2a\u8111",
    "\u6211\u6682\u65f6\u5fd8\u4e86\u73b0\u5728\u8be5\u53eb\u4ec0\u4e48",
    "\u4e0d\u662f" + "\u4ea6\u821f" + "\u7684\u590d\u523b",
    "\u89c2\u770b\u3001\u62cd\u6444\u3001\u8bbe\u8ba1\u3001\u7f51\u9875\u5b9e\u9a8c",
    "\u4eba\u5de5\u667a\u80fd\u6a21\u578b",
    "\u6570\u636e\u68c0\u7d22\u5de5\u5177",
]
FORBIDDEN_COPY_EXTS = {".ai", ".indd", ".pdf", ".psd", ".jpg", ".jpeg", ".png", ".heic", ".mov", ".mp4", ".m4v"}
CONTENT_KEYS = {
    "answer",
    "bad_answer",
    "content",
    "cues",
    "example",
    "examples",
    "excerpt",
    "expected",
    "input",
    "method",
    "output",
    "prompt",
    "question",
    "summary",
    "system_prompt",
    "themes",
    "tokens",
}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as fp:
        for line in fp:
            if line.strip():
                yield json.loads(line)


def iter_content(value: Any, key: str | None = None) -> Iterable[str]:
    if isinstance(value, str):
        if key in CONTENT_KEYS:
            yield value
        return
    if isinstance(value, list):
        for item in value:
            yield from iter_content(item, key)
        return
    if isinstance(value, dict):
        for child_key, child in value.items():
            yield from iter_content(child, child_key)


def scan_text(label: str, text: str, violations: list[dict[str, Any]], *, allow_forbidden_placeholders: bool = False) -> None:
    if EMAIL_RE.search(text):
        violations.append({"check": "redaction", "target": label, "marker": "email"})
    if PHONE_RE.search(text):
        violations.append({"check": "redaction", "target": label, "marker": "phone"})
    if LONG_NUMBER_RE.search(text):
        violations.append({"check": "redaction", "target": label, "marker": "long_number"})
    if RAW_PATH_RE.search(text):
        violations.append({"check": "redaction", "target": label, "marker": "raw_path"})
    if not allow_forbidden_placeholders:
        for term in FORBIDDEN_TERMS:
            if term in text:
                violations.append({"check": "forbidden_term", "target": label, "marker": term})
                break


def scan_json_payload(path: Path, violations: list[dict[str, Any]], *, allow_forbidden_placeholders: bool = False) -> None:
    if path.suffix == ".jsonl":
        payloads: Iterable[Any] = iter_jsonl(path)
    elif path.exists():
        payloads = [read_json(path)]
    else:
        return
    for payload in payloads:
        scan_text(path.as_posix(), "\n".join(iter_content(payload)), violations, allow_forbidden_placeholders=allow_forbidden_placeholders)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate training OS artifacts.")
    parser.add_argument("--training-dir", default="artifacts/training_os")
    parser.add_argument("--web-dir", default="web")
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--require-integrated", action="store_true")
    args = parser.parse_args()

    training_dir = Path(args.training_dir)
    web_dir = Path(args.web_dir)
    project_root = Path(args.project_root)
    violations: list[dict[str, Any]] = []
    required = [
        "dialog_sft.jsonl",
        "offline_eval_cases.jsonl",
        "negative_examples.jsonl",
        "runtime_memory_pack.json",
        "runtime_dialog_methodology.json",
        "model_inference_cases.json",
        "training_report.md",
        "quality_report.md",
        "integration_manifest.json",
    ]
    if args.require_integrated:
        required.append("model_inference_report.json")
    for name in required:
        if not (training_dir / name).exists():
            violations.append({"check": "required_file", "marker": f"missing:{name}"})

    sft_count = sum(1 for _ in iter_jsonl(training_dir / "dialog_sft.jsonl"))
    eval_count = sum(1 for _ in iter_jsonl(training_dir / "offline_eval_cases.jsonl"))
    negative_count = sum(1 for _ in iter_jsonl(training_dir / "negative_examples.jsonl"))
    if sft_count < 480:
        violations.append({"check": "dialog_sft", "marker": "too_few", "count": sft_count})
    if eval_count < 520:
        violations.append({"check": "offline_eval_cases", "marker": "too_few", "count": eval_count})
    if negative_count < 60:
        violations.append({"check": "negative_examples", "marker": "too_few", "count": negative_count})

    runtime_pack = read_json(training_dir / "runtime_memory_pack.json") if (training_dir / "runtime_memory_pack.json").exists() else {}
    runtime_methods = read_json(training_dir / "runtime_dialog_methodology.json") if (training_dir / "runtime_dialog_methodology.json").exists() else {}
    if len(runtime_pack.get("memory_cards", [])) < 200:
        violations.append({"check": "runtime_memory_pack", "marker": "too_few_cards"})
    if runtime_pack.get("policy", {}).get("source_files_copied") is not False:
        violations.append({"check": "runtime_memory_pack", "marker": "copy_policy"})
    if runtime_pack.get("policy", {}).get("sensitive_content_read") is not False:
        violations.append({"check": "runtime_memory_pack", "marker": "sensitive_policy"})
    if runtime_methods.get("policy", {}).get("raw_paths_stored") is not False:
        violations.append({"check": "runtime_dialog_methodology", "marker": "path_policy"})

    scan_json_payload(training_dir / "dialog_sft.jsonl", violations)
    scan_json_payload(training_dir / "offline_eval_cases.jsonl", violations)
    scan_json_payload(training_dir / "runtime_memory_pack.json", violations)
    scan_json_payload(training_dir / "runtime_dialog_methodology.json", violations)
    scan_json_payload(training_dir / "negative_examples.jsonl", violations, allow_forbidden_placeholders=True)

    integration = read_json(training_dir / "integration_manifest.json") if (training_dir / "integration_manifest.json").exists() else {}
    if args.require_integrated and integration.get("status") != "integrated":
        violations.append({"check": "integration", "marker": "not_integrated"})
    model_cases = read_json(training_dir / "model_inference_cases.json") if (training_dir / "model_inference_cases.json").exists() else {}
    model_case_rows = model_cases.get("cases", []) if isinstance(model_cases, dict) else []
    model_case_lanes = {case.get("lane") for case in model_case_rows if isinstance(case, dict)}
    model_case_count = len(model_case_rows)
    model_required_count = sum(1 for case in model_case_rows if isinstance(case, dict) and case.get("must_use_model"))
    thresholds = model_cases.get("thresholds", {}) if isinstance(model_cases, dict) else {}
    min_total_cases = int(thresholds.get("min_total", 10))
    min_model_cases = int(thresholds.get("min_model_cases", 3))
    min_used_model = int(thresholds.get("min_used_model", 3))
    required_lanes = set(thresholds.get("required_lanes", ["fixed", "common_knowledge", "boundary", "unknown", "model_rewrite"]))
    if model_case_count < min_total_cases:
        violations.append({"check": "model_inference_cases", "marker": "too_few", "count": model_case_count})
    if model_required_count < min_model_cases:
        violations.append({"check": "model_inference_cases", "marker": "too_few_model_cases", "count": model_required_count})
    for lane in required_lanes:
        if lane not in model_case_lanes:
            violations.append({"check": "model_inference_cases", "marker": f"missing_lane:{lane}"})
    if args.require_integrated and (training_dir / "model_inference_report.json").exists():
        report = read_json(training_dir / "model_inference_report.json")
        summary = report.get("summary", {}) if isinstance(report, dict) else {}
        if report.get("ok") is not True:
            violations.append({"check": "model_inference_report", "marker": "not_ok"})
        if summary.get("total", 0) < model_case_count:
            violations.append({"check": "model_inference_report", "marker": "incomplete", "count": summary.get("total", 0)})
        if summary.get("used_model", 0) < min_used_model:
            violations.append({"check": "model_inference_report", "marker": "model_not_exercised", "count": summary.get("used_model", 0)})
        if report.get("failures"):
            violations.append({"check": "model_inference_report", "marker": "failures_present", "sample": report.get("failures", [])[:5]})
    if args.require_integrated:
        for rel in ("brain_pack.js", "dialog_methodology.js"):
            path = web_dir / rel
            if path.exists():
                scan_text(path.as_posix(), path.read_text(encoding="utf-8", errors="ignore"), violations)

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

    result = {
        "ok": not violations,
        "dialog_sft": sft_count,
        "offline_eval_cases": eval_count,
        "negative_examples": negative_count,
        "runtime_cards": len(runtime_pack.get("memory_cards", [])) if isinstance(runtime_pack, dict) else 0,
        "runtime_method_cards": len(runtime_methods.get("cards", [])) if isinstance(runtime_methods, dict) else 0,
        "model_inference_cases": model_case_count,
        "integrated": integration.get("status") == "integrated",
        "violations": violations[:80],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not violations else 2


if __name__ == "__main__":
    raise SystemExit(main())
