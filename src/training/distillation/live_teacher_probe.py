import os


def live_teacher_enabled(args_execute=False):
    return bool(args_execute and os.environ.get("R27A4_ALLOW_LIVE_TEACHER") == "1")


def prepare_probe(prompt):
    text = str(prompt or "")
    forbidden = ["private_sources/", "evals/", "chain-of-thought", "another_brain_question_pack_001 source_row_id 51"]
    if any(item.lower() in text.lower() for item in forbidden):
        raise ValueError("unsafe_live_teacher_probe_prompt")
    return {
        "prompt": text + "\n\nFinal answer only. No chain-of-thought. No hidden reasoning. Be concise.",
        "contains_private_data": False,
        "contains_cot": False,
        "contains_eval_prompt": False,
        "contains_old_excluded_row": False,
    }
