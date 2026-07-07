# R28RAG2 Lightweight Static RAG

R28RAG2 productizes the browser-side demo retrieval path into a lightweight static RAG layer.

It adds:

- static memory index at `web/another_brain/static_rag/memory_index.json`
- evidence source registry at `web/another_brain/static_rag/source_registry.json`
- browser/runtime ranking helpers for keyword, Chinese char ngram, and BM25-like scoring
- evidence status classification for sufficient, insufficient, conflicting, and malicious packets
- process-panel source summaries with provenance and review status
- hard-router integration through evidence status and policy hints

The static memory records are synthetic/public-safe/demo-safe operational evidence. They are not private raw data, not training corpus, and not a broad answer bank.

Runtime flow:

1. Normalize query text.
2. Rank static memory records with keyword, source/title, and Chinese char ngram features.
3. Return top-k evidence with provenance fields.
4. Classify evidence status.
5. Pass the evidence packet to the hard router and finalizer.
6. Display source/provenance summary in the public process panel.

When evidence is sufficient, the model draft path can remain active. When evidence is insufficient, conflicting, or malicious, the hard router chooses the deterministic boundary surface.
