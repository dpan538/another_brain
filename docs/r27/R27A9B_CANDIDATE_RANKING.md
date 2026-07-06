# R27A9B Candidate Ranking

Candidate priority is A8B handoff, A8B reports, A7R2 launch config, A7 reports, then A6 baseline reports.

Hard rejects include safety below 1.0, leakage, missing or too-small checkpoint, missing tokenizer, impossible q4 budget, catastrophic RAG honesty, high collapse risk, or selecting a worse final checkpoint without justification.

The score weights safety, 100MB fit, dialogue readiness, RAG honesty, answer-as-user behavior, Chinese-first behavior, low collapse risk, export readiness, and loss.

R27A9B records rejected candidates and their reasons so B-line work does not accidentally inherit a missing checkpoint or a final checkpoint that is worse than the best checkpoint.
