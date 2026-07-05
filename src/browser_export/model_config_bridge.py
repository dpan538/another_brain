from __future__ import annotations

from typing import Any

from src.training.model_lab.model_ladder import estimate_params


REQUIRED_CONFIG_KEYS = ("vocab_size", "context_length", "n_layer", "n_head", "n_embd")


def infer_config_from_training_state(state_dict: dict[str, Any], metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    metadata = dict(metadata or {})
    config = dict(metadata.get("config") or metadata.get("model_config") or metadata)

    token_shape = tuple(int(dim) for dim in getattr(state_dict.get("token_emb.weight"), "shape", ()))
    pos_shape = tuple(int(dim) for dim in getattr(state_dict.get("pos_emb.weight"), "shape", ()))
    if len(token_shape) == 2:
        config.setdefault("vocab_size", token_shape[0])
        config.setdefault("n_embd", token_shape[1])
    if len(pos_shape) == 2:
        config.setdefault("context_length", pos_shape[0])
        config.setdefault("n_embd", pos_shape[1])

    block_indexes = set()
    for name in state_dict:
        parts = name.split(".")
        if len(parts) > 2 and parts[0] == "blocks" and parts[1].isdigit():
            block_indexes.add(int(parts[1]))
    if block_indexes:
        config.setdefault("n_layer", max(block_indexes) + 1)

    if "n_head" not in config and int(config.get("n_embd", 0) or 0) % 4 == 0:
        config["n_head"] = 4
    config.setdefault("dropout", 0.0)
    config.setdefault("model_size", "checkpoint_inferred")
    return normalize_model_config(config)


def normalize_model_config(config: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(config or {})
    for key in REQUIRED_CONFIG_KEYS:
        if key in normalized and normalized[key] not in ("", None):
            normalized[key] = int(normalized[key])
    if "dropout" in normalized and normalized["dropout"] not in ("", None):
        normalized["dropout"] = float(normalized["dropout"])
    if all(key in normalized for key in REQUIRED_CONFIG_KEYS):
        normalized["estimated_params"] = estimate_params(
            normalized["vocab_size"],
            normalized["context_length"],
            normalized["n_layer"],
            normalized["n_embd"],
        )
    return normalized


def validate_model_config(config: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    for key in REQUIRED_CONFIG_KEYS:
        if key not in config:
            failures.append(f"missing_config:{key}")
            continue
        try:
            value = int(config[key])
        except Exception:
            failures.append(f"non_integer_config:{key}")
            continue
        if value <= 0:
            failures.append(f"non_positive_config:{key}")
    if not failures and int(config["n_embd"]) % int(config["n_head"]) != 0:
        failures.append("n_embd_must_be_divisible_by_n_head")
    return failures
