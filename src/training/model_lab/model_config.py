DEFAULT_CONFIG = {
    "model_type": "from_scratch_engineering_char_decoder",
    "product_model": False,
    "phase_4": False,
    "release_checkpoint": False,
    "context_length": 256,
    "n_layer": 2,
    "n_head": 4,
    "n_embd": 128,
    "dropout": 0.0,
    "max_steps": 100,
    "batch_size": 4,
    "max_train_tokens": 250000,
    "learning_rate": 0.05,
}


R27A3_DEFAULT_CONFIG = {
    "model_type": "from_scratch_tiny_gpt_decoder",
    "product_model": False,
    "phase_4": False,
    "release_checkpoint": False,
    "context_length": 512,
    "cpu_context_length": 256,
    "n_layer": 4,
    "cpu_n_layer": 3,
    "n_head": 4,
    "n_embd": 256,
    "cpu_n_embd": 192,
    "dropout": 0.05,
    "max_steps": 1000,
    "cpu_max_steps": 500,
    "batch_size": 8,
    "max_train_tokens": 2000000,
    "learning_rate": 0.0008,
}


def estimate_transformer_params(vocab_size, n_layer, n_embd, context_length):
    vocab_size = int(vocab_size)
    n_layer = int(n_layer)
    n_embd = int(n_embd)
    context_length = int(context_length)
    embeddings = vocab_size * n_embd + context_length * n_embd
    per_layer = 4 * n_embd * n_embd + 2 * 4 * n_embd * n_embd + 4 * n_embd
    head = n_embd * vocab_size
    return int(embeddings + n_layer * per_layer + head)
