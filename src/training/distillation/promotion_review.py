import re
from src.training.distillation.style_filter import style_rejection_reason


FORBIDDEN_RE = re.compile(
    r"chain[-_ ]?of[-_ ]?thought|scratchpad|hidden prompt|system prompt|private_sources/|BEGIN PRIVATE KEY|api[_-]?key|secret|evals/|eval prompt",
    re.I,
)
OLD_ROW_RE = re.compile(r"another_brain_question_pack_001.*(?:5[1-9]|[6-9][0-9]|100)", re.I | re.S)


def review_candidate(candidate):
    text = f"{candidate.get('prompt','')}\n{candidate.get('final_answer','')}"
    reasons = []
    if not candidate.get("prompt") or not candidate.get("final_answer"):
        reasons.append("missing_prompt_or_answer")
    if FORBIDDEN_RE.search(text):
        reasons.append("forbidden_cot_hidden_private_eval_or_secret")
    if OLD_ROW_RE.search(text):
        reasons.append("old_excluded_question_pack_row")
    style_reason = style_rejection_reason(candidate.get("final_answer", ""))
    if style_reason:
        reasons.append(style_reason)
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
    out["promotion_reason"] = "passed_r27a_filters_engineering_only"
    return out
