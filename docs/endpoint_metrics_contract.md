# Endpoint Metrics Contract

R20 turns endpoint readiness into a hard gate. The metrics below measure whether another_brain behaves like a stable typed conversation runtime rather than a collection of local patches.

| metric | target |
| --- | ---: |
| response_mode_accuracy | >= 0.90 |
| contextual_binding_accuracy | >= 0.92 |
| repair_precision | >= 0.95 |
| repair_recall | >= 0.90 |
| simplification_accuracy | >= 0.95 |
| mobile_density_pass_rate | >= 0.95 |
| duplicate_answer_rate | <= 0.02 |
| generic_fallback_illegal_count | = 0 |
| visible_ui_leakage_score | = 0 |
| 16turn_memory_binding_score | >= 0.90 |
| warm_answer_p95 | <= 3000ms |
| privacy_leak_count | = 0 |
| copyright_leak_count | = 0 |
| source_leak_count | = 0 |

## Hard Failure Conditions

- An explicit question becomes quiet affordance.
- A normal follow-up with active entity/work/list triggers repair.
- A simplify/rewrite/expand request triggers repair by default.
- A generic fallback becomes final answer in a typed context.
- The public runtime depends on private/PDF-derived material.
- A user-visible answer bypasses conversation controller, verifier/finalizer, mobile density, or dedupe.
- WebGPU becomes authoritative for privacy/copyright/source boundary, memory write approval, explicit-question affordance, or repair eligibility.

## Profile Gate

The standard profile must satisfy the endpoint metrics without requiring WebGPU. WebGPU may improve retrieval/rerank latency or quality, but deterministic/WASM fallback remains the correctness baseline.

