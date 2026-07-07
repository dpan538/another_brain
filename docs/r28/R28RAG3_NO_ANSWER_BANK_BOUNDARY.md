# R28RAG3 No Answer Bank Boundary

R28RAG3 does not create a broad answer bank.

## What It Provides

- Lightweight profile hints.
- Value and aesthetic style hints.
- Boundary hints for insufficient evidence, conflicting evidence, injection refusal, and non-product status.
- Source provenance and tone hints for process display.

## What It Does Not Provide

- No canned factual answers.
- No broad topic answer bank.
- No copied user answers.
- No private raw data.
- No eval prompt leakage.
- No old excluded rows.

Open questions still route through q4 draft, local RAG, router policy, verifier, and finalizer. The cards can shape evidence/tone, but they are not final response templates.

## Tests

- `tests/r28rag3/test_card_schema.ts`
- `tests/r28rag3/test_profile_retriever.ts`
- `tests/r28rag3/test_affective_rag_packet.ts`
- `tests/r28rag3/test_static_retriever_assets.ts`
- `tests/r28rag3/test_process_trace_sources.ts`
- `tests/r28rag3/test_web_runtime_markers.ts`
