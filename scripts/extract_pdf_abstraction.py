#!/usr/bin/env python3
"""Extract public-safe abstraction signals from a local PDF.

This script is intentionally not a raw text extractor. It reads a PDF locally,
then writes a small summary with source hash, page/structure counts, redaction
risk counts, and review-only fact/theme candidates. It must not write source
paths, local timestamps, or source text snippets into the output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT_DIR = ROOT / "artifacts" / "training_os" / "pdf_abstractions"

THEME_TERMS: dict[str, list[str]] = {
    "home_displacement": ["home", "return", "soil", "city", "new york", "shanghai", "jiangsu", "家", "回去", "土", "城市", "纽约", "上海", "江苏"],
    "memory_attention": ["memory", "forget", "remember", "watch", "attention", "library", "记忆", "忘", "看", "图书馆"],
    "religious_space": ["church", "chapel", "religion", "prayer", "教堂", "宗教", "祈祷"],
    "body_subject": ["body", "shadow", "self", "subject", "身体", "影子", "自我", "主体"],
    "structure_institution": ["institution", "role", "system", "school", "archive", "制度", "角色", "档案", "学校"],
    "material_process": ["paper", "print", "image", "photograph", "surface", "纸", "印刷", "图像", "照片", "表面"],
}

SECTION_LABELS = ["Still Life", "Bless You", "Their World", "Church"]

RISK_PATTERNS: dict[str, re.Pattern[str]] = {
    "email_like": re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I),
    "phone_like": re.compile(r"(?<![A-Za-z0-9])(?:\+?\d[\d\s().-]{7,}\d)(?![A-Za-z0-9])"),
    "gps_like": re.compile(r"-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}"),
    "local_path_like": re.compile(r"/Users/|/Volumes/|/home/|\b[A-Za-z]:\\"),
    "id_or_account_keyword": re.compile(r"(passport|visa|bank|account|身份证|护照|签证|银行卡|账号)", re.I),
}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract no-raw-text PDF abstraction signals.")
    parser.add_argument("--pdf", required=True, help="Local PDF path. The path is never written to output.")
    parser.add_argument("--source-id", required=True, help="Stable reviewed source id.")
    parser.add_argument("--visibility", default="local", choices=["local", "private", "private_review"])
    parser.add_argument("--out", default="", help="Output JSON path. Defaults under artifacts/training_os/pdf_abstractions/.")
    return parser.parse_args(argv)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_pages(path: Path) -> tuple[list[str], dict[str, Any]]:
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception as exc:  # pragma: no cover - depends on local runtime
        raise SystemExit(
            "pypdf is required. Use the bundled Codex Python runtime or install pypdf locally."
        ) from exc

    reader = PdfReader(str(path))
    pages: list[str] = []
    encrypted = bool(getattr(reader, "is_encrypted", False))
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:
            pages.append("")
    metadata = getattr(reader, "metadata", None) or {}
    return pages, {
        "page_count": len(reader.pages),
        "encrypted": encrypted,
        "metadata_keys_present": sorted(str(key).lstrip("/") for key in metadata.keys()),
    }


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def count_theme_signals(text: str) -> dict[str, int]:
    lowered = text.lower()
    counts: dict[str, int] = {}
    for theme, terms in THEME_TERMS.items():
        total = 0
        for term in terms:
            total += lowered.count(term.lower())
        counts[theme] = total
    return counts


def structure_signals(text: str) -> dict[str, Any]:
    numbered = len(re.findall(r"(?m)^\s*(?:\d+|[IVX]+)[.)、]\s*$", text))
    years = sorted(set(re.findall(r"\b(?:19|20)\d{2}\b", text)))
    section_hits = [label for label in SECTION_LABELS if label.lower() in text.lower()]
    return {
        "numbered_section_marker_count": numbered,
        "known_section_labels_detected": section_hits,
        "year_mentions_detected": years[:12],
        "year_mention_count": len(re.findall(r"\b(?:19|20)\d{2}\b", text)),
    }


def risk_counts(text: str) -> dict[str, int]:
    return {name: len(pattern.findall(text)) for name, pattern in RISK_PATTERNS.items()}


def candidate_facts(source_id: str, text: str, structure: dict[str, Any]) -> list[dict[str, Any]]:
    lowered = text.lower()
    candidates: list[dict[str, Any]] = []

    if "collection" in source_id:
        if {"2024", "2025"}.issubset(set(structure.get("year_mentions_detected", []))):
            candidates.append({
                "fact_type": "writing_collection",
                "claim": "The collection has local evidence for a 2024 to 2025 writing-period candidate.",
                "status": "review_required",
                "visibility": "local",
            })
        if {"Still Life", "Bless You", "Their World"}.issubset(set(structure.get("known_section_labels_detected", []))):
            candidates.append({
                "fact_type": "writing_collection",
                "claim": "The collection structure candidate includes Still Life, Bless You, and Their World.",
                "status": "review_required",
                "visibility": "local",
            })
        if any(term in lowered for term in ["new york", "纽约"]):
            candidates.append({
                "fact_type": "location_phase",
                "claim": "A New York phase signal is present; do not infer current address, visa, or immigration status.",
                "status": "review_required_sensitive",
                "visibility": "local",
            })

    if "church" in source_id:
        candidates.append({
            "fact_type": "work",
            "claim": "The local PDF is a prose work candidate associated with the title Church.",
            "status": "review_required",
            "visibility": "local",
        })
        if structure.get("numbered_section_marker_count", 0) > 0:
            candidates.append({
                "fact_type": "work",
                "claim": "The work contains numbered-structure signals.",
                "status": "review_required",
                "visibility": "local",
            })

    return candidates


def abstraction_report(args: argparse.Namespace) -> dict[str, Any]:
    pdf_path = Path(args.pdf).expanduser().resolve()
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {args.pdf}")
    if pdf_path.suffix.lower() != ".pdf":
        raise SystemExit("Input must be a PDF.")

    pages, pdf_info = extract_pages(pdf_path)
    text = "\n".join(pages)
    normalized = normalize(text)
    structure = structure_signals(text)

    report = {
        "schema_version": 1,
        "source_id": args.source_id,
        "visibility": args.visibility,
        "review_status": "local_parse_only_not_runtime_approved",
        "source_hash_sha256": sha256_file(pdf_path),
        "raw_text_committed": False,
        "source_path_committed": False,
        "raw_quotes_committed": False,
        "pdf": {
            "page_count": pdf_info["page_count"],
            "encrypted": pdf_info["encrypted"],
            "metadata_keys_present": pdf_info["metadata_keys_present"],
            "extracted_page_count": len(pages),
            "extracted_char_count": len(normalized),
            "empty_page_count": sum(1 for page in pages if not normalize(page)),
        },
        "structure_signals": structure,
        "theme_signal_counts": count_theme_signals(text),
        "risk_counts": risk_counts(text),
        "candidate_facts": candidate_facts(args.source_id, text, structure),
        "must_not_infer": [
            "exact private address",
            "visa or immigration status",
            "medical or psychological diagnosis",
            "family biography beyond approved fact cards",
            "literal event history from creative or narrative passages",
            "complete author psychology",
        ],
        "copyright_boundary": [
            "no raw quote training",
            "no dense source-text target",
            "summaries and short approved facts only",
        ],
    }
    return report


def assert_public_safe_output(report: dict[str, Any]) -> None:
    payload = json.dumps(report, ensure_ascii=False, sort_keys=True)
    forbidden = [
        "/Users/",
        "/Volumes/",
        "/home/",
        "C:\\",
        "Poetry_Collection.pdf",
        "Church.pdf",
        "according to your file",
        "根据你的文件",
        "根据你的网站",
    ]
    for item in forbidden:
        if item in payload:
            raise SystemExit(f"Unsafe output contains forbidden token: {item}")


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    out = Path(args.out).expanduser().resolve() if args.out else DEFAULT_OUT_DIR / f"{args.source_id}.summary.json"
    report = abstraction_report(args)
    assert_public_safe_output(report)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "source_id": report["source_id"],
        "page_count": report["pdf"]["page_count"],
        "extracted_char_count": report["pdf"]["extracted_char_count"],
        "candidate_facts": len(report["candidate_facts"]),
        "risk_counts": report["risk_counts"],
        "out": str(out.relative_to(ROOT)) if out.is_relative_to(ROOT) else "<outside-root>",
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
