def choose_best(stages):
    best_dev = None
    for stage in stages:
        if stage.get("checkpoint_path") and stage.get("dev_loss") is not None:
            if best_dev is None or float(stage["dev_loss"]) < float(best_dev["dev_loss"]):
                best_dev = stage
    best_probe = None
    for stage in stages:
        score = float(stage.get("product_probe_score", 0))
        if best_probe is None or score > float(best_probe.get("product_probe_score", 0)):
            best_probe = stage
    return {
        "best_dev_loss_checkpoint": best_dev.get("checkpoint_path") if best_dev else "",
        "best_product_probe_checkpoint": (best_probe or best_dev or {}).get("checkpoint_path", ""),
        "best_rag_honesty_checkpoint": (best_probe or best_dev or {}).get("checkpoint_path", ""),
        "final_checkpoint": stages[-1].get("checkpoint_path") if stages else "",
    }
