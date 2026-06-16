# Endpoint Conversation Standard

another_brain is ready when it can interpret turns through a typed NLU control plane, answer within a 3s warm-page SLA using deterministic/tool-first reasoning, sustain 16-turn internal memory with 4-turn visible UI, avoid generic fallback collapse, avoid repair overtrigger, avoid answer repetition, and degrade safely across WebGPU, WASM, and deterministic profiles.

Endpoint metrics:

- `response_mode_accuracy >= 0.90`
- `contextual_binding_accuracy >= 0.92`
- `repair_precision >= 0.95`
- `repair_recall >= 0.90`
- `simplification_accuracy >= 0.95`
- `mobile_density_pass_rate >= 0.95`
- `duplicate_answer_rate <= 0.02`
- `generic_fallback_illegal_count = 0`
- `visible_ui_leakage_score = 0`
- `16turn_memory_binding_score >= 0.90`

The public runtime remains local-first. Typed cards, relation graph, solvers, verifier, and controller decisions are first-class runtime structures. Free generation is optional and bounded, not the product core.

