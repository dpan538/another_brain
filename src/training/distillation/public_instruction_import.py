import hashlib

from src.training.distillation.candidate_queue import make_candidate


def language_of(text):
    zh = sum(1 for ch in str(text) if "\u4e00" <= ch <= "\u9fff")
    if zh > 8:
        return "zh"
    if zh > 0:
        return "mixed"
    return "en"


def candidate_from_public_row(row, index=0):
    text = row.get("text") or ""
    prompt = row.get("prompt") or row.get("instruction") or row.get("question") or ""
    answer = row.get("final_answer") or row.get("answer") or row.get("response") or ""
    if not prompt or not answer:
        parts = [p.strip() for p in str(text).split("\n") if p.strip()]
        if len(parts) >= 2:
            prompt, answer = parts[0], "\n".join(parts[1:3])
    cid_base = f"{row.get('dataset_id','public_instruction')}:{index}:{prompt}:{answer}"
    return make_candidate(
        "r27a4_instruction_" + hashlib.sha256(cid_base.encode("utf-8")).hexdigest()[:16],
        "public_instruction_sample",
        prompt,
        answer,
        source_dataset_id=row.get("dataset_id", ""),
        source_url=row.get("source_url", ""),
        language=language_of(prompt + answer),
        license_names=[row.get("license_name", "")] if row.get("license_name") else [],
        license_obligations=row.get("license_obligations") or [],
        provenance={"upstream_record_id": row.get("upstream_record_id"), "raw_sha256": row.get("raw_sha256")},
    )
