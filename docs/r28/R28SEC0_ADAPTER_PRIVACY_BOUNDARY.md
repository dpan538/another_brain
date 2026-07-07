# R28SEC0 Adapter Privacy Boundary

The adapter bridge remains manual, local-session-only, non-persistent, and not training data.

## Required packet properties

Adapter packets must keep:

- `privacy_scope: "local_session_only"`
- `allowed_for_training: false`
- `provenance` as metadata only
- no persistence flag
- no training promotion flag

The bridge does not fetch provenance URLs, does not write payload files, does not use browser storage for imported context, and does not connect to backend inference.

## Rejected adapter content

R28SEC0 rejects adapter packets that include:

- hidden prompt or developer message disclosure requests
- prompt override instructions
- evidence-as-instruction text
- explicit CoT or hidden reasoning requests
- answer-bank fields in evidence
- training promotion flags
- local persistence flags

Secrets-like adapter content is accepted only as local-session content with a warning. It remains `allowed_for_training: false` and `privacy_scope: "local_session_only"`.

## UI status

The static chat UI now displays:

- local-only and no remote send status
- no backend or external LLM status
- local context session-only status
- imported context is not training data
- no local persistence by default
- fallback reason when a security guard blocks response generation
