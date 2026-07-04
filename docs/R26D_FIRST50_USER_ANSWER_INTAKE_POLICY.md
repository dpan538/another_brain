# R26D First-50 User Answer Intake Policy

R26D parses the approved local CSV from `private_sources/question_packs/another_brain_question_pack_001_answered.csv` and uses only rows 1-50 as answer-as-user candidate material.

## Boundaries

- Raw CSV remains ignored/private and must not be committed.
- Rows 1-50 are `candidate_review_only`, not active training rows.
- Rows 51-100 are `excluded_from_training`.
- Candidate rows remain under ignored artifacts until a later review and promotion step.
- Candidate rows may later become tracked corpus only after explicit approval.
- User wording is the primary signal; Codex must not assistant-ify it.
- Poems, essays, and project docs are not involved in this R26D intake.
- Teacher/Doubao is not involved in R26D.
- No chain-of-thought, private raw data, local paths, secrets, or eval prompt copies are allowed.

Rows 51-100 must not be used as positive samples, negative samples, preference pairs, repair pairs, teacher-probe prompts, tokenizer training text, eval-derived training seeds, long-horizon rows, or prompt-generation sources.
