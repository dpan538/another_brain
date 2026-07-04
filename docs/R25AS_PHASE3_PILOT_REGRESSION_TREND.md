# R25AS Phase 3 Pilot Regression Trend

R25AS reads completed reports only. It does not train, rerun pilots, run tokenizer dry-run, expand corpus, or approve phase_4.

| Pilot | Variant | Steps | Final dev | Heldout | Classification |
| --- | --- | ---: | ---: | ---: | --- |
| R25M | n/a | 80 | 8.3004 | n/a | informative_but_not_product |
| R25P | r25p_more_sequences_128 | 80 | 5.6368 | 5.2506 | heldout_regressed_vs_best |
| R25S | r25s_data_first_balanced_192 | 80 | 5.2674 | 5.0692 | best_data_first_reference |
| R25V | two_layer_same_width | 80 | 5.4305 | 5.2441 | heldout_regressed_vs_best |
| R25Y | r25y_data_regularized_192 | 80 | 5.4293 | 5.1360 | heldout_regressed_vs_best |
| R25AC | r25ac_chinese_personal_microcycle_256 | 100 | 5.8502 | 5.4242 | heldout_regressed_vs_best |
| R25AO | r25ao_sampler_zh70_mixed20_en10 | 100 | 5.5285 | 5.7820 | heldout_regressed_vs_best |
| R25AR | r25ar_mixed_repair_lower_intensity | 60 | 6.7373 | 6.8565 | heldout_regressed_vs_best |

Best heldout reference: `R25S`. R25S remains the loss reference. R25AO and R25AR are more aligned with the Chinese-personal direction, but both regressed on heldout quality, with R25AR worse than R25AO. The small-pilot objective remains useful as a warning signal, not as a product-readiness proof.
