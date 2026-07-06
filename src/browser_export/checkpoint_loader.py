from __future__ import annotations

from pathlib import Path
from typing import Any

from .candidate_discovery import ROOT, resolve_repo_path


def synthetic_state_dict_for_config(config: dict[str, Any] | None = None) -> dict[str, Any]:
    try:
        import torch
    except Exception:
        return {}
    cfg = {
        "vocab_size": 32,
        "context_length": 16,
        "n_layer": 1,
        "n_embd": 16,
        **(config or {}),
    }
    return {
        "token_emb.weight": torch.zeros((int(cfg["vocab_size"]), int(cfg["n_embd"]))),
        "pos_emb.weight": torch.zeros((int(cfg["context_length"]), int(cfg["n_embd"]))),
        "blocks.0.ln1.weight": torch.ones((int(cfg["n_embd"]),)),
        "blocks.0.ln1.bias": torch.zeros((int(cfg["n_embd"]),)),
        "lm_head.weight": torch.zeros((int(cfg["vocab_size"]), int(cfg["n_embd"]))),
    }


def _extract_state_dict(payload: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    if isinstance(payload, dict):
        metadata: dict[str, Any] = {}
        for key in ("model_config", "config", "hparams", "meta"):
            if isinstance(payload.get(key), dict):
                metadata.update(payload[key])
        for key in ("model_state_dict", "state_dict", "model"):
            if isinstance(payload.get(key), dict):
                return payload[key], metadata
        tensor_like = {key: value for key, value in payload.items() if hasattr(value, "shape")}
        if tensor_like:
            return tensor_like, metadata
    raise RuntimeError("unsupported_checkpoint_structure")


def load_checkpoint_state(checkpoint_path: str | Path) -> tuple[dict[str, Any], dict[str, Any]]:
    path = resolve_repo_path(str(checkpoint_path))
    if path is None:
        raise RuntimeError("checkpoint_path_outside_repo")
    if not path.exists():
        raise FileNotFoundError(path)
    if path.suffix == ".safetensors":
        raise RuntimeError("safetensors_checkpoint_requires_optional_dependency")
    if not str(path.resolve()).startswith(str((ROOT / "artifacts").resolve())):
        raise RuntimeError("checkpoint_must_be_ignored_artifact_path")
    import torch

    payload = torch.load(path, map_location="cpu")
    return _extract_state_dict(payload)


def load_candidate_state(candidate: dict[str, Any], synthetic_if_missing: bool = True) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    blockers: list[str] = []
    checkpoint_path = candidate.get("checkpoint_path") or ""
    if checkpoint_path:
        try:
            state_dict, metadata = load_checkpoint_state(checkpoint_path)
            metadata.update(candidate.get("model_config") or {})
            return state_dict, metadata, blockers
        except Exception as error:
            blockers.append(f"checkpoint_load_failed:{error}")
            if not synthetic_if_missing:
                return {}, dict(candidate.get("model_config") or {}), blockers
    if synthetic_if_missing:
        config = dict(candidate.get("model_config") or {})
        return synthetic_state_dict_for_config(config), config, blockers + ["synthetic_state_used"]
    return {}, dict(candidate.get("model_config") or {}), blockers + ["no_checkpoint_state_loaded"]
