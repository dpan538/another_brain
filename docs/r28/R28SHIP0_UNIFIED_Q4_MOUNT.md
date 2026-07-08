# R28SHIP0 Unified q4 Mount

R28SHIP0 unifies the UX5 Chat/Dashboard shell with q4 mount behavior that was split across HOTFIX3 and LOAD0 lineage.

Integrated behavior:

- q4 asset paths normalize to `/another_brain/model_assets/...`.
- `web/another_brain/model_assets/...` maps to `/another_brain/model_assets/...`.
- external URLs, traversal, artifacts, and `data/public_ingestion` paths are rejected.
- boot does a quick local check, then runs an async q4 mount with Plan B retries.
- fallback is available, but final fallback is only shown after the retry plan is exhausted.
- UI status uses the actual q4 forward result instead of treating metadata readiness as forward readiness.

The browser path remains local/static only. It does not add backend inference, Vercel Function inference, Edge inference, external LLM APIs, Doubao, or a hosted vector store.
