# R25AP R25AO Analysis And Decision

R25AP analyzes R25AO only. It does not train, rerun R25AO, rerun any prior
pilot, run tokenizer dry-run, expand corpus, modify `training/llm_corpus/`,
approve phase_4, commit artifacts, or commit weights.

## R25AO Result

- Run: `r25ao_expanded_chinese_personal_microcycle`
- Variant: `r25ao_sampler_zh70_mixed20_en10`
- Dataset train/dev/heldout: 384 / 96 / 96
- Train mix: zh 269, mixed 77, en 38
- Train share: zh 70.05%, mixed 20.05%, en 9.90%
- Train loss: 8.4616 -> 5.0312
- Dev loss: 8.4456 -> 5.5285
- Heldout loss: 5.7820
- Train/dev gap: 0.4973
- Train/heldout gap: 0.7508
- Dev/heldout gap: 0.2534

R25AO met the Chinese-first sampler target and reduced train/dev loss. It did
not prove better heldout generalization: R25S remains the best available
heldout reference at 5.0692.

## Comparison

| Run | Heldout Loss | Note |
| --- | ---: | --- |
| R25S | 5.0692 | best heldout reference |
| R25Y | 5.1360 | data regularization did not beat R25S |
| R25V | 5.2441 | two-layer ablation did not beat R25S |
| R25P | 5.2506 | second bounded small pilot |
| R25AC | 5.4242 | first Chinese-personal micro-cycle |
| R25AO | 5.7820 | sampler target met, heldout regressed |

R25AO is best aligned with the current project direction because it uses the
expanded Chinese-personal corpus and zh-first sampler, but it is not best by
heldout quality. That difference matters: direction improved, generalization
did not.

## Decision

R25AP recommendation: `pause_for_review`.

Required before any future training:

- Review mixed and English bucket weakness.
- Review high-loss task families.
- Consider sampler or corpus adjustments without training first.
- Require fresh reviewer approval for any later bounded micro-cycle.
- Keep phase_4 blocked.

Product training progress remains `0%`. Formal decoder training progress
remains `0%`. Pilot training progress remains `7%`. No release checkpoint or
browser artifact exists.
