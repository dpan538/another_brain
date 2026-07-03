# R25AN Chinese Sampler Feasibility Summary

R25AN simulated zh-first sampling plans from tracked `training/llm_corpus/*.jsonl` only. It did not write training datasets and did not train a decoder.

## Recommendation

- sampler_ready_for_bounded_microcycle

## Plans

- 256_64_64: train 256, dev 64, heldout 64; feasible without replacement: true; train need zh/mixed/en 180/51/25
- 384_96_96: train 384, dev 96, heldout 96; feasible without replacement: true; train need zh/mixed/en 269/77/38
- 512_128_128: train 512, dev 128, heldout 128; feasible without replacement: true; train need zh/mixed/en 359/102/51

## Boundary

Sampler readiness is not training approval. Any R25AO micro-cycle still requires a fresh explicit approval, and phase_4 remains blocked.
