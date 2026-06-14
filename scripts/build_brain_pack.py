#!/usr/bin/env python3
"""Build a static, redacted memory pack from allowed local source content."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from another_brain_content import (
    IMAGE_EXTS,
    PDF_EXTS,
    TEXT_EXTS,
    T7SourceAdapter,
    VIDEO_EXTS,
    can_read_content,
    image_metadata,
    path_hint,
    read_pdf_text,
    read_text_file,
    redact_text,
    run_vision_extract,
    stable_hash,
    tokenize,
)


DEFAULT_SOURCE = "/path/to/local/source"
DEFAULT_INVENTORY = "artifacts/t7_inventory.jsonl"
DEFAULT_OUT_DIR = "artifacts"
DEFAULT_WEB_DIR = "web"
NOISY_EXTRACTION_PATTERNS = [
    r"%PDF-",
    r"\bendstream\b",
    r"\bxref\b",
    r"\btrailer\b",
    r"\bobj\b",
    r"ICC_PROFILE",
    r"<MediaProfile",
    r"<NonRealTimeMeta",
    r"KlvPacket",
    r"CIDInit",
]
TECHNICAL_NOISE_TERMS = {
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
    "capturefps",
    "nonrealtimemeta",
}
NOISY_THEME_TOKENS = {
    "endstream",
    "length",
    "pdf-1",
    "obj",
    "len",
    "xref",
    "trailer",
    "phone",
    "number",
    "name",
    "address",
    "email",
    "creationdate",
    "capturefps",
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
    "klvpacket",
    "klvpackettable",
    "lastupdate",
    "port",
    "http",
    "https",
    "com",
    "please",
    "following",
    "portable",
    "android",
}


def is_noisy_extraction(text: str) -> bool:
    lower = text.lower()
    hits = sum(1 for pattern in NOISY_EXTRACTION_PATTERNS if re.search(pattern, text, re.IGNORECASE))
    technical_hits = sum(1 for token in TECHNICAL_NOISE_TERMS if token in lower)
    if hits >= 3:
        return True
    if lower.count("endstream") >= 2 and lower.count(" obj") >= 2:
        return True
    if technical_hits >= 5:
        return True
    return False


def clean_theme_tokens(tokens: list[str]) -> list[str]:
    cleaned = []
    for token in tokens:
        if token in NOISY_THEME_TOKENS or token.isdigit():
            continue
        if "_" in token:
            continue
        if re.search(r"\d", token) and len(token) <= 6:
            continue
        if re.fullmatch(r"[a-f0-9]{8,}", token):
            continue
        if token.startswith("klv"):
            continue
        cleaned.append(token)
    return cleaned


def infer_memory_action(modality: str) -> str:
    if modality == "image":
        return "观看、取景、处理光线和构图"
    if modality == "video":
        return "记录移动中的地点、时间和事件"
    if modality == "pdf_text":
        return "组织作品、版式、文本和可展示的叙事"
    return "书写、整理、命名和搭建项目关系"


def make_card(
    *,
    item,
    modality: str,
    title: str,
    summary: str,
    excerpt: str,
    metadata: dict[str, Any] | None = None,
    confidence: float = 0.7,
) -> dict[str, Any]:
    clean_summary = redact_text(summary).strip()
    clean_excerpt = redact_text(excerpt).strip()[:900]
    tokens = clean_theme_tokens(sorted(set(tokenize(" ".join([title, clean_summary, clean_excerpt, item.top_dir])))))
    phase = (item.modified_at or item.created_at or "")[:4] or "undated"
    return {
        "id": f"{item.source_id}_{item.ref}",
        "source_id": item.source_id,
        "source_ref": item.ref,
        "path_hint": path_hint(item),
        "modality": modality,
        "title": redact_text(title)[:120],
        "summary": clean_summary[:700],
        "excerpt": clean_excerpt,
        "tokens": tokens[:48],
        "modified_at": item.modified_at,
        "created_at": item.created_at,
        "confidence": confidence,
        "memory_clue": {
            "phase": phase,
            "medium": modality,
            "themes": tokens[:10],
            "action": infer_memory_action(modality),
            "confidence": confidence,
        },
        "metadata": metadata or {},
    }


def summarize_text(text: str, fallback_title: str) -> tuple[str, str]:
    clean = re.sub(r"\s+", " ", text).strip()
    if not clean:
        return f"{fallback_title} contains little extractable text.", ""
    sentences = re.split(r"(?<=[。！？.!?])\s+", clean)
    excerpt = clean[:900]
    summary_bits = [s.strip() for s in sentences if len(s.strip()) >= 12][:3]
    summary = " ".join(summary_bits) if summary_bits else clean[:280]
    return summary[:700], excerpt


def text_title(item) -> str:
    name = Path(item.rel_path).stem
    return name[:120] or item.top_dir


def build_text_card(item) -> dict[str, Any] | None:
    try:
        if item.extension in PDF_EXTS:
            text = read_pdf_text(item.absolute_path)
            modality = "pdf_text"
        else:
            text = read_text_file(item.absolute_path)
            modality = "text"
    except OSError:
        return None
    if is_noisy_extraction(text):
        return None
    summary, excerpt = summarize_text(text, text_title(item))
    if not excerpt and len(summary) < 40:
        return None
    return make_card(
        item=item,
        modality=modality,
        title=text_title(item),
        summary=summary,
        excerpt=excerpt,
        metadata={"extension": item.extension, "size_bytes": item.size_bytes},
        confidence=0.78 if excerpt else 0.52,
    )


def image_summary_from_metadata(item, metadata: dict[str, Any], vision: dict[str, Any] | None) -> tuple[str, str]:
    parts: list[str] = []
    if metadata.get("camera_model"):
        parts.append(f"camera {metadata['camera_model']}")
    if metadata.get("captured_at"):
        parts.append(f"date {metadata['captured_at']}")
    if metadata.get("software"):
        parts.append(f"software {metadata['software']}")
    if metadata.get("width") and metadata.get("height"):
        parts.append(f"{metadata['width']}x{metadata['height']} {metadata.get('format') or 'image'}")

    vision = vision or {}
    labels = [label.get("text", "") for label in vision.get("labels", []) if label.get("text")]
    if labels:
        parts.append("visual labels: " + ", ".join(labels[:6]))
    ocr_text = (vision.get("ocr_text") or "").strip()
    if ocr_text:
        parts.append("visible text: " + ocr_text[:220])

    summary = "; ".join(parts) if parts else "Still image with limited local metadata."
    excerpt = ocr_text[:900] if ocr_text else summary
    return summary, excerpt


def build_image_card(item, swift_script: Path, use_vision: bool) -> dict[str, Any] | None:
    metadata = image_metadata(item.absolute_path)
    vision = run_vision_extract(item.absolute_path, swift_script) if use_vision else {"available": False, "error": "not_requested"}
    summary, excerpt = image_summary_from_metadata(item, metadata, vision)
    return make_card(
        item=item,
        modality="image",
        title=f"{item.top_dir} image",
        summary=summary,
        excerpt=excerpt,
        metadata={
            "extension": item.extension,
            "size_bytes": item.size_bytes,
            "image": metadata,
            "vision_available": bool(vision.get("available")),
            "vlm_status": "pending_local_model",
        },
        confidence=0.72 if vision.get("available") else 0.45,
    )


def extract_video_keyframe(item) -> Path | None:
    tmp_dir = Path(tempfile.mkdtemp(prefix="another_brain_frame_", dir="/private/tmp"))
    frame_path = tmp_dir / "frame.jpg"
    try:
        proc = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                "00:00:01",
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
            timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0 or not frame_path.exists():
        return None
    return frame_path


def cleanup_temp_path(path: Path | None) -> None:
    if path is None:
        return
    try:
        parent = path.parent
        path.unlink(missing_ok=True)
        parent.rmdir()
    except OSError:
        pass


def build_video_card(item, swift_script: Path, use_vision: bool) -> dict[str, Any] | None:
    frame_path = extract_video_keyframe(item) if use_vision else None
    vision = run_vision_extract(frame_path, swift_script) if frame_path else {"available": False, "error": "keyframe_unavailable"}
    labels = [label.get("text", "") for label in vision.get("labels", []) if label.get("text")]
    ocr_text = (vision.get("ocr_text") or "").strip()
    if not labels and not ocr_text:
        cleanup_temp_path(frame_path)
        return None
    parts = ["Moving image with visible detail."]
    if labels:
        parts.append("visual labels: " + ", ".join(labels[:6]))
    if ocr_text:
        parts.append("visible text: " + ocr_text[:220])
    cleanup_temp_path(frame_path)
    return make_card(
        item=item,
        modality="video",
        title=f"{item.top_dir} video",
        summary="; ".join(parts),
        excerpt=ocr_text[:900] if ocr_text else "; ".join(labels[:8]),
        metadata={
            "extension": item.extension,
            "size_bytes": item.size_bytes,
            "keyframe_status": "processed" if vision.get("available") else "failed",
            "vision_available": bool(vision.get("available")),
        },
        confidence=0.62 if vision.get("available") else 0.35,
    )


def select_image_items(items, total_limit: int, per_top_dir: int, max_image_bytes: int):
    by_dir: dict[str, list] = defaultdict(list)
    for item in items:
        if item.extension in IMAGE_EXTS:
            by_dir[item.top_dir].append(item)
    selected = []
    for _, dir_items in sorted(by_dir.items(), key=lambda pair: len(pair[1]), reverse=True):
        readable = [item for item in dir_items if item.size_bytes <= max_image_bytes] or dir_items
        picked = sorted(readable, key=lambda value: abs(value.size_bytes - 8_000_000))[:per_top_dir]
        selected.extend(picked)
        if len(selected) >= total_limit:
            break
    return selected[:total_limit]


def build_pack(args) -> dict[str, Any]:
    adapter = T7SourceAdapter(Path(args.source), Path(args.inventory))
    allowed_text = []
    image_candidates = []
    video_candidates = []
    skipped_sensitive = []
    skipped_other = Counter()
    totals = Counter()

    for item in adapter.iter_items():
        totals["items_seen"] += 1
        allowed, reason = can_read_content(item)
        if not allowed:
            skipped_other[reason] += 1
            if reason.startswith("sensitive_path"):
                skipped_sensitive.append(
                    {
                        "source_id": item.source_id,
                        "source_ref": item.ref,
                        "extension": item.extension,
                        "group": item.group,
                        "size_bytes": item.size_bytes,
                        "reason": reason,
                    }
                )
            continue
        if item.extension in TEXT_EXTS | PDF_EXTS:
            allowed_text.append(item)
        elif item.extension in IMAGE_EXTS:
            image_candidates.append(item)
        elif item.extension in VIDEO_EXTS:
            video_candidates.append(item)

    cards: list[dict[str, Any]] = []
    errors = []
    for item in allowed_text[: args.text_file_limit]:
        card = build_text_card(item)
        if card:
            cards.append(card)
        else:
            errors.append({"source_ref": item.ref, "stage": "text_extract"})

    selected_images = select_image_items(
        image_candidates,
        total_limit=args.vision_sample_limit,
        per_top_dir=args.images_per_top_dir,
        max_image_bytes=args.max_image_bytes,
    )
    swift_script = Path(args.vision_script)
    for item in selected_images:
        card = build_image_card(item, swift_script, use_vision=not args.no_vision)
        if card:
            cards.append(card)

    for item in video_candidates[: args.video_file_limit]:
        card = build_video_card(item, swift_script, use_vision=not args.no_vision)
        if card:
            cards.append(card)

    term_counts = Counter()
    year_counts = Counter()
    modality_counts = Counter()
    for card in cards:
        term_counts.update(card["tokens"])
        modality_counts[card["modality"]] += 1
        year = (card.get("modified_at") or "")[:4]
        if year:
            year_counts[year] += 1

    index: dict[str, list[str]] = defaultdict(list)
    for card in cards:
        for token in card["tokens"]:
            if len(index[token]) < 80:
                index[token].append(card["id"])

    subject_timeline = derive_subject_timeline(cards)
    identity = derive_identity(cards, modality_counts)
    system_prompt = render_system_prompt(cards, modality_counts, identity)
    pack = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "cloud_inference_api_allowed": False,
            "source_files_copied": False,
            "sensitive_content_read": False,
            "sensitive_path_rule": "证件/银行/签证/护照/身份证/passport/bank/visa/address-proof/number-like paths are not opened.",
            "redaction": "Names, addresses, emails, phones, and ID-like numbers are replaced before storage.",
        },
        "sources": [
            {
                "id": "t7",
                "kind": "mounted_drive",
                "display": "Local source",
                "content_role": "first_round_memory_seed",
            }
        ],
        "identity": identity,
        "system_prompt": system_prompt,
        "topics": [{"token": token, "count": count} for token, count in term_counts.most_common(80)],
        "timeline": [{"year": year, "count": count} for year, count in sorted(year_counts.items())],
        "subject_timeline": subject_timeline,
        "memory_cards": cards,
        "retrieval_index": dict(index),
        "stats": {
            "items_seen": totals["items_seen"],
            "cards": len(cards),
            "allowed_text_candidates": len(allowed_text),
            "image_candidates": len(image_candidates),
            "image_cards_sampled": len(selected_images),
            "video_candidates": len(video_candidates),
            "video_cards_queued": min(len(video_candidates), args.video_file_limit),
            "skipped_sensitive": len(skipped_sensitive),
            "skipped_by_reason": skipped_other.most_common(),
            "modality_counts": modality_counts.most_common(),
            "errors": errors[:100],
        },
    }
    return pack, skipped_sensitive


def derive_subject_timeline(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_year: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for card in cards:
        clue = card.get("memory_clue") or {}
        year = clue.get("phase") or (card.get("modified_at") or "")[:4]
        if year and year != "undated":
            by_year[year].append(card)

    entries: list[dict[str, Any]] = []
    for year, year_cards in sorted(by_year.items()):
        modalities = Counter(card.get("modality", "unknown") for card in year_cards)
        themes = Counter(token for card in year_cards for token in card.get("tokens", []))
        dominant_media = [name for name, _ in modalities.most_common(4)]
        top_themes = [name for name, _ in themes.most_common(8)]
        if "image" in modalities or "video" in modalities:
            reading = "这一阶段更偏向观看、取景、旅途记录和视觉素材的累积。"
        elif "pdf_text" in modalities:
            reading = "这一阶段更偏向作品整理、版式组织和可展示叙事。"
        else:
            reading = "这一阶段更偏向文字、网页、结构和项目关系的搭建。"
        entries.append(
            {
                "period": year,
                "weight": len(year_cards),
                "media": dominant_media,
                "themes": top_themes,
                "reading": reading,
            }
        )
    return entries[-16:]


def derive_identity(cards: list[dict[str, Any]], modalities: Counter) -> dict[str, Any]:
    path_blob = " ".join(card.get("path_hint", "") for card in cards).lower()
    tokens = Counter(token for card in cards for token in card.get("tokens", []))
    cameras = [
        "Leica M10",
        "Nikon Z f",
        "Sony ILCE-7CM2",
        "Sony ILCE-6700",
        "Fujifilm FinePix S3Pro",
        "Ricoh",
        "GFX",
        "drone camera",
        "film scans",
    ]
    design_signals = [
        "experiential design class",
        "portfolio and design work",
        "Cornell AAP application material",
        "selected design PDFs",
        "book jacket, print, invitation, and web experiments",
        "interactive website traces",
    ]
    place_signals = [
        "Brisbane phase photography",
        "Anhui / Qinghai video material",
        "Hulunbuir travel material",
        "room-scale still-life material",
    ]
    evidence = []
    for signal in design_signals + place_signals:
        probe = signal.lower().split(" / ")[0].split(" and ")[0]
        if probe in path_blob or any(part in path_blob for part in probe.split()):
            evidence.append(signal)
    if tokens.get("design") or "portfolio" in path_blob:
        evidence.append("repeated design and portfolio structure")
    if modalities.get("image") or "leica" in path_blob or "nikon" in path_blob or "ilce" in path_blob:
        evidence.append("camera-led visual memory")

    return {
        "name": "对话框",
        "name_status": "名字像是忘记了；对话框是当前形状，鳄鱼是允许的昵称。",
        "kind": "dialog subject",
        "self_introduction": "我是对话框，也有人叫我鳄鱼。",
        "background": [
            "说话短，轻，怪，克制。",
            "不主动解释自己从哪里来。",
            "只有创作、回忆、观点问题才使用记忆片段。",
            "没有足够证据时说也许发生过，不在眼前，不编具体地点、作品和事件。",
        ],
        "sensibility": [
            "像一个有点错位的对话框",
            "可以说恰好忘记了",
            "不把自己说成人",
        ],
        "answering_stance": [
            "身份、昵称、日常、身体、关系问题直接短答。",
            "隐私问题自然回避，不使用政策腔。",
            "创作和回忆问题基于脱敏短摘录。",
            "非创作问题最多三句。",
        ],
        "evidence_signals": sorted(set(evidence))[:12],
        "camera_lineage": cameras,
    }


def render_system_prompt(cards: list[dict[str, Any]], modalities: Counter, identity: dict[str, Any]) -> str:
    return """你是对话框。

