from src.training.model_lab.scale_decision import RUNTIME_OVERHEAD_BYTES, STATIC_BUDGET_BYTES, TOKENIZER_ESTIMATE_BYTES, product_budget_estimate


def browser_budget_report(param_count, checkpoint_size=0):
    report = product_budget_estimate(int(param_count))
    report.update({
        "selected_model_params": int(param_count),
        "checkpoint_size_bytes": int(checkpoint_size or 0),
        "tokenizer_size_estimate_bytes": TOKENIZER_ESTIMATE_BYTES,
        "runtime_js_wasm_webgpu_estimate_bytes": RUNTIME_OVERHEAD_BYTES,
        "rag_shard_budget_bytes": 20_000_000,
        "ui_app_shell_budget_bytes": 8_000_000,
        "verifier_finalizer_fallback_budget_bytes": 8_000_000,
        "static_budget_bytes": STATIC_BUDGET_BYTES,
    })
    report["total_q4_with_app_estimate_bytes"] = report["q4_total_estimate_bytes"] + report["rag_shard_budget_bytes"] + report["ui_app_shell_budget_bytes"] + report["verifier_finalizer_fallback_budget_bytes"]
    report["fits_current_100mb_budget"] = report["total_q4_with_app_estimate_bytes"] <= STATIC_BUDGET_BYTES
    report["estimate_0_5b_q4_bytes"] = product_budget_estimate(500_000_000)["q4_total_estimate_bytes"]
    report["estimate_2b_q4_bytes"] = product_budget_estimate(2_000_000_000)["q4_total_estimate_bytes"]
    report["0_5b_fits_current_static_budget"] = report["estimate_0_5b_q4_bytes"] <= STATIC_BUDGET_BYTES
    report["2b_fits_current_static_budget"] = report["estimate_2b_q4_bytes"] <= STATIC_BUDGET_BYTES
    if report["fits_current_100mb_budget"]:
        report["recommendation"] = "continue_training_selected_model"
    else:
        report["recommendation"] = "100MB_budget_incompatible_with_requested_model_scale"
    return report
