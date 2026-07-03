# R25AO Expanded Chinese-Personal Micro-Cycle Run

R25AO ran exactly one approved phase 3 bounded small decoder pilot:
`r25ao_expanded_chinese_personal_microcycle` /
`r25ao_sampler_zh70_mixed20_en10`.

This is pilot training only. It is not formal decoder training, product-scale
training, long-term training, phase_4 scaled training, release checkpoint
admission, tokenizer dry-run, or browser static deployment.

## Dataset

- Train/dev/heldout rows: 384 / 96 / 96
- Train language counts: zh 269, mixed 77, en 38
- Dev language counts: zh 68, mixed 19, en 9
- Heldout language counts: zh 68, mixed 19, en 9
- Train mix: zh 70.05%, mixed 20.05%, en 9.90%
- Source scope: tracked `training/llm_corpus/` split files only
- Split overlap: none

## Run Result

- Backend: local `python_torch`
- Architecture: one-layer `r25s_baseline_data_first` causal decoder pilot
- Parameters: 566080
- Steps: 100
- Initial/final train loss: 8.4616 -> 5.0312
- Initial/final dev loss: 8.4456 -> 5.5285
- Train loss decreased: true
- Dev loss finite: true
- Replayable checkpoint: written as ignored JSON only

## Boundary

The approval marker was consumed after the attempt. Future R25AO reruns,
tokenizer dry-runs, corpus changes, promotion work, product training, release
admission, or phase_4 work require a fresh explicit approval. No weights or
R25AO artifacts are committed.

## R25AP Analysis Note

R25AP later analyzed this run without training or replaying the pilot. The
analysis classifies R25AO as sampler-success but quality-regressed: the
Chinese-first sampler target was met and train/dev loss decreased, but heldout
loss was worse than R25S and R25AC. R25AP therefore recommends
`pause_for_review`, not an immediate repeat, tokenizer dry-run, corpus
expansion, or phase_4 review.
