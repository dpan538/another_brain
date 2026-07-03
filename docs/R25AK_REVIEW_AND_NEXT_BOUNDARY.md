# R25AK Review And Next Boundary

R25AK changes `training/llm_corpus` by adding reviewed repo-derived split files. It does not train, does not run tokenizer dry-run, and does not approve phase_4 scaled training.

## Current Boundary

- Promoted rows are reviewed corpus rows, not a trained model.
- Raw private sources are not used.
- Eval prompts are not used.
- Ignored R25AJ/R25AK artifacts are not committed.
- Product and formal training progress remain 0%.
- Phase_4 remains blocked.

## R25AL Boundary

R25AL may review the promoted corpus and request a later tokenizer/corpus-readiness approval. It must not automatically train. A later bounded Chinese-personal micro-cycle would need a separate fresh approval after corpus review.

R25AL may run tokenizer dry-run readiness only. It must not run decoder training, small-pilot training, phase_4 scaled training, long-term training, or product-scale training. Tokenizer artifacts stay ignored and uncommitted. R25AM remains a future inert approval path, not automatic training.
