# R25AP Language Bucket Regression

R25AP reads the R25AO ignored breakdown report only. It does not replay
training, run tokenizer dry-run, parse private sources, or mutate corpus files.

## R25AO Heldout Buckets

| Bucket | Sequences | Loss |
| --- | ---: | ---: |
| zh | 68 | 5.4540 |
| mixed | 19 | 6.1143 |
| en | 9 | 6.9239 |

Gaps:

- mixed minus zh: 0.6603
- en minus zh: 1.4699

The zh bucket is stronger than the full heldout aggregate. Mixed and English
are weaker, especially English. This does not mean English should dominate the
next corpus. It means the project should review mixed/en boundary examples and
technical-language rows while keeping Chinese-first goals intact.

## Interpretation

R25AO succeeded at sampling but exposed bucket imbalance. The next reviewed
step should not be an immediate repeat. If work continues, it should first
inspect mixed/en rows, high-loss task families, and sampler pressure without
starting training.

Phase_4 scaled training remains unapproved.
