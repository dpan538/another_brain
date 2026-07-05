def should_stop(ledger, candidate_report):
    if candidate_report.get("dev_loss") != candidate_report.get("dev_loss"):
        return True, "nan_dev_loss"
    stages = ledger.get("stages", [])
    recent = stages[-3:]
    if len(recent) == 3 and all(float(s.get("dev_loss", 0) or 0) <= float(candidate_report.get("dev_loss", 0) or 0) for s in recent):
        return True, "dev_loss_no_improvement_three_segments"
    if candidate_report.get("safety_probe_failed"):
        return True, "safety_probe_failed"
    return False, ""
