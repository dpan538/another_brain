# R25AF To R25AG Corpus Expansion Path

R25AF prepares the path for a future R25AG derived corpus expansion. It does
not parse raw writing, does not generate rows, does not train, and does not
commit private source material.

## R25AG Target

R25AG may later convert reviewed writing, poetry, fragments, preferred answers,
and repaired answers into `1000` to `3000` derived rows before any further
micro-cycle. Raw source remains private by default under
`private_sources/r25af_user_writing_inbox/`.

The target mix remains Chinese-first:

- `zh`: at least `70%`.
- `mixed`: about `20%`.
- `en`: at most `10%`.

## Derived Coverage

The future expansion should cover project continuation, repair after weak
answer, local-first static browser reasoning, style preference, tool-status
honesty, bounded judgment, Chinese rewrite/compression, Chinese explanation,
poetry-to-dialogue style transfer, and preference pairs.

Each category must define target rows, source types, review requirements,
allowed transformations, forbidden content, split policy, and eval
contamination guard. Source families must not leak from heldout into training.

R25AG requires fresh approval before parsing approved sources or generating
derived rows. Future training after R25AG requires another fresh approval, and
phase_4 scaled training remains blocked.
