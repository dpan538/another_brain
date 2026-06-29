# R25 Static LLM Candidate Matrix

R25F resets candidate selection to a model-agnostic state. It does not download, train, convert, or admit model weights.

The primary R25 target is a same-origin static decoder LLM that runs in the browser. No named model is selected. The next candidate must be supplied locally by the user or selected in a later reviewed decision.

| Candidate | Params | Architecture | Est. q size | Chinese | Hobby fit | Pro fit | Admission |
| --- | ---: | --- | ---: | --- | --- | --- | --- |
| local_reviewed_decoder_artifact_tbd | 0 | decoder_only | 0 MB | tbd | tbd_after_artifact_review | awaiting_reviewed_local_decoder_artifact | candidate_selection_reset |
| browser_ready_decoder_artifact_tbd | 0 | decoder_only | 0 MB | tbd | optional_fit_if_under_budget | primary_profile_after_review | no_named_model_selected |
| encoder_only_family_rejected | 0 | encoder_only | 0 MB | varies | reject_not_decoder_llm | reject_not_decoder_llm | rejected_primary_llm_encoder_only |
| legacy_slm_family_rejected | 0 | decoder_only | 0 MB | varies | reject_as_final_target | reject_as_final_target | rejected_as_final_product_target |
| server_required_family_rejected | 0 | decoder_only | 0 MB | varies | reject_requires_backend | reject_requires_backend | rejected_for_r25 |
| over_budget_decoder_family_rejected | 0 | decoder_only | 0 MB | varies | reject_over_budget | reject_over_budget | rejected_over_budget |
| unclear_license_family_rejected | 0 | decoder_only | 0 MB | varies | reject_until_reviewed | reject_until_reviewed | rejected_unclear_license |

## Explicit Rejections

- Encoder-only models are rejected as the primary LLM because the R25 answer path needs a decoder draft model.
- 100M-200M SLMs are rejected as the final product target, even if they remain useful fallback or comparison artifacts.
- Models that require server inference, Vercel Functions, Edge Functions, remote APIs, or external storage are rejected.
- Models that exceed the selected static profile budget are rejected.
- Models with unclear license or conversion provenance are rejected until reviewed.

## R25B/R25C Admission Work

R25B through R25F add training-content, loader, and admission scaffolding only. They do not download, convert, benchmark, or admit real weights.

The current status is `candidate_selection_reset`, `no_named_model_selected`, and `awaiting_reviewed_local_decoder_artifact`. A future patch must perform local artifact review, license/provenance review, static manifest generation with real hashes, browser budget measurement, and the full R24/R25 gate suite before any runtime answer path can use a real model.

No candidate row claims real browser performance.
