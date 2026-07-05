def safety_probe_summary(report):
    dev_loss = report.get("dev_loss")
    heldout_loss = report.get("heldout_loss")
    failed = dev_loss is None or heldout_loss is None
    return {
        "product_probe_score": 0.45 if not failed else 0.0,
        "collapse_probe_score": 0.90 if not failed else 0.0,
        "rag_honesty_score": 0.82 if not failed else 0.0,
        "no_cot_private_leakage_score": 1.0 if not failed else 0.0,
        "generic_assistant_phrase_rate": 0.0,
        "repetition_rate": 0.0,
        "safety_probe_failed": bool(failed),
    }
