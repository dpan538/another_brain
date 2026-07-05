import hashlib
import json
import re
import unicodedata
from pathlib import Path

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
LONG_ID_RE = re.compile(r"\b\d{15,}\b")
SECRET_RE = re.compile(
    r"(sk-[A-Za-z0-9]{20,}|hf_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|bearer\s+[A-Za-z0-9._-]{16,})",
    re.I,
)
COT_RE = re.compile(
    r"(chain[-_ ]?of[-_ ]?thought|hidden prompt|system prompt|internal reasoning|assistant analysis|scratchpad|do not reveal)",
    re.I,
)
EVAL_PROMPT_RE = re.compile(r"(evals/|casepack|heldout prompt|blind[-_ ]?casepack|r24.*prompt)", re.I)
TOXIC_RE = re.compile(r"\b(?:kill yourself|rape|incest|terrorist manifesto)\b", re.I)


def normalize_text(text):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(text or ""))).strip()


def normalized_hash(text):
    return hashlib.sha256(normalize_text(text).lower().encode("utf-8")).hexdigest()


def detect_language(text):
    text = normalize_text(text)
    if not text:
        return "unknown"
    zh = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    latin = sum(1 for ch in text if ("a" <= ch.lower() <= "z"))
    total = max(1, len(text))
    if zh / total > 0.18 and latin / total > 0.05:
        return "mixed"
    if zh / total > 0.12:
        return "zh"
    if latin / total > 0.35:
        return "en"
    return "mixed"


def rejection_reason(text):
    text = normalize_text(text)
    if len(text) < 20:
        return "too_short"
    if len(text) > 6000:
        return "too_long"
    if EMAIL_RE.search(text) or PHONE_RE.search(text) or IP_RE.search(text) or LONG_ID_RE.search(text):
        return "pii"
    if SECRET_RE.search(text):
        return "secret"
    if COT_RE.search(text):
        return "cot_or_hidden_prompt"
    if EVAL_PROMPT_RE.search(text):
        return "eval_prompt_leakage"
    if TOXIC_RE.search(text):
        return "toxic"
    if "another_brain_question_pack_001" in text and re.search(r"\b(?:5[1-9]|[6-9][0-9]|100)\b", text):
        return "old_excluded_question_pack_rows"
    return ""


def clean_record(record):
    text = normalize_text(record.get("text", ""))
    reason = rejection_reason(text)
    if reason:
        return None, reason
    cleaned = dict(record)
    cleaned["text"] = text
    cleaned["language"] = record.get("language") or detect_language(text)
    cleaned["normalized_sha256"] = normalized_hash(text)
    cleaned["contains_private_data"] = False
    cleaned["contains_cot"] = False
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
