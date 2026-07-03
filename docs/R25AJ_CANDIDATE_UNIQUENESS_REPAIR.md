# R25AJ Candidate Uniqueness Repair

R25AJ repairs the R25AH repo-derived candidate-generation path after R25AI blocked promotion on target-answer uniqueness. It does not train, does not promote rows, does not modify `training/llm_corpus`, and does not commit generated candidate artifacts.

## Blocker Preserved

R25AI correctly blocked before promotion because the R25AH artifact had 440 candidate rows but only 36 unique target answers. The attempted 256/32/32 promotion could not satisfy the no-duplicate-target rule.

The failure was not a reason to scale training. It was a candidate quality issue: the old generator reused a small set of target templates while varying source metadata.

## Repair

R25AJ adds:

- a blocked-promotion diagnostic
- a review rubric
- a normalized uniqueness checker
- a repaired deterministic generator
- a candidate validator
- an ignored review-pack builder
- an inert R25AK promotion template

The repaired generator uses selected tracked repo sources from R25AH and binds each candidate to source category, file theme, short digest, and transformation obligation. It does not create uniqueness by appending IDs or meaningless suffixes.

## Boundaries

- No training ran.
- No promotion ran.
- `training/llm_corpus` is unchanged.
- Root PDF, DOC, and DOCX files were not parsed.
- `data/public_ingestion` was not parsed.
- `private_sources` was not read.
- Evals were not used as candidate sources.
- Phase_4 scaled training remains blocked.
- No weights or artifacts are committed.

R25AK is required before any reviewed subset of R25AJ candidates can be promoted. Future training after promotion still requires another approval.

## R25AK Follow-Up

R25AK promotes a bounded reviewed subset of these unique candidates into
tracked corpus split files. That promotion is corpus preparation only: no
training, no tokenizer dry-run, no phase_4 approval, and no ignored candidate
artifacts are committed.
