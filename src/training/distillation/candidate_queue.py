import json
import time
from pathlib import Path


def now_utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def write_jsonl(path, rows):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def read_jsonl(path):
    path = Path(path)
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").split("\n") if line.strip()]


def make_candidate(candidate_id, candidate_type, prompt, final_answer, source_dataset_id="", source_url="", language="mixed", license_names=None, license_obligations=None, provenance=None):
    return {
        "candidate_id": candidate_id,
        "candidate_type": candidate_type,
        "source_dataset_id": source_dataset_id,
        "source_url": source_url,
        "teacher_name": "",
        "teacher_runtime_dependency": False,
        "prompt": str(prompt or "").strip(),
        "final_answer": str(final_answer or "").strip(),
        "language": language,
        "contains_private_data": False,
        "contains_cot": False,
        "contains_hidden_prompt": False,
        "contains_eval_prompt": False,
        "contains_old_excluded_row": False,
        "review_status": "pending",
        "training_allowed": False,
        "promotion_reason": "",
        "license_names": license_names or [],
        "license_obligations": license_obligations or [],
        "created_at_utc": now_utc(),
        "provenance": provenance or {},
    }
