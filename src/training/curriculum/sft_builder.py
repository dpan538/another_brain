import hashlib


def format_sft(prompt, response):
    return f"<|user|>\n{str(prompt).strip()}\n<|assistant|>\n{str(response).strip()}\n<|end|>"


def sft_record(curriculum, prompt, response, idx, language="mixed", source_candidate_id="", source_dataset_ids=None, license_names=None, license_obligations=None):
    rid = hashlib.sha256(f"{curriculum}:{idx}:{prompt}:{response}".encode("utf-8")).hexdigest()[:16]
    return {
        "training_record_id": f"r27a5_{curriculum}_{rid}",
        "record_id": f"r27a5_{curriculum}_{rid}",
        "curriculum": curriculum,
        "prompt": prompt,
        "response": response,
        "text": format_sft(prompt, response),
        "language": language,
        "source_candidate_id": source_candidate_id,
        "source_row_id": "",
        "source_dataset_ids": source_dataset_ids or [],
        "license_names": license_names or [],
        "license_obligations": license_obligations or [],
        "allowed_to_train_engineering": True,
        "allowed_to_commit_raw": False,
        "contains_private_data": False,
        "contains_cot": False,
        "contains_hidden_prompt": False,
        "contains_eval_prompt": False,
        "contains_old_excluded_row": False,
        "split": "train",
        "weight": 1.0,
        "provenance": {"phase": "R27A5", "engineering_only": True},
    }
