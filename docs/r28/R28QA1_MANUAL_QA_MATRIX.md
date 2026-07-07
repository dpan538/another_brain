# R28QA1 Manual QA Matrix

R28QA1 validates the static q4 candidate without training, new model assets, backend inference, external LLM calls, Doubao, hosted vector stores, or product admission.

Automated matrix command:

```bash
python3 scripts/r28qa1_run_qa_matrix.py
```

The matrix covers chat route load, manifest visibility, q4 checksums, visible runtime mode, local-only status, adapter plain text and JSON imports, RAG evidence paths, insufficient evidence, malicious evidence, conflicting evidence, fallback reason display, clear chat, abort generation, mobile layout, accessibility markers, no backend/external runtime, bundle budget, no product admission text, visible release blockers, and RT2 readable q4 generation smoke.

Manual browser preview checklist:

1. Open the Vercel preview for branch `r28qa1-static-q4-manual-qa`.
2. Open `/another_brain_chat/`.
3. Confirm `Local only`, `No backend inference`, `static_q4_experimental`, decode status, token count, fallback reason, and release blockers are visible.
4. Import plain text context and JSON context; clear imported context.
5. Ask a RAG demo question, an insufficient-evidence question, and a malicious-evidence prompt.
6. Use Clear chat and Abort generation.
7. Check narrow mobile viewport and keyboard/focus behavior.
8. Inspect network requests and confirm no backend, external LLM, Doubao, or hosted vector-store calls.
