# Current Training Structure

R26A creates this canonical current-training directory as an index, not as a move operation.

- `corpus_manifest.json` references active corpus files in `training/llm_corpus/`.
- `training_status.json` records that product/formal training remain at 0%, phase_4 is blocked, and any future training needs fresh approval.
- `source_policy.json` keeps root DOC/PDF files, `data/public_ingestion/`, `private_sources/`, ignored artifacts, and eval prompts out of training by default.

No corpus rows were generated, promoted, rewritten, or moved in R26A.

R26H adds a readiness gate over the post-R26G user-answer corpus. It does not
modify `training/llm_corpus`, does not train, and does not approve phase_4.
The R26I entry files are inert templates until a fresh reviewer approval is
provided.

R27A adds current-training schemas and tracked indexes for trace-only
reasoning plans, local evidence packets, value/aesthetic profile packets,
teacher probes, and reviewed distillation candidates. It also adds a relation
evidence index, value/aesthetic profile, and teacher-probe pack for P0
architecture review. R27A does not modify `training/llm_corpus`, does not
train, does not run tokenizer dry-run, and does not approve phase_4.
