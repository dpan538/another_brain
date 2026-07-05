def estimate_params(vocab_size, context_length, n_layer, n_embd):
    token = vocab_size * n_embd
    pos = context_length * n_embd
    per_layer = 4 * n_embd * n_embd + 8 * n_embd * n_embd + 4 * n_embd
    head = n_embd * vocab_size
    return int(token + pos + n_layer * per_layer + head)


MODEL_LADDER = {
    "tiny_debug": {"context_length": 256, "n_layer": 4, "n_head": 4, "n_embd": 256, "dropout": 0.05, "smoke_only": True},
    "mini_8m": {"context_length": 256, "n_layer": 3, "n_head": 4, "n_embd": 192, "dropout": 0.05, "cpu_fallback": True},
    "mini_12m": {"context_length": 512, "n_layer": 6, "n_head": 6, "n_embd": 384, "dropout": 0.05},
    "mini_30m": {"context_length": 512, "n_layer": 8, "n_head": 8, "n_embd": 512, "dropout": 0.05, "requires_accelerator": True},
}


def choose_model(size, device, vocab_size, requested_context=512):
    if size == "auto":
        size = "mini_12m" if device in {"mps", "cuda"} else "mini_8m"
    cfg = dict(MODEL_LADDER[size])
    cfg["model_size"] = size
    cfg["context_length"] = min(int(requested_context), int(cfg["context_length"]))
    cfg["vocab_size"] = int(vocab_size)
    cfg["estimated_params"] = estimate_params(int(vocab_size), cfg["context_length"], cfg["n_layer"], cfg["n_embd"])
    return cfg


def browser_size_estimates(param_count, tokenizer_bytes=0):
    return {
        "fp32_bytes": int(param_count * 4 + tokenizer_bytes),
        "fp16_bytes": int(param_count * 2 + tokenizer_bytes),
        "int8_bytes": int(param_count + tokenizer_bytes),
        "int4_bytes": int(param_count * 0.5 + tokenizer_bytes),
    }
