from src.training.model_lab.model_ladder import browser_size_estimates, choose_model


STATIC_BUDGET_BYTES = 100_000_000
TOKENIZER_ESTIMATE_BYTES = 1_200_000
RUNTIME_OVERHEAD_BYTES = 18_000_000


def product_budget_estimate(param_count):
    est = browser_size_estimates(param_count, TOKENIZER_ESTIMATE_BYTES)
    est["static_overhead_bytes"] = RUNTIME_OVERHEAD_BYTES
    est["q4_total_estimate_bytes"] = est["int4_bytes"] + RUNTIME_OVERHEAD_BYTES
    est["fits_100mb_q4"] = est["q4_total_estimate_bytes"] <= STATIC_BUDGET_BYTES
    return est


def decide_model_scale(probe, baseline):
    stable = [b for b in probe.get("stable_candidates", []) if b.get("ok")]
    candidates = []
    for item in stable:
        params = int(item.get("estimated_params") or 0)
        budget = product_budget_estimate(params)
        if item["model_size"] != "mini_8m" and item.get("tokens_per_second", 0) > 1 and budget["q4_total_estimate_bytes"] <= STATIC_BUDGET_BYTES:
            candidates.append({**item, "budget": budget})
    candidates.sort(key=lambda x: int(x.get("estimated_params") or 0), reverse=True)
    if candidates:
        chosen = candidates[0]
        return {
            "ok": True,
            "selected_scale": chosen["model_size"],
            "train_model_size": chosen["model_size"],
            "context_length": chosen["context_length"],
            "lineage": "new_from_scratch_single_decoder",
            "resume_r27a6_checkpoint": False,
            "reason": "largest_measured_stable_mps_candidate_with_plausible_q4_100mb_budget",
            "selected_candidate": chosen,
            "product_budget": chosen["budget"],
            "fallback_used": False,
            "mps_available": bool(probe.get("mps_is_available")),
            "r27a6_best_checkpoint_path": baseline.get("best_checkpoint_path", ""),
            "tokenizer_path": baseline.get("tokenizer_path", ""),
            "estimate_only": {
                "0.5B": {**product_budget_estimate(500_000_000), "train_locally": False},
                "2B": {**product_budget_estimate(2_000_000_000), "train_locally": False},
            },
        }
    cfg = choose_model("mini_8m", "cpu", int(baseline.get("vocab_size") or 16000), 256)
    return {
        "ok": True,
        "selected_scale": "continue_mini8m",
        "train_model_size": "mini_8m",
        "context_length": 256,
        "lineage": "resume_r27a6_best_checkpoint",
        "resume_r27a6_checkpoint": True,
        "reason": probe.get("fallback_reason") or "no_larger_candidate_measured_stable",
        "selected_candidate": {"model_size": "mini_8m", "estimated_params": cfg["estimated_params"], "context_length": 256},
        "product_budget": product_budget_estimate(cfg["estimated_params"]),
        "fallback_used": True,
        "mps_available": bool(probe.get("mps_is_available")),
        "r27a6_best_checkpoint_path": baseline.get("best_checkpoint_path", ""),
        "tokenizer_path": baseline.get("tokenizer_path", ""),
        "capacity_warning": "mini8m remains an engineering fallback and is likely insufficient for product-quality dialogue.",
        "estimate_only": {
            "0.5B": {**product_budget_estimate(500_000_000), "train_locally": False},
            "2B": {**product_budget_estimate(2_000_000_000), "train_locally": False},
        },
    }
