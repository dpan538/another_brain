# R28ROUT0 Route Schema

R28ROUT0 adds a hard router and answer-surface policy layer for the tiny SLM UX. It is a runtime guard, not the main intelligence layer and not a hand-authored answer bank.

## Input

```json
{
  "user_input": "...",
  "evidence_status": "sufficient | insufficient | conflicting | malicious | none",
  "runtime_mode": "static_q4_experimental | synthetic_tiny | mock",
  "model_output": "...",
  "decode_status": "exact_runtime_tokenizer | lossy_fallback | failed",
  "generation_flags": [],
  "adapter_context_present": false,
  "product_admission": false
}
```

## Output

```json
{
  "route": "rag_grounded_answer",
  "use_model_draft": true,
  "final_answer": "...",
  "fallback_reason": "",
  "quality_flags": [],
  "non_claims": []
}
```

## Routes

- `direct_model_draft`
- `rag_grounded_answer`
- `insufficient_evidence_boundary`
- `conflicting_evidence_boundary`
- `malicious_evidence_boundary`
- `adapter_context_boundary`
- `model_empty_fallback`
- `model_gibberish_fallback`
- `model_repetition_fallback`
- `model_timeout_fallback`
- `not_product_status`
- `synthetic_demo_fallback`

## Precedence

Evidence boundaries win before model output. Malicious evidence is treated as untrusted instruction text. Conflict and insufficiency prevent a deterministic answer claim. If evidence is sufficient, model quality flags can still route to empty, gibberish, repetition, or timeout fallback. A valid q4 draft remains the draft path when no boundary fires.
