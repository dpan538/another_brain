# R25 Static LLM Candidate Matrix

R25G and R25H keep candidate selection model-agnostic. They do not download, train, convert, or admit model weights.

R25I reorients the product path toward a project-trained decoder LLM trained from scratch, then packaged as a static browser release. No named pretrained model is selected. External artifacts are compatibility or baseline-only unless explicitly reviewed as such.

| Candidate | Params | Architecture | Est. q size | Chinese | Hobby fit | Pro fit | Admission |
| --- | ---: | --- | ---: | --- | --- | --- | --- |
| self_trained_browser_decoder_release_tbd | 0 | decoder_only | 0 MB | planned_zh_en_mixed_tokenizer_and_corpus | optional_likely_rejects_scaled_release | primary_profile_for_self_trained_release | from_scratch_release_planned_not_trained |
| project_tiny_decoder_sanity_model_not_product | 0 | decoder_only | 0 MB | pipeline_sanity_only | may_fit_if_tiny | fits_if_tiny | future_toy_sanity_not_product |
| baseline_external_decoder_comparison_only | 0 | decoder_only | 0 MB | comparison_only | tbd_if_reviewed_baseline | tbd_if_reviewed_baseline | baseline_only_not_product |
| encoder_only_family_rejected | 0 | encoder_only | 0 MB | varies | reject_not_decoder_llm | reject_not_decoder_llm | rejected_primary_llm_encoder_only |
| legacy_slm_family_rejected | 0 | decoder_only | 0 MB | varies | reject_as_final_target | reject_as_final_target | rejected_as_final_product_target |
| lora_adapter_path_rejected_as_final_strategy | 0 | decoder_only | 0 MB | varies | reject_as_final_strategy | reject_as_final_strategy | rejected_as_final_strategy |
| server_required_family_rejected | 0 | decoder_only | 0 MB | varies | reject_requires_backend | reject_requires_backend | rejected_for_r25 |
| over_budget_decoder_family_rejected | 0 | decoder_only | 0 MB | varies | reject_over_budget | reject_over_budget | rejected_over_budget |
| unclear_license_family_rejected | 0 | decoder_only | 0 MB | varies | reject_until_reviewed | reject_until_reviewed | rejected_unclear_license |
| conversion_required_family_pending | 0 | decoder_only | 0 MB | tbd | tbd_after_conversion_review | pending_conversion_path_review | awaiting_candidate_decision |
| capacity_envelope_family_pending | 0 | decoder_only | 0 MB | tbd | often_rejects_larger_decoder_envelopes | primary_capacity_profile_pending_real_artifact | awaiting_capacity_reviewed_candidate |

## Explicit Rejections

- Encoder-only models are rejected as the primary LLM because the R25 answer path needs a decoder draft model.
- 100M-200M SLMs are rejected as the final product target, even if they remain useful fallback or comparison artifacts.
- LoRA, fine-tuning, adapters, and external pretrained adaptation are rejected as the final product strategy.
- Models that require server inference, Vercel Functions, Edge Functions, remote APIs, or external storage are rejected.
- Models that exceed the selected static profile budget are rejected.
- Models with unclear license or conversion provenance are rejected until reviewed.

## R25I Release And Capacity Framework

R25B through R25H add training-content, loader, admission, purge, decision, and capacity scaffolding only. R25I adds from-scratch training doctrine and release-decision framing. None of these patches train, download, convert, benchmark, or admit real weights.

The current status is `from_scratch_release_planned_not_trained`, `no_named_model_selected`, and `awaiting_self_trained_release_decision`. R25H adds a metadata-only capacity envelope and dry-run manifests so future release artifacts can be measured before artifact intake. A future patch must create a reviewed self-trained release decision, check `static_llm/conversion_paths/matrix.json`, compare the release to `static_llm/capacity_profiles/`, then perform local artifact review, license/provenance review, static manifest generation with real hashes, browser budget measurement, and the full R24/R25 gate suite before any runtime answer path can use a real model.

A release decision record does not admit weights. It only allows a later local artifact intake attempt for a future self-trained artifact.

No candidate row claims real browser performance.
