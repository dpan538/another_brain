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
