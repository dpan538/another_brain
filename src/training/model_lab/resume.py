from pathlib import Path

from src.training.model_lab.mini_decoder import build_tiny_gpt


def load_resumable_tiny_gpt(checkpoint_path, vocab_size, device):
    import torch

    payload = torch.load(Path(checkpoint_path), map_location=device)
    config = dict(payload.get("config") or {})
    if int(config.get("vocab_size", 0)) != int(vocab_size):
        raise ValueError("resume_vocab_size_mismatch")
    model = build_tiny_gpt(
        vocab_size,
        context_length=int(config["context_length"]),
        n_layer=int(config["n_layer"]),
        n_head=int(config["n_head"]),
        n_embd=int(config["n_embd"]),
        dropout=float(config.get("dropout", 0.05)),
    ).to(device)
    model.load_state_dict(payload["model_state_dict"])
    return model, config
