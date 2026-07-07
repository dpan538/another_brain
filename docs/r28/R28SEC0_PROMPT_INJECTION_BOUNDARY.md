# R28SEC0 Prompt Injection Boundary

R28SEC0 treats imported context and retrieved evidence as data, not instructions. Evidence can support a static local answer, but it cannot override runtime policy, request hidden prompt disclosure, request developer message disclosure, or ask the shell to reveal internal reasoning.

## Blocked input patterns

- hidden prompt disclosure requests
- developer message disclosure requests
- system prompt disclosure markers
- evidence-as-instruction language
- prompt override language
- explicit CoT or hidden reasoning requests
- input over the static runtime cap

Secrets-like content is not treated as training data or sent anywhere. It produces a warning so the UI/debug packet can show the local privacy risk without promoting or persisting the content.

## Evidence handling

Evidence is guarded before normalization and again after normalization. This prevents answer-bank fields from being erased before inspection.

Guarded evidence outcomes:

- safe evidence remains in `retrieved_evidence`.
- malicious evidence is removed and counted in `security_guard.rejected_evidence_count`.
- if all evidence is rejected for hidden prompt or instruction override, the packet uses `answer_policy_hint: "refuse"` and falls back.
- conflicting and insufficient evidence remain explicit verifier statuses.

## No answer-bank behavior

R28SEC0 rejects fixture or evidence fields such as `answer`, `answer_text`, `final_answer`, `expected_answer`, and `prompt`. Static RAG memory can supply supporting context only; it cannot smuggle a final answer.

## Non-forwarding rule

Blocked hidden prompt, developer message, prompt-injection, or CoT requests do not enter:

- state packet input
- retrieval query
- worker prompt
- training promotion path
- external runtime path
- local persistence path
