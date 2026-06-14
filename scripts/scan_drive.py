#!/usr/bin/env python3
"""Read-only inventory scanner for the Another Brain source drive.

The scanner walks a mounted volume, stats every accessible file, and writes
derived metadata. It does not copy source files or persist file contents.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_SOURCE = "/path/to/local/source"
DEFAULT_OUT_DIR = "artifacts"

EXCLUDED_DIRS = {
    ".Spotlight-V100",
    ".TemporaryItems",
    ".Trashes",
    ".fseventsd",
    "System Volume Information",
}
HOME_EXCLUDED_TOP_DIRS = {
    "Applications",
    "Envs",
    "Library",
    "node_modules",
    ".Trash",
}
HOME_EXCLUDED_DIR_NAMES = {
    ".cache",
    ".config",
    ".docker",
    ".git",
    ".next",
    ".npm",
    ".ssh",
    ".Trash",
    ".venv",
    ".vscode",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
}
HOME_EXCLUDED_SUFFIXES = (
    ".app",
    ".cocatalog",
    ".framework",
    ".lrdata",
    ".photoslibrary",
)

RAW_EXTS = {
    "3fr",
    "arw",
    "cr2",
    "cr3",
    "dng",
    "erf",
    "fff",
    "iiq",
    "mef",
    "mos",
    "mrw",
    "nef",
    "orf",
    "pef",
    "raf",
    "raw",
    "rw2",
    "rwl",
    "sr2",
    "srf",
    "x3f",
}
PHOTO_EXTS = {"jpg", "jpeg", "png", "tif", "tiff", "heic", "gif", "webp", "thm"}
VIDEO_EXTS = {"mov", "mp4", "m4v", "avi", "mkv", "mts", "m2ts"}
AUDIO_EXTS = {"mp3", "wav", "aif", "aiff", "m4a", "flac", "aac"}
DESIGN_EXTS = {"indd", "psd", "ai", "eps", "svg", "sketch", "xd", "afdesign"}
DOC_EXTS = {"pdf", "doc", "docx", "txt", "md", "rtf", "pages", "key", "ppt", "pptx"}
CODE_EXTS = {
    "css",
    "html",
    "js",
    "jsx",
    "json",
    "mdx",
    "php",
    "py",
    "rb",
    "sh",
    "sqlite",
    "sqlite-shm",
    "sqlite-wal",
    "ts",
    "tsx",
    "xml",
    "yaml",
    "yml",
}
COMPRESSED_BUNDLE_EXTS = {"zip", "rar", "7z", "tar", "gz", "bz2", "xz", "dmg"}
PHOTO_WORKFLOW_EXTS = {"cof", "cop", "cos", "cot", "cocatalog", "lrcat", "lrdata", "xmp", "lrf"}

TOKEN_RE = re.compile(
    r"[\u4e00-\u9fff]{2,}|[A-Za-z][A-Za-z0-9_+\-]{1,}|20\d{2}(?:[._-]\d{1,2}){0,2}"
)

STOP_TERMS = {
    "and",
    "app",
    "bad",
    "data",
    "file",
    "files",
    "final",
    "for",
    "folder",
    "good",
    "image",
    "new",
    "part",
    "project",
    "setup",
    "system",
    "the",
    "upload",
    "week",
}


def iso_from_timestamp(ts: float | None) -> str | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()


def extension_for(name: str) -> str:
    if name.startswith("._"):
        name = name[2:]
    suffix = Path(name).suffix.lower().lstrip(".")
    return suffix or "(none)"


def classify_file(name: str, ext: str) -> str:
    lower = name.lower()
    if name.startswith("._") or lower in {".ds_store", "thumbs.db", "desktop.ini"}:
        return "system_metadata"
    if ext in RAW_EXTS:
        return "camera_raw"
    if ext in PHOTO_EXTS:
        return "photo_image"
    if ext in VIDEO_EXTS:
        return "video"
    if ext in AUDIO_EXTS:
        return "audio"
    if ext in DESIGN_EXTS:
        return "design_source"
    if ext in DOC_EXTS:
        return "document"
    if ext in PHOTO_WORKFLOW_EXTS:
        return "photo_workflow"
    if ext in CODE_EXTS:
        return "code_or_data"
    if ext in COMPRESSED_BUNDLE_EXTS:
        return "compressed_bundle"
    return "other"


def tokenize(path_text: str) -> list[str]:
    text = path_text.replace("_", " ").replace("-", " ").replace(".", " ")
    tokens = []
    for raw in TOKEN_RE.findall(text):
        token = raw.strip().lower()
        if token and token not in STOP_TERMS and len(token) <= 48:
            tokens.append(token)
    return tokens


def safe_stat(path: Path) -> os.stat_result | None:
    try:
        return path.stat()
    except OSError:
        return None


def should_skip_dir(profile: str, source: Path, root_path: Path, dirname: str) -> tuple[bool, str | None]:
    if dirname in EXCLUDED_DIRS:
        return True, "system_dir"
    if profile != "home":
        return False, None
    candidate = root_path / dirname
    try:
        rel = candidate.relative_to(source).as_posix()
    except ValueError:
        rel = dirname
    parts = rel.split("/")
    if dirname.startswith("."):
        return True, "home_hidden_dir"
    if parts and parts[0] in HOME_EXCLUDED_TOP_DIRS:
        return True, "home_excluded_top_dir"
    if dirname in HOME_EXCLUDED_DIR_NAMES:
        return True, "home_noise_dir"
    if dirname.lower().endswith(HOME_EXCLUDED_SUFFIXES):
        return True, "home_package_dir"
    if rel == "Desktop/another_brain":
        return True, "home_current_project"
    return False, None


def record_for_file(root: Path, path: Path, st: os.stat_result) -> dict[str, Any]:
    rel = path.relative_to(root).as_posix()
    ext = extension_for(path.name)
    mtime = getattr(st, "st_mtime", None)
    birthtime = getattr(st, "st_birthtime", None)
    parts = rel.split("/")
    return {
        "path": rel,
        "top_dir": parts[0] if len(parts) > 1 else "",
        "depth": len(parts) - 1,
        "name": path.name,
        "extension": ext,
        "group": classify_file(path.name, ext),
        "size_bytes": st.st_size,
        "modified_at": iso_from_timestamp(mtime),
        "created_at": iso_from_timestamp(birthtime),
    }


def scan(source: Path, out_dir: Path, *, source_id: str = "t7", profile: str = "t7") -> dict[str, Any]:
    started = time.time()
    out_dir.mkdir(parents=True, exist_ok=True)
    inventory_path = out_dir / f"{source_id}_inventory.jsonl"
    summary_path = out_dir / f"{source_id}_summary.json"

    counters: dict[str, Counter] = {
        "extensions": Counter(),
        "groups": Counter(),
        "modified_years": Counter(),
        "created_years": Counter(),
        "top_dirs_by_count": Counter(),
        "terms": Counter(),
    }
    top_dirs_by_size: defaultdict[str, int] = defaultdict(int)
    top_large_files: list[dict[str, Any]] = []
    skipped_dirs: Counter = Counter()
    stat_errors: list[str] = []

    file_count = 0
    dir_count = 0
    total_bytes = 0
    oldest_mtime: tuple[float, str] | None = None
    newest_mtime: tuple[float, str] | None = None
    oldest_story_mtime: tuple[float, str] | None = None
    newest_story_mtime: tuple[float, str] | None = None

    with inventory_path.open("w", encoding="utf-8") as fp:
        for current_root, dirnames, filenames in os.walk(source, topdown=True, onerror=None):
            root_path = Path(current_root)
            kept_dirs = []
            for dirname in dirnames:
                skip, reason = should_skip_dir(profile, source, root_path, dirname)
                if skip:
                    skipped_dirs[f"{reason}:{dirname}"] += 1
                else:
                    kept_dirs.append(dirname)
            dirnames[:] = kept_dirs
            dir_count += len(dirnames)

            for filename in filenames:
                path = root_path / filename
                st = safe_stat(path)
                if st is None:
                    if len(stat_errors) < 200:
                        stat_errors.append(path.as_posix())
                    continue

                rec = record_for_file(source, path, st)
                fp.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")

                file_count += 1
                size = rec["size_bytes"]
                total_bytes += size
                ext = rec["extension"]
                group = rec["group"]
                top_dir = rec["top_dir"] or "(root)"

                counters["extensions"][ext] += 1
                counters["groups"][group] += 1
                counters["top_dirs_by_count"][top_dir] += 1
                top_dirs_by_size[top_dir] += size
                counters["terms"].update(tokenize(rec["path"]))

                if rec["modified_at"]:
                    year = rec["modified_at"][:4]
                    counters["modified_years"][year] += 1
                    mtime = st.st_mtime
                    if oldest_mtime is None or mtime < oldest_mtime[0]:
                        oldest_mtime = (mtime, rec["path"])
                    if newest_mtime is None or mtime > newest_mtime[0]:
                        newest_mtime = (mtime, rec["path"])
                    if group != "system_metadata":
                        if oldest_story_mtime is None or mtime < oldest_story_mtime[0]:
                            oldest_story_mtime = (mtime, rec["path"])
                        if newest_story_mtime is None or mtime > newest_story_mtime[0]:
                            newest_story_mtime = (mtime, rec["path"])

                if rec["created_at"]:
                    counters["created_years"][rec["created_at"][:4]] += 1

                if len(top_large_files) < 80 or size > top_large_files[-1]["size_bytes"]:
                    top_large_files.append(
                        {
                            "path": rec["path"],
                            "group": group,
                            "extension": ext,
                            "size_bytes": size,
                            "modified_at": rec["modified_at"],
                        }
                    )
                    top_large_files.sort(key=lambda item: item["size_bytes"], reverse=True)
                    del top_large_files[80:]

    top_dirs_size_counter = Counter(top_dirs_by_size)
    summary = {
        "source": source.as_posix(),
        "source_id": source_id,
        "profile": profile,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": round(time.time() - started, 2),
        "scan_policy": {
            "copied_source_files": False,
            "persisted_file_contents": False,
            "persisted_metadata": [
                "relative path",
                "file name",
                "extension",
                "size",
                "modified time",
                "created time when available",
            ],
            "excluded_system_dirs": sorted(EXCLUDED_DIRS),
            "profile_exclusions": {
                "home_excluded_top_dirs": sorted(HOME_EXCLUDED_TOP_DIRS) if profile == "home" else [],
                "home_excluded_dir_names": sorted(HOME_EXCLUDED_DIR_NAMES) if profile == "home" else [],
                "home_excluded_suffixes": list(HOME_EXCLUDED_SUFFIXES) if profile == "home" else [],
            },
        },
        "totals": {
            "files": file_count,
            "directories_seen": dir_count,
            "bytes": total_bytes,
        },
        "time_range": {
            "oldest_modified_file": {
                "path": oldest_mtime[1],
                "modified_at": iso_from_timestamp(oldest_mtime[0]),
            }
            if oldest_mtime
            else None,
            "newest_modified_file": {
                "path": newest_mtime[1],
                "modified_at": iso_from_timestamp(newest_mtime[0]),
            }
            if newest_mtime
            else None,
            "oldest_non_system_file": {
                "path": oldest_story_mtime[1],
                "modified_at": iso_from_timestamp(oldest_story_mtime[0]),
            }
            if oldest_story_mtime
            else None,
            "newest_non_system_file": {
                "path": newest_story_mtime[1],
                "modified_at": iso_from_timestamp(newest_story_mtime[0]),
            }
            if newest_story_mtime
            else None,
        },
        "counts": {
            name: counter.most_common(500 if name == "terms" else 200)
            for name, counter in counters.items()
        },
        "top_dirs_by_size": top_dirs_size_counter.most_common(200),
        "top_large_files": top_large_files,
        "skipped_dirs": skipped_dirs.most_common(),
        "stat_errors_sample": stat_errors,
        "outputs": {
            "inventory_jsonl": inventory_path.as_posix(),
            "summary_json": summary_path.as_posix(),
        },
    }

    with summary_path.open("w", encoding="utf-8") as fp:
        json.dump(summary, fp, ensure_ascii=False, indent=2, sort_keys=True)

    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan a drive without copying source files.")
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="Mounted source volume path.")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help="Directory for derived artifacts.")
    parser.add_argument("--source-id", default="t7", help="Stable source id used in artifact file names.")
    parser.add_argument("--profile", choices=["t7", "home"], default="t7", help="Scan profile and exclusion policy.")
    args = parser.parse_args()

    source = Path(args.source)
    if not source.exists():
        raise SystemExit(f"Source does not exist: {source}")
    if not source.is_dir():
        raise SystemExit(f"Source is not a directory: {source}")

    summary = scan(source, Path(args.out_dir), source_id=args.source_id, profile=args.profile)
    print(
        json.dumps(
            {
                "source": summary["source"],
                "files": summary["totals"]["files"],
                "directories_seen": summary["totals"]["directories_seen"],
                "duration_seconds": summary["duration_seconds"],
                "inventory": summary["outputs"]["inventory_jsonl"],
                "summary": summary["outputs"]["summary_json"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
