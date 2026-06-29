# R25 Static LLM Candidate Matrix

R25A does not download, train, convert, or admit model weights. This matrix is manually curated from repo-known candidate names and earlier local planning surfaces only.

The primary R25 target is a same-origin static decoder LLM that runs in the browser. Encoder-only models, 100M-200M SLMs, server-required models, over-budget models, and unclear-license models are not accepted as the final product target.

| Candidate | Params | Architecture | Est. q size | Chinese | Hobby fit | Pro fit | Admission |
| --- | ---: | --- | ---: | --- | --- | --- | --- |
| Qwen/Qwen2.5-0.5B-Instruct | 500,000,000 | decoder_only | 350 MB | strong repo-known candidate | reject_over_budget | candidate_after_review | candidate_for_r25b_review |
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

## R25B Work

R25B should choose a real decoder artifact, convert it for browser inference, place assets under the approved static LLM asset path, write a real manifest with sha256 hashes, and pass the R25 admission gate before any runtime answer path uses it.
