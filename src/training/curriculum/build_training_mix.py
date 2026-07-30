import hashlib
import json
from pathlib import Path


def stable_split(text):
    n = int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:8], 16) % 100
    if n < 80:
        return "train"
    if n < 90:
        return "dev"
    return "heldout"


def normalize_for_dedup(text):
    return " ".join(str(text or "").lower().split())


def make_record(record_id, curriculum, text, language, sources, licenses, **extra):
    rec = {
        "training_record_id": record_id,
        "curriculum": curriculum,
        "text": text,
        "input": extra.pop("input", ""),
        "target": extra.pop("target", ""),
        "evidence": extra.pop("evidence", []),
        "source_dataset_ids": sources,
        "license_names": licenses,
        "license_obligations": extra.pop("license_obligations", []),
        "allowed_to_train": True,
        "allowed_to_train_engineering": extra.pop("allowed_to_train_engineering", True),
        "allowed_to_commit_raw": False,
        "split": stable_split(record_id + text),
        "weight": extra.pop("weight", 1.0),
        "language": language,
        "contains_private_data": False,
        "contains_cot": False,
        "contains_eval_prompt": False,
        "provenance": extra.pop("provenance", {})
    }
    rec.update(extra)
    return rec


def write_splits(rows, out_dir):
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    seen = {}
    split_rows = {"train": [], "dev": [], "heldout": []}
    rejected = []
    for row in rows:
        if row.get("allowed_to_train_engineering") is not True:
            rejected.append({"record_id": row["training_record_id"], "reason": "not_engineering_admitted"})
            continue
        h = hashlib.sha256(normalize_for_dedup(row["text"]).encode("utf-8")).hexdigest()
        if h in seen:
            rejected.append({"record_id": row["training_record_id"], "reason": "dedup", "duplicate_of": seen[h]})
            continue
        seen[h] = row["training_record_id"]
        split_rows[row["split"]].append(row)
    for split, items in split_rows.items():
        with (Path(out_dir) / f"{split}.jsonl").open("w", encoding="utf-8") as handle:
            for row in items:
                handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    return split_rows, rejected
