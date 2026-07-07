# R28UX3 Process Transparent UI

R28UX3 changes the static preview from a demo-looking chat shell into a process-transparent answer surface.

The UI shows:

- input packet status
- local context / adapter status
- RAG evidence packet status
- model runtime and tokenizer status
- q4 draft status
- hard router route
- finalizer decision
- fallback reason
- final answer source

Answer source labels are public product-surface labels:

- `static_q4_experimental`
- `hard_router_boundary`
- `synthetic_fallback`
- `no_model_fallback`

The preview must not imply q4 participation when the browser worker did not run q4 forward. If a model draft exists but the router or finalizer replaces it, the UI shows `model_draft_generated=true`, `finalizer_replaced_draft=true`, and the public reason.

This remains static-only. It adds no backend inference, Vercel Function inference, external LLM API, Doubao, or hosted vector store.
