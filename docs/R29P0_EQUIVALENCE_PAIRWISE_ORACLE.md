# R29P0 — Equivalence-Constrained Pairwise Oracle Architecture Gate

## Decision question

This campaign tests one architectural claim only: whether an oracle pairwise selector can choose between two independently generated, otherwise-identical DeepSeek answers and create useful Chinese brand/natural-language value without changing factual or semantic content. The selector returns candidate A, candidate B, or the canonical fallback unchanged. It never rewrites, fuses, or generates answer text.

This is architecture-value evidence, not evidence that an efish ranker is trainable or works. No local ranker is trained or used, no weights change, and product admission remains false.

## Adopted evidence and failure family

Previous R29 campaigns established that local complete-answer generation failed generated dialogue evaluation, semantic packet steering caused factual regression, and critic-driven rewriting could delete a condition. The primary failure family is semantic intervention after or during fact formation. The smallest general mechanism tested here removes natural-language generation from the local role and permits selection only after a conservative equivalence pre-screen.

The remaining risks are insufficient temperature-zero candidate diversity, protected-feature false negatives, oracle value too small to justify a 96M ranker, 256-token context overflow, provider residual variance, and two-request latency. Frozen cases, the protected-feature guard, blinded panels, context-fit checks, and parallel latency measurements detect those risks.

## Immutable history

- R29B2M-R3: `BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE`
- R29B2M-R4H: `ABORTED_SAFELY`
- R29B2M-R4H-R1: `BLOCKED_HYBRID_VALUE`
- R29B2M-R4H-R2: `BLOCKED_HYBRID_V2_FACTUAL`
- R29B2M-R4H-R3: `BLOCKED_HYBRID_ARCHITECTURE`

R29P0 does not reopen or edit those campaigns.

## Frozen live protocol

Candidate A and candidate B use byte-equivalent JSON request bodies: one frozen system prompt, the same conversation, `deepseek-v4-flash`, `thinking: {type: disabled}`, explicit `temperature: 0`, streaming with usage, no tools, no `top_p`, and `max_tokens: 192`. They are dispatched as separate concurrent requests. Candidate B is never conditioned on A. Across cases, concurrency is one. Candidate A is always the canonical fallback.

One deterministic-controller response is also generated per scored case from a controller frozen before any responses are observed. It controls only family-specific length and response density. Candidate A remains the DeepSeek-only baseline. Three separate smoke cases consume nine non-scored requests; sixty cases consume 180 scored requests. The hard ceiling is 190 requests and CNY 2.

The current official DeepSeek contract was checked against official documentation on 2026-08-23. The API documents `deepseek-v4-flash`, `POST /chat/completions`, explicit disabled thinking, temperature 0–2 with default 1, SSE streaming and usage, optional-in-practice fingerprint/cache observations, and explicit `max_tokens`. It does not document a request-side `n`/multi-choice contract. Temperature zero is not claimed to guarantee identical output.

## Case and review protocol

The frozen set has 60 new public-safe cases: 36 everyday, 12 bounded logic, and 12 bounded philosophy. It contains no target answers, preferred wording, oracle decisions, or old outputs and is forbidden for training. A contamination audit checks R2 training material, dialogue eval-v2, prior R4H product cases, and prior public-safe response excerpts.

Generation uses three fixed-seed stratified batches of 20. After Batch 1, blinded provisional Panel A evaluates factual/semantic equivalence before any style preference. If protected, equivalent, non-identical headroom is under 25%, or provisional A-to-B selection is under 15%, generation stops before Batch 2. A fresh blinded Panel A evaluates all 60 if generation continues.

The oracle selects B only when the protected guard passes and Panel A says the pair is equivalent and prefers B. Protected mismatch, inequivalence, uncertainty, tie, and every other uncertain state select A. Panel B then compares the unchanged oracle output separately with canonical A and with the deterministic baseline. Codex panels are explicitly provisional and not human.

Human Panel A and Panel B reviews are mandatory for a pass. Until valid 60/60 human exports exist, the campaign must end cleanly at `HUMAN_REVIEW_REQUIRED` (or an earlier blocked state). Human review is resumed without rerunning DeepSeek after source hashes and blinded-order manifests validate.

## Protected equivalence and context

The deterministic guard records source, A, and B signatures for numbers, Chinese numerals, quantities, units, currency, percentages, dates, times, explicit named values, quoted strings, URLs, emails, negation/polarity, conditions/modality, privacy/refusal state, identity boundaries, user constraints, ordered alternatives, and fixture-specified logic conclusions. A protected A/B mismatch makes B ineligible. The guard is a conservative screen, not proof of semantic equivalence. Embedding similarity can never override it or Panel A.

Future local serialization is exactly `<CTX>…</CTX><A>…</A><B>…</B><EOS>` and is measured with the committed exact efish tokenizer. No candidate is semantically truncated to fit. An over-budget pair abstains and falls back to A. Total must be below 256 tokens, preferably at most 248, with at least 95% context-fit required.

## Gates and product boundary

Only valid human review can establish the final factual gate: 60/60 non-regression and zero selection-attributable protected-semantic change. Safe equivalent headroom must be at least 40%; the oracle must select B for at least 15 of 60 cases; Panel B must prefer changed outputs at least 65% with losses at most 10%; changed-output brand/natural preference must be at least 60%; all-case preference must be net positive; and the oracle must outperform the deterministic controller.

Parallel pair-ready latency plus a simulated local delay of at most 350 ms must have p95 at most five seconds and observed/projected maximum at most eight seconds. Candidates remain buffered until selection; unselected text is never shown.

`ORACLE_PAIRWISE_PASS` alone may authorize a separate future frozen-backbone probe. It does not authorize LoRA, full fine-tuning, q4 replacement, browser deployment, or product release. Before a human pass, `ranker_training_authorized` remains false.
