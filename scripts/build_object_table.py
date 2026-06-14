#!/usr/bin/env python3
"""Build a redacted object table from local source inventory and allowed text."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from another_brain_content import (
    PDF_EXTS,
    TEXT_EXTS,
    T7SourceAdapter,
    can_read_content,
    compact_whitespace,
    path_hint,
    read_pdf_text,
    read_text_file,
    redact_text,
    stable_hash,
    tokenize,
)


DEFAULT_SOURCE = "/path/to/local/source"
DEFAULT_INVENTORY = "artifacts/t7_inventory.jsonl"
DEFAULT_BRAIN_PACK = "artifacts/brain_pack.json"
DEFAULT_OUT = "artifacts/object_table.json"
DEFAULT_WEB_OUT = "web/object_table.js"
DEFAULT_HISTORY_DIR = "artifacts/history"

TARGET_OBJECTS = 3000
MAX_SOURCE_REFS = 24
MAX_TEXT_FILES = 800

NOISY_TERMS = {
    "adjustments",
    "arw",
    "bin",
    "cache",
    "caches",
    "capture",
    "catalog",
    "charset",
    "clip",
    "cocatalog",
    "cof",
    "comask",
    "content",
    "content-language",
    "content-type",
    "cop",
    "cot",
    "dcim",
    "derivatives",
    "dng",
    "html",
    "http-equiv",
    "jpeg",
    "jpeg",
    "jpg",
    "library",
    "lrf",
    "lrdata",
    "masters",
    "meta",
    "mov",
    "mp4",
    "mrw",
    "nef",
    "originals",
    "panorama",
    "photoslibrary",
    "pictures",
    "plist",
    "png",
    "photos",
    "previews",
    "private",
    "raf",
    "raw",
    "refresh",
    "resources",
    "srt",
    "thumbnails",
    "tif",
    "tiff",
    "url",
    "www",
    "xmp",
    "zh-cn",
}
NOISY_COMPONENTS = {
    "(root)",
    "cache",
    "clip",
    "dcim",
    "derivatives",
    "masters",
    "originals",
    "pictures",
    "previews",
    "private",
    "resources",
    "thumbnails",
}
NOISY_SUBSTRINGS = (
    "cache",
    "caches",
    "database",
    "m4root",
    "mediapro",
    "msdcf",
    "originals",
    "previews",
    "resources",
    "thmbnl",
    "thumbnail",
    "thumbs",
)
SHORT_TOKEN_ALLOWLIST = {
    "a74",
    "ccd",
    "dji",
    "gfx",
    "gr",
    "m10",
    "web",
    "z6",
    "zf",
}
GROUP_TO_MEDIA = {
    "photo_image": "still_image",
    "camera_raw": "camera_raw",
    "photo_workflow": "photo_workflow",
    "video": "moving_image",
    "design_source": "design_source",
    "document": "document",
    "code_or_data": "web_or_data",
    "audio": "audio",
    "compressed_bundle": "bundle",
}
CAMERA_PATTERNS = [
    (re.compile(r"\b(leica|m10|徕卡)\b", re.I), "Leica / 徕卡"),
    (re.compile(r"\b(nikon|尼康|z\s*f|nikon\s*z|nikon\s*f)\b", re.I), "Nikon"),
    (re.compile(r"\b(sony|ilce|a7|a74|a7d|rx100|黑卡)\b", re.I), "Sony"),
    (re.compile(r"\b(ricoh|gr\b|理光)\b", re.I), "Ricoh / 理光"),
    (re.compile(r"\b(fuji|fujifilm|gfx|富士)\b", re.I), "Fujifilm / 富士"),
    (re.compile(r"\b(pentax|宾得|kp\+?2490)\b", re.I), "Pentax / 宾得"),
    (re.compile(r"\b(minolta|autocord)\b", re.I), "Minolta"),
    (re.compile(r"\b(panasonic|松下)\b", re.I), "Panasonic / 松下"),
    (re.compile(r"\b(dji|无人机|drone)\b", re.I), "DJI / 无人机"),
    (re.compile(r"\b(iphone|ios)\b", re.I), "iPhone"),
    (re.compile(r"\b(ccd)\b", re.I), "CCD"),
    (re.compile(r"\b(film|胶片|135)\b", re.I), "Film / 胶片"),
]
PROJECT_PATTERNS = [
    (re.compile(r"(portfolio|作品集)", re.I), "portfolio"),
    (re.compile(r"(年度总结)", re.I), "yearbook"),
    (re.compile(r"(book|jacket|print|editorial|印刷|书籍)", re.I), "print"),
    (re.compile(r"(website|web|网页|html|p5)", re.I), "web"),
    (re.compile(r"(travel|旅程|旅行|旅拍|行$)", re.I), "travel"),
    (re.compile(r"(branding|brand)", re.I), "branding"),
]
PLACE_HINT_RE = re.compile(
    r"(呼伦贝尔|内蒙|甘肃|青海|合肥|广东|美国|匹兹堡|哈里斯堡|淮安|进贤|李渡|布里斯班|brisbane|pittsburgh|harrisburg)",
    re.I,
)
HEX_RE = re.compile(r"^[a-f0-9]{4,}$", re.I)
DATEISH_RE = re.compile(r"^(?:19|20)\d{2}(?:[._-]?\d{1,2}){0,2}$")
CAMERA_FILE_RE = re.compile(r"^(?:dsc|dji|c|img|_dsc|p|m10p|l|dscf|dsf|pict|hsa|sonya)\d{2,}", re.I)
LIKELY_ROMAN_NAME_RE = re.compile(r"\b[A-Z][a-z]{2,}[_\s-]+[A-Z][a-z]{2,}\b")
PLACEHOLDER_RE = re.compile(r"<(?:EMAIL|PHONE|NUMBER|ADDRESS|NAME)>", re.I)
BUNDLE_SUFFIX_RE = re.compile(r"\.(?:cocatalog|lrdata|photoslibrary|library|app)$", re.I)
SOURCE_EXT_SUFFIX_RE = re.compile(r"\.(?:jpg|jpeg|png|heic|tif|tiff|dng|arw|raf|nef|mrw|mov|mp4|lrf|srt|xmp)$", re.I)
HASH_FRAGMENT_RE = re.compile(r"(?:^|[-_])[a-f0-9]{6,}(?:[-_]|$)", re.I)
KNOWLEDGE_INDEX_RE = re.compile(
    r"\b("
    r"leica|nikon|sony|ricoh|fuji|fujifilm|pentax|minolta|panasonic|dji|iphone|ios|"
    r"capture\s*one|lightroom|photoshop|illustrator|indesign|pdf|html|css|javascript|"
    r"raw|jpeg|jpg|png|dng|arw|raf|nef|tif|tiff|film|ccd|gfx|zf|image|photo|"
    r"website|portfolio|design|branding|format|frame|processor|video|indd|print|book|"
    r"gr|photosgraph|photoanalysis|imagedata|photolibrary|cloudphoto|sqlite|codec|layout"
    r")\b|徕卡|尼康|理光|富士|宾得|松下|无人机|胶片|印刷|网页|作品集|照片文件|视频素材|乐凯",
    re.I,
)
INTERNAL_NAMING_RE = re.compile(
    r"("
    r"\b(?:c\d+-\d+|gfx\d+|dji\s*\d+|m10.*存片|rx100raw|100ricoh|a7d|sc?ree\s+shots)\b|"
    r"\d|/|:|final\s+final|something in my room|something-in-website|鳄鱼老师|红茶宾得|美国存片|夜拍布里斯班|com\\.apple|kksk|黑卡|黑白\\d*卷"
    r")",
    re.I,
)


@dataclass
class ObjectCandidate:
    label: str
    kind: str
    score: float = 0.0
    evidence_count: int = 0
    source_refs: list[str] = field(default_factory=list)
    media: Counter = field(default_factory=Counter)
    phases: Counter = field(default_factory=Counter)
    top_dirs: Counter = field(default_factory=Counter)
    co_terms: Counter = field(default_factory=Counter)
    relations: Counter = field(default_factory=Counter)

    def add(
        self,
        *,
        weight: float,
        item: Any | None = None,
        media: str | None = None,
        co_terms: list[str] | None = None,
        relation: str | None = None,
    ) -> None:
        self.score += weight
        self.evidence_count += 1
        if item is not None:
            ref = stable_hash(f"{item.source_id}:{item.rel_path}")[:16]
            if ref not in self.source_refs and len(self.source_refs) < MAX_SOURCE_REFS:
                self.source_refs.append(ref)
            if item.modified_at:
                self.phases[item.modified_at[:4]] += 1
            self.top_dirs[redact_label(item.top_dir or "(root)")] += 1
            self.media[GROUP_TO_MEDIA.get(item.group, media or item.group)] += 1
        elif media:
            self.media[media] += 1
        if co_terms:
            self.co_terms.update(term for term in co_terms if is_meaningful_label(term))
        if relation:
            self.relations[relation] += 1


def redact_label(text: str) -> str:
    text = redact_text(text)
    text = re.sub(r"[_]+", " ", text)
    text = LIKELY_ROMAN_NAME_RE.sub("<NAME>", text)
    text = BUNDLE_SUFFIX_RE.sub("", text)
    text = re.sub(r"\s+", " ", text).strip(" /._-")
    return text[:96]


def canonical_label(label: str) -> str:
    return redact_label(label).lower()


def is_meaningful_label(label: str) -> bool:
    label = redact_label(label)
    lower = label.lower()
    if not label or len(label) < 2:
        return False
    if PLACEHOLDER_RE.search(label):
        return False
    if lower in NOISY_TERMS or lower in NOISY_COMPONENTS:
        return False
    if any(noise in lower for noise in NOISY_SUBSTRINGS):
        return False
    if SOURCE_EXT_SUFFIX_RE.search(lower):
        return False
    if any(part in lower for part in ("previews.lrdata", ".lrdata", ".cocatalog", ".photoslibrary")):
        return False
    if re.fullmatch(r"[a-z]{1,3}", lower) and lower not in SHORT_TOKEN_ALLOWLIST:
        return False
    if HEX_RE.fullmatch(lower) or HASH_FRAGMENT_RE.search(lower) or DATEISH_RE.fullmatch(lower) or CAMERA_FILE_RE.match(lower):
        return False
    if re.fullmatch(r"[a-z]{1,2}\d{1,3}", lower) and lower not in {"m10", "z6", "zf"}:
        return False
    if lower.isdigit():
        return False
    if re.fullmatch(r"[._\-+ ]+", lower):
        return False
    if label in {"<EMAIL>", "<PHONE>", "<NUMBER>", "<ADDRESS>", "<NAME>"}:
        return False
    return True


def object_kind_for_label(label: str, fallback: str = "topic") -> str:
    lower = label.lower()
    for pattern, _ in CAMERA_PATTERNS:
        if pattern.search(lower):
            return "camera_or_device"
    if PLACE_HINT_RE.search(label):
        return "place_or_trip"
    for pattern, project_kind in PROJECT_PATTERNS:
        if pattern.search(label):
            return f"project_{project_kind}"
    if re.search(r"(摄影|照片|相片|photo|image|raw|胶片|film)", lower):
        return "medium_photography"
    if re.search(r"(视频|录屏|movie|video|mov|mp4)", lower):
        return "medium_video"
    if re.search(r"(设计|design|indd|portfolio|book|print)", lower):
        return "medium_design"
    return fallback


def object_id(label: str, kind: str) -> str:
    return f"obj_{hashlib.sha256(f'{kind}:{label}'.encode('utf-8')).hexdigest()[:16]}"


def get_candidate(objects: dict[tuple[str, str], ObjectCandidate], label: str, kind: str) -> ObjectCandidate | None:
    label = redact_label(label)
    if not is_meaningful_label(label):
        return None
    key = (kind, canonical_label(label))
    if key not in objects:
        objects[key] = ObjectCandidate(label=label, kind=kind)
    return objects[key]


def path_components(rel_path: str) -> list[str]:
    parts = Path(rel_path).parts
    components: list[str] = []
    for part in parts[:-1]:
        label = redact_label(part)
        if is_meaningful_label(label):
            components.append(label)
    stem = redact_label(Path(rel_path).stem)
    if is_meaningful_label(stem):
        components.append(stem)
    return components


def compound_components(components: list[str]) -> list[str]:
    compacted: list[str] = []
    for component in components:
        label = redact_label(component)
        if not is_meaningful_label(label):
            continue
        if compacted and canonical_label(compacted[-1]) == canonical_label(label):
            continue
        compacted.append(label)

    compounds: list[str] = []
    for left, right in zip(compacted, compacted[1:]):
        if canonical_label(left) == canonical_label(right):
            continue
        label = redact_label(f"{left} / {right}")
        if 5 <= len(label) <= 96 and is_meaningful_label(label):
            compounds.append(label)
    return compounds[:8]


def add_inventory_objects(objects: dict[tuple[str, str], ObjectCandidate], item: Any) -> None:
    path_text = redact_label(item.rel_path)
    tokens = [token for token in tokenize(path_text) if is_meaningful_label(token)]
    media = GROUP_TO_MEDIA.get(item.group, item.group)
    components = path_components(item.rel_path)

    for component in components:
        kind = object_kind_for_label(component, fallback="project_or_folder")
        candidate = get_candidate(objects, component, kind)
        if candidate:
            candidate.add(weight=8.0 if component == redact_label(item.top_dir) else 3.5, item=item, media=media, co_terms=tokens)

    for token in tokens:
        kind = object_kind_for_label(token)
        candidate = get_candidate(objects, token, kind)
        if candidate:
            candidate.add(weight=1.0, item=item, media=media, co_terms=tokens[:12])

    for compound in compound_components(components):
        kind = object_kind_for_label(compound, fallback="context_cluster")
        candidate = get_candidate(objects, compound, kind)
        if candidate:
            candidate.add(weight=2.2, item=item, media=media, co_terms=tokens[:12], relation="path_context_pair")

    for pattern, label in CAMERA_PATTERNS:
        if pattern.search(path_text):
            candidate = get_candidate(objects, label, "camera_or_device")
            if candidate:
                candidate.add(weight=6.0, item=item, media=media, co_terms=tokens, relation="appears_in_path")

    place_match = PLACE_HINT_RE.search(path_text)
    if place_match:
        candidate = get_candidate(objects, place_match.group(1), "place_or_trip")
        if candidate:
            candidate.add(weight=7.0, item=item, media=media, co_terms=tokens, relation="place_hint")

    for pattern, project_kind in PROJECT_PATTERNS:
        if pattern.search(path_text):
            label = {
                "portfolio": "作品集 / portfolio",
                "yearbook": "年度总结",
                "print": "印刷与书籍",
                "web": "网页实验",
                "travel": "旅行素材",
                "branding": "Branding",
            }[project_kind]
            candidate = get_candidate(objects, label, f"project_{project_kind}")
            if candidate:
                candidate.add(weight=5.0, item=item, media=media, co_terms=tokens, relation="project_pattern")


def add_experience_cluster_objects(objects: dict[tuple[str, str], ObjectCandidate], item: Any) -> None:
    media = GROUP_TO_MEDIA.get(item.group, item.group)
    timestamp = item.modified_at or item.created_at or ""
    year = timestamp[:4]
    month = timestamp[:7]
    if not year or not re.fullmatch(r"(?:19|20)\d{2}", year):
        return
    path_text = redact_label(item.rel_path)
    place_match = PLACE_HINT_RE.search(path_text)
    if place_match:
        place = place_match.group(1)
        media_label = {
            "still_image": "照片",
            "camera_raw": "原片",
            "photo_workflow": "照片整理",
            "moving_image": "视频",
            "design_source": "设计",
            "document": "文档",
            "web_or_data": "网页数据",
            "audio": "声音",
        }.get(media, "素材")
        label = f"{year}年{place}{media_label}"
        candidate = get_candidate(objects, label, "experience_cluster")
        if candidate:
            candidate.add(weight=2.6, item=item, media=media, relation="structured_time_place_media")
        if re.fullmatch(r"(?:19|20)\d{2}-\d{2}", month):
            month_label = f"{year}年{month[5:7]}月{place}{media_label}"
            candidate = get_candidate(objects, month_label, "experience_cluster")
            if candidate:
                candidate.add(weight=1.7, item=item, media=media, relation="structured_month_place_media")

    for pattern, project_kind in PROJECT_PATTERNS:
        if not pattern.search(path_text):
            continue
        project_label = {
            "portfolio": "作品集整理",
            "yearbook": "年度总结",
            "print": "印刷书籍项目",
            "web": "网页实验",
            "travel": "旅行素材",
            "branding": "品牌项目",
        }[project_kind]
        label = f"{year}年{project_label}"
        candidate = get_candidate(objects, label, "experience_cluster")
        if candidate:
            candidate.add(weight=2.2, item=item, media=media, relation="structured_time_project")
        if re.fullmatch(r"(?:19|20)\d{2}-\d{2}", month):
            month_label = f"{year}年{month[5:7]}月{project_label}"
            candidate = get_candidate(objects, month_label, "experience_cluster")
            if candidate:
                candidate.add(weight=1.5, item=item, media=media, relation="structured_month_project")


def text_terms(text: str) -> list[str]:
    text = compact_whitespace(redact_text(text))[:24_000]
    return [token for token in tokenize(text) if is_meaningful_label(token)]


def add_text_content_objects(objects: dict[tuple[str, str], ObjectCandidate], item: Any) -> bool:
    if item.extension not in TEXT_EXTS | PDF_EXTS:
        return False
    try:
        text = read_pdf_text(item.absolute_path) if item.extension in PDF_EXTS else read_text_file(item.absolute_path)
    except OSError:
        return False
    lowered = text.lower()
    if any(marker in lowered for marker in ("passport", "visa", "bank", "身份证", "护照", "银行", "签证")):
        return False
    terms = text_terms(text)
    for token, count in Counter(terms).most_common(40):
        kind = object_kind_for_label(token)
        candidate = get_candidate(objects, token, kind)
        if candidate:
            candidate.add(
                weight=1.4 + min(count, 8) * 0.35,
                item=item,
                media=GROUP_TO_MEDIA.get(item.group, item.group),
                co_terms=terms[:20],
                relation="appears_in_text",
            )
    return True


def add_memory_card_objects(objects: dict[tuple[str, str], ObjectCandidate], brain_pack_path: Path) -> int:
    if not brain_pack_path.exists():
        return 0
    pack = json.loads(brain_pack_path.read_text(encoding="utf-8"))
    count = 0
    for card in pack.get("memory_cards", []):
        text = redact_label(" ".join([card.get("title", ""), card.get("summary", ""), card.get("excerpt", "")]))
        terms = [token for token in tokenize(text) if is_meaningful_label(token)]
        for token, token_count in Counter(terms).most_common(28):
            kind = object_kind_for_label(token)
            candidate = get_candidate(objects, token, kind)
            if candidate:
                candidate.add(
                    weight=1.8 + min(token_count, 6) * 0.45,
                    media=card.get("modality", "memory_card"),
                    co_terms=terms[:16],
                    relation="appears_in_memory_card",
                )
                count += 1
    return count


def add_seed_objects(objects: dict[tuple[str, str], ObjectCandidate]) -> None:
    seeds = [
        ("对话框", "subject", "self_shape"),
        ("鳄鱼", "alias", "nickname"),
        ("滑行大喷菇", "object_friend", "friend"),
        ("摄影", "practice", "teachable_logic"),
        ("名字", "identity_surface", "forgotten_or_unfixed"),
    ]
    for label, kind, relation in seeds:
        candidate = get_candidate(objects, label, kind)
        if candidate:
            candidate.add(weight=20.0, media="dialog_state", relation=relation)


def confidence_for(candidate: ObjectCandidate) -> float:
    score = candidate.score
    spread = len(candidate.top_dirs) + len(candidate.phases) + len(candidate.media)
    value = 1 - math.exp(-(score + spread) / 42)
    return round(min(0.98, max(0.18, value)), 3)


def answer_style_for(kind: str) -> str:
    if kind == "object_friend":
        return "treat_as_relation_not_encyclopedia"
    if kind in {"alias", "subject", "identity_surface"}:
        return "deterministic_short_answer"
    if kind == "practice":
        return "short_teaching_logic"
    if kind.startswith("project_"):
        return "project_memory_summary"
    if kind == "experience_cluster":
        return "structured_experience_summary"
    if kind in {"camera_or_device", "medium_photography", "medium_video", "medium_design"}:
        return "medium_specific_observation"
    if kind == "place_or_trip":
        return "place_or_trip_association"
    return "object_association"


def index_bucket_for(candidate: ObjectCandidate) -> str:
    label = candidate.label
    lower = canonical_label(label)
    if candidate.kind in {"subject", "alias", "object_friend", "practice", "identity_surface"}:
        return "confirmed_relation_trace"
    if candidate.kind == "experience_cluster":
        return "experience_trace"
    if candidate.kind == "place_or_trip":
        return "place_trace"
    if candidate.kind.startswith("medium_") or candidate.kind == "camera_or_device":
        return "knowledge_index"
    if candidate.kind.startswith("project_"):
        return "practice_trace"
    if any(term in lower for term in ("raw", "jpeg", "jpg", "png", "format", "frame", "processor", "com.apple")):
        return "knowledge_index"
    if KNOWLEDGE_INDEX_RE.search(label):
        return "knowledge_index"
    if INTERNAL_NAMING_RE.search(label):
        return "naming_index"
    if candidate.kind == "topic":
        return "knowledge_index"
    if candidate.kind in {"project_or_folder", "context_cluster"}:
        if re.search(r"\d", lower) or re.fullmatch(r"[a-z0-9 +._:-]{4,}", lower):
            return "naming_index"
    return "memory_trace"


def serialize_candidate(candidate: ObjectCandidate) -> dict[str, Any]:
    top_relations = [
        {"type": relation, "count": count}
        for relation, count in candidate.relations.most_common(8)
    ]
    co_objects = [
        {"label": label, "count": count}
        for label, count in candidate.co_terms.most_common(12)
        if label.lower() != canonical_label(candidate.label)
    ]
    return {
        "id": object_id(candidate.label, candidate.kind),
        "label": candidate.label,
        "kind": candidate.kind,
        "visibility": "object",
        "confidence": confidence_for(candidate),
        "score": round(candidate.score, 3),
        "evidence_count": candidate.evidence_count,
        "answer_style": answer_style_for(candidate.kind),
        "relations": top_relations,
        "co_objects": co_objects,
        "media": [{"type": key, "count": value} for key, value in candidate.media.most_common(8)],
        "phases": [{"period": key, "count": value} for key, value in candidate.phases.most_common(8)],
        "top_contexts": [
            {"label": key, "count": value}
            for key, value in candidate.top_dirs.most_common(8)
            if is_meaningful_label(key)
        ],
        "source_refs": candidate.source_refs,
    }


def serialize_index_candidate(candidate: ObjectCandidate, bucket: str) -> dict[str, Any]:
    return {
        "id": object_id(candidate.label, candidate.kind),
        "label": candidate.label,
        "kind": candidate.kind,
        "bucket": bucket,
        "confidence": confidence_for(candidate),
        "score": round(candidate.score, 3),
        "evidence_count": candidate.evidence_count,
        "media": [{"type": key, "count": value} for key, value in candidate.media.most_common(4)],
        "phases": [{"period": key, "count": value} for key, value in candidate.phases.most_common(4)],
    }


def build_object_table(args: argparse.Namespace) -> dict[str, Any]:
    adapter = T7SourceAdapter(Path(args.source), Path(args.inventory))
    objects: dict[tuple[str, str], ObjectCandidate] = {}
    counts = Counter()
    skipped_reasons = Counter()
    text_read = 0
    text_used = 0

    memory_hits = add_memory_card_objects(objects, Path(args.brain_pack))

    for item in adapter.iter_items():
        counts["items_seen"] += 1
        allowed, reason = can_read_content(item)
        if not allowed and reason.startswith("sensitive_path"):
            skipped_reasons[reason] += 1
            continue
        if reason == "system_metadata":
            skipped_reasons[reason] += 1
            continue

        # Non-sensitive path metadata is safe to parse for object structure even
        # when the source file type itself is not opened.
        add_inventory_objects(objects, item)
        add_experience_cluster_objects(objects, item)
        counts[f"group:{item.group}"] += 1

        if allowed and item.extension in TEXT_EXTS | PDF_EXTS and text_read < args.max_text_files:
            text_read += 1
            if add_text_content_objects(objects, item):
                text_used += 1

    candidates = list(objects.values())
    candidates.sort(key=lambda item: (item.score, item.evidence_count, len(item.top_dirs)), reverse=True)
    object_candidates: list[ObjectCandidate] = []
    trace_candidates: list[tuple[ObjectCandidate, str]] = []
    index_candidates: list[tuple[ObjectCandidate, str]] = []
    for candidate in candidates:
        bucket = index_bucket_for(candidate)
        if bucket == "object":
            object_candidates.append(candidate)
        elif bucket.endswith("_trace"):
            trace_candidates.append((candidate, bucket))
        else:
            index_candidates.append((candidate, bucket))

    selected: list[dict[str, Any]] = []
    selected_candidates = [
        serialize_index_candidate(candidate, bucket)
        for candidate, bucket in trace_candidates[: args.target_objects]
    ]
    selected_index = [
        serialize_index_candidate(candidate, bucket)
        for candidate, bucket in index_candidates[: args.target_objects]
    ]
    index_counts = Counter(bucket for _, bucket in index_candidates)
    trace_counts = Counter(bucket for _, bucket in trace_candidates)
    return {
        "schema_version": 4,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "cloud_inference_api_allowed": False,
            "source_files_copied": False,
            "sensitive_content_read": False,
            "sensitive_paths_opened": False,
            "raw_paths_stored": False,
            "raw_text_stored": False,
            "object_labels_redacted": True,
            "auto_promote_objects": False,
            "objects_require_manual_approval": True,
            "candidate_labels_are_not_objects": True,
            "object_promotion_requires_user_confirmation": True,
            "runtime_uses_objects_only": True,
        },
        "source": {
            "id": "t7",
            "display": "Local source",
            "inventory": Path(args.inventory).as_posix(),
        },
        "stats": {
            "items_seen": counts["items_seen"],
            "raw_candidates": len(candidates),
            "approved_object_candidates": len(object_candidates),
            "trace_candidates": len(trace_candidates),
            "index_candidates": len(index_candidates),
            "trace_buckets": trace_counts.most_common(),
            "index_buckets": index_counts.most_common(),
            "objects_selected": len(selected),
            "candidate_index_selected": len(selected_candidates),
            "index_selected": len(selected_index),
            "target_objects": args.target_objects,
            "text_files_read": text_read,
            "text_files_used": text_used,
            "memory_card_object_hits": memory_hits,
            "skipped": skipped_reasons.most_common(),
            "groups_seen": [(key.removeprefix("group:"), value) for key, value in counts.items() if key.startswith("group:")],
        },
        "objects": selected,
        "candidate_index": selected_candidates,
        "knowledge_index": selected_index,
    }


def write_outputs(table: dict[str, Any], out_path: Path, web_out_path: Path, history_dir: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    web_out_path.parent.mkdir(parents=True, exist_ok=True)
    history_dir.mkdir(parents=True, exist_ok=True)

    table_text = json.dumps(table, ensure_ascii=False, indent=2, sort_keys=True)
    out_path.write_text(table_text, encoding="utf-8")
    web_out_path.write_text(
        "export const OBJECT_TABLE = " + json.dumps(table, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )

    record = {
        "generated_at": table["generated_at"],
        "object_table_sha256": hashlib.sha256(table_text.encode("utf-8")).hexdigest(),
        "stats": table["stats"],
        "policy": table["policy"],
        "out": out_path.as_posix(),
        "web_out": web_out_path.as_posix(),
    }
    (history_dir / "latest_object_build.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    with (history_dir / "object_build_history.jsonl").open("a", encoding="utf-8") as fp:
        fp.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a redacted object table from the local source inventory.")
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--inventory", default=DEFAULT_INVENTORY)
    parser.add_argument("--brain-pack", default=DEFAULT_BRAIN_PACK)
    parser.add_argument("--out", default=DEFAULT_OUT)
    parser.add_argument("--web-out", default=DEFAULT_WEB_OUT)
    parser.add_argument("--history-dir", default=DEFAULT_HISTORY_DIR)
    parser.add_argument("--target-objects", type=int, default=TARGET_OBJECTS)
    parser.add_argument("--max-text-files", type=int, default=MAX_TEXT_FILES)
    args = parser.parse_args()

    table = build_object_table(args)
    write_outputs(table, Path(args.out), Path(args.web_out), Path(args.history_dir))
    print(
        json.dumps(
            {
                "object_table": args.out,
                "web_object_table": args.web_out,
                **table["stats"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
