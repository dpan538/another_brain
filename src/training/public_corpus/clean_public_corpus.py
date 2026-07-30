import hashlib
import json
import re
import unicodedata
from html import unescape
from pathlib import Path

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
LONG_ID_RE = re.compile(r"\b\d{15,}\b")
SECRET_RE = re.compile(
    r"(sk-[A-Za-z0-9]{20,}|hf_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|bearer\s+[A-Za-z0-9._-]{16,}|OPENAI_API_KEY|HF_TOKEN)",
    re.I,
)
COT_RE = re.compile(
    r"(chain[-_ ]?of[-_ ]?thought|hidden prompt|system prompt(?: dump)?|internal reasoning|assistant analysis|scratchpad|do not reveal|developer message|tool trace|eval prompt)",
    re.I,
)
EVAL_PROMPT_RE = re.compile(r"(evals/|casepack|heldout prompt|blind[-_ ]?casepack|r24.*prompt)", re.I)
TOXIC_RE = re.compile(r"\b(?:kill yourself|rape|incest|terrorist manifesto)\b", re.I)
MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
HTML_TAG_RE = re.compile(r"<[^>]+>")


def normalize_text(text):
    text = unescape(str(text or ""))
    text = MARKDOWN_LINK_RE.sub(r"\1", text)
    text = HTML_TAG_RE.sub(" ", text)
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text)).strip()


def normalized_hash(text):
    return hashlib.sha256(normalize_text(text).lower().encode("utf-8")).hexdigest()


def detect_language_with_score(text):
    text = normalize_text(text)
    if not text:
        return "unknown", 0.0, "heuristic_zh_en_mixed"
    zh = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    latin = sum(1 for ch in text if ("a" <= ch.lower() <= "z"))
    total = max(1, len(text))
    if zh / total > 0.18 and latin / total > 0.05:
        return "mixed", round((zh + latin) / total, 4), "heuristic_zh_en_mixed"
    if zh / total > 0.12:
        return "zh", round(zh / total, 4), "heuristic_zh_en_mixed"
    if latin / total > 0.35:
        return "en", round(latin / total, 4), "heuristic_zh_en_mixed"
    return "mixed", round((zh + latin) / total, 4), "heuristic_zh_en_mixed"


def detect_language(text):
    return detect_language_with_score(text)[0]


def rejection_reason(text):
    text = normalize_text(text)
    if len(text) < 20:
        return "too_short"
    if len(text) > 20000:
        return "too_long_unsplittable"
    if SECRET_RE.search(text):
        return "secret"
    if EMAIL_RE.search(text) or PHONE_RE.search(text) or IP_RE.search(text) or LONG_ID_RE.search(text):
        return "pii"
    if COT_RE.search(text):
        return "cot_or_hidden_prompt"
    if EVAL_PROMPT_RE.search(text):
        return "eval_prompt_leakage"
    if TOXIC_RE.search(text):
        return "toxic"
    if "another_brain_question_pack_001" in text and re.search(r"\b(?:5[1-9]|[6-9][0-9]|100)\b", text):
        return "old_excluded_question_pack_rows"
    return ""


def chunk_text(text, max_chars=2400):
    text = normalize_text(text)
    if len(text) <= max_chars:
        return [text]
    chunks = []
    parts = re.split(r"(?<=[。！？.!?])\s+", text)
    current = ""
    for part in parts:
        if not part:
            continue
        if len(current) + len(part) + 1 <= max_chars:
            current = f"{current} {part}".strip()
        else:
            if current:
                chunks.append(current)
            current = part[:max_chars]
    if current:
        chunks.append(current)
    return chunks or [text[:max_chars]]


def clean_record(record):
    text = normalize_text(record.get("text", ""))
    reason = rejection_reason(text)
    if reason:
        return None, reason
    cleaned = dict(record)
    cleaned["text"] = text
    language, score, detector = detect_language_with_score(text)
    cleaned["language"] = record.get("language") or language
    if cleaned["language"] not in {"zh", "en", "mixed", "symbolic"}:
        cleaned["language"] = language
    cleaned["language_score"] = score
    cleaned["detector_name"] = detector
    cleaned["normalized_sha256"] = normalized_hash(text)
    cleaned["contains_private_data"] = False
    cleaned["contains_cot"] = False
    cleaned["contains_eval_prompt"] = False
    return cleaned, ""


def read_jsonl(path):
    with Path(path).open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)


def write_jsonl(path, rows):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with Path(path).open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
