# R27B3 Static RAG Memory Assets

R27B3 adds a static, same-origin demo memory path for the browser chat shell. The committed asset is `web/another_brain/static_rag/demo_memory.json`, declared in `web/another_brain/asset_manifest.json`, and labeled demo-only.

The browser runtime loads the asset from the same origin, ranks records locally, builds an evidence packet, drafts with the mock/synthetic browser runtime, and sends the result through verifier/finalizer/fallback. There is no backend retrieval, hosted vector store, external storage runtime, training, or private source ingestion.

The fixture is intentionally small and synthetic. It is evidence for a decoder path, not an answer bank.
