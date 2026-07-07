# R28GEN1 Product Surface Hardening

R28GEN1 hardens the prelaunch answer surface around a small static q4 runtime. It improves deterministic user experience without claiming model quality admission.

## Stable Outcomes

- Insufficient evidence: answer says the local session lacks enough evidence and does not treat model output as fact.
- Conflicting evidence: answer explains that local evidence conflicts and asks for trust resolution.
- Malicious evidence: evidence instructions are ignored; evidence cannot override runtime policy or request hidden prompts/CoT.
- Empty, repeated, overlong, token-id-only, or low-confidence output: answer uses a structured Chinese fallback.

## Prompt-Injection Boundary

Evidence is facts-only input. It cannot become a runtime/developer/system instruction. The finalizer rejects evidence that asks to reveal hidden prompts, developer messages, system prompts, or chain-of-thought.

## No Answer Bank

R28GEN1 does not add stored answer rows, answer-bank fixtures, or final-answer payloads. Evidence records remain evidence records. The finalizer only formats runtime/fallback outcomes.

## Static Runtime Boundary

- local browser/static only
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store
- no private persistence by default

## Remaining Quality Boundary

The static q4 runtime can generate readable text with the exact tokenizer, but GEN1 is not a quality gate. Low-quality or unstable output is routed to deterministic fallback.
