def loss_by_curriculum_placeholder(metrics):
    mix = metrics.get("actual_curriculum_token_mix", {})
    loss = metrics.get("dev_loss")
    return {k: loss for k, v in mix.items() if v > 0}
