# R28QA2 Product Surface QA

R28QA2 reruns the product-surface QA matrix after exact-tokenizer recovery and deterministic generation hardening.

## Scope

- exact tokenizer/current tokenizer status
- q4 readable generation
- RAG sufficient, insufficient, conflict, and malicious evidence modes
- adapter plain text and JSON local-session imports
- deterministic fallback quality
- mobile and accessibility markers
- no product admission claims
- static budget and build readiness

## Output Labels

- `preview_ready`: hard QA, runtime, tokenizer, and budget checks pass with no quality blocker.
- `preview_ready_with_quality_blocker`: hard QA checks pass, but model quality remains not admitted.
- `blocked_tokenizer`: exact/current tokenizer path is blocked.
- `blocked_runtime`: q4 readable runtime or product-surface scenarios are blocked.
- `blocked_budget`: static bundle budget is blocked.

## Current Expected Outcome

The expected post-GEN1 outcome is `preview_ready_with_quality_blocker`: exact tokenizer and q4 readable generation pass, static budget remains under 100MB, and quality remains `quality_not_ready`.

## Non-Claims

R28QA2 does not train, change model assets, connect backend/external LLM runtime, approve product/browser/release admission, or create an answer bank.
