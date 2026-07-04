# R25AQ R25AO Root-Cause Summary

R25AQ does not train, rerun R25AO, run a tokenizer dry-run, expand corpus, or modify `training/llm_corpus`. It analyzes the already completed R25AO ignored reports.

## Classification

R25AO is classified as `sampler_success_quality_regressed`. The likely root-cause set is: `sampler_overfocus_on_zh`, `language_bucket_imbalance`, `task_family_mismatch`, `source_family_mismatch`, `training_intensity_too_high`, `heldout_distribution_mismatch`.

## Loss Behavior

- Train loss: 8.4616 -> 5.0312.
- Dev loss: 8.4456 -> 5.5285.
- Heldout loss: 5.7820.
- Train/dev gap: 0.4973.
- Train/heldout gap: 0.7508.
- Dev/heldout gap: 0.2534.
- Best prior heldout reference: 5.0692.

## Sampler Versus Quality

R25AO met the zh-first sampler target with train mix zh 70.05%, mixed 20.05%, en 9.90%. That is sampler success, not quality success: heldout regressed against the best prior reference.

## Language Buckets

- zh heldout loss: 5.4540.
- mixed heldout loss: 6.1143; mixed-minus-zh 0.6603.
- en heldout loss: 6.9239; en-minus-zh 1.4699.

Mixed remains more product-important than English because the project is Chinese-first but technical repo conversation is often mixed.

## High-Loss Families

- Chinese_project_decision: loss 8.1009 over 2 heldout sequences
- constraint_preservation: loss 8.0087 over 3 heldout sequences
- draft_answer: loss 7.9233 over 1 heldout sequences
- release_packaging_boundary: loss 7.8877 over 2 heldout sequences
- no_backend_policy: loss 7.7922 over 4 heldout sequences
- verify_draft: loss 7.5364 over 1 heldout sequences
- retrieval_grounded_answer: loss 7.2252 over 1 heldout sequences

## Boundary

R25AQ does not justify an immediate repeat. R25AR is design-only and requires fresh approval before any bounded pilot. Product training progress remains 0%, phase_4 remains blocked, no weights are committed, no external APIs/downloads are used, no backend/storage path is introduced, and no chain-of-thought or private raw data is added.
