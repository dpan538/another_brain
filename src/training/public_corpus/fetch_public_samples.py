import hashlib
import json
import time
from pathlib import Path

import requests

from src.training.public_corpus.license_admission import SOURCE_SPECS


USER_AGENT = "another-brain-r27a3/1.0 engineering-only"


def now_utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def sha256_text(text):
    return hashlib.sha256(str(text or "").encode("utf-8")).hexdigest()


def raw_record(dataset_id, source_url, text, license_name, obligations, language_hint, upstream_record_id="", original_metadata=None):
    return {
        "record_id": f"{dataset_id}_{sha256_text(source_url + upstream_record_id + text)[:16]}",
        "dataset_id": dataset_id,
        "source_url": source_url,
        "upstream_record_id": upstream_record_id,
        "license_name": license_name,
        "license_obligations": obligations,
        "language_hint": language_hint,
        "text": text,
        "retrieved_at_utc": now_utc(),
        "raw_sha256": sha256_text(text),
        "original_metadata": original_metadata or {},
    }


def fetch_hf_metadata(dataset_id, timeout=20):
    spec = SOURCE_SPECS[dataset_id]
    response = requests.get(spec["metadata_source_url"], timeout=timeout, headers={"User-Agent": USER_AGENT})
    response.raise_for_status()
    return response.content, response.json()


def fetch_wikipedia_zh(decision, max_rows, max_bytes):
    rows = []
    bytes_seen = 0
    api = SOURCE_SPECS["wikipedia_zh"]["api_url"]
    while len(rows) < max_rows and bytes_seen < max_bytes:
        params = {
            "action": "query",
            "generator": "random",
            "grnnamespace": 0,
            "grnlimit": min(50, max_rows - len(rows)),
            "prop": "extracts|info",
            "explaintext": 1,
            "inprop": "url",
            "format": "json",
        }
        response = requests.get(api, params=params, timeout=25, headers={"User-Agent": USER_AGENT})
        response.raise_for_status()
        data = response.json()
        pages = (data.get("query") or {}).get("pages") or {}
        for page in pages.values():
            text = page.get("extract") or ""
            url = page.get("fullurl") or f"https://zh.wikipedia.org/?curid={page.get('pageid')}"
            if not text.strip():
                continue
            encoded_len = len(text.encode("utf-8"))
            if bytes_seen + encoded_len > max_bytes:
                return rows
            rows.append(raw_record(
                "wikipedia_zh",
                url,
                text,
                decision["license_name"],
                decision["license_obligations"],
                "zh",
                upstream_record_id=str(page.get("pageid") or page.get("title") or ""),
                original_metadata={"title": page.get("title"), "pageid": page.get("pageid")},
            ))
            bytes_seen += encoded_len
            if len(rows) >= max_rows:
                break
    return rows


def fetch_hf_streaming(dataset_id, decision, max_rows, max_bytes):
    try:
        from datasets import load_dataset
    except Exception as exc:
        return [], {"status": "blocked_dependency_missing", "error": repr(exc)}
    spec = SOURCE_SPECS[dataset_id]
    kwargs = {"split": "train", "streaming": True, "trust_remote_code": False}
    if spec.get("hf_config"):
        iterator = load_dataset(spec["hf_dataset"], spec["hf_config"], **kwargs)
    else:
        iterator = load_dataset(spec["hf_dataset"], **kwargs)
    rows = []
    bytes_seen = 0
    for item in iterator:
        text = item.get("text") or item.get("content") or item.get("response") or ""
        if isinstance(text, list):
            text = "\n".join(str(x) for x in text)
        if not str(text).strip():
            continue
        encoded_len = len(str(text).encode("utf-8"))
        if bytes_seen + encoded_len > max_bytes:
            break
        rows.append(raw_record(
            dataset_id,
            item.get("url") or spec["upstream_url"],
            str(text),
            decision["license_name"],
            decision["license_obligations"],
            spec.get("primary_language", "mixed"),
            upstream_record_id=str(item.get("id") or item.get("sha256") or len(rows)),
            original_metadata={k: v for k, v in item.items() if k != "text"},
        ))
        bytes_seen += encoded_len
        if len(rows) >= max_rows:
            break
    return rows, {"status": "sample_fetched", "rows": len(rows), "bytes": bytes_seen}


def write_jsonl(path, rows):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with Path(path).open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
