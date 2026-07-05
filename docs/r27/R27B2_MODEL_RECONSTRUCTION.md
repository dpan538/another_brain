# R27B2 Model Reconstruction

R27B2 reconstructs the same local `build_tiny_gpt` mini decoder used by A-line model lab code. It reads checkpoint config or infers shape metadata from the state dict, validates `vocab_size`, `context_length`, `n_layer`, `n_head`, and `n_embd`, and loads matching tensors on CPU only.

If checkpoint loading, config validation, or tensor shape matching fails, the bridge reports a blocker and can fall back to a synthetic tiny model for interface smoke tests.

This is not pretrained-weight acquisition, model training, product admission, browser admission, or release checkpoint selection.
