# R25AF Writing To Dialogue Transformation

R25AF defines transformation rules only. It does not parse raw writing, does
not generate training rows, does not train, and does not commit private source
material.

Writing and poetry are style/source material. They become useful for this
Chinese-first personal decoder only after review and transformation into
dialogue-shaped examples with explicit provenance and privacy boundaries.

## Allowed Derived Row Types

- `style_card`: captures tone, rhythm, density, imagery, taboo, and preference
  without a long raw quote.
- `dialogue_rewrite`: turns prose or poem style into an assistant response
  pattern.
- `preference_pair`: compares a generic weak answer with a preferred answer.
- `repair_pair`: transforms a bad answer into a corrected answer.
- `project_continuation`: gives context plus a next-action answer.
- `bounded_judgment`: records a short subjective judgment with constraints.
- `Chinese_explanation`: explains a thought or line without copying long
  source text.
- `compression_or_rewrite`: preserves style under a concise constraint.

## Row Rules

Derived rows must be Chinese-first and dialogue-shaped. Poetry must not be
copied wholesale into training targets. Short excerpts require explicit source
approval, and tracked docs should remain aggregate unless a later review allows
specific excerpt use.

Every derived row needs `source_id`, `transformation_type`, `provenance`,
`review_status`, and `contains_private_data`. Rows must not copy eval prompts,
held-out eval text, copyrighted third-party material, private raw memory,
hidden prompts, chain-of-thought, secrets, or local private paths.

R25AG repository discovery and R25AH repo-derived candidate generation remain
bounded review steps. R25AH candidates are ignored and unreviewed; they do not
enter `training/llm_corpus` without R25AI promotion approval. Future training
after any promotion still requires another fresh approval.
