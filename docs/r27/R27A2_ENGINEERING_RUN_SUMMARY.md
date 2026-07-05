# R27A2 Engineering Run Summary

Run id: `r27a2_bounded_engineering_20260705T095626Z`.

Steps: `100`. Train loss: `6.9537` -> `4.4690`. Dev loss: `4.9114`. Heldout loss: `4.8225`.

Actual mix: `{'user_answered_anchor': 0.1526, 'rag_evidence_grounded': 0.3738, 'reasoning_symbolic': 0.4673, 'value_aesthetic': 0.0062}`.

This is an engineering training run only. It is not product training, not phase_4, not a product model, and no weights/artifacts are committed.

## Configuration

- Training command: `python3 scripts/r27a2_engineering_train.py --max-steps 100 --context-length 256 --run-label r27a2_bounded_engineering`
- Evaluation command: `python3 scripts/r27a2_evaluate_engineering_run.py --latest`
- Model lab path: `src/training/model_lab/`
- Runtime: CPU Python standard library
- Tokenizer: bounded character fallback tokenizer
- Tokenizer vocabulary size: `1047`
- Max steps: `100`
- Context length: `256`
- Product model: `false`
- Phase 4 training: `false`
- Release checkpoint: `false`
- Remote model weights downloaded: `false`
- Weights committed: `false`

## Training Data Used

- Train records: `498`
- Dev records: `74`
- Heldout records: `70`
- Train tokens: `26272`
- Dev tokens: `3867`
- Heldout tokens: `3583`
- Public corpus downloaded bytes: `0`
- Raw public samples used: `0`
- Public/instruction curricula were not populated because public source licenses and access remained conditional in R27A2.
- `another_brain_question_pack_001` rows `51-100` were not used.
- Evaluation prompts were not used as training rows.
- Chain-of-thought, hidden prompts, secrets, and private raw text were blocked by the cleaning and mix guards.

## Curriculum Counts

- `user_answered_anchor`: `98`
- `rag_evidence_grounded`: `240`
- `reasoning_symbolic`: `300`
- `value_aesthetic`: `4`
- Missing because of R27A2 source constraints: `public_chinese_pretraining`, `secondary_english_mixed`, `instruction_distillation`

## Ignored Artifacts

R27A2 wrote only ignored run artifacts under:

- `artifacts/r27a2/metadata/`
- `artifacts/r27a2/manifests/`
- `artifacts/r27a2/reports/`
- `artifacts/r27a2/training_mix/`
- `artifacts/r27a2/model_lab/tokenizer/`
- `artifacts/r27a2/model_lab/checkpoints/`
- `artifacts/r27a2/model_lab/runs/r27a2_bounded_engineering_20260705T095626Z/`

These artifacts are audit and engineering-run outputs only. They must not be committed.

## Command Log

- `npm run test:r27a2`: pass
- `python3 scripts/r27a2_fetch_public_samples.py --dry-run`: pass
- `python3 scripts/r27a2_fetch_public_samples.py --execute --max-total-raw-mb 25 --max-rows-per-source 500 --max-bytes-per-source 8000000`: pass
- `python3 scripts/r27a2_clean_public_samples.py`: pass
- `python3 scripts/r27a2_build_training_mix.py --max-total-records 3000`: pass
- `python3 scripts/r27a2_engineering_train.py --max-steps 100 --context-length 256 --run-label r27a2_bounded_engineering`: pass
- `python3 scripts/r27a2_evaluate_engineering_run.py --latest`: pass
- `npm run check:training-approval-markers`: pass
- `npm run check:no-training-in-routine-gates`: pass
- `npm run check:r27a-p0-reasoning-rag-value-distill`: pass

## Gate Status

- R27A aggregate gate: pass
- R26G history gate: pass
- R26D question-pack exclusion guard: pass
- R26E promoted user-answer gate: pass
- LLM training corpus gate: pass
- Training provenance gate: pass
- Eval split integrity gate: pass
- Training approval marker gate: pass
- No-training-in-routine-gates guard: pass
- From-scratch training doctrine gate: pass
- Chinese personal training direction gate: pass
- R24 recovery candidate gate: pass
- R24G source derivation gate: pass
- R24B shard runtime gate: pass
- Vercel build: pass

## Non-Claims

R27A2 does not claim product readiness, formal decoder training progress, phase 4 readiness, public-corpus license clearance, release checkpoint creation, named pretrained model selection, LoRA/fine-tune/adapters as a final path, backend/storage/API expansion, or committed weights. The consumed R27A2 approval authorized exactly one bounded engineering run; no additional training is approved.
