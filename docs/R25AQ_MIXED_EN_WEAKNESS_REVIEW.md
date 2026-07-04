# R25AQ Mixed/EN Weakness Review

R25AQ does not train, generate datasets, or modify `training/llm_corpus`. This review uses existing R25AO language-bucket reports and aggregate corpus metadata.

## Finding

R25AO met the zh-first sampler target, but mixed/en buckets are weaker than zh:

- zh heldout loss: 5.4540.
- mixed heldout loss: 6.1143; mixed-minus-zh 0.6603; risk `moderate`.
- en heldout loss: 6.9239; en-minus-zh 1.4699; risk `high`.

## Product Priority

Chinese remains the highest priority. Mixed Chinese/English is higher priority than English because repo work naturally includes code terms, config names, and technical boundaries. English remains capped support, not a generic benchmark-fluency target.

## Recommended Change

R25AR should bias toward a repaired mix around zh >= 65%, mixed about 25%, en <= 10%, with lower training intensity. The aim is mixed boundary robustness without letting English dominate.

R25AR is not approved by R25AQ. Any future pilot requires fresh reviewer approval. Phase_4 remains blocked, product/formal training remains 0%, and no weights are committed.
