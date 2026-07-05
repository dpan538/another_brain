from __future__ import annotations

from typing import Any

from src.training.model_lab.mini_decoder import build_tiny_gpt

from .checkpoint_loader import load_candidate_state
from .model_config_bridge import infer_config_from_training_state, normalize_model_config, validate_model_config
from .shape_manifest import summarize_tensors


def reconstruct_candidate_model(candidate: dict[str, Any], synthetic_if_missing: bool = True) -> dict[str, Any]:
    state_dict, metadata, blockers = load_candidate_state(candidate, synthetic_if_missing=synthetic_if_missing)
    if not state_dict:
        return {
            "ok": False,
            "candidate_id": candidate.get("candidate_id", ""),
            "source_checkpoint": candidate.get("checkpoint_path", ""),
            "model_config": dict(candidate.get("model_config") or {}),
            "state_loaded": False,
            "state_dict_loaded": False,
            "load_state_dict": "not_attempted",
            "blockers": blockers or ["missing_state_dict"],
        }

    config = infer_config_from_training_state(state_dict, metadata)
    config.update(normalize_model_config(candidate.get("model_config") or {}))
    config = normalize_model_config(config)
    config_failures = validate_model_config(config)
    if config_failures:
        return {
            "ok": False,
            "candidate_id": candidate.get("candidate_id", ""),
            "source_checkpoint": candidate.get("checkpoint_path", ""),
            "model_config": config,
            "state_loaded": True,
            "state_dict_loaded": True,
            "load_state_dict": "not_attempted",
            "blockers": blockers + config_failures,
        }

    try:
        model = build_tiny_gpt(
            int(config["vocab_size"]),
            context_length=int(config["context_length"]),
            n_layer=int(config["n_layer"]),
            n_head=int(config["n_head"]),
            n_embd=int(config["n_embd"]),
            dropout=float(config.get("dropout", 0.0)),
        )
    except Exception as error:
        return {
            "ok": False,
            "candidate_id": candidate.get("candidate_id", ""),
            "source_checkpoint": candidate.get("checkpoint_path", ""),
            "model_config": config,
            "state_loaded": True,
            "state_dict_loaded": True,
            "load_state_dict": "not_attempted",
            "blockers": blockers + [f"model_rebuild_failed:{error}"],
        }

    model_state = model.state_dict()
    shape_mismatches = []
    compatible_state = {}
    for name, value in state_dict.items():
        if name not in model_state:
            shape_mismatches.append(f"unexpected_tensor:{name}")
            continue
        expected_shape = tuple(int(dim) for dim in getattr(model_state[name], "shape", ()))
        actual_shape = tuple(int(dim) for dim in getattr(value, "shape", ()))
        if expected_shape != actual_shape:
            shape_mismatches.append(f"shape_mismatch:{name}:{actual_shape}!={expected_shape}")
            continue
        compatible_state[name] = value

    load_state = "not_loaded"
    if compatible_state and not shape_mismatches:
        try:
            model.load_state_dict(compatible_state, strict=False)
            load_state = "loaded"
        except Exception as error:
            blockers.append(f"state_dict_load_failed:{error}")
    elif shape_mismatches:
        blockers.append("state_dict_shape_mismatch")

    summary = summarize_tensors(state_dict, limit=None)
    return {
        "ok": load_state == "loaded" and not blockers,
        "candidate_id": candidate.get("candidate_id", ""),
        "source_checkpoint": candidate.get("checkpoint_path", ""),
        "source_kind": candidate.get("source_kind", ""),
        "model_config": config,
        "params": summary["params"],
        "tensor_count": summary["tensor_count"],
        "tensors": summary["tensors"],
        "state_loaded": True,
        "state_dict_loaded": load_state == "loaded",
        "load_state_dict": load_state,
        "shape_mismatches": shape_mismatches[:20],
        "product_model": False,
        "browser_admission": False,
        "release_checkpoint": False,
        "blockers": blockers,
    }
