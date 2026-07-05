# Reasoning Architecture

Future LLM drafts receive a `reasoning_plan` before answer generation. The plan identifies task type, operation, retrieval need, solver need, value-profile need, memory/context relation need, and verifier requirements.

The plan is trace-only and `trace_only_no_cot: true`. It is not chain-of-thought, not a final answer, and not a canned response. It prevents route collapse by requiring operations such as `knowledge_lookup`, `relation_ordering`, `abstract_reframe`, `value_judgment`, `aesthetic_judgment`, `unsupported_challenge`, and `evidence_correction` to stay visible before finalization.

R24 remains the verifier/fallback harness. R27A does not train or alter model weights.
