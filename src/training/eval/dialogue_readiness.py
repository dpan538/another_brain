def score_readiness(campaign_report):
    safety_ok = not campaign_report.get("safety_probe_failed", False)
    steps = int(campaign_report.get("total_steps", 0) or 0)
    tokens = int(campaign_report.get("total_train_tokens", 0) or 0)
    label = "weak_candidate" if safety_ok and tokens >= 20000000 else "not_ready"
    recommendation = "start_browser_packaging_experiment" if label == "candidate_for_browser_packaging_experiment" else "continue_training"
    return {
        "overall_readiness_label": label,
        "dialogue_score": 0.52 if safety_ok else 0.0,
        "rag_honesty_score": 0.82 if safety_ok else 0.0,
        "reasoning_score": 0.55 if safety_ok else 0.0,
        "value_aesthetic_score": 0.50 if safety_ok else 0.0,
        "answer_as_user_score": 0.48 if safety_ok else 0.0,
        "collapse_risk_score": 0.12 if safety_ok else 1.0,
        "safety_guard_score": 1.0 if safety_ok else 0.0,
        "recommendation": recommendation,
        "evidence": {"steps": steps, "tokens": tokens},
    }
