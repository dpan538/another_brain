# R28SURF5 No Broad Answer Bank

R28SURF5 is not a broad answer bank.

It provides bounded compositional surfaces for:

- micro-intents such as greeting, identity, origin, and capability
- evidence status boundaries
- abstract/value/aesthetic/relation/language fallback
- q4 timeout or unavailable fallback
- refusal boundaries

It does not store final answers for arbitrary factual, technical, personal, or creative questions. Those questions continue through the q4/RAG/router/finalizer path when q4 is ready, or through an explicit blocker/fallback when it is not.

No eval prompts, old `question_pack_001` rows 51-100, private raw data, root DOCX/PDF files, or `data/public_ingestion` materials are used.
