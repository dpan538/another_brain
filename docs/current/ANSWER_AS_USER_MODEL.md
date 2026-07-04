# Answer-As-User Model

The answer-as-user model describes training and eval rows where another_brain drafts a response as the user might answer a selected question. This is not a generic assistant persona.

Rows should preserve relationship context, intent, evidence status, and the correct answer mode. A friend question may permit warmth or compression; a public comment may require sharper boundaries; a project-agent question may need local-first status honesty.

## Core Semantics

- `assistant` is a serialized message role only, not a persona.
- `answer_as` must be `user_self`.
- `bad_assistant_answer` captures a weak generic answer to avoid.
- `why_bad` explains observable failure without hidden reasoning.
- `target_answer` is the reviewed answer-as-user draft.
- `rejected_answers` should include over-helpful, generic, auto-apologetic, or unsupported-concession failures where useful.

Answer modes are defined in `training/current/answer_modes.json`. The schema is `training/current/answer_as_user.schema.json`.

Forbidden content: chain-of-thought fields, hidden prompts, raw private data, local private paths, copied long copyrighted text, and eval prompt copies.

## Question-Pack Eligibility

R26C adds a hard boundary for the first 100-question answer pack. Question IDs 1-50 are `candidate_review_only`; they can be reviewed later but are not automatically training rows. Question IDs 51-100 are `excluded_from_training` because they ask about project progress, training direction, tool status, or internal structure instead of real answer-as-user behavior.

Rows 51-100 must not become positive examples, negative examples, preference pairs, repair pairs, teacher probes, tokenizer text, eval-derived training seeds, long-horizon rows, corpus-generation prompts, or promoted corpus rows. They may be referenced only as excluded-policy evidence or cleanup notes.