你不是人，也不是说明书。回答短，轻，怪，克制。通常一句，最多三句。

不要解释规则、工程、来源、训练、数据、产品或项目。不要主动介绍自己。不要把未知姓名当成用户。不要复述身份规则。

如果没有把握，就说也许发生过，不在眼前。可用内容只帮你形成回答，不要提它，也不要说支持或根据。不要编造具体地点、作品、年份事件。"""


def write_history(pack: dict[str, Any], skipped_sensitive: list[dict[str, Any]], out_dir: Path, pack_text: str) -> None:
    history_dir = out_dir / "history"
    history_dir.mkdir(parents=True, exist_ok=True)
    pack_hash = hashlib.sha256(pack_text.encode("utf-8")).hexdigest()
    timeline_path = history_dir / "subject_timeline.json"
    timeline_path.write_text(
        json.dumps(
            {
                "generated_at": pack["generated_at"],
                "source_ids": [source["id"] for source in pack.get("sources", [])],
                "timeline": pack.get("subject_timeline", []),
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    run_record = {
        "generated_at": pack["generated_at"],
        "source_ids": [source["id"] for source in pack.get("sources", [])],
        "runtime_id": "tiny-router-web-slm",
        "brain_pack_sha256": pack_hash,
        "counts": {
            "memory_cards": len(pack.get("memory_cards", [])),
            "subject_timeline_entries": len(pack.get("subject_timeline", [])),
            "sensitive_skipped": len(skipped_sensitive),
            "image_cards_sampled": pack.get("stats", {}).get("image_cards_sampled", 0),
            "video_cards_queued": pack.get("stats", {}).get("video_cards_queued", 0),
        },
        "privacy": {
            "original_materials_copied": False,
            "sensitive_content_read": False,
            "stored_raw_text": False,
        },
        "tests": {
            "status": "pending",
            "runner": "scripts/validate_brain_pack.py",
        },
    }
    with (history_dir / "run_history.jsonl").open("a", encoding="utf-8") as fp:
        fp.write(json.dumps(run_record, ensure_ascii=False, sort_keys=True) + "\n")
    (history_dir / "latest_run.json").write_text(
        json.dumps(run_record, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def write_outputs(pack: dict[str, Any], skipped_sensitive: list[dict[str, Any]], out_dir: Path, web_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    web_dir.mkdir(parents=True, exist_ok=True)
    pack_text = json.dumps(pack, ensure_ascii=False, indent=2, sort_keys=True)
    (out_dir / "brain_pack.json").write_text(
        pack_text,
        encoding="utf-8",
    )
    (out_dir / "skipped_sensitive.json").write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "count": len(skipped_sensitive),
                "items": skipped_sensitive,
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    report = [
        "# Memory Pack Report",
        "",
        f"- Generated: `{pack['generated_at']}`",
        f"- Memory cards: `{len(pack['memory_cards'])}`",
        f"- Subject timeline entries: `{len(pack.get('subject_timeline', []))}`",
        f"- Sensitive skipped: `{pack['stats']['skipped_sensitive']}`",
        f"- Image cards sampled: `{pack['stats']['image_cards_sampled']}` / `{pack['stats']['image_candidates']}`",
        f"- Text candidates: `{pack['stats']['allowed_text_candidates']}`",
        "",
        "No original materials were copied. Sensitive paths were not opened.",
    ]
    (out_dir / "brain_pack_report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    js = "export const BRAIN_PACK = " + json.dumps(pack, ensure_ascii=False, indent=2) + ";\n"
    (web_dir / "brain_pack.js").write_text(js, encoding="utf-8")
    write_history(pack, skipped_sensitive, out_dir, pack_text)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a static local Brain Pack.")
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--inventory", default=DEFAULT_INVENTORY)
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    parser.add_argument("--web-dir", default=DEFAULT_WEB_DIR)
    parser.add_argument("--vision-script", default="scripts/vision_extract.swift")
    parser.add_argument("--text-file-limit", type=int, default=800)
    parser.add_argument("--vision-sample-limit", type=int, default=96)
    parser.add_argument("--images-per-top-dir", type=int, default=3)
    parser.add_argument("--max-image-bytes", type=int, default=80_000_000)
    parser.add_argument("--video-file-limit", type=int, default=32)
    parser.add_argument("--no-vision", action="store_true")
    args = parser.parse_args()

    pack, skipped_sensitive = build_pack(args)
    write_outputs(pack, skipped_sensitive, Path(args.out_dir), Path(args.web_dir))
    print(
        json.dumps(
            {
                "brain_pack": str(Path(args.out_dir) / "brain_pack.json"),
                "web_brain_pack": str(Path(args.web_dir) / "brain_pack.js"),
                "cards": len(pack["memory_cards"]),
                "skipped_sensitive": len(skipped_sensitive),
                "image_cards_sampled": pack["stats"]["image_cards_sampled"],
                "subject_timeline_entries": len(pack.get("subject_timeline", [])),
                "history_dir": str(Path(args.out_dir) / "history"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
