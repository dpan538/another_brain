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

## R25AQ Follow-Up

R25AQ confirms the same bucket weakness: mixed remains product-important
because repo work is Chinese-first with technical mixed terms, while English
remains secondary and capped. The repaired sampler design should address mixed
coverage first, not generic English fluency. R25AQ does not train, generate
datasets, run tokenizer dry-run, or approve phase_4.
## R25AR Bucket Follow-Up

R25AR increased mixed sampling to 25% and lowered training intensity, but heldout buckets still favored zh:

- zh: 6.0836
- mixed: 8.0400
- en: 8.1583

Mixed-minus-zh was 1.9564 and en-minus-zh was 2.0747, so R25AR did not repair the mixed/en weakness.

## R25AS Regression Decision

R25AS analyzes R25AR without training or replay. It confirms that the repaired sampler changed coverage but did not repair mixed/en generalization: R25AR heldout was 6.8565, worse than R25AO's 5.7820, with mixed and English still above zh. R25AS recommends pausing phase 3 training and reviewing corpus/eval distribution or objective mismatch before any fresh pilot approval.
