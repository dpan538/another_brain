# R25AF Personal Writing Intake Policy

R25AF defines how user writing, poems, essays, fragments, preferred answers,
and repaired answers may be supplied for future review. It does not train,
does not generate corpus rows, does not parse existing root PDFs/DOCX, does not
parse `data/public_ingestion/`, and does not commit private raw writing.

## Local-Only Inbox

Future source files may be placed under ignored local paths only:

- `private_sources/r25af_user_writing_inbox/poetry/`
- `private_sources/r25af_user_writing_inbox/essays/`
- `private_sources/r25af_user_writing_inbox/fragments/`
- `private_sources/r25af_user_writing_inbox/preferred_answers/`
- `private_sources/r25af_user_writing_inbox/rejected_and_repaired_answers/`

`private_sources/**` must stay ignored by git. Raw files in those directories
are metadata-only by default: file count, extension, byte size, relative path,
and optional hash. Their text must not be parsed, copied into tracked docs, or
committed unless a later explicit review changes the source permission.

## Source Rules

User writing and poetry are valuable style/source material, not direct dialogue
data. Poetry, prose, and notes must first become reviewed derived artifacts such
as style cards, dialogue rewrites, preference pairs, repair pairs, or
project-continuation examples.

Raw private data must not enter the training corpus. Chain-of-thought, hidden
prompts, secrets, local private paths, and unreviewed personal claims are
forbidden. External LLM conversion is forbidden. Source ownership or license
must be user-owned or explicitly permitted before any derived row is considered.

Reviewed derived rows may be tracked only after separate approval. Future
training after any corpus expansion requires another fresh approval.

R25AG repository text discovery may catalog existing repo-local tracked docs and
structured corpus scaffolds before requesting new private uploads. That
discovery is not parsing private inbox files, not generating corpus rows, not
training, not modifying `training/llm_corpus/`, not parsing root PDFs/DOCX, and
not bulk-parsing `data/public_ingestion/`. Future R25AH work may propose
source-specific derived rows from selected existing repo text only after fresh
review.
