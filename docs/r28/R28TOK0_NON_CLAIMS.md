# R28TOK0 Non-Claims

R28TOK0 makes one runtime compatibility change: exact tokenizer encode/decode replaces the RT2 lossy display codec as the primary path for the static q4 experimental runtime.

R28TOK0 does not claim:

- Product model.
- Product admission.
- Browser admission.
- Release checkpoint admission.
- Vercel preview pass.
- Product-quality generation.
- Training approval.
- Phase 4 approval.

R28TOK0 does not add:

- New model weights.
- New q4 shards.
- Raw checkpoints.
- FP32/FP16 weights.
- Optimizer states.
- ONNX or GGUF artifacts.
- Tokenizer training artifacts.
- Raw, clean, processed, or public ingestion corpora.
- Backend inference.
- Vercel Function or Edge inference.
- External LLM API.
- Doubao.
- Hosted vector store.

Exact tokenizer admission is runtime compatibility only. Manual QA, product admission, browser admission, and release checkpoint admission remain separate future gates.
