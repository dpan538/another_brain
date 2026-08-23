"""Pure-stdlib architecture accounting for ``efish-personal-judge-v1``.

This module is a specification and measurement aid, not an inference or
training implementation.  It deliberately constructs the tensor inventory
rather than relying on the approximate parameter formula used by early model
planning documents.  The inventory mirrors the audited R28M1/R3 dimensions
while removing the natural-language LM head and adding only low-entropy
classification heads.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import prod
from typing import Any, Iterable, Mapping


@dataclass(frozen=True)
class TensorSpec:
    """A learned tensor used for exact parameter and storage accounting."""

    name: str
    shape: tuple[int, ...]

    @property
    def parameters(self) -> int:
        return prod(self.shape)

    @property
    def q4_bytes(self) -> int:
        # R28M1 uses two signed-offset int4 values per byte, padding the final
        # high nibble for odd tensor sizes.  Scales live in model metadata.
        return (self.parameters + 1) // 2

    @property
    def fp16_bytes(self) -> int:
        return self.parameters * 2


def _positive_int(value: Any, name: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise ValueError(f"{name}_must_be_positive_integer")
    return value


def dimensions(contract: Mapping[str, Any]) -> dict[str, int]:
    shared = contract["shared_dimensions"]
    result = {
        name: _positive_int(shared[name], name)
        for name in (
            "vocab_size",
            "context_length",
            "normal_target_tokens",
            "reserved_tokens",
            "n_layer",
            "hidden_size",
            "n_head",
            "mlp_size",
        )
    }
    if result["hidden_size"] % result["n_head"]:
        raise ValueError("hidden_size_not_divisible_by_n_head")
    if result["context_length"] != 512:
        raise ValueError("r30j0_context_length_must_be_512")
    if result["normal_target_tokens"] + result["reserved_tokens"] != result["context_length"]:
        raise ValueError("normal_target_and_reserve_must_fill_context")
    return result


def backbone_tensors(contract: Mapping[str, Any], *, context_length: int | None = None) -> tuple[TensorSpec, ...]:
    """Return learned backbone tensors; causal masks are procedural, not parameters."""

    dims = dimensions(contract)
    vocab, context = dims["vocab_size"], context_length or dims["context_length"]
    layers, hidden, mlp = dims["n_layer"], dims["hidden_size"], dims["mlp_size"]
    tensors: list[TensorSpec] = [
        TensorSpec("token_emb.weight", (vocab, hidden)),
        TensorSpec("pos_emb.weight", (context, hidden)),
    ]
    for layer in range(layers):
        prefix = f"blocks.{layer}"
        tensors.extend(
            (
                TensorSpec(f"{prefix}.ln1.weight", (hidden,)),
                TensorSpec(f"{prefix}.ln1.bias", (hidden,)),
                TensorSpec(f"{prefix}.attn.in_proj_weight", (3 * hidden, hidden)),
                TensorSpec(f"{prefix}.attn.in_proj_bias", (3 * hidden,)),
                TensorSpec(f"{prefix}.attn.out_proj.weight", (hidden, hidden)),
                TensorSpec(f"{prefix}.attn.out_proj.bias", (hidden,)),
                TensorSpec(f"{prefix}.ln2.weight", (hidden,)),
                TensorSpec(f"{prefix}.ln2.bias", (hidden,)),
                TensorSpec(f"{prefix}.mlp.in.weight", (mlp, hidden)),
                TensorSpec(f"{prefix}.mlp.in.bias", (mlp,)),
                TensorSpec(f"{prefix}.mlp.out.weight", (hidden, mlp)),
                TensorSpec(f"{prefix}.mlp.out.bias", (hidden,)),
            )
        )
    tensors.extend((TensorSpec("ln_f.weight", (hidden,)), TensorSpec("ln_f.bias", (hidden,))))
    return tuple(tensors)


def lm_head_tensor(contract: Mapping[str, Any]) -> TensorSpec:
    dims = dimensions(contract)
    return TensorSpec("lm_head.weight", (dims["vocab_size"], dims["hidden_size"]))


def classification_head_tensors(contract: Mapping[str, Any]) -> tuple[TensorSpec, ...]:
    hidden = dimensions(contract)["hidden_size"]
    tensors: list[TensorSpec] = []
    for head_name, head in contract["classification_heads"].items():
        outputs = head.get("output_count")
        labels = head.get("labels")
        if outputs != len(labels):
            raise ValueError(f"head_output_count_mismatch:{head_name}")
        tensors.extend(
            (
                TensorSpec(f"heads.{head_name}.weight", (outputs, hidden)),
                TensorSpec(f"heads.{head_name}.bias", (outputs,)),
            )
        )
    return tuple(tensors)


def profile_representation_tensors(
    contract: Mapping[str, Any], alternative: str, *, categorical_case: str | None = None
) -> tuple[TensorSpec, ...]:
    """Return the optional learned tensors for one A/B/C profile alternative.

    Categorical tokens have two explicitly distinct cases: reusing audited
    reserved IDs adds no parameters, while vocabulary extension adds token
    embedding rows.  The contract does not choose between either case in J0.
    """

    hidden = dimensions(contract)["hidden_size"]
    profile = contract["profile_representation_alternatives"][alternative]
    if alternative == "fixed_profile_embedding":
        return (TensorSpec("profile.owner_embedding", (profile["profile_count"], hidden)),)
    if alternative == "categorical_profile_tokens":
        if categorical_case == "reuse_audited_reserved_ids":
            return ()
        if categorical_case == "extend_vocabulary":
            return (TensorSpec("profile.additional_token_rows", (profile["token_count"], hidden)),)
        raise ValueError("categorical_profile_tokens_requires_explicit_accounting_case")
    if alternative == "structured_side_channel":
        axes = profile["axis_count"]
        categories = profile["categories_per_axis"]
        width = profile["category_embedding_width"]
        return (
            TensorSpec("profile.axis_category_embeddings", (axes, categories, width)),
            TensorSpec("profile.projection.weight", (hidden, axes * width)),
            TensorSpec("profile.projection.bias", (hidden,)),
        )
    raise ValueError(f"unknown_profile_representation:{alternative}")


def parameter_count(tensors: Iterable[TensorSpec]) -> int:
    return sum(tensor.parameters for tensor in tensors)


def q4_bytes(tensors: Iterable[TensorSpec]) -> int:
    return sum(tensor.q4_bytes for tensor in tensors)


def fp16_bytes(tensors: Iterable[TensorSpec]) -> int:
    return sum(tensor.fp16_bytes for tensor in tensors)


def synthetic_prefill_flops(contract: Mapping[str, Any], tokens: int) -> int:
    """Dense-attention FLOP model using two FLOPs per multiply-add.

    Per block: Q/K/V/out projections = 8*T*D^2, two 4D MLP
    projections = 16*T*D^2, and QK/AV attention = 4*T^2*D.
    LayerNorm, GELU, softmax, embedding lookup and transfers are omitted, so
    this is a comparison model rather than a wall-clock performance claim.
    """

    dims = dimensions(contract)
    hidden, layers = dims["hidden_size"], dims["n_layer"]
    head_outputs = sum(head["output_count"] for head in contract["classification_heads"].values())
    return layers * (24 * tokens * hidden * hidden + 4 * tokens * tokens * hidden) + 2 * hidden * head_outputs


def synthetic_activation_bytes(contract: Mapping[str, Any], tokens: int) -> dict[str, int]:
    """Conservative FP16 prefill workspace model; no KV cache is included."""

    dims = dimensions(contract)
    hidden, heads, mlp = dims["hidden_size"], dims["n_head"], dims["mlp_size"]
    fp16 = 2
    hidden_buffer = tokens * hidden * fp16
    outputs = sum(head["output_count"] for head in contract["classification_heads"].values())
    parts = {
        "hidden_and_residual_workspaces_4x": 4 * hidden_buffer,
        "qkv_workspace": 3 * hidden_buffer,
        "attention_logits_and_probabilities": 2 * heads * tokens * tokens * fp16,
        "mlp_intermediate": tokens * mlp * fp16,
        "pooled_state_and_logits": (hidden + outputs) * fp16,
        "kv_cache": 0,
    }
    parts["total"] = sum(parts.values())
    return parts


def _component_counts(contract: Mapping[str, Any]) -> dict[str, int]:
    dims = dimensions(contract)
    vocab, old_context = dims["vocab_size"], contract["source_decoder"]["context_length"]
    hidden, layers, mlp = dims["hidden_size"], dims["n_layer"], dims["mlp_size"]
    per_layer = {
        "layer_norms": 4 * hidden,
        "attention_weights": 4 * hidden * hidden,
        "attention_biases": 4 * hidden,
        "mlp_weights": 2 * hidden * mlp,
        "mlp_biases": mlp + hidden,
    }
    return {
        "token_embedding": vocab * hidden,
        "source_position_embedding": old_context * hidden,
        "judge_position_embedding": dims["context_length"] * hidden,
        "per_layer_total": sum(per_layer.values()),
        "all_blocks": layers * sum(per_layer.values()),
        "final_layer_norm": 2 * hidden,
        "source_lm_head": vocab * hidden,
        "classification_heads": parameter_count(classification_head_tensors(contract)),
        **{f"per_layer_{name}": value for name, value in per_layer.items()},
    }


def measure_architecture(contract: Mapping[str, Any]) -> dict[str, Any]:
    """Derive the full R30J0 architecture, storage and synthetic runtime report."""

    dims = dimensions(contract)
    source_backbone = backbone_tensors(contract, context_length=contract["source_decoder"]["context_length"])
    judge_backbone = backbone_tensors(contract)
    heads = classification_head_tensors(contract)
    source_lm = lm_head_tensor(contract)
    source_parameters = parameter_count((*source_backbone, source_lm))
    judge_parameters = parameter_count((*judge_backbone, *heads))
    q4_backbone = q4_bytes(judge_backbone)
    all_q4 = q4_backbone + q4_bytes(heads)
    q4_backbone_fp16_heads = q4_backbone + fp16_bytes(heads)
    components = _component_counts(contract)

    asset = contract["projection_assumptions"]
    metadata = asset["model_metadata_budget_bytes"]
    tokenizer = asset["runtime_tokenizer_bytes"]
    runtime = asset["judge_runtime_bundle_budget_bytes"]
    static_all_q4 = all_q4 + metadata + tokenizer + runtime
    static_fp16_heads = q4_backbone_fp16_heads + metadata + tokenizer + runtime

    profile_reports: dict[str, Any] = {}
    for alternative in contract["profile_representation_alternatives"]:
        if alternative == "categorical_profile_tokens":
            cases: dict[str, Any] = {}
            for case in ("reuse_audited_reserved_ids", "extend_vocabulary"):
                tensors = profile_representation_tensors(contract, alternative, categorical_case=case)
                cases[case] = {
                    "parameter_delta": parameter_count(tensors),
                    "all_q4_byte_delta": q4_bytes(tensors),
                    "fp16_byte_delta": fp16_bytes(tensors),
                    "authorized_in_j0": False,
                }
            profile_reports[alternative] = {
                "accounting_cases": cases,
                "selection_status": "not_selected_j0",
            }
        else:
            tensors = profile_representation_tensors(contract, alternative)
            profile_reports[alternative] = {
                "parameter_delta": parameter_count(tensors),
                "all_q4_byte_delta": q4_bytes(tensors),
                "fp16_byte_delta": fp16_bytes(tensors),
                "judge_total_parameters": judge_parameters + parameter_count(tensors),
                "all_q4_total_weight_bytes": all_q4 + q4_bytes(tensors),
                "all_q4_static_local_asset_bytes": static_all_q4 + q4_bytes(tensors),
                "selection_status": "not_selected_j0",
            }
    for case in profile_reports["categorical_profile_tokens"]["accounting_cases"].values():
        case["judge_total_parameters"] = judge_parameters + case["parameter_delta"]
        case["all_q4_total_weight_bytes"] = all_q4 + case["all_q4_byte_delta"]
        case["all_q4_static_local_asset_bytes"] = static_all_q4 + case["all_q4_byte_delta"]

    latency: dict[str, Any] = {}
    for tokens in (dims["context_length"] - dims["reserved_tokens"], dims["context_length"]):
        flops = synthetic_prefill_flops(contract, tokens)
        latency[str(tokens)] = {
            "synthetic_flops": flops,
            "synthetic_gflops": flops / 1_000_000_000,
            "latency_ms_at_assumed_effective_gflops": {
                str(rate): flops / (rate * 1_000_000_000) * 1000
                for rate in asset["synthetic_effective_throughput_gflops"]
            },
            "effective_gflops_required_for_250ms": flops / 0.250 / 1_000_000_000,
            "effective_gflops_required_for_500ms": flops / 0.500 / 1_000_000_000,
        }

    activation = synthetic_activation_bytes(contract, dims["context_length"])
    margin = round(activation["total"] * asset["activation_allocator_margin_fraction"])
    causal_mask_workspace = dims["context_length"] * dims["context_length"]
    causal_workspaces = activation["total"] + causal_mask_workspace
    causal_margin = round(causal_workspaces * asset["activation_allocator_margin_fraction"])
    return {
        "model_family": contract["model_family"],
        "measurement_kind": "synthetic_architecture_projection_not_browser_benchmark",
        "dimensions": {**dims, "head_dim": dims["hidden_size"] // dims["n_head"]},
        "attention_variants": {
            key: {
                "attention_semantics": value["attention_semantics"],
                "parameter_count": judge_parameters,
                "checkpoint_parity": False,
                "lineage_label_if_initialized_from_r28m1": "warm-started_from_r28m1_representation",
            }
            for key, value in contract["attention_variants"].items()
        },
        "components": components,
        "source_decoder_parameters_excluding_masks": source_parameters,
        "judge_common_parameters_excluding_profile_representation": judge_parameters,
        "lm_head_parameters_removed": source_lm.parameters,
        "position_parameters_added": (dims["context_length"] - contract["source_decoder"]["context_length"]) * dims["hidden_size"],
        "classification_head_parameters_added": parameter_count(heads),
        "net_parameter_reduction": source_parameters - judge_parameters,
        "profile_representation_alternatives": profile_reports,
        "storage_projection": {
            "all_q4": {
                "weight_bytes": all_q4,
                "source_r28m1_shard_bytes": contract["source_decoder"]["actual_q4_shard_bytes"],
                "weight_byte_reduction_from_source_package": contract["source_decoder"]["actual_q4_shard_bytes"] - all_q4,
                "static_local_asset_bytes": static_all_q4,
                "static_local_asset_megabytes_decimal": static_all_q4 / 1_000_000,
            },
            "q4_backbone_fp16_heads": {
                "weight_bytes": q4_backbone_fp16_heads,
                "q4_backbone_bytes": q4_backbone,
                "fp16_head_bytes": fp16_bytes(heads),
                "static_local_asset_bytes": static_fp16_heads,
                "static_local_asset_megabytes_decimal": static_fp16_heads / 1_000_000,
            },
            "shared_nonweight_assumptions": {
                "model_metadata_budget_bytes": metadata,
                "runtime_tokenizer_bytes": tokenizer,
                "judge_runtime_bundle_budget_bytes": runtime,
            },
        },
        "synthetic_latency": latency,
        "synthetic_memory_512": {
            "fp16_activation_workspaces": activation,
            "activation_allocator_margin_bytes": margin,
            "packed_q4_all_q4_resident_projection_bytes": static_all_q4 + activation["total"] + margin,
            "packed_q4_all_q4_resident_projection_mebibytes": (static_all_q4 + activation["total"] + margin) / (1024 * 1024),
            "variant_workspace_projections": {
                "causal_judge": {
                    "procedural_dense_uint8_mask_workspace_bytes": causal_mask_workspace,
                    "note": "conservative_materialized_mask_case_a_fused_kernel_could_avoid_this_workspace",
                    "packed_q4_resident_projection_bytes": static_all_q4 + causal_workspaces + causal_margin,
                    "packed_q4_resident_projection_mebibytes": (static_all_q4 + causal_workspaces + causal_margin) / (1024 * 1024),
                },
                "bidirectional_judge": {
                    "mask_workspace_bytes": 0,
                    "packed_q4_resident_projection_bytes": static_all_q4 + activation["total"] + margin,
                    "packed_q4_resident_projection_mebibytes": (static_all_q4 + activation["total"] + margin) / (1024 * 1024),
                },
            },
            "full_fp16_weight_materialization_bytes": judge_parameters * 2,
            "full_fp16_materialization_is_not_assumed": True,
        },
        "non_claims": [
            "no_training_was_run",
            "no_browser_or_webgpu_benchmark_was_run",
            "synthetic_latency_is_not_a_p50_or_p95_claim",
            "metadata_and_runtime_bundle_values_are_planning_budgets",
            "resident_memory_projection_excludes_application_shell_webgpu_driver_and_shader_compilation",
            "profile_representation_not_selected",
            "no_checkpoint_parity_after_attention_or_context_change",
        ],
    }


def validate_contract(contract: Mapping[str, Any]) -> dict[str, Any]:
    report = measure_architecture(contract)
    expected = contract["expected_measurements"]
    checks = {
        "source_decoder_parameters": report["source_decoder_parameters_excluding_masks"],
        "judge_common_parameters": report["judge_common_parameters_excluding_profile_representation"],
        "lm_head_parameters_removed": report["lm_head_parameters_removed"],
        "position_parameters_added": report["position_parameters_added"],
        "classification_head_parameters_added": report["classification_head_parameters_added"],
        "all_q4_weight_bytes": report["storage_projection"]["all_q4"]["weight_bytes"],
        "q4_backbone_fp16_heads_weight_bytes": report["storage_projection"]["q4_backbone_fp16_heads"]["weight_bytes"],
    }
    mismatches = {name: (value, expected.get(name)) for name, value in checks.items() if value != expected.get(name)}
    if mismatches:
        raise ValueError(f"architecture_measurement_contract_mismatch:{mismatches}")
    if contract["runtime_contract"].get("autoregressive_decode") is not False:
        raise ValueError("autoregressive_decode_must_be_false")
    if contract["runtime_contract"].get("lm_head") != "absent":
        raise ValueError("lm_head_must_be_absent")
    if contract["runtime_contract"].get("kv_cache_required") is not False:
        raise ValueError("kv_cache_must_not_be_required")
    if contract.get("training_state") != {
        "training_started": False,
        "classification_updates": 0,
        "examples_seen_by_optimizer": 0,
        "checkpoint": None,
        "candidate": None,
    }:
        raise ValueError("j0_training_state_must_remain_zero")
    return report


def audit_r28m1_source_config(contract: Mapping[str, Any], source: Mapping[str, Any]) -> dict[str, Any]:
    """Cross-check the arithmetic against committed public R28M1 metadata."""

    architecture = source.get("architecture")
    expected_architecture = {
        "vocab_size": contract["shared_dimensions"]["vocab_size"],
        "context_length": contract["source_decoder"]["context_length"],
        "n_layer": contract["shared_dimensions"]["n_layer"],
        "n_embd": contract["shared_dimensions"]["hidden_size"],
        "n_head": contract["shared_dimensions"]["n_head"],
    }
    mismatched_dimensions = {
        name: (architecture.get(name) if isinstance(architecture, Mapping) else None, expected)
        for name, expected in expected_architecture.items()
        if not isinstance(architecture, Mapping) or architecture.get(name) != expected
    }
    if mismatched_dimensions:
        raise ValueError(f"r28m1_source_dimension_mismatch:{mismatched_dimensions}")
    tensors = source.get("tensors")
    if not isinstance(tensors, list) or len(tensors) != source.get("tensor_count"):
        raise ValueError("r28m1_source_tensor_inventory_invalid")
    parameter_count_excluding_masks = sum(
        int(tensor["numel"]) for tensor in tensors if not str(tensor.get("name", "")).endswith(".mask")
    )
    q4_shard_bytes = sum(int(tensor["bytes"]) for tensor in tensors)
    mask_bytes = sum(int(tensor["bytes"]) for tensor in tensors if str(tensor.get("name", "")).endswith(".mask"))
    lm_heads = [tensor for tensor in tensors if tensor.get("name") == "lm_head.weight"]
    if len(lm_heads) != 1:
        raise ValueError("r28m1_source_lm_head_inventory_invalid")
    observed = {
        "tensor_count": len(tensors),
        "parameter_count_excluding_masks": parameter_count_excluding_masks,
        "q4_shard_bytes": q4_shard_bytes,
        "stored_causal_mask_bitpack_bytes": mask_bytes,
        "lm_head_parameters": int(lm_heads[0]["numel"]),
        "lm_head_q4_bytes": int(lm_heads[0]["bytes"]),
    }
    expected = {
        "parameter_count_excluding_masks": contract["source_decoder"]["audited_parameter_count_excluding_masks"],
        "q4_shard_bytes": contract["source_decoder"]["actual_q4_shard_bytes"],
        "stored_causal_mask_bitpack_bytes": contract["source_decoder"]["stored_causal_mask_bitpack_bytes"],
        "lm_head_parameters": contract["expected_measurements"]["lm_head_parameters_removed"],
        "lm_head_q4_bytes": contract["expected_measurements"]["lm_head_parameters_removed"] // 2,
    }
    mismatches = {name: (observed[name], value) for name, value in expected.items() if observed[name] != value}
    if mismatches:
        raise ValueError(f"r28m1_source_inventory_mismatch:{mismatches}")
    return {**observed, "source_kind": "committed_public_metadata_read_only", "audit_passed": True}
