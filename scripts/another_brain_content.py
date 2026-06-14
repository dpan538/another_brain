#!/usr/bin/env python3
"""Shared local content utilities for Another Brain.

This module is deliberately conservative: sensitive paths are rejected before
content extraction, and all saved excerpts pass through redaction.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


SYSTEM_NAMES = {".ds_store", "thumbs.db", "desktop.ini"}

TEXT_EXTS = {
    "css",
    "csv",
    "html",
    "js",
    "json",
    "md",
    "mdx",
    "rtf",
    "txt",
    "xml",
    "yaml",
    "yml",
}
PDF_EXTS = {"pdf"}
IMAGE_EXTS = {"jpg", "jpeg", "png", "tif", "tiff", "heic", "webp"}
VIDEO_EXTS = {"mov", "mp4", "m4v", "avi", "mkv"}

SENSITIVE_SUBSTRINGS = [
    "证件",
    "身份证",
    "身份",
    "护照",
    "银行",
    "银行卡",
    "签证",
    "驾照",
    "驾驶证",
    "户口",
    "社保",
    "医保",
    "税号",
    "账号",
    "账户",
    "卡号",
    "号码",
    "地址证明",
    "房产证",
    "passport",
    "visa",
    "bank",
    "id card",
    "idcard",
    "identity",
    "driver license",
    "driving license",
    "ssn",
    "tax id",
    "account number",
    "card number",
    "proof of address",
    "address proof",
    "statement",
]

SENSITIVE_TOKEN_RE = re.compile(
    r"(^|[^a-z0-9])(passport|visa|bank|idcard|identity|ssn|statement)([^a-z0-9]|$)"
)

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
URL_RE = re.compile(r"https?://[^\s`'\"\]\)<>]+")
ABS_PATH_RE = re.compile(
    r"(?<![A-Za-z0-9])/(?:Users|Volumes|private|var|tmp|Applications|Library|System|opt|usr|bin|sbin|etc|home)"
    r"(?:/[^`'\"\n\r\]\)]*)?"
)
REL_PATH_RE = re.compile(
    r"(?<![A-Za-z0-9_])(?:\.{1,2}/)?(?:[A-Za-z0-9_.@+-]+/){2,}[A-Za-z0-9_.@+-]+"
)
PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)")
LONG_NUMBER_RE = re.compile(r"(?<!\d)\d{6,}(?!\d)")
NAME_LABEL_RE = re.compile(
    r"(?i)\b(name|full name|applicant|author)\b\s*[:：]\s*[^\n,;]{1,80}|"
    r"(姓名|申请人|作者)\s*[:：]\s*[^\n,;，；]{1,40}"
)
ADDRESS_LABEL_RE = re.compile(
    r"(?i)\b(address|residence|home address)\b\s*[:：]\s*[^\n]{1,120}|"
    r"(地址|住址|居住地)\s*[:：]\s*[^\n]{1,80}"
)
CHINESE_ADDRESS_RE = re.compile(
    r"[\u4e00-\u9fff]{2,}(?:省|市|区|县|路|街|巷|号|室)[\u4e00-\u9fffA-Za-z0-9#\- ]{0,40}"
)

TOKEN_RE = re.compile(
    r"[\u4e00-\u9fff]{2,}|[A-Za-z][A-Za-z0-9_+\-]{1,}|20\d{2}(?:[._-]\d{1,2}){0,2}"
)

STOP_TERMS = {
    "and",
    "for",
    "the",
    "with",
    "from",
    "this",
    "that",
    "files",
    "file",
    "image",
    "data",
    "email",
    "cache",
    "previews",
    "resources",
    "processed",
    "captured",
    "digital",
    "jpeg",
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
    "analyzed",
    "extraction",
    "ffmpeg",
    "frame",
    "frames",
    "phone",
    "number",
    "name",
    "address",
    "length",
    "endstream",
    "pdf-1",
    "obj",
    "len",
    "xref",
    "trailer",
    "creationdate",
    "capturefps",
    "duration",
    "direct",
    "encoding",
    "status",
    "value",
    "true",
    "false",
    "ver",
    "framecount",
    "halfstep",
    "increment",
    "klvpacket",
    "klvpackettable",
    "lastupdate",
    "port",
    "key",
    "http",
    "https",
    "com",
    "please",
    "following",
    "portable",
    "android",
    "application",
    "root",
    "portablessd",
    "samsung",
    "ssd",
    "sw",
    "const",
    "processor",
}


@dataclass(frozen=True)
class SourceItem:
    source_id: str
    root: Path
    rel_path: str
    group: str
    extension: str
    size_bytes: int
    modified_at: str | None
    created_at: str | None

    @property
    def absolute_path(self) -> Path:
        return self.root / self.rel_path

    @property
    def ref(self) -> str:
        return stable_hash(f"{self.source_id}:{self.rel_path}")[:16]

    @property
    def top_dir(self) -> str:
        return self.rel_path.split("/", 1)[0] if "/" in self.rel_path else "(root)"


class SourceAdapter:
    source_id = "source"

    def iter_items(self) -> Iterable[SourceItem]:
        raise NotImplementedError


class T7SourceAdapter(SourceAdapter):
    source_id = "t7"

    def __init__(self, source_root: Path, inventory_path: Path) -> None:
        self.source_root = source_root
        self.inventory_path = inventory_path

    def iter_items(self) -> Iterable[SourceItem]:
        with self.inventory_path.open("r", encoding="utf-8") as fp:
            for line in fp:
                if not line.strip():
                    continue
                rec = json.loads(line)
                yield SourceItem(
                    source_id=self.source_id,
                    root=self.source_root,
                    rel_path=rec["path"],
                    group=rec.get("group", "other"),
                    extension=rec.get("extension", "(none)").lower(),
                    size_bytes=int(rec.get("size_bytes", 0)),
                    modified_at=rec.get("modified_at"),
                    created_at=rec.get("created_at"),
                )


class HomeSourceAdapter(SourceAdapter):
    source_id = "home"

    def __init__(self, source_root: Path, inventory_path: Path) -> None:
        self.source_root = source_root
        self.inventory_path = inventory_path

    def iter_items(self) -> Iterable[SourceItem]:
        with self.inventory_path.open("r", encoding="utf-8") as fp:
            for line in fp:
                if not line.strip():
                    continue
                rec = json.loads(line)
                yield SourceItem(
                    source_id=self.source_id,
                    root=self.source_root,
                    rel_path=rec["path"],
                    group=rec.get("group", "other"),
                    extension=rec.get("extension", "(none)").lower(),
                    size_bytes=int(rec.get("size_bytes", 0)),
                    modified_at=rec.get("modified_at"),
                    created_at=rec.get("created_at"),
                )


def stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="replace")).hexdigest()


def is_system_item(item: SourceItem) -> bool:
    name = Path(item.rel_path).name.lower()
    return item.group == "system_metadata" or name in SYSTEM_NAMES or name.startswith("._")


def is_sensitive_path(rel_path: str) -> tuple[bool, str | None]:
    normalized = rel_path.replace("_", " ").replace("-", " ").lower()
    normalized = re.sub(r"\s+", " ", normalized)
    for marker in SENSITIVE_SUBSTRINGS:
        if marker.lower() in normalized:
            return True, marker
    if SENSITIVE_TOKEN_RE.search(normalized):
        return True, "sensitive_token"
    return False, None


HOME_ALWAYS_SKIP_TOP_DIRS = {
    "Applications",
    "Envs",
    "Library",
    "node_modules",
    ".Trash",
}
HOME_REVIEW_ONLY_TOP_DIRS = {
    "Downloads",
    "Dropbox",
    "Zotero",
}
HOME_ALLOWED_TOP_DIRS = {
    "Desktop",
    "Documents",
    "Movies",
    "Pictures",
    "Projects",
}
HOME_NOISE_DIRS = {
    ".git",
    ".next",
    ".nuxt",
    ".turbo",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
}
HOME_RISKY_GENERIC_RE = re.compile(
    r"^(?:scan|statement|id|identity|passport|visa|bank|address|invoice|receipt|bill|img[_-]?\d+|dsc[_-]?\d+)\.(?:pdf|jpe?g|png|heic|tiff?)$",
    re.I,
)
HOME_LOW_SIGNAL_TEXT_EXTS = {"css", "csv", "js", "json", "xml", "yaml", "yml"}


def is_creative_home_top_dir(top_dir: str) -> bool:
    lower = top_dir.lower()
    if top_dir.startswith("."):
        return False
    return any(
        marker in lower
        for marker in (
            "photo",
            "portfolio",
            "project",
            "site",
            "design",
            "idea",
            "sony",
            "raw",
            "movie",
        )
    )


def can_read_home_content(item: SourceItem) -> tuple[bool, str]:
    parts = Path(item.rel_path).parts
    if not parts:
        return False, "home_empty_path"
    top_dir = parts[0]
    name = Path(item.rel_path).name
    lower_top = top_dir.lower()
    if top_dir.startswith(".") or any(part.startswith(".") for part in parts):
        return False, "home_hidden_or_config"
    if top_dir in HOME_ALWAYS_SKIP_TOP_DIRS:
        return False, f"home_skip_top_dir:{top_dir}"
    if top_dir in HOME_REVIEW_ONLY_TOP_DIRS:
        return False, f"home_review_only:{top_dir}"
    if lower_top.startswith("creative cloud files"):
        return False, "home_review_only:Creative Cloud"
    if len(parts) >= 2 and parts[0] == "Desktop" and parts[1] == "another_brain":
        return False, "home_skip_current_project"
    if any(part in HOME_NOISE_DIRS for part in parts):
        return False, "home_noise_dir"
    if HOME_RISKY_GENERIC_RE.match(name):
        return False, "home_risky_generic_name"
    if item.extension in HOME_LOW_SIGNAL_TEXT_EXTS:
        return False, "home_low_signal_code_or_data"
    if top_dir not in HOME_ALLOWED_TOP_DIRS and not is_creative_home_top_dir(top_dir):
        return False, "home_not_in_content_scope"
    return True, "home_allowed"


def can_read_content(item: SourceItem) -> tuple[bool, str]:
    if is_system_item(item):
        return False, "system_metadata"
    sensitive, reason = is_sensitive_path(item.rel_path)
    if sensitive:
        return False, f"sensitive_path:{reason}"
    if item.source_id == "home":
        home_allowed, home_reason = can_read_home_content(item)
        if not home_allowed:
            return False, home_reason
    if item.extension in TEXT_EXTS | PDF_EXTS | IMAGE_EXTS | VIDEO_EXTS:
        return True, "allowed"
    return False, "unsupported_type"


def redact_text(text: str) -> str:
    text = URL_RE.sub("<URL>", text)
    text = ABS_PATH_RE.sub("<PATH>", text)
    text = REL_PATH_RE.sub("<REL_PATH>", text)
    text = EMAIL_RE.sub("<EMAIL>", text)
    text = PHONE_RE.sub("<PHONE>", text)
    text = NAME_LABEL_RE.sub("<NAME>", text)
    text = ADDRESS_LABEL_RE.sub("<ADDRESS>", text)
    text = CHINESE_ADDRESS_RE.sub("<ADDRESS>", text)
    text = LONG_NUMBER_RE.sub("<NUMBER>", text)
    return text


def compact_whitespace(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def decode_bytes(data: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "gb18030", "big5", "latin-1"):
        try:
            decoded = data.decode(encoding)
            if decoded.count("\ufffd") < 5:
                return decoded
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def read_text_file(path: Path, max_bytes: int = 160_000) -> str:
    data = path.read_bytes()[:max_bytes]
    return compact_whitespace(redact_text(decode_bytes(data)))


def run_command(args: list[str], timeout: int = 20) -> str:
    try:
        proc = subprocess.run(
            args,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return proc.stdout if proc.returncode == 0 else ""


def read_pdf_text(path: Path, max_chars: int = 12_000) -> str:
    mdls = run_command(["mdls", "-raw", "-name", "kMDItemTextContent", str(path)])
    if mdls and mdls.strip() != "(null)":
        return compact_whitespace(redact_text(mdls[:max_chars]))
    strings = run_command(["strings", "-n", "8", str(path)], timeout=30)
    return compact_whitespace(redact_text(strings[:max_chars]))


def image_metadata(path: Path) -> dict[str, Any]:
    try:
        from PIL import Image, ExifTags

        with Image.open(path) as img:
            exif = img.getexif()
            named_exif = {}
            for key, value in list(exif.items())[:80]:
                name = ExifTags.TAGS.get(key, str(key))
                if isinstance(value, bytes):
                    continue
                named_exif[name] = str(value)[:160]
            return {
                "format": img.format,
                "width": img.size[0],
                "height": img.size[1],
                "mode": img.mode,
                "camera_make": named_exif.get("Make"),
                "camera_model": named_exif.get("Model"),
                "software": named_exif.get("Software"),
                "captured_at": named_exif.get("DateTimeOriginal") or named_exif.get("DateTime"),
            }
    except Exception as exc:  # noqa: BLE001
        return {"error": type(exc).__name__}


def run_vision_extract(path: Path, swift_script: Path) -> dict[str, Any]:
    if not swift_script.exists():
        return {"available": False, "error": "vision_script_missing"}
    output = run_command(
        [
            "swift",
            "-module-cache-path",
            "/private/tmp/swift_module_cache",
            str(swift_script),
            str(path),
        ],
        timeout=45,
    )
    if not output.strip():
        return {"available": False, "error": "vision_failed"}
    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        return {"available": False, "error": "vision_json_decode_failed"}
    if "ocr_text" in data:
        data["ocr_text"] = redact_text(data["ocr_text"])
    return data


def tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    for raw in TOKEN_RE.findall(text):
        token = raw.lower().strip()
        if len(token) > 1 and token not in STOP_TERMS and not token.isdigit():
            tokens.append(token)
    return tokens


def path_hint(item: SourceItem) -> str:
    ext = item.extension if item.extension != "(none)" else "file"
    top = redact_text(item.top_dir)
    return f"{top}/.../*.{ext}"
