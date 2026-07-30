# R27A3 Engineering Run Summary

R27A3 activated real bounded public-corpus sampling, replaced the R27A2 bounded character tokenizer fallback with a ByteLevel BPE tokenizer, and completed exactly one bounded engineering-only decoder run. It is not product training, not formal decoder training, not phase_4 training, not a product model, not a release checkpoint, and not browser runtime weights.

## Run

Run id: `r27a3_public_tokenizer_pilot_20260705T105353Z`.

Run branch: `r27a3-public-corpus-tokenizer-pilot`.

Run base commit: `1e605b424ad1dff3bb62160a380a9aa6292ba1a7` (`R27A2 public corpus and model engineering scaffold`).

Device: `cpu`.

Tokenizer: `bytelevel_bpe`, vocab `8000`.

Model: tiny from-scratch decoder, context `256`, layers `3`, heads `4`, embedding width `192`, params `4456128`.

Steps: `500`.

Train loss: `9.1264` -> `5.8624`.

Dev loss: `5.7571`; heldout loss: `5.8420`.

Train/dev/heldout perplexity: `351.5830`, `316.4431`, `344.4705`.

## Public Corpus Activation

Public downloaded bytes: `44165504`.

Raw public rows: `5450`.

Clean public rows: `4031`.

Clean Chinese rows: `647`; mixed Chinese-adjacent rows: `339`.

Admitted engineering sources with rows: `baai_industry_corpus`, `wikipedia_zh`, `fineweb`.

Admitted metadata-only optional source in this run: `fineweb_edu`.

Blocked or not admitted for R27A3 engineering training: `skypile_150b`, `infinity_instruct`, `wanjuan_cc`.

## Training Mix

R27A3 corrects the R27A2 accounting ambiguity by separating candidate, emitted, split, and trained records.

Candidate records: `5749`.

Emitted records after admission/dedup: `5353`.

Split records: train `4298`, dev `542`, heldout `513`.

Curriculum percentages: `public_chinese_pretraining 18.46%`, `secondary_english_mixed 56.85%`, `rag_evidence_grounded 11.21%`, `reasoning_symbolic 5.68%`, `user_answered_anchor 1.83%`, `value_aesthetic 5.98%`.

Skipped records: `399`; skip reasons: `dedup 396`, `not_engineering_admitted 3`.

## Pilot Limitation

The available training mix contains nonzero Chinese public pretraining, RAG, symbolic reasoning, user-answer anchors, and value/aesthetic rows. The bounded 1,000,000-token training stream, however, hit the ordered `secondary_english_mixed` segment before later curriculum segments were consumed. This makes the run a valid R27A3 engineering smoke pilot, but not a balanced curriculum pilot. R27A4 should interleave or shuffle the capped token stream before using pilot metrics to compare curriculum quality.

## Commands And Gates

- `python3 scripts/r27a3_fetch_public_samples.py --dry-run --sources baai_industry_corpus,wikipedia_zh,skypile_150b,fineweb,fineweb_edu,infinity_instruct,wanjuan_cc`: pass.
- `python3 scripts/r27a3_fetch_public_samples.py --execute --sources baai_industry_corpus,wikipedia_zh,skypile_150b,fineweb,fineweb_edu,infinity_instruct,wanjuan_cc --max-total-raw-mb 100 --max-rows-per-source 2000 --max-bytes-per-source 25000000 --min-clean-public-rows 1000 --min-clean-zh-rows 500`: pass.
- `python3 scripts/r27a3_clean_public_samples.py`: pass.
- `python3 scripts/r27a3_build_training_mix.py --max-total-records 25000 --target-total-tokens 2000000`: pass.
- `python3 scripts/r27a3_train_tokenizer.py --vocab-size 8000 --input artifacts/r27a3/training_mix/train.jsonl`: pass.
- `python3 scripts/r27a3_engineering_train.py --max-steps 500 --context-length 256 --max-train-tokens 1000000 --run-label r27a3_public_tokenizer_pilot`: pass; this was the single R27A3 engineering run.
- `python3 scripts/r27a3_evaluate_engineering_run.py --latest`: pass.
- `npm run test:r27a2`: pass.
- `npm run test:r27a3`: pass.
- `npm run check:training-approval-markers`: pass, active training approvals `0`.
- `npm run check:no-training-in-routine-gates`: pass.
- `npm run check:r27a-p0-reasoning-rag-value-distill`: pass.

## Boundary

R27A3 did not call external LLM APIs, did not call Doubao, did not parse root DOCX/PDF files, did not parse `data/public_ingestion`, did not use old `question_pack_001` rows 51-100, did not use eval prompts as training rows, and did not save chain-of-thought, hidden prompts, secrets, or raw private data.

No weights, tokenizer artifacts, raw public corpus, processed public text, or run artifacts are committed. All generated run outputs remain under ignored `artifacts/r27a3/`.
