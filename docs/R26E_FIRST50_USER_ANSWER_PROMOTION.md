# R26E First-50 User Answer Promotion

R26E is a corpus review and promotion step. It promotes selected reviewed candidates from the R26D first-50 user-answer intake into tracked corpus split files.

The promoted rows are answer-as-user rows: they preserve the user's own wording as the training target rather than rewriting it into a generic assistant response.

R26E does not train, does not run tokenizer dry-run, does not call Doubao or any external teacher, and does not use rows 51-100. The raw CSV remains private and ignored.

Output corpus files:
- `training/llm_corpus/r26e_user_answered_train.jsonl`
- `training/llm_corpus/r26e_user_answered_dev.jsonl`
- `training/llm_corpus/r26e_user_answered_heldout.jsonl`

Rows 51-100 remain excluded. Replacement rows 51-100 are still needed before any serious training decision, and R26F requires fresh approval.
