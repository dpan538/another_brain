# R25AQ R25AR Repaired Sampler Design

R25AQ does not train, rerun R25AO, run a tokenizer dry-run, expand corpus, modify `training/llm_corpus`, approve R25AR, or approve phase_4.

R25AR is an inert future design for one bounded phase_3 pilot. It exists because R25AO met the zh-first sampler target while heldout quality regressed. The repair target is mixed weakness, not generic English benchmark fluency.

## Design

- Variant: `r25ar_mixed_repair_lower_intensity`.
- Sampler target: zh >= 65%, mixed about 25%, en <= 10%.
- Rows: train/dev/heldout 384/96/96.
- Context: 64 tokens.
- Training intensity: 60 steps, learning rate 0.003, with early stop if dev worsens.
- Architecture: unchanged one-layer `causal_decoder_pilot` basis from the R25S data-first line.

## Boundary

The R25AR approval template is `approved:false` and all training, product, phase_4, release, and weight flags are false. A future run requires fresh explicit approval and must consume that approval after one attempt.

Product training progress remains 0%. Formal decoder training progress remains 0%. Phase_4 remains blocked. No weights, artifacts, external APIs/downloads, backend/storage path, chain-of-thought, or private raw data are added.
## R25AR Result Note

R25AR executed the repaired-sampler design once with zh 65.10%, mixed 25.00%, and en 9.90% in train. The run proved the sampler can execute, but heldout loss regressed to 6.8565 and mixed/en gaps remained weak. The design therefore needs analysis before any future approved pilot.
