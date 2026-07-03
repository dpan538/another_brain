# R25AL Post-Promotion Corpus Review Policy

R25AL reviews the expanded tracked corpus after R25AK promotion and may run one tokenizer dry-run readiness pass. It does not train a decoder, does not run a small pilot, does not run phase_4, and does not commit tokenizer artifacts or weights.

The review scope is `training/llm_corpus/*.jsonl`, including the R25AK split files. R25AK rows are treated as reviewed repo-derived rows because their sources are already repo-tracked and safe. Existing R25B/R25L corpus files remain unchanged.

Forbidden sources remain out of scope: evals as training data, `private_sources/`, root PDF/DOC/DOCX content, `data/public_ingestion/` content, and ignored artifacts as corpus source. Future R25AM training requires a fresh explicit approval. Phase_4 remains blocked.
