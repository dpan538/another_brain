from __future__ import annotations

from src.training.model_lab.model_ladder import estimate_params


VOCAB_SIZE = 16000
CONTEXT_LENGTH = 256

CANDIDATES = {
    "new_60m": {"model_size": "r27a11_60m", "context_length": 256, "n_layer": 6, "n_head": 8, "n_embd": 704},
    "new_80m": {"model_size": "r27a11_80m", "context_length": 256, "n_layer": 8, "n_head": 12, "n_embd": 768},
    "new_90m": {"model_size": "r27a11_90m", "context_length": 256, "n_layer": 9, "n_head": 12, "n_embd": 768},
    "new_96m": {"model_size": "r27a11_96m", "context_length": 256, "n_layer": 7, "n_head": 14, "n_embd": 896},
    "new_100m_research": {"model_size": "r27a11_100m_research", "context_length": 256, "n_layer": 8, "n_head": 14, "n_embd": 896},
    "new_125m_estimate": {"estimate_only": True, "params": 125_000_000},
    "new_150m_estimate": {"estimate_only": True, "params": 150_000_000},
    "100m_q3_research_estimate": {"estimate_only": True, "params": 106_000_384},
    "continue_a8b_100m_research_only": {"estimate_only": True, "params": 106_000_384},
}


def params_for_r27a11(candidate: str) -> int:
    spec = CANDIDATES[candidate]
    if spec.get("estimate_only"):
        return int(spec["params"])
    return estimate_params(VOCAB_SIZE, int(spec["context_length"]), int(spec["n_layer"]), int(spec["n_embd"]))


def trainable_candidates() -> set[str]:
    return {name for name, spec in CANDIDATES.items() if not spec.get("estimate_only")}
