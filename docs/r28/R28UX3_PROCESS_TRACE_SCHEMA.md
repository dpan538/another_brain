# R28UX3 Process Trace Schema

The process trace is a public answer-surface packet. It summarizes runtime status without exposing hidden reasoning or internal prompts.

Schema:

```json
{
  "trace_id": "...",
  "created_at": "...",
  "runtime_mode": "static_q4_experimental | synthetic_tiny | mock | fallback",
  "input_packet": {
    "has_user_input": true,
    "has_local_context": false,
    "adapter_context_present": false
  },
  "rag": {
    "retrieval_used": true,
    "evidence_count": 0,
    "evidence_status": "sufficient | insufficient | conflicting | malicious | none",
    "top_sources": []
  },
  "model": {
    "asset_manifest_loaded": true,
    "shards_verified": true,
    "tokenizer": "exact_runtime_tokenizer | lossy_fallback | none",
    "q4_forward_ran": false,
    "tokens_generated": 0,
    "draft_generated": false
  },
  "router": {
    "route": "direct_model_draft | rag_grounded_answer | insufficient_evidence_boundary | conflicting_evidence_boundary | malicious_evidence_boundary | model_gibberish_fallback | synthetic_demo_fallback | not_product_status",
    "used_model_draft": false,
    "replaced_model_draft": false,
    "reason": ""
  },
  "finalizer": {
    "final_answer_source": "model_draft | router_boundary | fallback",
    "quality_flags": [],
    "fallback_reason": ""
  },
  "non_claims": {
    "product_admission": false,
    "browser_admission": false,
    "release_checkpoint": false
  }
}
```

Trace events are public status events:

- `input_received`
- `adapter_context_loaded`
- `rag_retrieval_started`
- `rag_retrieval_completed`
- `model_manifest_loaded`
- `q4_shards_verified`
- `tokenizer_ready`
- `q4_forward_started`
- `q4_forward_completed`
- `draft_generated`
- `router_route_selected`
- `finalizer_applied`
- `fallback_used`
- `answer_completed`

Evidence sources are summarized by source id, title, trust level, and score. The UI does not need to print full private context text.
