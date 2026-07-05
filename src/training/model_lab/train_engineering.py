from src.training.model_lab.mini_decoder import BigramEngineeringDecoder


def train_bigram_decoder(tokenized_sequences, vocab_size, max_steps=100):
    model = BigramEngineeringDecoder(vocab_size)
    if not tokenized_sequences:
        raise ValueError("no_training_sequences")
    start_loss = model.loss(tokenized_sequences)
    steps = 0
    for seq in tokenized_sequences:
        model.update(seq)
        steps += 1
        if steps >= max_steps:
            break
    end_loss = model.loss(tokenized_sequences)
    return model, {"steps": steps, "train_loss_start": start_loss, "train_loss_end": end_loss}


def train_tiny_gpt(token_stream, dev_stream, heldout_stream, vocab_size, config, device, resume_checkpoint=None):
    import math
    import random
    import torch

    from src.training.model_lab.mini_decoder import build_tiny_gpt

    context_length = int(config["context_length"])
    batch_size = int(config.get("batch_size", 8))
    max_steps = int(config["max_steps"])
    if len(token_stream) <= context_length + 2:
        raise ValueError("not_enough_train_tokens")
    if resume_checkpoint:
        from src.training.model_lab.resume import load_resumable_tiny_gpt

        model, resume_config = load_resumable_tiny_gpt(resume_checkpoint, vocab_size, device)
        for key in ["context_length", "n_layer", "n_head", "n_embd"]:
            if int(resume_config[key]) != int(config[key]):
                raise ValueError(f"resume_config_mismatch_{key}")
    else:
        model = build_tiny_gpt(
            vocab_size,
            context_length=context_length,
            n_layer=int(config["n_layer"]),
            n_head=int(config["n_head"]),
            n_embd=int(config["n_embd"]),
            dropout=float(config.get("dropout", 0.05)),
        ).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=float(config.get("learning_rate", 0.0008)))
    train_tensor = torch.tensor(token_stream, dtype=torch.long, device=device)

    def batch():
        max_start = max(1, len(train_tensor) - context_length - 1)
        starts = torch.randint(0, max_start, (batch_size,), device=device)
        x = torch.stack([train_tensor[s:s + context_length] for s in starts])
        y = torch.stack([train_tensor[s + 1:s + context_length + 1] for s in starts])
        return x, y

    @torch.no_grad()
    def eval_loss(tokens):
        if len(tokens) <= context_length + 1:
            return None
        model.eval()
        losses = []
        tensor = torch.tensor(tokens[: min(len(tokens), context_length * 16)], dtype=torch.long, device=device)
        for start in range(0, max(1, len(tensor) - context_length - 1), context_length):
            chunk = tensor[start:start + context_length + 1]
            if len(chunk) <= 2:
                continue
            _, loss = model(chunk[:-1][None, :], chunk[1:][None, :])
            losses.append(float(loss.item()))
        model.train()
        return sum(losses) / max(1, len(losses))

    x0, y0 = batch()
    with torch.no_grad():
        _, loss0 = model(x0, y0)
        train_loss_start = float(loss0.item())
    losses = []
    for step in range(1, max_steps + 1):
        x, y = batch()
        _, loss = model(x, y)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if step == 1 or step % 50 == 0 or step == max_steps:
            losses.append({"step": step, "train_loss": float(loss.item())})
    train_loss_end = losses[-1]["train_loss"]
    dev_loss = eval_loss(dev_stream)
    heldout_loss = eval_loss(heldout_stream)
    return model, {
        "steps": max_steps,
        "train_loss_start": train_loss_start,
        "train_loss_end": train_loss_end,
        "dev_loss": dev_loss,
        "heldout_loss": heldout_loss,
        "dev_perplexity": math.exp(dev_loss) if dev_loss is not None and dev_loss < 20 else None,
        "heldout_perplexity": math.exp(heldout_loss) if heldout_loss is not None and heldout_loss < 20 else None,
        "loss_log": losses,
    }
