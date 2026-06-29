# R25 Static LLM Candidate Matrix

R25A does not download, train, convert, or admit model weights. This matrix is manually curated from repo-known candidate names and earlier local planning surfaces only.

The primary R25 target is a same-origin static decoder LLM that runs in the browser. Encoder-only models, 100M-200M SLMs, server-required models, over-budget models, and unclear-license models are not accepted as the final product target.

| Candidate | Params | Architecture | Est. q size | Chinese | Hobby fit | Pro fit | Admission |
| --- | ---: | --- | ---: | --- | --- | --- | --- |
| Qwen/Qwen2.5-0.5B-Instruct | 500,000,000 | decoder_only | 350 MB | strong repo-known candidate | reject_over_budget | candidate_after_review | primary_review_candidate_not_admitted |
| HuggingFaceTB/SmolLM2-135M-Instruct | 135,000,000 | decoder_only | 95 MB | unknown or weak | borderline_candidate_for_comparison | fits_but_rejected_as_final_target | rejected_as_final_product_target |
| bert-base-multilingual-cased | 179,000,000 | encoder_only | 120 MB | yes | reject_not_decoder_llm | reject_not_decoder_llm | rejected_primary_llm_encoder_only |
| Xenova/paraphrase-multilingual-MiniLM-L12-v2 | 118,000,000 | encoder_only | 85 MB | partial | reject_not_decoder_llm | reject_not_decoder_llm | rejected_primary_llm_encoder_only |
| server-required-or-remote-api-model | 7,000,000,000 | decoder_only | 4000 MB | unknown | reject_requires_backend | reject_requires_backend | rejected_for_r25 |

## Explicit Rejections

- Encoder-only models are rejected as the primary LLM because the R25 answer path needs a decoder draft model.
- 100M-200M SLMs are rejected as the final product target, even if they remain useful fallback or comparison artifacts.
- Models that require server inference, Vercel Functions, Edge Functions, remote APIs, or external storage are rejected.
- Models that exceed the selected static profile budget are rejected.
- Models with unclear license or conversion provenance are rejected until reviewed.

## R25B/R25C Admission Work

R25B adds training-content and admission scaffolding only. It does not download, convert, benchmark, or admit real weights.

R25C adds the local artifact inbox, artifact metadata schema, dry-run manifest intake, sharding plan, candidate loader eval, browser storage plan, and no-unapproved-weight guard. It still does not admit a real model without a reviewed local artifact and explicit approval.

The primary review class remains a small decoder-only browser candidate such as `Qwen/Qwen2.5-0.5B-Instruct`, but it is not admitted. R25C or later must perform local artifact conversion, license/provenance review, static manifest generation with real hashes, browser budget measurement, and the full R24/R25 gate suite before any runtime answer path can use a real model.

No candidate row claims real browser performance.
