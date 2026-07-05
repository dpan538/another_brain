def loss_by_curriculum_placeholder(metrics):
    mix = metrics.get("actual_curriculum_token_mix", {}) or {}
    dev = metrics.get("dev_loss")
    return {k: dev for k in mix}


def stage_loss_summary(stages):
    return {s.get("stage_id", f"stage_{i}"): s.get("dev_loss") for i, s in enumerate(stages)}
