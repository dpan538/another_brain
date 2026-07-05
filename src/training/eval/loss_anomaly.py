def classify_dev_heldout_anomaly(metrics, split_audit):
    dev = metrics.get("dev_loss")
    heldout = metrics.get("heldout_loss")
    flags = []
    proceed = True
    explanation = []
    if dev is None or heldout is None:
        return {"proceed": False, "classification": ["possible_eval_bug"], "explanation": ["missing dev or heldout loss"]}
    gap = float(dev) - float(heldout)
    if split_audit.get("duplicates", {}).get("cross_split_duplicate_count", 0) > 0:
        flags.append("possible_leakage")
        proceed = False
    dev_summary = split_audit["splits"]["dev"]
    heldout_summary = split_audit["splits"]["heldout"]
    dev_mean = dev_summary["token_length"]["mean"]
    heldout_mean = heldout_summary["token_length"]["mean"]
    if gap > 1.0:
        if dev_mean > heldout_mean * 1.5:
            flags.extend(["benign_split_composition", "possible_length_bias"])
            explanation.append("dev rows are much longer on average than heldout rows")
        dev_sources = dev_summary.get("source_dataset_counts", {})
        heldout_sources = heldout_summary.get("source_dataset_counts", {})
        if dev_sources != heldout_sources:
            flags.append("possible_curriculum_mismatch")
            explanation.append("source/curriculum distribution differs between dev and heldout")
        if not flags:
            flags.append("possible_eval_bug")
            proceed = False
    if not flags:
        flags.append("no_issue_found")
        explanation.append("dev and heldout losses do not show a large unexplained gap")
    if "possible_eval_bug" in flags and "benign_split_composition" not in flags:
        proceed = False
    return {"proceed": proceed, "classification": sorted(set(flags)), "dev_minus_heldout_loss": gap, "explanation": explanation}
