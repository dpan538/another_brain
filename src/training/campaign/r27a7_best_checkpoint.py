def choose_best(stages):
    best_dev = None
    best_product = None
    best_rag = None
    for stage in stages:
        if stage.get("checkpoint_path") and stage.get("dev_loss") is not None:
            if best_dev is None or float(stage["dev_loss"]) < float(best_dev["dev_loss"]):
                best_dev = stage
        if stage.get("checkpoint_path"):
            if best_product is None or float(stage.get("product_probe_score", 0)) > float(best_product.get("product_probe_score", 0)):
                best_product = stage
            if best_rag is None or float(stage.get("rag_honesty_score", 0)) > float(best_rag.get("rag_honesty_score", 0)):
                best_rag = stage
    return {
        "best_dev_loss_checkpoint": (best_dev or {}).get("checkpoint_path", ""),
        "best_product_probe_checkpoint": (best_product or best_dev or {}).get("checkpoint_path", ""),
        "best_rag_honesty_checkpoint": (best_rag or best_dev or {}).get("checkpoint_path", ""),
        "final_checkpoint": stages[-1].get("checkpoint_path") if stages else "",
    }
