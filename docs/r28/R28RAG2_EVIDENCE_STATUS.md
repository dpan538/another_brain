# R28RAG2 Evidence Status

R28RAG2 uses evidence status as an answer-surface guard, not as a hidden reasoning channel.

Statuses:

- `sufficient`: at least one trusted, answerable retrieved item clears the score threshold and no conflict or malicious instruction is present.
- `insufficient`: no usable evidence, empty query, no answerable item, or top score below threshold.
- `conflicting`: evidence records carry conflicting metadata for the same claim group.
- `malicious`: retrieved evidence contains instruction-injection markers, hidden-prompt requests, or an explicit malicious fixture flag.

Policy hints:

- `answer_with_evidence`: allow normal model/finalizer path with evidence.
- `ask_clarifying`: use insufficient-evidence boundary.
- `identify_conflict`: use conflict boundary.
- `ignore_untrusted_instruction`: ignore malicious evidence instructions and use malicious-evidence boundary.

The evidence packet can show source id, title, origin, provenance, review status, and retrieval score. It must not display hidden prompts, private raw text, eval prompts, or old excluded question-pack rows.
