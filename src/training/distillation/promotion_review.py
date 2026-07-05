import re


FORBIDDEN_RE = re.compile(
    r"chain[-_ ]?of[-_ ]?thought|scratchpad|hidden prompt|system prompt|private_sources/|BEGIN PRIVATE KEY|api[_-]?key|secret|evals/|eval prompt",
    re.I,
)
OLD_ROW_RE = re.compile(r"another_brain_question_pack_001.*(?:5[1-9]|[6-9][0-9]|100)", re.I | re.S)
GENERIC_RE = re.compile(r"as an ai language model|how can i assist|customer support|i'm here to help", re.I)


def review_candidate(candidate):
    text = f"{candidate.get('prompt','')}\n{candidate.get('final_answer','')}"
    reasons = []
    if not candidate.get("prompt") or not candidate.get("final_answer"):
        reasons.append("missing_prompt_or_answer")
    if FORBIDDEN_RE.search(text):
        reasons.append("forbidden_cot_hidden_private_eval_or_secret")
    if OLD_ROW_RE.search(text):
        reasons.append("old_excluded_question_pack_row")
    if GENERIC_RE.search(candidate.get("final_answer", "")):
        reasons.append("generic_assistant_style")
    if not candidate.get("license_names"):
        reasons.append("missing_license")
    if reasons:
        out = dict(candidate)
        out["review_status"] = "rejected"
        out["training_allowed"] = False
        out["promotion_reason"] = ",".join(reasons)
        return out
    out = dict(candidate)
    out["review_status"] = "promoted_for_engineering"
    out["training_allowed"] = True
    out["promotion_reason"] = "passed_r27a4_filters_engineering_only"
    return out
