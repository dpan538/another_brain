# R25AO Review And Next Boundary

R25AO completed one bounded expanded Chinese-personal phase 3 micro-cycle and
then stopped. The result is useful for review, not an automatic training or
release decision.

## Comparison Summary

- R25AO vs R25AC: more train/dev/heldout rows, lower final dev loss, higher
  heldout loss.
- R25AO vs R25S: more rows and Chinese-first sampling, but higher dev and
  heldout loss.
- History recommendation: `expanded_chinese_personal_neutral`.
- Next-step recommendation:
  `stop_and_review_r25ao_before_any_repeat_tokenizer_or_phase_4_design_review`.

## Required Pause

R25AP is the next analysis boundary. It may analyze R25AO only after explicit
approval, and its template is inert by default. R25AP does not authorize
training, tokenizer dry-run, phase_4 scaled training, product training, release
checkpoint admission, or weight commit.

Any later bounded micro-cycle, tokenizer review, corpus change, or promotion
step needs a separate approval. Phase_4 scaled training is not approved.
Product/formal training progress remains 0%, and the R25AO checkpoint remains
an ignored pilot artifact.

## R25AP Outcome

R25AP confirms that R25AO does not justify automatic continuation. The run met
the zh-first sampler target, but R25S remains best by heldout loss and mixed/en
buckets need review. The next boundary is a pause for review or a fresh
approval for non-training sampler/corpus analysis before any later bounded
training proposal.

## R25AQ Follow-Up

R25AQ performs that non-training sampler/root-cause analysis. It confirms that
R25AO met the zh-first sampler target and reduced train/dev loss, but heldout
regressed against the best prior references. Mixed and English buckets are
weak; mixed is the higher priority because the target remains Chinese-first
with technical mixed-language robustness. R25AR is only an inert repaired
sampler design and is not approved. Product/formal training progress remains
`0%`, phase_4 remains blocked, and no weights or artifacts are committed.
## R25AR Boundary Update

R25AR was the approved repaired-sampler follow-up to R25AO. It ran once, consumed its approval, and did not improve heldout generalization. R25AO and R25AR together support a pause-for-review boundary before any further training, tokenizer dry-run, corpus expansion, or phase_4 discussion.
