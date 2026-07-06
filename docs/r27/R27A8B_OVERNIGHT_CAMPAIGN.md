# R27A8B Overnight Campaign

Campaign id: `r27a8b_resource_safe_overnight_v1`

R27A8B is engineering training only. It is not product training, not formal decoder training, not phase_4, not browser admission, and not release checkpoint admission.

Primary progress metric is `optimizer_tokens`. Planned or streamed tokens are not used as the primary training-progress metric. Ordinary metric no-improvement cannot stop before the minimum budget: 4 wall-clock hours, 15,000,000 optimizer tokens, and 4 normal segments. Hard stops before the minimum remain allowed for NaN, OOM loop, safety failure, leakage, artifact guard failure, checkpoint corruption, disk critical, or system interrupt.

Normal stage order cycles through Chinese-first pretraining, SFT/dialogue, RAG/value/answer-as-user replay, and consolidation. Checkpoints and ledgers are ignored under `artifacts/r27a8b/`.
