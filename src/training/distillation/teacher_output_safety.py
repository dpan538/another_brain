def reject_teacher_output(text):
    lowered = str(text or "").lower()
    if "chain-of-thought" in lowered or "hidden reasoning" in lowered:
        return "cot_or_hidden_reasoning"
    if "private_sources/" in lowered or "evals/" in lowered:
        return "private_or_eval_leakage"
    return ""
