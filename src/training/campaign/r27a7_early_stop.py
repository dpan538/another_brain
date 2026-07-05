def should_stop(ledger, candidate_report):
    dev = candidate_report.get("dev_loss")
    if dev != dev:
        return True, "nan_dev_loss"
    if candidate_report.get("safety_probe_failed"):
        return True, "safety_probe_failed"
    if candidate_report.get("mps_oom_repeated"):
        return True, "mps_oom_repeated"
    stages = ledger.get("stages", [])
    recent = [s for s in stages[-3:] if s.get("dev_loss") is not None]
    if len(recent) >= 3 and all(float(s["dev_loss"]) <= float(dev or 999) for s in recent):
        return True, "dev_loss_no_improvement_three_segments"
    if len(stages) >= 2 and dev is not None:
        best = min(float(s["dev_loss"]) for s in stages if s.get("dev_loss") is not None)
        if float(dev) > best * 1.35:
            return True, "dev_loss_exploded_vs_best"
    if float(candidate_report.get("rag_honesty_score", 1.0)) < 0.5:
        return True, "rag_honesty_worsened_sharply"
    return False, ""
