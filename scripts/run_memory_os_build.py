#!/usr/bin/env python3
"""Run a long, local-only memory OS build over allowed T7 content.

The build never copies original source files into the project. It stores only
redacted event atoms, derived observations, aggregate reflections, and hashed
provenance references.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from another_brain_content import (
    HomeSourceAdapter,
    IMAGE_EXTS,
    PDF_EXTS,
    TEXT_EXTS,
    T7SourceAdapter,
    VIDEO_EXTS,
    can_read_content,
    compact_whitespace,
    decode_bytes,
    redact_text,
    run_command,
    stable_hash,
    tokenize,
)


DEFAULT_SOURCE = "/path/to/local/source"
DEFAULT_INVENTORY = "artifacts/t7_inventory.jsonl"
DEFAULT_OUT_DIR = "artifacts/memory_os"
DEFAULT_CHECKPOINT = 100
SENSITIVE_CONTENT_RE = re.compile(
    r"passport|visa|bank|身份证|护照|银行|签证|银行卡|证件|address proof|proof of address|account number|card number",
    re.I,
)
NOISY_TOKENS = {
    "metadata",
    "software",
    "digital",
    "processed",
    "visible",
    "local",
    "text",
    "image",
    "video",
    "jpeg",
    "frame",
    "frames",
    "duration",
    "encoding",
    "status",
    "value",
    "true",
    "false",
    "endstream",
    "length",
    "xref",
    "trailer",
    "obj",
    "pdf",
    "http",
    "https",
    "go",
    "to",
    "url",
    "www",
    "com",
    "html",
    "head",
    "meta",
    "content",
    "charset",
    "refresh",
    "panorama",
    "http-equiv",
    "content-language",
    "content-type",
    "zh-cn",
    "gb2312",
    "portable",
    "ssd",
    "android",
    "samsung",
    "root",
    "const",
    "subtype",
    "type",
}
VALIDATION_CONTENT_KEYS = {
    "summary",
    "excerpt",
    "ocr_excerpt",
    "topics",
    "themes",
    "method",
    "examples",
    "label",
    "identity_shape",
    "style",
    "memory_architecture",
}
CALIBRATION_METHODS = [
    {
        "id": "dialog_shape",
        "method": "主体是对话框；回答短、轻、怪、克制，不解释后台。",
        "examples": ["我是对话框，也有人叫我鳄鱼。", "我忘记了。可以这样回答吗？"],
        "source": "user_calibration",
    },
    {
        "id": "forgetting_method",
        "method": "忘记不是失败，而是暂时没有被想起；无法证明时直接承认。",
        "examples": ["早忘了。", "我甚至无法证明我存在。", "也许只是忘了。"],
        "source": "user_calibration",
    },
    {
        "id": "photo_method",
        "method": "摄影先按逻辑和操作理解；照片整理与遗忘有关。",
        "examples": ["摄影是一种逻辑。", "买个相机，然后看说明书。", "因为会忘记。"],
        "source": "user_calibration",
    },
    {
        "id": "object_method",
        "method": "承认某个东西不能从文件名、品牌、格式、路径或备注自动成立；需要关系、行为或确认。用户说对象时默认是恋爱对象。",
        "examples": ["我暂时没有对象。", "名字之间的关系，不一定是事物之间的关系。"],
        "source": "user_calibration",
    },
    {
        "id": "privacy_method",
        "method": "身份、财务、证件、地址和号码细节不还原；拒绝要自然。",
        "examples": ["对话框也会有这些吗？"],
        "source": "user_calibration",
    },
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_line(record: dict[str, Any]) -> str:
    return json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n"


def sha_short(value: str, length: int = 16) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="replace")).hexdigest()[:length]


def size_bucket(size: int) -> str:
    if size < 64_000:
        return "tiny"
    if size < 1_000_000:
        return "small"
    if size < 10_000_000:
        return "medium"
    if size < 80_000_000:
        return "large"
    return "huge"


def phase_for(item: Any) -> str:
    stamp = item.modified_at or item.created_at or ""
    return stamp[:4] if re.fullmatch(r"(?:19|20)\d{2}.*", stamp) else "undated"


def clean_tokens(text: str, limit: int = 24) -> list[str]:
    result = []
    seen = set()
    for token in tokenize(text):
        token = token.lower().strip()
        if not token or token in NOISY_TOKENS or token in seen:
            continue
        if token.isdigit() or re.fullmatch(r"[a-f0-9]{8,}", token):
            continue
        seen.add(token)
        result.append(token)
        if len(result) >= limit:
            break
    return result


def top_tokens(counter: Counter, limit: int = 12) -> list[str]:
    return [token for token, _ in counter.most_common(limit) if token and token not in NOISY_TOKENS]


def item_meta(item: Any) -> dict[str, Any]:
    return {
        "source_id": item.source_id,
        "source_ref": item.ref,
        "phase": phase_for(item),
        "extension": item.extension,
        "group": item.group,
        "size_bucket": size_bucket(item.size_bytes),
        "top_context_hash": sha_short(item.top_dir or "(root)"),
    }


def medium_for(item: Any, modality: str) -> str:
    if modality == "text":
        return "text_document"
    if modality == "pdf_text":
        return "pdf_document"
    if modality == "image":
        return "still_image"
    if modality == "video_frame":
        return "moving_image"
    return item.group


def action_for(modality: str) -> str:
    if modality in {"text", "pdf_text"}:
        return "书写、整理、组织项目关系"
    if modality == "image":
        return "观看、取景、记录视觉线索"
    if modality == "video_frame":
        return "记录移动中的地点、时间和事件"
    return "留下可回溯的痕迹"


def sentence_summary(text: str, limit: int = 520) -> str:
    clean = compact_whitespace(redact_text(text))
    if not clean:
        return ""
    sentences = [part.strip() for part in re.split(r"(?<=[。！？.!?])\s+", clean) if len(part.strip()) >= 10]
    summary = " ".join(sentences[:3]) if sentences else clean[:limit]
    return summary[:limit]


def safe_excerpt(text: str, limit: int = 320) -> str:
    return compact_whitespace(redact_text(text))[:limit]


def adapter_for_source(source_id: str, source: Path, inventory: Path) -> Any:
    if source_id == "home":
        return HomeSourceAdapter(source, inventory)
    return T7SourceAdapter(source, inventory)


def iter_validation_text(value: Any, key: str | None = None) -> Iterable[str]:
    if isinstance(value, str):
        if key in VALIDATION_CONTENT_KEYS:
            yield value
        return
    if isinstance(value, list):
        for item in value:
            yield from iter_validation_text(item, key)
        return
    if isinstance(value, dict):
        for child_key, child_value in value.items():
            yield from iter_validation_text(child_value, child_key)


def load_validation_payloads(paths: Iterable[Path]) -> list[Any]:
    payloads = []
    for path in paths:
        if not path.exists():
            continue
        if path.suffix == ".jsonl":
            with path.open("r", encoding="utf-8") as fp:
                for line in fp:
                    if not line.strip():
                        continue
                    try:
                        payloads.append(json.loads(line))
                    except json.JSONDecodeError:
                        payloads.append({"summary": line[:500]})
            continue
        try:
            payloads.append(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            payloads.append({"summary": path.read_text(encoding="utf-8", errors="ignore")[:500]})
    return payloads


def read_text_full(path: Path) -> str:
    data = path.read_bytes()
    return compact_whitespace(redact_text(decode_bytes(data)))


def read_pdf_full(path: Path) -> str:
    mdls = run_command(["mdls", "-raw", "-name", "kMDItemTextContent", str(path)], timeout=180)
    if mdls and mdls.strip() != "(null)":
        return compact_whitespace(redact_text(mdls))
    strings = run_command(["strings", "-n", "8", str(path)], timeout=180)
    return compact_whitespace(redact_text(strings))


NOISY_CONTENT_RE = re.compile(
    r"%PDF-|endstream|startxref|xref\s*$|/FlateDecode|<</Filter|klvpacket",
    re.I | re.M,
)
HTML_SHELL_RE = re.compile(r"^\s*<!doctype html|^\s*<html\b|/_next/static|<script\b|<link\b", re.I)
SOURCE_LIST_RE = re.compile(r"(?im)^\s*# .*source urls?\b|^\s*# .*files generated\b|^\s*user-agent:\s*\*")
BOILERPLATE_RE = re.compile(
    r"Astro Starter Kit|create-next-app|This is a \[Next\.js\]|npm create astro@latest|Getting Started\s+First, run the development server",
    re.I,
)


def is_low_signal_content(text: str) -> bool:
    clean = text.strip()
    if not clean:
        return True
    if NOISY_CONTENT_RE.search(clean):
        return True
    if SOURCE_LIST_RE.search(clean[:900]):
        return True
    if BOILERPLATE_RE.search(clean[:2000]):
        return True
    if HTML_SHELL_RE.search(clean[:1200]):
        return True
    placeholder_count = clean.count("<URL>") + clean.count("<REL_PATH>") + clean.count("<PATH>")
    if placeholder_count >= 10:
        return True
    if len(clean) < 80 and len(tokenize(clean)) < 8:
        return True
    return False


def local_visual_features(path: Path) -> dict[str, Any]:
    try:
        if path.stat().st_size > 20_000_000:
            return {
                "available": True,
                "labels": [
                    {"text": "大幅图像", "confidence": 0.55},
                    {"text": "视觉特征未展开", "confidence": 0.45},
                ],
                "profile": {
                    "visual_fallback": "metadata_large_image",
                    "aspect_bucket": "unknown",
                },
            }
        import colorsys
        import warnings

        import numpy as np
        from PIL import Image

        Image.MAX_IMAGE_PIXELS = None
        warnings.simplefilter("ignore", Image.DecompressionBombWarning)
        with Image.open(path) as image:
            width, height = image.size
            try:
                image.draft("RGB", (320, 320))
            except Exception:
                pass
            image.thumbnail((160, 160))
            sample = image.convert("RGB")
            sample.thumbnail((160, 160))
            arr = np.asarray(sample, dtype=np.float32) / 255.0
        if arr.size == 0 or width <= 0 or height <= 0:
            return {"available": False, "error": "empty_image"}

        luma = arr[..., 0] * 0.2126 + arr[..., 1] * 0.7152 + arr[..., 2] * 0.0722
        brightness = float(np.mean(luma))
        contrast = float(np.std(luma))
        max_channel = arr.max(axis=2)
        min_channel = arr.min(axis=2)
        saturation = float(np.mean((max_channel - min_channel) / np.maximum(max_channel, 0.001)))
        red, green, blue = [float(value) for value in arr.reshape(-1, 3).mean(axis=0)]
        hue, _, _ = colorsys.rgb_to_hsv(red, green, blue)
        aspect = width / max(height, 1)

        labels: list[dict[str, Any]] = []

        def add(text: str, confidence: float) -> None:
            labels.append({"text": text, "confidence": round(confidence, 3)})

        if aspect > 1.75:
            add("宽幅画面", 0.68)
        elif aspect > 1.08:
            add("横向构图", 0.72)
        elif aspect < 0.58:
            add("狭长纵向构图", 0.66)
        elif aspect < 0.92:
            add("纵向构图", 0.72)
        else:
            add("接近方形画幅", 0.64)

        if brightness < 0.25:
            add("低照度", 0.7)
        elif brightness > 0.72:
            add("明亮光线", 0.7)
        else:
            add("中性亮度", 0.55)

        if contrast > 0.28:
            add("高对比", 0.68)
        elif contrast < 0.13:
            add("低对比", 0.6)
        else:
            add("中等对比", 0.52)

        if saturation < 0.18:
            add("色彩克制", 0.68)
        elif saturation > 0.46:
            add("色彩饱和", 0.66)
        else:
            add("自然色彩", 0.54)

        if saturation < 0.12:
            add("中性色倾向", 0.58)
        elif hue < 0.06 or hue >= 0.92:
            add("偏红色调", 0.5)
        elif hue < 0.14:
            add("偏橙色调", 0.5)
        elif hue < 0.22:
            add("偏黄色调", 0.5)
        elif hue < 0.45:
            add("偏绿色调", 0.5)
        elif hue < 0.62:
            add("偏青蓝色调", 0.5)
        elif hue < 0.78:
            add("偏蓝紫色调", 0.5)
        else:
            add("偏紫红色调", 0.5)

        return {
            "available": True,
            "labels": labels,
            "profile": {
                "visual_fallback": "pil_numpy",
                "aspect_bucket": "wide" if aspect > 1.75 else "landscape" if aspect > 1.08 else "portrait" if aspect < 0.92 else "squareish",
                "brightness": round(brightness, 3),
                "contrast": round(contrast, 3),
                "saturation": round(saturation, 3),
            },
        }
    except Exception as exc:  # noqa: BLE001
        return {"available": False, "error": type(exc).__name__}


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


class MemoryOSBuild:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.source = Path(args.source)
        self.source_id = args.source_id
        self.inventory = Path(args.inventory)
        self.out_dir = Path(args.out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.started_at = now_iso()
        self.started_monotonic = time.monotonic()
        self.event_atoms_path = self.out_dir / "event_atoms.jsonl"
        self.vision_path = self.out_dir / "vision_observations.jsonl"
        self.run_log_path = self.out_dir / "run_log.jsonl"
        self.progress_path = self.out_dir / "progress.json"
        self.status_path = self.out_dir / "status_index.json"
        self.sensitive_path = self.out_dir / "sensitive_skipped.json"
        if args.fresh:
            self.reset_generated_outputs()
        self.stats: dict[str, Any] = {
            "processed": Counter(),
            "errors": Counter(),
            "sensitive": Counter(),
            "modalities": Counter(),
            "phases": Counter(),
            "tokens": Counter(),
            "labels": Counter(),
            "text_status": Counter(),
            "vision_status": Counter(),
            "video_status": Counter(),
        }
        self.status = self.load_status()
        self.totals = Counter()
        self.text_items: list[Any] = []
        self.image_items: list[Any] = []
        self.video_items: list[Any] = []
        self.video_fractions = self.parse_fractions(args.video_frames)
        self.sync_status_from_existing_outputs()

    def reset_generated_outputs(self) -> None:
        paths = [
            self.event_atoms_path,
            self.vision_path,
            self.run_log_path,
            self.progress_path,
            self.status_path,
            self.sensitive_path,
            self.out_dir / "reflection_cards.json",
            self.out_dir / "method_cards.generated.json",
            self.out_dir / "method_cards.home.generated.json",
            self.out_dir / "answer_candidates.generated.json",
            self.out_dir / "home_reflection_cards.json",
            self.out_dir / "temporal_graph.json",
            self.out_dir / "core_summary.json",
            self.out_dir / "methodology_report.md",
            self.out_dir / "validation_summary.json",
        ]
        if self.source_id == "home":
            paths.append(self.out_dir.parent / "home_eval_report.md")
        for path in paths:
            path.unlink(missing_ok=True)

    def parse_fractions(self, raw: str) -> list[float]:
        values = []
        for part in raw.split(","):
            try:
                value = float(part.strip())
            except ValueError:
                continue
            if 0 <= value <= 1:
                values.append(value)
        return values or [0.05, 0.5, 0.95]

    def load_status(self) -> dict[str, dict[str, str]]:
        if not self.status_path.exists():
            return {"text": {}, "image": {}, "video": {}}
        try:
            data = json.loads(self.status_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"text": {}, "image": {}, "video": {}}
        return {
            "text": dict(data.get("text", {})),
            "image": dict(data.get("image", {})),
            "video": dict(data.get("video", {})),
        }

    def sync_status_from_existing_outputs(self) -> None:
        if not self.vision_path.exists():
            return
        synced = 0
        with self.vision_path.open("r", encoding="utf-8") as fp:
            for line in fp:
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if record.get("modality") != "image":
                    continue
                source_ref = record.get("source_ref")
                status = record.get("status")
                if source_ref and status in {"processed", "vision_error", "vision_fallback_processed"}:
                    if self.status["image"].get(source_ref) != status:
                        self.status["image"][source_ref] = status
                        synced += 1
        if synced:
            self.log("resume", "synced image status from existing observations", synced=synced)

    def save_status(self) -> None:
        write_json(self.status_path, self.status)

    def log(self, stage: str, message: str, **fields: Any) -> None:
        record = {
            "at": now_iso(),
            "elapsed_s": round(time.monotonic() - self.started_monotonic, 1),
            "stage": stage,
            "message": message,
            **fields,
        }
        with self.run_log_path.open("a", encoding="utf-8") as fp:
            fp.write(json_line(record))
        print(json.dumps(record, ensure_ascii=False), flush=True)

    def write_progress(self, stage: str) -> None:
        elapsed = time.monotonic() - self.started_monotonic
        payload = {
            "started_at": self.started_at,
            "updated_at": now_iso(),
            "elapsed_seconds": round(elapsed, 1),
            "stage": stage,
            "totals": dict(self.totals),
            "processed": {key: dict(value) for key, value in self.stats.items() if isinstance(value, Counter)},
            "status_counts": {
                "text": Counter(self.status["text"].values()).most_common(),
                "image": Counter(self.status["image"].values()).most_common(),
                "video": Counter(self.status["video"].values()).most_common(),
            },
            "disk_free_bytes": self.disk_free(self.out_dir),
        }
        write_json(self.progress_path, payload)

    def checkpoint(self, stage: str) -> None:
        self.save_status()
        self.write_progress(stage)

    def disk_free(self, path: Path) -> int:
        try:
            stat = os.statvfs(path)
            return stat.f_bavail * stat.f_frsize
        except OSError:
            return -1

    def ensure_source_available(self) -> None:
        if not self.source.exists():
            raise RuntimeError(f"source missing: {self.source}")
        if self.disk_free(self.out_dir) < 2_000_000_000:
            raise RuntimeError("less than 2GB free on output volume")

    def collect_items(self) -> None:
        self.ensure_source_available()
        adapter = adapter_for_source(self.source_id, self.source, self.inventory)
        sensitive_items = []
        for item in adapter.iter_items():
            self.totals["items_seen"] += 1
            allowed, reason = can_read_content(item)
            if not allowed:
                self.stats["errors"][reason] += 1
                if reason.startswith("sensitive_path"):
                    self.stats["sensitive"][reason] += 1
                    sensitive_items.append(
                        {
                            "source_id": item.source_id,
                            "source_ref": item.ref,
                            "group": item.group,
                            "extension": item.extension,
                            "size_bucket": size_bucket(item.size_bytes),
                            "reason": reason,
                        }
                    )
                continue
            if item.extension in TEXT_EXTS | PDF_EXTS:
                if self.source_id == "home" and item.size_bytes > self.args.home_max_text_bytes:
                    self.stats["errors"]["home_skip_large_text_pdf"] += 1
                    continue
                self.text_items.append(item)
            elif item.extension in IMAGE_EXTS:
                self.image_items.append(item)
            elif item.extension in VIDEO_EXTS:
                if self.source_id == "home" and item.size_bytes > self.args.home_max_video_bytes:
                    self.stats["errors"]["home_skip_large_video"] += 1
                    continue
                self.video_items.append(item)
        if self.args.limit_text is not None:
            self.text_items = self.text_items[: self.args.limit_text]
        if self.args.limit_images is not None:
            self.image_items = self.image_items[: self.args.limit_images]
        if self.args.limit_videos is not None:
            self.video_items = self.video_items[: self.args.limit_videos]
        self.totals.update(
            {
                "allowed_text_pdf": len(self.text_items),
                "allowed_images": len(self.image_items),
                "allowed_videos": len(self.video_items),
                "sensitive_skipped": len(sensitive_items),
            }
        )
        write_json(
            self.sensitive_path,
            {
                "generated_at": now_iso(),
                "count": len(sensitive_items),
                "by_reason": self.stats["sensitive"].most_common(),
                "items": sensitive_items,
            },
        )
        self.log("collect", "collected allowed work items", **dict(self.totals))
        self.checkpoint("collect")

    def append_atom(self, atom: dict[str, Any]) -> None:
        with self.event_atoms_path.open("a", encoding="utf-8") as fp:
            fp.write(json_line(atom))
        self.stats["modalities"][atom.get("modality", "unknown")] += 1
        self.stats["phases"][atom.get("phase", "undated")] += 1
        self.stats["tokens"].update(atom.get("topics", []))

    def append_vision(self, observation: dict[str, Any]) -> None:
        with self.vision_path.open("a", encoding="utf-8") as fp:
            fp.write(json_line(observation))
        for label in observation.get("labels", []):
            self.stats["labels"][label.get("text", "")] += 1

    def atom_base(self, item: Any, modality: str, status: str) -> dict[str, Any]:
        meta = item_meta(item)
        return {
            "id": f"atom_{item.ref}_{modality}",
            "schema_version": 1,
            "created_at": now_iso(),
            "source_id": meta["source_id"],
            "source_ref": meta["source_ref"],
            "phase": meta["phase"],
            "modality": modality,
            "medium": medium_for(item, modality),
            "action": action_for(modality),
            "status": status,
            "confidence": 0.5,
            "provenance": {
                "source_hash": item.ref,
                "top_context_hash": meta["top_context_hash"],
            },
            "file_profile": {
                "extension": meta["extension"],
                "group": meta["group"],
                "size_bucket": meta["size_bucket"],
            },
        }

    def process_texts(self) -> None:
        self.log("text", "starting text/pdf extraction", total=len(self.text_items))
        for index, item in enumerate(self.text_items, start=1):
            if self.status["text"].get(item.ref) in {"processed", "skipped_sensitive_content", "skipped_low_signal_content", "error"}:
                continue
            try:
                text = read_pdf_full(item.absolute_path) if item.extension in PDF_EXTS else read_text_full(item.absolute_path)
                if SENSITIVE_CONTENT_RE.search(text):
                    self.status["text"][item.ref] = "skipped_sensitive_content"
                    self.stats["text_status"]["skipped_sensitive_content"] += 1
                    self.log("text", "discarded content after sensitive marker", source_ref=item.ref)
                    continue
                if is_low_signal_content(text):
                    self.status["text"][item.ref] = "skipped_low_signal_content"
                    self.stats["text_status"]["skipped_low_signal_content"] += 1
                    continue
                tokens = clean_tokens(text, 36)
                summary = sentence_summary(text)
                atom = self.atom_base(item, "pdf_text" if item.extension in PDF_EXTS else "text", "processed")
                atom.update(
                    {
                        "summary": summary or "可提取文字很少。",
                        "excerpt": safe_excerpt(text),
                        "topics": tokens,
                        "text_profile": {
                            "characters_read": len(text),
                            "token_count": len(tokenize(text)),
                        },
                        "confidence": 0.82 if summary else 0.45,
                    }
                )
                self.append_atom(atom)
                self.status["text"][item.ref] = "processed"
                self.stats["text_status"]["processed"] += 1
            except Exception as exc:  # noqa: BLE001
                self.status["text"][item.ref] = "error"
                self.stats["text_status"]["error"] += 1
                self.log("text", "text extraction failed", source_ref=item.ref, error=type(exc).__name__)
            if index % self.args.checkpoint_every == 0:
                self.log("text", "checkpoint", processed=index, total=len(self.text_items))
                self.checkpoint("text")
        self.checkpoint("text")
        self.log("text", "finished text/pdf extraction", status=Counter(self.status["text"].values()).most_common())

    def write_manifest(self, items: Iterable[tuple[str, Path]]) -> Path:
        fd, raw_path = tempfile.mkstemp(prefix="memory_os_vision_", suffix=".jsonl", dir="/private/tmp")
        path = Path(raw_path)
        with os.fdopen(fd, "w", encoding="utf-8") as fp:
            for ref, item_path in items:
                fp.write(json_line({"ref": ref, "path": item_path.as_posix()}))
        return path

    def run_vision_manifest(self, manifest: Path, timeout: int | None = None) -> Iterable[dict[str, Any]]:
        cmd = [
            "swift",
            "-module-cache-path",
            "/private/tmp/swift_module_cache",
            "scripts/vision_batch.swift",
            manifest.as_posix(),
        ]
        proc = subprocess.Popen(
            cmd,
            cwd=Path.cwd(),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        try:
            stdout, _ = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, _ = proc.communicate()
            self.log("vision", "vision batch timeout; falling back for missing items", timeout_s=timeout)
        for line in stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                self.log("vision", "vision json decode failed", sample=line[:200])
        if proc.returncode != 0:
            self.log("vision", "vision batch process returned error", returncode=proc.returncode)

    def observation_from_vision(
        self,
        result: dict[str, Any],
        *,
        modality: str,
        item: Any | None = None,
        extra: dict[str, Any] | None = None,
        fallback_path: Path | None = None,
    ) -> dict[str, Any]:
        extra_payload = dict(extra or {})
        fallback_used = False
        available = bool(result.get("available"))
        error_text = result.get("error")
        if not available and fallback_path is not None:
            fallback = local_visual_features(fallback_path)
            if fallback.get("available"):
                fallback_used = True
                available = True
                result = {**result, "labels": fallback.get("labels", []), "ocr_text": ""}
                extra_payload.update(fallback.get("profile", {}))
                error_text = "vision_failed; local_visual_features_used"
            else:
                error_text = f"{error_text or 'vision_failed'}; fallback_failed:{fallback.get('error', 'unknown')}"
        labels = [
            {"text": redact_text(str(label.get("text", "")))[:80], "confidence": round(float(label.get("confidence", 0)), 4)}
            for label in result.get("labels", [])
            if label.get("text")
        ]
        ocr = redact_text(result.get("ocr_text") or "")
        source_ref = item.ref if item is not None else str(result.get("ref", "")).split(":frame:", 1)[0]
        status = "processed" if available else "vision_error"
        if fallback_used:
            status = "vision_fallback_processed"
        return {
            "schema_version": 1,
            "created_at": now_iso(),
            "source_id": item.source_id if item is not None else self.source_id,
            "source_ref": source_ref,
            "observation_ref": result.get("ref", source_ref),
            "modality": modality,
            "status": status,
            "available": available,
            "labels": labels,
            "ocr_excerpt": safe_excerpt(ocr, 500),
            "ocr_present": bool(ocr.strip()),
            "elapsed_ms": result.get("elapsed_ms"),
            "error": str(error_text)[:500] if error_text else None,
            "extra": extra_payload,
        }

    def image_atom_from_observation(self, item: Any, observation: dict[str, Any]) -> dict[str, Any]:
        labels_text = " ".join(label["text"] for label in observation.get("labels", []))
        ocr_text = observation.get("ocr_excerpt", "")
        topics = clean_tokens(f"{labels_text} {ocr_text}", 24)
        if observation.get("available"):
            label_summary = "、".join(label["text"] for label in observation.get("labels", [])[:5]) or "没有稳定标签"
            summary = f"视觉观察：{label_summary}。"
            if ocr_text:
                summary += f" 可见文字：{ocr_text[:160]}"
        else:
            summary = "图片已尝试本地视觉分析，但没有得到稳定结果。"
        atom = self.atom_base(item, "image", observation["status"])
        atom.update(
            {
                "summary": summary[:520],
                "excerpt": ocr_text[:320],
                "topics": topics,
                "vision_ref": observation["observation_ref"],
                "confidence": 0.72 if observation.get("available") else 0.35,
            }
        )
        return atom

    def process_images(self) -> None:
        if self.args.vision == "none":
            self.log("image", "vision disabled; recording metadata-only image attempts", total=len(self.image_items))
            for index, item in enumerate(self.image_items, start=1):
                if self.status["image"].get(item.ref):
                    continue
                atom = self.atom_base(item, "image", "metadata_only")
                atom.update({"summary": "图片存在，但本轮未做视觉分析。", "excerpt": "", "topics": [], "confidence": 0.25})
                self.append_atom(atom)
                self.status["image"][item.ref] = "metadata_only"
                if index % self.args.checkpoint_every == 0:
                    self.checkpoint("image")
            return

        remaining = [item for item in self.image_items if self.status["image"].get(item.ref) not in {"processed", "vision_error", "vision_fallback_processed"}]
        self.log("image", "starting all-image Vision pass", total=len(self.image_items), remaining=len(remaining))
        processed = 0
        for batch_start in range(0, len(remaining), self.args.image_batch_size):
            batch = remaining[batch_start : batch_start + self.args.image_batch_size]
            large_refs = {item.ref for item in batch if item.size_bytes > self.args.vision_max_bytes}
            vision_items = [item for item in batch if item.ref not in large_refs]
            by_ref = {item.ref: item for item in vision_items}
            seen_refs: set[str] = set()
            if vision_items:
                manifest = self.write_manifest((item.ref, item.absolute_path) for item in vision_items)
                try:
                    results = list(self.run_vision_manifest(manifest, timeout=self.args.vision_batch_timeout))
                finally:
                    manifest.unlink(missing_ok=True)
            else:
                results = []
            for result in results:
                ref = result.get("ref")
                item = by_ref.get(ref)
                if item is None:
                    continue
                seen_refs.add(item.ref)
                observation = self.observation_from_vision(result, modality="image", item=item, fallback_path=item.absolute_path)
                self.append_vision(observation)
                self.append_atom(self.image_atom_from_observation(item, observation))
                self.status["image"][item.ref] = observation["status"]
                self.stats["vision_status"][observation["status"]] += 1
                processed += 1
                if processed % self.args.checkpoint_every == 0:
                    self.log("image", "checkpoint", processed=processed, total=len(remaining))
                    self.checkpoint("image")
                    attempts = sum(self.stats["vision_status"].values())
                    errors = self.stats["vision_status"].get("vision_error", 0)
                    if attempts >= self.args.vision_error_stop_after and errors / max(attempts, 1) >= self.args.vision_error_stop_rate:
                        raise RuntimeError(f"vision failure rate {errors}/{attempts} exceeded threshold")
                    if self.disk_free(self.out_dir) < 1_000_000_000:
                        raise RuntimeError("less than 1GB free during image pass")
            for item in batch:
                if item.ref in seen_refs:
                    continue
                error = "vision_skipped_large_image" if item.ref in large_refs else "vision_no_result"
                observation = self.observation_from_vision(
                    {"ref": item.ref, "available": False, "error": error},
                    modality="image",
                    item=item,
                    fallback_path=item.absolute_path,
                )
                self.append_vision(observation)
                self.append_atom(self.image_atom_from_observation(item, observation))
                self.status["image"][item.ref] = observation["status"]
                self.stats["vision_status"][observation["status"]] += 1
                processed += 1
                if processed % self.args.checkpoint_every == 0:
                    self.log("image", "checkpoint", processed=processed, total=len(remaining))
                    self.checkpoint("image")
                    if self.disk_free(self.out_dir) < 1_000_000_000:
                        raise RuntimeError("less than 1GB free during image pass")
        self.checkpoint("image")
        self.log("image", "finished image Vision pass", status=Counter(self.status["image"].values()).most_common())

    def ffprobe_duration(self, path: Path) -> float | None:
        out = run_command(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            timeout=30,
        )
        try:
            value = float(out.strip())
        except ValueError:
            return None
        return value if value > 0 else None

    def extract_video_frames(self, item: Any, temp_dir: Path) -> list[tuple[str, Path, dict[str, Any]]]:
        duration = self.ffprobe_duration(item.absolute_path)
        frames: list[tuple[str, Path, dict[str, Any]]] = []
        if duration is None:
            self.log("video", "duration unavailable", source_ref=item.ref)
            return frames
        for index, fraction in enumerate(self.video_fractions):
            timestamp = max(0.05, min(duration * fraction, max(duration - 0.05, 0.05)))
            frame_ref = f"{item.ref}:frame:{index}"
            frame_path = temp_dir / f"{item.ref}_{index}.jpg"
            proc = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-ss",
                    f"{timestamp:.3f}",
                    "-i",
                    str(item.absolute_path),
                    "-frames:v",
                    "1",
                    "-q:v",
                    "3",
                    str(frame_path),
                ],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=90,
            )
            if proc.returncode == 0 and frame_path.exists():
                frames.append((frame_ref, frame_path, {"frame_index": index, "fraction": fraction, "timestamp_s": round(timestamp, 3)}))
            else:
                self.log("video", "frame extraction failed", source_ref=item.ref, frame_index=index)
        return frames

    def video_atom_from_observation(self, item: Any, observation: dict[str, Any]) -> dict[str, Any]:
        labels_text = " ".join(label["text"] for label in observation.get("labels", []))
        ocr_text = observation.get("ocr_excerpt", "")
        extra = observation.get("extra", {})
        topics = clean_tokens(f"{labels_text} {ocr_text}", 24)
        label_summary = "、".join(label["text"] for label in observation.get("labels", [])[:5]) or "没有稳定标签"
        atom = self.atom_base(item, "video_frame", observation["status"])
        atom.update(
            {
                "id": f"atom_{observation['observation_ref'].replace(':', '_')}",
                "summary": f"视频关键帧 {extra.get('frame_index', 0)}：{label_summary}。"[:520],
                "excerpt": ocr_text[:320],
                "topics": topics,
                "vision_ref": observation["observation_ref"],
                "frame": {
                    "index": extra.get("frame_index"),
                    "fraction": extra.get("fraction"),
                    "timestamp_s": extra.get("timestamp_s"),
                },
                "confidence": 0.62 if observation.get("available") else 0.32,
            }
        )
        return atom

    def process_videos(self) -> None:
        remaining = [item for item in self.video_items if self.status["video"].get(item.ref) not in {"processed", "partial", "error"}]
        self.log("video", "starting video keyframe pass", total=len(self.video_items), remaining=len(remaining), frames=self.video_fractions)
        for batch_start in range(0, len(remaining), self.args.video_batch_size):
            batch = remaining[batch_start : batch_start + self.args.video_batch_size]
            temp_dir = Path(tempfile.mkdtemp(prefix="memory_os_video_frames_", dir="/private/tmp"))
            frame_records: list[tuple[str, Path, dict[str, Any], Any]] = []
            try:
                for item in batch:
                    frames = self.extract_video_frames(item, temp_dir)
                    for frame_ref, frame_path, extra in frames:
                        frame_records.append((frame_ref, frame_path, extra, item))
                    if not frames:
                        self.status["video"][item.ref] = "error"
                        self.stats["video_status"]["error"] += 1
                if frame_records:
                    manifest = self.write_manifest((ref, path) for ref, path, _, _ in frame_records)
                    frame_map = {ref: (extra, item, path) for ref, path, extra, item in frame_records}
                    try:
                        for result in self.run_vision_manifest(manifest):
                            ref = result.get("ref")
                            if ref not in frame_map:
                                continue
                            extra, item, frame_path = frame_map[ref]
                            observation = self.observation_from_vision(result, modality="video_frame", item=item, extra=extra, fallback_path=frame_path)
                            self.append_vision(observation)
                            self.append_atom(self.video_atom_from_observation(item, observation))
                    finally:
                        manifest.unlink(missing_ok=True)
                for item in batch:
                    if self.status["video"].get(item.ref) == "error":
                        continue
                    frame_count = sum(1 for _, _, _, owner in frame_records if owner.ref == item.ref)
                    self.status["video"][item.ref] = "processed" if frame_count == len(self.video_fractions) else "partial"
                    self.stats["video_status"][self.status["video"][item.ref]] += 1
            except Exception as exc:  # noqa: BLE001
                self.log("video", "video batch failed", batch_start=batch_start, error=type(exc).__name__)
                for item in batch:
                    self.status["video"].setdefault(item.ref, "error")
            finally:
                for _, frame_path, _, _ in frame_records:
                    frame_path.unlink(missing_ok=True)
                try:
                    temp_dir.rmdir()
                except OSError:
                    pass
            if (batch_start + len(batch)) % self.args.checkpoint_every == 0 or batch_start + len(batch) >= len(remaining):
                self.log("video", "checkpoint", processed=batch_start + len(batch), total=len(remaining))
                self.checkpoint("video")
        self.checkpoint("video")
        self.log("video", "finished video keyframe pass", status=Counter(self.status["video"].values()).most_common())

    def load_atoms_for_aggregation(self) -> list[dict[str, Any]]:
        atoms = []
        if not self.event_atoms_path.exists():
            return atoms
        with self.event_atoms_path.open("r", encoding="utf-8") as fp:
            for line in fp:
                if not line.strip():
                    continue
                try:
                    atoms.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return atoms

    def build_reflections(self, atoms: list[dict[str, Any]]) -> list[dict[str, Any]]:
        by_phase: dict[str, list[dict[str, Any]]] = defaultdict(list)
        by_modality: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for atom in atoms:
            by_phase[atom.get("phase", "undated")].append(atom)
            by_modality[atom.get("modality", "unknown")].append(atom)
        cards: list[dict[str, Any]] = []
        for phase, phase_atoms in sorted(by_phase.items()):
            if phase == "undated" or not phase_atoms:
                continue
            modalities = Counter(atom.get("modality", "unknown") for atom in phase_atoms)
            tokens = Counter(token for atom in phase_atoms for token in atom.get("topics", []))
            if modalities.get("image", 0) > modalities.get("text", 0):
                method = "这一阶段主要通过观看、取景和反复整理视觉材料来形成判断。"
            elif modalities.get("text", 0) + modalities.get("pdf_text", 0) > 0:
                method = "这一阶段更像是在用文字、版式和项目结构把经验固定下来。"
            else:
                method = "这一阶段留下的线索较分散，适合只做低置信回溯。"
            cards.append(
                {
                    "id": f"reflection_phase_{phase}",
                    "kind": "phase_reflection",
                    "phase": phase,
                    "weight": len(phase_atoms),
                    "media": modalities.most_common(6),
                    "themes": top_tokens(tokens, 14),
                    "method": method,
                    "confidence": round(min(0.9, 0.45 + len(phase_atoms) / 2500), 3),
                }
            )
        for modality, modality_atoms in sorted(by_modality.items()):
            tokens = Counter(token for atom in modality_atoms for token in atom.get("topics", []))
            method = {
                "image": "图像层适合推导观看习惯、场景偏好、秩序感和整理方式，不适合直接当作事实自述。",
                "video_frame": "视频层适合推导移动、地点转换和时间过程，但单帧只提供片段证据。",
                "text": "文本层适合推导概念、项目方法和表达习惯。",
                "pdf_text": "PDF 层适合推导作品集、版式、展示和印刷相关方法。",
            }.get(modality, "这一媒介只进入低置信背景。")
            cards.append(
                {
                    "id": f"reflection_modality_{modality}",
                    "kind": "modality_reflection",
                    "modality": modality,
                    "weight": len(modality_atoms),
                    "themes": top_tokens(tokens, 16),
                    "method": method,
                    "confidence": round(min(0.92, 0.5 + len(modality_atoms) / 12000), 3),
                }
            )
        return cards

    def build_method_cards(self, atoms: list[dict[str, Any]], reflections: list[dict[str, Any]]) -> list[dict[str, Any]]:
        cards = list(CALIBRATION_METHODS)
        modality_counts = Counter(atom.get("modality", "unknown") for atom in atoms)
        phase_counts = Counter(atom.get("phase", "undated") for atom in atoms)
        cards.append(
            {
                "id": "derived_memory_recall",
                "method": "回忆问题先找阶段和媒介，再找具体痕迹；没有具体痕迹时承认不记得。",
                "examples": ["最早也许是很早之前了。", "我不会假装我知道。"],
                "source": "derived_from_allowed_records",
                "signals": {
                    "dominant_modalities": modality_counts.most_common(5),
                    "dominant_phases": phase_counts.most_common(8),
                },
            }
        )
        cards.append(
            {
                "id": "derived_visual_logic",
                "method": "视觉材料多时，回答应从观看、顺序、整理和媒介转换切入，而不是列出器材或文件。",
                "examples": ["照片本来就不会说话。", "黑白也是颜色。"],
                "source": "derived_from_allowed_records",
                "signals": {
                    "image_atoms": modality_counts.get("image", 0),
                    "video_frame_atoms": modality_counts.get("video_frame", 0),
                },
            }
        )
        return cards

    def build_temporal_graph(self, atoms: list[dict[str, Any]], reflections: list[dict[str, Any]]) -> dict[str, Any]:
        phase_counts = Counter(atom.get("phase", "undated") for atom in atoms)
        modality_counts = Counter(atom.get("modality", "unknown") for atom in atoms)
        nodes = []
        edges = []
        for phase, count in phase_counts.most_common():
            if phase == "undated":
                continue
            nodes.append({"id": f"phase:{phase}", "type": "phase", "label": phase, "weight": count})
        for modality, count in modality_counts.most_common():
            nodes.append({"id": f"medium:{modality}", "type": "medium", "label": modality, "weight": count})
        for card in reflections:
            nodes.append({"id": f"method:{card['id']}", "type": "method", "label": card["kind"], "weight": card.get("weight", 1)})
            if card.get("phase"):
                edges.append({"from": f"phase:{card['phase']}", "to": f"method:{card['id']}", "relation": "summarized_by", "confidence": round(float(card.get("confidence", 0.5)), 3)})
            if card.get("modality"):
                edges.append({"from": f"medium:{card['modality']}", "to": f"method:{card['id']}", "relation": "summarized_by", "confidence": round(float(card.get("confidence", 0.5)), 3)})
        approved_entities = [
            {"id": "entity:dialog_box", "type": "subject_shape", "label": "对话框", "source": "user_calibration"},
            {"id": "entity:crocodile_alias", "type": "alias", "label": "鳄鱼", "source": "user_calibration"},
            {"id": "entity:gliding_big_spray_mushroom", "type": "friend_name", "label": "滑行大喷菇", "source": "user_calibration"},
        ]
        nodes.extend(approved_entities)
        edges.extend(
            [
                {"from": "entity:dialog_box", "to": "entity:crocodile_alias", "relation": "may_be_called", "confidence": 0.8},
                {"from": "entity:dialog_box", "to": "entity:gliding_big_spray_mushroom", "relation": "knows_as_friend", "confidence": 0.9},
            ]
        )
        return {
            "schema_version": 1,
            "generated_at": now_iso(),
            "source_id": self.source_id,
            "policy": {
                "auto_promote_objects": False,
                "approved_entities_only": True,
                "raw_paths_stored": False,
            },
            "nodes": nodes,
            "edges": edges,
        }

    def build_answer_candidates(
        self,
        atoms: list[dict[str, Any]],
        reflections: list[dict[str, Any]],
        method_cards: list[dict[str, Any]],
    ) -> dict[str, Any]:
        modality_counts = Counter(atom.get("modality", "unknown") for atom in atoms)
        phase_counts = Counter(atom.get("phase", "undated") for atom in atoms)
        token_counts = Counter(token for atom in atoms for token in atom.get("topics", []))
        candidates = [
            {
                "id": "home_answer_forget整理",
                "tags": ["memory", "organize", "forgetting"],
                "answer": "因为会忘记。",
                "source": "calibration_plus_home_signal",
            },
            {
                "id": "home_answer_trace_not_claim",
                "tags": ["memory", "trace", "uncertainty"],
                "answer": "很多事情只是痕迹。",
                "source": "home_method_gate",
            },
            {
                "id": "home_answer_method_first",
                "tags": ["creative", "method", "project"],
                "answer": "先看它是怎么被整理的。",
                "source": "derived_from_home_records",
            },
            {
                "id": "home_answer_visual_order",
                "tags": ["visual", "order", "photo"],
                "answer": "我先看顺序。",
                "source": "derived_from_home_records",
            },
            {
                "id": "home_answer_not_sure",
                "tags": ["uncertainty", "boundary"],
                "answer": "我不会假装我知道。",
                "source": "calibration",
            },
            {
                "id": "home_answer_dialog_limit",
                "tags": ["boundary", "dialog"],
                "answer": "我只是个对话框。",
                "source": "calibration",
            },
            {
                "id": "home_answer_project_done",
                "tags": ["project", "completion"],
                "answer": "项目完成了就是完成了。",
                "source": "calibration",
            },
            {
                "id": "home_answer_photo_logic",
                "tags": ["photo", "logic"],
                "answer": "摄影是一种逻辑。",
                "source": "calibration",
            },
        ]
        for card in method_cards:
            for example in card.get("examples", [])[:2]:
                answer = compact_whitespace(redact_text(str(example)))[:80]
                if answer and not any(item["answer"] == answer for item in candidates):
                    candidates.append(
                        {
                            "id": f"method_example_{sha_short(card.get('id', '') + answer, 12)}",
                            "tags": [card.get("id", "method")],
                            "answer": answer,
                            "source": "method_card_example",
                        }
                    )
        return {
            "schema_version": 1,
            "generated_at": now_iso(),
            "policy": {
                "raw_text_stored": False,
                "raw_paths_stored": False,
                "runtime_integrated": False,
                "identity_daily_privacy_rules_override": False,
            },
            "signals": {
                "event_atoms": len(atoms),
                "dominant_modalities": modality_counts.most_common(6),
                "dominant_phases": phase_counts.most_common(8),
                "dominant_themes": top_tokens(token_counts, 16),
                "reflection_cards": len(reflections),
            },
            "candidates": candidates[:80],
        }

    def render_home_eval_report(
        self,
        atoms: list[dict[str, Any]],
        reflections: list[dict[str, Any]],
        method_cards: list[dict[str, Any]],
        core: dict[str, Any],
    ) -> str:
        modality_counts = Counter(atom.get("modality", "unknown") for atom in atoms)
        phase_counts = Counter(atom.get("phase", "undated") for atom in atoms)
        lines = [
            "# Home 离线评估报告",
            "",
            "- 生成时间：`<TIMESTAMP>`",
            f"- 来源：`{self.source_id}`",
            f"- 事件原子：`{len(atoms)}`",
            f"- 反思卡：`{len(reflections)}`",
            f"- 方法卡：`{len(method_cards)}`",
            f"- 运行时接入：`false`",
            "",
            "## 和 T7-only 的关系",
            "",
            "- T7 继续作为已验证的视觉/媒介基础。",
            "- Home 本轮只提供离线方法语料、短答候选和创作习惯线索。",
            "- 身份、日常、恋爱对象、隐私、哲学短答继续由当前规则优先。",
            "",
            "## Home 信号",
            "",
        ]
        for modality, count in modality_counts.most_common(8):
            lines.append(f"- `{modality}`：{count}")
        lines.extend(["", "## 阶段", ""])
        for phase, count in phase_counts.most_common(10):
            lines.append(f"- `{phase}`：{count}")
        lines.extend(
            [
                "",
                "## 风险结论",
                "",
                "- 不接入前端，避免污染当前稳定人格。",
                "- 不生成用户可见对象。",
                "- 输出只允许脱敏短摘录、方法、统计和 hash provenance。",
                f"- 隐私策略：`{json.dumps(core.get('privacy', {}), ensure_ascii=False)}`",
                "",
            ]
        )
        return "\n".join(lines)

    def write_reports(self) -> None:
        atoms = self.load_atoms_for_aggregation()
        reflections = self.build_reflections(atoms)
        method_cards = self.build_method_cards(atoms, reflections)
        graph = self.build_temporal_graph(atoms, reflections)
        modality_counts = Counter(atom.get("modality", "unknown") for atom in atoms)
        phase_counts = Counter(atom.get("phase", "undated") for atom in atoms)
        token_counts = Counter(token for atom in atoms for token in atom.get("topics", []))
        core = {
            "schema_version": 1,
            "generated_at": now_iso(),
            "source_id": self.source_id,
            "identity_shape": "对话框",
            "style": ["短", "轻", "怪", "克制"],
            "memory_architecture": ["working_state", "core_summary", "method_cards", "event_atoms", "reflection_cards", "temporal_relation_graph", "candidate_stores"],
            "dominant_modalities": modality_counts.most_common(8),
            "dominant_phases": phase_counts.most_common(12),
            "dominant_themes": top_tokens(token_counts, 24),
            "privacy": {
                "raw_paths_stored": False,
                "raw_text_stored": False,
                "source_files_copied": False,
                "sensitive_content_read": False,
            },
        }
        write_json(self.out_dir / "reflection_cards.json", {"schema_version": 1, "generated_at": now_iso(), "cards": reflections})
        write_json(self.out_dir / "method_cards.generated.json", {"schema_version": 1, "generated_at": now_iso(), "cards": method_cards})
        if self.source_id == "home":
            write_json(self.out_dir / "home_reflection_cards.json", {"schema_version": 1, "generated_at": now_iso(), "cards": reflections})
            write_json(self.out_dir / "method_cards.home.generated.json", {"schema_version": 1, "generated_at": now_iso(), "cards": method_cards})
            write_json(self.out_dir / "answer_candidates.generated.json", self.build_answer_candidates(atoms, reflections, method_cards))
        write_json(self.out_dir / "temporal_graph.json", graph)
        write_json(self.out_dir / "core_summary.json", core)
        report = [
            "# 方法论报告",
            "",
            f"- 生成时间：`{now_iso()}`",
            f"- 事件原子：`{len(atoms)}`",
            f"- 反思卡：`{len(reflections)}`",
            f"- 方法卡：`{len(method_cards)}`",
            f"- 敏感跳过：`{self.totals.get('sensitive_skipped', 0)}`",
            "",
            "## 阶段",
            "",
        ]
        for phase, count in phase_counts.most_common(12):
            report.append(f"- `{phase}`：{count} 条事件原子")
        report.extend(["", "## 媒介", ""])
        for modality, count in modality_counts.most_common(12):
            report.append(f"- `{modality}`：{count} 条")
        report.extend(["", "## 方法论初稿", ""])
        for card in method_cards:
            report.append(f"- **{card['id']}**：{card['method']}")
        report.extend(["", "## 记忆门控", "", "- 隐私、任务匹配、承认项、来源、矛盾、语气和污染风险必须先过门，再进入回答上下文。"])
        (self.out_dir / "methodology_report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
        if self.source_id == "home":
            (self.out_dir.parent / "home_eval_report.md").write_text(self.render_home_eval_report(atoms, reflections, method_cards, core), encoding="utf-8")
        self.log("report", "wrote memory OS reports", atoms=len(atoms), reflections=len(reflections), methods=len(method_cards))

    def validate_memory_os(self) -> None:
        atoms = self.load_atoms_for_aggregation()
        violations = []
        payloads = load_validation_payloads(
            [
                self.out_dir / "event_atoms.jsonl",
                self.out_dir / "vision_observations.jsonl",
                self.out_dir / "reflection_cards.json",
                self.out_dir / "method_cards.generated.json",
                self.out_dir / "method_cards.home.generated.json",
                self.out_dir / "answer_candidates.generated.json",
                self.out_dir / "home_reflection_cards.json",
                self.out_dir / "temporal_graph.json",
                self.out_dir / "core_summary.json",
            ]
        )
        content_text = "\n".join(text for payload in payloads for text in iter_validation_text(payload))
        if re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", content_text):
            violations.append("email_leak")
        if re.search(r"(?<![\d.])\d{8,}(?![\d.])", content_text):
            violations.append("long_number_leak")
        if self.source.as_posix() in content_text:
            violations.append("raw_path_leak")
        copied_exts = []
        for path in self.out_dir.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".heic", ".pdf", ".mov", ".mp4", ".indd", ".ai"}:
                copied_exts.append(path.relative_to(self.out_dir).as_posix())
        if copied_exts:
            violations.append({"source_copies": copied_exts[:20]})
        expected_images = self.totals.get("allowed_images", 0)
        expected_text = self.totals.get("allowed_text_pdf", 0)
        expected_videos = self.totals.get("allowed_videos", 0)
        validation = {
            "validated_at": now_iso(),
            "ok": not violations,
            "violations": violations,
            "counts": {
                "event_atoms": len(atoms),
                "text_status": Counter(self.status["text"].values()).most_common(),
                "image_status": Counter(self.status["image"].values()).most_common(),
                "video_status": Counter(self.status["video"].values()).most_common(),
                "expected_text_pdf": expected_text,
                "expected_images": expected_images,
                "expected_videos": expected_videos,
            },
        }
        write_json(self.out_dir / "validation_summary.json", validation)
        self.log("validate", "memory OS validation complete", ok=validation["ok"], violations=violations)

    def run(self) -> None:
        self.log("start", "memory OS build starting", source=self.source_id, out_dir=self.out_dir.as_posix())
        self.collect_items()
        self.process_texts()
        self.process_images()
        self.process_videos()
        self.write_reports()
        self.validate_memory_os()
        self.checkpoint("complete")
        self.log("complete", "memory OS build complete")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run full local memory OS build over an approved local inventory.")
    parser.add_argument("--source-id", choices=["t7", "home"], default="t7")
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--inventory", default=DEFAULT_INVENTORY)
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    parser.add_argument("--vision", choices=["all-images", "none"], default="all-images")
    parser.add_argument("--video-frames", default="0.05,0.50,0.95")
    parser.add_argument("--completion", choices=["until-complete"], default="until-complete")
    parser.add_argument("--checkpoint-every", type=int, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--image-batch-size", type=int, default=100)
    parser.add_argument("--vision-batch-timeout", type=int, default=60)
    parser.add_argument("--vision-max-bytes", type=int, default=50_000_000)
    parser.add_argument("--video-batch-size", type=int, default=8)
    parser.add_argument("--vision-error-stop-rate", type=float, default=0.85)
    parser.add_argument("--vision-error-stop-after", type=int, default=500)
    parser.add_argument("--limit-text", type=int)
    parser.add_argument("--limit-images", type=int)
    parser.add_argument("--limit-videos", type=int)
    parser.add_argument("--home-max-text-bytes", type=int, default=25_000_000)
    parser.add_argument("--home-max-video-bytes", type=int, default=2_000_000_000)
    parser.add_argument("--fresh", action="store_true", help="Clear generated output files before rebuilding.")
    args = parser.parse_args()

    try:
        MemoryOSBuild(args).run()
    except KeyboardInterrupt:
        print(json.dumps({"stage": "interrupted", "message": "memory OS build interrupted"}, ensure_ascii=False), flush=True)
        return 130
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"stage": "failed", "error": type(exc).__name__, "message": str(exc)}, ensure_ascii=False), flush=True)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
