#!/usr/bin/env python3
"""Validate that Brain Pack artifacts follow privacy, history, and subject rules."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SENSITIVE_MARKERS = [
    "passport",
    "bank",
    "visa",
    "护照",
    "银行",
    "签证",
    "身份证",
    "证件",
]
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
LONG_NUMBER_RE = re.compile(r"(?<!\d)\d{8,}(?!\d)")
PHONE_PLACEHOLDER_RE = re.compile(r"<PHONE>", re.IGNORECASE)
SUBJECT_DOWNGRADE_TERMS = [
    "\u6863\u6848",
    "\u68c0\u7d22" + "\u5de5\u5177",
    "\u6587\u4ef6" + "\u6e05\u5355",
    "\u672c\u5730" + "\u6863\u6848",
    "\u538b\u7f29" + "\u51fa\u6765",
    "arc" + "hive",
]
FRONTEND_FORBIDDEN_TERMS = [
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
FRONTEND_CHECK_FILES = [
    "web/index.html",
    "web/app.js",
    "web/bench.html",
    "web/bench.js",
    "web/dialog_rules.js",
    "web/dialog_methodology.js",
    "web/brain_pack.js",
    "web/object_table.js",
    "artifacts/brain_pack.json",
    "artifacts/dialog_methodology.json",
    "artifacts/object_table.json",
]
OLD_MODEL_MARKERS = [
    "0." + "8B",
]
PROJECT_CHECK_FILES = [
    "README.md",
    "models/manifest.json",
    "web/config.js",
    "web/app.js",
    "web/bench.html",
    "web/bench.js",
    "scripts/build_brain_pack.py",
]
FORBIDDEN_COPY_EXTS = {
    ".ai",
    ".indd",
    ".pdf",
    ".psd",
    ".jpg",
    ".jpeg",
    ".png",
    ".heic",
    ".mov",
    ".mp4",
    ".m4v",
}
NOISY_SUBJECT_TERMS = {
    "endstream",
    "length",
    "pdf-1",
    "obj",
    "len",
    "phone",
    "number",
    "date",
    "software",
    "metadata",
    "local",
    "clue",
    "limited",
    "visible",
    "text",
    "video",
    "moving-image",
    "creationdate",
    "capturefps",
    "ver",
    "true",
    "false",
    "status",
    "value",
    "direct",
    "duration",
    "encoding",
    "framecount",
    "halfstep",
    "increment",
    "klvpacket",
    "klvpackettable",
    "lastupdate",
    "port",
    "key",
    "application",
    "root",
    "portablessd",
    "samsung",
    "ssd",
    "sw",
    "processor",
    "const",
    "png",
    "js",
    "in",
    "to",
    "go",
}


def flatten(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return "\n".join(flatten(item) for item in value.values())
    if isinstance(value, list):
        return "\n".join(flatten(item) for item in value)
    return ""


def validate_memory_cards(pack: dict[str, Any], violations: list[dict[str, Any]]) -> None:
    for card in pack.get("memory_cards", []):
        visible_fields = {
            "path_hint": card.get("path_hint", ""),
            "title": card.get("title", ""),
            "summary": card.get("summary", ""),
            "excerpt": card.get("excerpt", ""),
        }
        haystack = json.dumps(visible_fields, ensure_ascii=False).lower()
        for marker in SENSITIVE_MARKERS:
            if marker.lower() in haystack:
                violations.append({"check": "sensitive_marker", "card": card.get("id"), "marker": marker})
        for regex, label in ((EMAIL_RE, "email"), (LONG_NUMBER_RE, "long_number")):
            if regex.search(haystack):
                violations.append({"check": "redaction", "card": card.get("id"), "marker": label})


def validate_subject(pack: dict[str, Any], violations: list[dict[str, Any]]) -> None:
    subject_text = flatten(
        {
            "identity": pack.get("identity", {}),
            "system_prompt": pack.get("system_prompt", ""),
            "sources": pack.get("sources", []),
        }
    ).lower()
    for term in SUBJECT_DOWNGRADE_TERMS:
        if term.lower() in subject_text:
            violations.append({"check": "subject_language", "marker": term})
    identity = pack.get("identity", {})
    intro = identity.get("self_introduction", "")
    if "对话框" not in intro:
        violations.append({"check": "subject_language", "marker": "missing_dialog_identity"})
    if not pack.get("subject_timeline"):
        violations.append({"check": "history", "marker": "missing_subject_timeline"})
    subject_tokens = []
    for entry in pack.get("subject_timeline", []):
        subject_tokens.extend(entry.get("themes", []))
    subject_tokens.extend(topic.get("token", "") for topic in pack.get("topics", [])[:20])
    for token in subject_tokens:
        if token in NOISY_SUBJECT_TERMS:
            violations.append({"check": "subject_noise", "marker": token})


def validate_history(history_dir: Path, violations: list[dict[str, Any]]) -> None:
    required = ["run_history.jsonl", "latest_run.json", "subject_timeline.json"]
    for name in required:
        path = history_dir / name
        if not path.exists():
            violations.append({"check": "history", "marker": f"missing:{name}"})
    latest = history_dir / "latest_run.json"
    if latest.exists():
        data = json.loads(latest.read_text(encoding="utf-8"))
        if data.get("privacy", {}).get("original_materials_copied") is not False:
            violations.append({"check": "privacy", "marker": "history_copy_policy"})


def validate_object_table(project_root: Path, violations: list[dict[str, Any]]) -> None:
    path = project_root / "artifacts/object_table.json"
    if not path.exists():
        violations.append({"check": "object_table", "marker": "missing"})
        return
    table = json.loads(path.read_text(encoding="utf-8"))
    schema_version = int(table.get("schema_version", 1))
    if schema_version >= 3:
        policy = table.get("policy", {})
        stats = table.get("stats", {})
        if policy.get("objects_require_manual_approval") is not True:
            violations.append({"check": "object_table", "marker": "manual_approval_not_required"})
        if policy.get("auto_promote_objects") is not False:
            violations.append({"check": "object_table", "marker": "auto_promote_enabled"})
        if table.get("objects"):
            violations.append({"check": "object_table", "marker": "unapproved_objects_present"})
        if not table.get("candidate_index"):
            violations.append({"check": "object_table", "marker": "missing_candidate_index"})
        if not table.get("knowledge_index"):
            violations.append({"check": "object_table", "marker": "missing_knowledge_index"})
        required_stats = ["raw_candidates", "index_candidates", "candidate_index_selected", "index_buckets"]
        if schema_version >= 4:
            required_stats.append("approved_object_candidates")
        else:
            required_stats.append("object_candidates")
        for key in required_stats:
            if key not in stats:
                violations.append({"check": "object_table", "marker": f"missing_stats:{key}"})
        if schema_version >= 4:
            for key in (
                "candidate_labels_are_not_objects",
                "object_promotion_requires_user_confirmation",
                "runtime_uses_objects_only",
            ):
                if policy.get(key) is not True:
                    violations.append({"check": "object_table_policy", "marker": key})
            for key in ("trace_candidates", "trace_buckets"):
                if key not in stats:
                    violations.append({"check": "object_table", "marker": f"missing_stats:{key}"})
            for item in table.get("candidate_index", []):
                bucket = str(item.get("bucket", ""))
                if "object_candidate" in bucket:
                    violations.append({"check": "object_table", "marker": f"unsafe_candidate_bucket:{bucket}"})
    elif schema_version >= 2:
        stats = table.get("stats", {})
        if len(table.get("objects", [])) < 50:
            violations.append({"check": "object_table", "marker": "too_few_filtered_objects"})
        if not table.get("knowledge_index"):
            violations.append({"check": "object_table", "marker": "missing_knowledge_index"})
        for key in ("raw_candidates", "object_candidates", "index_candidates", "index_buckets"):
            if key not in stats:
                violations.append({"check": "object_table", "marker": f"missing_stats:{key}"})
    elif len(table.get("objects", [])) < 1000:
        violations.append({"check": "object_table", "marker": "too_few_objects"})
    policy = table.get("policy", {})
    for key in ("source_files_copied", "sensitive_content_read", "sensitive_paths_opened", "raw_paths_stored", "raw_text_stored"):
        if policy.get(key) is not False:
            violations.append({"check": "object_table_policy", "marker": key})
    markers = SENSITIVE_MARKERS + ["<PHONE>", "<ADDRESS>", "<NUMBER>", "<EMAIL>"]
    for index, obj in enumerate(table.get("objects", [])):
        haystack = json.dumps(
            {
                "label": obj.get("label", ""),
                "co_objects": obj.get("co_objects", []),
                "top_contexts": obj.get("top_contexts", []),
            },
            ensure_ascii=False,
        ).lower()
        for marker in markers:
            if marker.lower() in haystack:
                violations.append({"check": "object_table_privacy", "marker": marker, "index": index})
                break


def validate_project_files(project_root: Path, violations: list[dict[str, Any]]) -> None:
    for rel_path in PROJECT_CHECK_FILES:
        path = project_root / rel_path
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for marker in OLD_MODEL_MARKERS:
            if marker in text:
                violations.append({"check": "old_model_reference", "path": rel_path, "marker": marker})


def validate_frontend_language(project_root: Path, violations: list[dict[str, Any]]) -> None:
    for rel_path in FRONTEND_CHECK_FILES:
        path = project_root / rel_path
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for marker in FRONTEND_FORBIDDEN_TERMS:
            if marker in text:
                violations.append({"check": "frontend_forbidden_term", "path": rel_path, "marker": marker})


def validate_no_source_copies(project_root: Path, violations: list[dict[str, Any]]) -> None:
    for root_name in ("artifacts", "web"):
        root = project_root / root_name
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or "models" in path.parts:
                continue
            if path.suffix.lower() in FORBIDDEN_COPY_EXTS:
                violations.append({"check": "source_copy", "path": path.relative_to(project_root).as_posix()})


def record_validation(history_dir: Path, ok: bool, summary: dict[str, Any], violations: list[dict[str, Any]]) -> None:
    history_dir.mkdir(parents=True, exist_ok=True)
    record = {
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "ok": ok,
        "summary": summary,
        "violations": violations[:50],
    }
    latest_validation = history_dir / "latest_validation.json"
    latest_validation.write_text(
        json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    with (history_dir / "validation_history.jsonl").open("a", encoding="utf-8") as fp:
        fp.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")

    latest_run = history_dir / "latest_run.json"
    if latest_run.exists():
        data = json.loads(latest_run.read_text(encoding="utf-8"))
        data["tests"] = {
            "status": "passed" if ok else "failed",
            "validated_at": record["validated_at"],
            "runner": "scripts/validate_brain_pack.py",
            "summary": summary,
        }
        latest_run.write_text(
            json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate redacted Brain Pack.")
    parser.add_argument("--brain-pack", default="artifacts/brain_pack.json")
    parser.add_argument("--history-dir", default="artifacts/history")
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--record-result", action="store_true")
    args = parser.parse_args()

    text = Path(args.brain_pack).read_text(encoding="utf-8")
    pack = json.loads(text)
    violations = []
    project_root = Path(args.project_root)
    validate_memory_cards(pack, violations)
    validate_subject(pack, violations)
    validate_object_table(project_root, violations)
    validate_history(Path(args.history_dir), violations)
    validate_project_files(project_root, violations)
    validate_frontend_language(project_root, violations)
    validate_no_source_copies(project_root, violations)
    summary = {
        "cards": len(pack.get("memory_cards", [])),
        "subject_timeline_entries": len(pack.get("subject_timeline", [])),
        "objects": len(json.loads((project_root / "artifacts/object_table.json").read_text(encoding="utf-8")).get("objects", []))
        if (project_root / "artifacts/object_table.json").exists()
        else 0,
    }
    if args.record_result:
        record_validation(Path(args.history_dir), not violations, summary, violations)
    if violations:
        print(json.dumps({"ok": False, "violations": violations[:50]}, ensure_ascii=False, indent=2))
        return 2
    print(
        json.dumps(
            {
                "ok": True,
                **summary,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
