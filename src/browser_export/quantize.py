from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .shape_manifest import estimate_sizes


@dataclass(frozen=True)
class QuantizationPlan:
    quantization: str
    params: int
    weight_bytes: int
    scale_bytes: int
    total_bytes: int
    scheme: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "quantization": self.quantization,
            "params": self.params,
            "weight_bytes": self.weight_bytes,
            "scale_bytes": self.scale_bytes,
            "total_bytes": self.total_bytes,
            "scheme": self.scheme,
        }


def estimate_quantization(params: int, quantization: str = "q4", tensor_count: int = 1, per_channel_groups: int = 1) -> QuantizationPlan:
    quant = quantization.lower()
    sizes = estimate_sizes(params)
    if quant == "fp32":
        weight_bytes = sizes["fp32_bytes"]
        scale_bytes = 0
        scheme = "raw_float32"
    elif quant == "fp16":
        weight_bytes = sizes["fp16_bytes"]
        scale_bytes = 0
        scheme = "raw_float16"
    elif quant == "int8":
        weight_bytes = sizes["int8_bytes"]
        scale_bytes = max(1, tensor_count * per_channel_groups) * 4
        scheme = "symmetric_int8_per_tensor_or_channel"
    elif quant in {"q4", "int4"}:
        weight_bytes = sizes["q4_bytes"]
        scale_bytes = max(1, tensor_count * per_channel_groups) * 4
        scheme = "experimental_packed_int4_per_tensor_or_channel"
    else:
        raise ValueError(f"unsupported_quantization:{quantization}")
    return QuantizationPlan(
        quantization=quant,
        params=int(params),
        weight_bytes=int(weight_bytes),
        scale_bytes=int(scale_bytes),
        total_bytes=int(weight_bytes + scale_bytes),
        scheme=scheme,
    )


def budget_fit(params: int, model_weight_budget_bytes: int = 70_000_000) -> dict[str, Any]:
    plans = {quant: estimate_quantization(params, quant).to_dict() for quant in ("fp32", "fp16", "int8", "q4")}
    return {
        "params": int(params),
        "estimates": plans,
        "fits_model_weight_budget": {
            quant: plan["total_bytes"] <= model_weight_budget_bytes for quant, plan in plans.items()
        },
    }
