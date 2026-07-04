# R25AQ Sampler Variant Simulation

R25AQ does not train, run a tokenizer dry-run, expand corpus, or write train/dev/heldout dataset files. This simulation only counts available tracked corpus rows and target allocations.

## Simulated Variants

- r25ar_balanced_zh65_mixed25_en10: train zh/mixed/en 250/96/38; risk low; baseline sampler change; quality risk remains if intensity is unchanged
- r25ar_zh70_mixed25_en5: train zh/mixed/en 269/96/19; risk low; protects English cap but may not address mixed enough
- r25ar_zh70_mixed20_en10_lower_intensity: train zh/mixed/en 269/77/38; risk low; baseline sampler change; quality risk remains if intensity is unchanged
- r25ar_zh70_mixed20_en10_shorter_steps: train zh/mixed/en 269/77/38; risk low; baseline sampler change; quality risk remains if intensity is unchanged
- r25ar_zh70_mixed20_en10_more_personal_targets: train zh/mixed/en 269/77/38; risk low; baseline sampler change; quality risk remains if intensity is unchanged
- r25ar_zh65_mixed25_en10_lower_intensity: train zh/mixed/en 250/96/38; risk low; better mixed robustness with lower overfit pressure; slightly less zh dominance

## Recommendation

Recommended design: `r25ar_zh65_mixed25_en10_lower_intensity`.

This choice raises mixed coverage while keeping English capped at 10%, lowers training intensity from R25AO, keeps the one-layer pilot architecture, and keeps phase_4 blocked. It is not approved by R25AQ; a future R25AR run requires fresh reviewer approval.

Product training progress remains 0%. No weights, artifacts, backend/storage path, external APIs/downloads, chain-of-thought, or private raw data are added.
