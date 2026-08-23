# Model Card: efish-personal-judge-v1

## Status

`efish-personal-judge-v1` is an architecture and dataset-readiness design. No
judge weights, checkpoint, browser runtime, or product candidate exist in
R30J0. Training has not started.

## Intended role

This model does not generate the product's factual answer. DeepSeek V4 Flash is
the remote language and reasoning layer. The local judge evaluates how well an
already-formed DeepSeek response matches an owner-approved, non-sensitive
conversational preference profile. Its low-entropy outputs are personal fit,
voice issues, presentation mode, and calibrated abstention.

Presentation control is non-semantic. It may change reveal rhythm, spacing, and
motion, but it must return the answer text byte-for-byte unchanged.

## Architecture target

- classification-only transformer
- 512-token hard context, normal target at most 448 tokens, at least 64 tokens
  reserved
- seven blocks, hidden size 896, fourteen attention heads
- causal and bidirectional specifications evaluated separately
- one prefill per judgement
- no natural-language generation head
- no autoregressive decode, sampling, or normal-path KV cache
- browser-local q4 target, preferably at most 45 MB for judge model weights

Exact parameter and package projections are generated from tensor shapes. They
are engineering calculations, not browser latency or memory measurements.

## Honest lineage

R28M1 q4-recovered representation is the default initialization lineage for a
future probe. R3 `stage_a_080k` is a challenger representation only. Its failed
generation result is not rewritten, and neither lineage is called a candidate
in R30J0. A bidirectional conversion from R28M1 may be described only as
`warm-started_from_r28m1_representation`, never as checkpoint parity.

## Personalization boundary

The approved profile may contain explicit, non-sensitive preferences about
brevity, warmth, directness, formality, rhythm, humour, questions, and related
style dimensions. It is versioned, editable, deletable, and owner-reviewed.

The judge does not diagnose an end user's emotion or personality. It does not
infer sensitive identity, silently learn from product conversations, consume
private raw chats, or represent the owner perfectly.

## Not intended for

- factual, truth, logic, medical, legal, or financial decisions
- answer generation, rewriting, fusion, or semantic correction
- psychological profiling or sensitive demographic inference
- hidden online learning
- RAG or vector-database retrieval
- product, browser, or release admission in R30J0

Structured memory and opt-in portfolio knowledge remain separate future
interfaces. Neither is implemented by this model.

## Internal product wording

DeepSeek V4 Flash generates the conversational answer. efish runs locally as a
personal judgement layer that evaluates response fit and controls presentation
according to an owner-approved preference profile.

This wording does not claim that efish generated DeepSeek's answer, and avoids
claims such as “personal consciousness”, “digital clone”, or “AI version of
me”.
