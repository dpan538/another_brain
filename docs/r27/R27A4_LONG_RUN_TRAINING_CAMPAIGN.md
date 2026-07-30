# R27A4 Long Run Training Campaign

R27A4 exists because R27A3 proved real public-corpus and tokenizer plumbing, but its capped 1M-token stream consumed the ordered `secondary_english_mixed` segment first. R27A4 fixes that with deterministic token-budget interleaving before running a longer engineering campaign.

The campaign is `engineering_pilot` only. It has three stages: tokenizer v2 refresh, interleaved pretraining, and instruction/value/RAG training. Hard caps are `6000` steps, `12000000` train tokens, `3` stages, and `6` checkpoints.

R27A4 is not product training, not formal decoder training, not phase_4, not browser admission, and not a release checkpoint. All checkpoints, tokenizer artifacts, raw public corpus, cleaned public text, and processed training streams remain ignored under `artifacts/r27a4/`.
