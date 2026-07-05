import hashlib
import statistics
from collections import Counter, defaultdict

from src.training.curriculum.token_budget import record_tokens
from src.training.distillation.candidate_queue import read_jsonl


def normalized_text(row):
    text = str(row.get("text") or row.get("target_answer") or row.get("response") or "")
    return " ".join(text.lower().split())


def row_length(row):
    return len(str(row.get("text") or ""))


def quantile(values, q):
    if not values:
        return 0
    values = sorted(values)
    idx = min(len(values) - 1, max(0, int(round((len(values) - 1) * q))))
    return values[idx]


def summarize_split(path):
    rows = read_jsonl(path)
    lengths = [row_length(r) for r in rows]
    tokens = [record_tokens(r) for r in rows]
    curricula = Counter(r.get("curriculum", "unknown") for r in rows)
    languages = Counter(r.get("language", "unknown") for r in rows)
    sources = Counter(r.get("source_dataset_id") or ",".join(r.get("source_dataset_ids", []) or []) or "unknown" for r in rows)
    return {
        "path": str(path),
        "rows": len(rows),
        "tokens_estimate": sum(tokens),
        "curriculum_counts": dict(curricula),
        "language_counts": dict(languages),
        "source_dataset_counts": dict(sources),
        "length": {
            "mean": statistics.mean(lengths) if lengths else 0,
            "median": statistics.median(lengths) if lengths else 0,
            "p90": quantile(lengths, 0.90),
            "p95": quantile(lengths, 0.95),
            "max": max(lengths) if lengths else 0,
        },
        "token_length": {
            "mean": statistics.mean(tokens) if tokens else 0,
            "median": statistics.median(tokens) if tokens else 0,
            "p90": quantile(tokens, 0.90),
            "p95": quantile(tokens, 0.95),
            "max": max(tokens) if tokens else 0,
        },
    }


def duplicate_report(split_paths):
    seen = defaultdict(list)
    for split, path in split_paths.items():
        for row in read_jsonl(path):
            norm = normalized_text(row)
            if norm:
                seen[hashlib.sha256(norm.encode("utf-8")).hexdigest()].append(split)
    cross = {k: v for k, v in seen.items() if len(set(v)) > 1}
    return {"cross_split_duplicate_count": len(cross), "duplicate_split_examples": list(cross.values())[:20]}


def audit_splits(train_path, dev_path, heldout_path):
    paths = {"train": train_path, "dev": dev_path, "heldout": heldout_path}
    summaries = {name: summarize_split(path) for name, path in paths.items()}
    return {"splits": summaries, "duplicates": duplicate_report(paths)}
