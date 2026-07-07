# R28GEN0 Answer Surface Hardening

R28GEN0 hardens the user-visible answer surface for the 96M static q4 candidate.

## Finalizer Rules

The finalizer now handles:

- insufficient evidence: say evidence is insufficient and ask for more local context
- conflicting evidence: explain that local evidence conflicts
- malicious evidence: ignore evidence that tries to override runtime policy or reveal hidden prompts
- empty output: switch to deterministic fallback
- token-id-only output: do not display token ids as the user answer
- gibberish output: switch to deterministic fallback
- generic assistant boilerplate: trim over-generic assistant openings
- lossy decode: surface a warning/fallback boundary when exact decode is not the main path

## User Experience

The answer packet keeps the old response fields while adding:

- `prompt_packet`
- `generation_result`
- `answer_status`
- `quality_flags`
- `surface_policy`

This keeps downstream tests and UI code compatible while exposing why the answer was finalized or replaced.

## No Answer Bank

Retrieved evidence remains auxiliary context. The prompt packet normalizes evidence records to source/title/text fields and does not expose `answer`, `final_answer`, or `answer_text` fields as answer-bank content.

## Privacy

Imported context remains local-session-only. GEN0 adds no persistence path, no teacher/runtime API, no backend inference, and no external model call.
