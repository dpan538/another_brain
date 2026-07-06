# R27B4 End-to-End Static Delivery Gate

R27B4 aggregates the B0-B3 browser delivery path into a demo static delivery candidate. The route is `web/another_brain_chat/index.html`, with runtime mode config at `web/another_brain/runtime_mode.json`.

The end-to-end path is:

1. Static chat route.
2. Delivery mode config: `demo_static`.
3. Browser runtime mode: `synthetic_tiny` by default.
4. Static demo RAG retrieval.
5. Evidence packet.
6. Mock/synthetic decoder draft.
7. Verifier/finalizer/fallback.

The gate is static-only. It does not introduce backend inference, external LLM calls, hosted vector storage, product model admission, release checkpoints, or phase_4 approval.
