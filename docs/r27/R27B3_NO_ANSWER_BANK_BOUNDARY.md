# R27B3 No Answer Bank Boundary

R27B3 does not create hand-authored final answers. Static RAG records may contain short demo facts with source metadata, trust level, and origin labels, but not `answer`, `answer_text`, `final_answer`, eval prompts, old excluded question-pack rows, private raw data, root DOCX/PDF parses, or `data/public_ingestion` parses.

The browser path is:

1. User input.
2. State packet.
3. Static local retrieval.
4. Evidence packet.
5. Mock/synthetic decoder draft.
6. Verifier/finalizer/fallback.

That boundary keeps memory retrieval as evidence, not as the main intelligence layer.
