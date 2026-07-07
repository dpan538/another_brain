#!/usr/bin/env python3
"""R28B9 deployable static bundle size breakdown."""

from __future__ import annotations

import fnmatch
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
BASE_REF = os.environ.get("R28B9_BASE_REF", "origin/r28p0b-prelaunch-integration")
REPORT_PATH = ROOT / "artifacts" / "r28b9" / "reports" / "bundle_size_breakdown.json"

SOURCE_MAP_SUFFIX = ".map"
UNUSED_TEST_DEMO_ASSETS = {
    "web/context_stress_cases.json",
    "web/model_inference_cases.json",
    "web/model_gate.html",
    "web/model_gate.js",
    "web/bench.html",
    "web/bench.js",
    "web/webgpu_bench.html",
    "web/webgpu_bench.js",
}


def run_git(args: list[str], *, check: bool = True) -> str:
    result = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True, check=False)
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"git {' '.join(args)} failed")
    return result.stdout


def read_ignore_entries(text: str) -> list[str]:
    entries: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and not line.startswith("!"):
            entries.append(line)
    return entries


def current_ignore_entries(root: Path = ROOT) -> list[str]:
    path = root / ".vercelignore"
    return read_ignore_entries(path.read_text(encoding="utf-8")) if path.exists() else []


def ref_ignore_entries(ref: str = BASE_REF) -> list[str]:
    text = run_git(["show", f"{ref}:.vercelignore"], check=False)
    return read_ignore_entries(text)


def ignored_by_vercel(rel: str, entries: Iterable[str]) -> bool:
    for entry in entries:
        normalized = entry.rstrip("/")
        if entry.endswith("/**"):
            prefix = normalized[:-3]
            if rel == prefix or rel.startswith(prefix + "/"):
                return True
        if fnmatch.fnmatch(rel, entry) or rel == normalized or rel.startswith(normalized + "/"):
            return True
    return False


def collect_current_web_files(root: Path = ROOT) -> dict[str, int]:
    entries = current_ignore_entries(root)
    files: dict[str, int] = {}
    for path in (root / "web").rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        if ignored_by_vercel(rel, entries):
            continue
        files[rel] = path.stat().st_size
    return dict(sorted(files.items()))


def collect_ref_web_files(ref: str = BASE_REF) -> dict[str, int]:
    entries = ref_ignore_entries(ref)
    files: dict[str, int] = {}
    output = run_git(["ls-tree", "-r", "-l", ref, "--", "web"])
    pattern = re.compile(r"^\d+\s+\w+\s+[0-9a-f]+\s+(-|\d+)\t(.+)$")
    for line in output.splitlines():
        match = pattern.match(line)
        if not match:
            continue
        size_text, rel = match.groups()
        if size_text == "-" or ignored_by_vercel(rel, entries):
            continue
        files[rel] = int(size_text)
    return dict(sorted(files.items()))


def classify_path(rel: str) -> str:
    path = Path(rel)
    suffix = path.suffix.lower()
    if suffix == SOURCE_MAP_SUFFIX:
        return "source_maps"
    if rel.startswith("web/another_brain_chat/"):
        return "chat_shell"
    if rel.startswith("web/another_brain/static_rag/"):
        return "demo_rag_assets"
    if rel in UNUSED_TEST_DEMO_ASSETS:
        return "unused_test_demo_assets"
    if suffix == ".css":
        return "css"
    if rel.startswith("web/knowledge_shards/"):
        if path.name == "manifest.json":
            return "manifest_overhead"
        return "knowledge_shards"
    if path.name in {"runtime_mode.json", "asset_manifest.json", "site.webmanifest"}:
        return "manifest_overhead"
    if suffix in {".txt", ".md", ".xml"}:
        return "docs_static_copied_files"
    if rel in {"web/culture_cards.generated.js", "web/tiny_router_model.generated.js", "web/public_knowledge_pack.generated.js"}:
        return "generated_runtime_data"
    if suffix == ".js":
        return "js_runtime"
    if suffix == ".json":
        return "json_static_data"
    if suffix == ".html":
        return "html_shell"
    return "other_static"


def summarize_files(files: dict[str, int]) -> dict:
    categories: dict[str, dict] = defaultdict(lambda: {"bytes": 0, "files": 0, "largest": []})
    for rel, size in files.items():
        category = classify_path(rel)
        bucket = categories[category]
        bucket["bytes"] += size
        bucket["files"] += 1
        bucket["largest"].append({"path": rel, "bytes": size})

    out = {}
    for category, bucket in sorted(categories.items()):
        largest = sorted(bucket["largest"], key=lambda item: item["bytes"], reverse=True)[:10]
        out[category] = {"bytes": bucket["bytes"], "files": bucket["files"], "largest": largest}
    return out


def ignored_current_diet_assets(root: Path = ROOT) -> list[dict]:
    entries = current_ignore_entries(root)
    ignored = []
    for rel in sorted(UNUSED_TEST_DEMO_ASSETS):
        path = root / rel
        if path.exists() and ignored_by_vercel(rel, entries):
            ignored.append({"path": rel, "bytes": path.stat().st_size, "category": classify_path(rel)})
    for path in (root / "web").rglob(f"*{SOURCE_MAP_SUFFIX}"):
        rel = path.relative_to(root).as_posix()
        if ignored_by_vercel(rel, entries):
            ignored.append({"path": rel, "bytes": path.stat().st_size, "category": "source_maps"})
    return ignored


def build_breakdown(base_ref: str = BASE_REF, root: Path = ROOT) -> dict:
    before_files = collect_ref_web_files(base_ref)
    after_files = collect_current_web_files(root)
    before_total = sum(before_files.values())
    after_total = sum(after_files.values())
    categories_before = summarize_files(before_files)
    categories_after = summarize_files(after_files)
    all_categories = sorted(set(categories_before) | set(categories_after))
    saved_by_category = {
        category: categories_before.get(category, {}).get("bytes", 0) - categories_after.get(category, {}).get("bytes", 0)
        for category in all_categories
    }
    largest_removed_or_ignored = []
    for rel, size in before_files.items():
        if rel not in after_files:
            largest_removed_or_ignored.append({"path": rel, "bytes": size, "category": classify_path(rel)})
    largest_removed_or_ignored = sorted(largest_removed_or_ignored, key=lambda item: item["bytes"], reverse=True)[:20]

    report = {
        "ok": after_total <= before_total,
        "base_ref": base_ref,
        "before": {
            "bundle_bytes": before_total,
            "file_count": len(before_files),
            "categories": categories_before,
        },
        "after": {
            "bundle_bytes": after_total,
            "file_count": len(after_files),
            "categories": categories_after,
        },
        "bytes_saved": before_total - after_total,
        "saved_by_category": saved_by_category,
        "largest_removed_or_ignored": largest_removed_or_ignored,
        "ignored_current_diet_assets": ignored_current_diet_assets(root),
        "required_categories": [
            "js_runtime",
            "chat_shell",
            "docs_static_copied_files",
            "demo_rag_assets",
            "css",
            "source_maps",
            "unused_test_demo_assets",
            "manifest_overhead",
        ],
        "non_claims": {
            "training": False,
            "model_assets": False,
            "product_model": False,
            "backend_inference": False,
            "external_runtime": False,
        },
    }
    return report


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    report = build_breakdown()
    write_json(REPORT_PATH, report)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
