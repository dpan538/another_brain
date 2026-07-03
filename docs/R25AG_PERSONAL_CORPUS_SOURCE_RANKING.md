# R25AG Personal Corpus Source Ranking

R25AG ranked existing repository text surfaces for future Chinese-personal corpus review. It did not generate training rows, promote rows, modify `training/llm_corpus`, parse root PDF/DOCX content, or parse `data/public_ingestion` content.

## Value Counts

- high_value: 162
- medium_value: 101
- low_value: 0
- not_for_training: 4582

## High-Value Categories

- tracked_project_docs: 108
- tracked_identity_pack: 21
- tracked_knowledge_sources: 21
- tracked_training_corpus: 8
- tracked_long_horizon: 4

## Recommendation

- Estimated existing personal signal: moderate
- Recommended next action: review high-value tracked project docs and long-horizon/style scaffolds before approving any derived-row generation

Tracked summaries include counts and categories only. Source-specific promotion or derived-row generation still needs a later explicit approval.

## R25AJ Follow-Up

R25AH used selected high-value tracked sources to generate ignored candidate rows, but R25AI blocked before promotion because too many targets repeated the same templates. R25AJ repairs candidate uniqueness under ignored artifacts only. It does not train, does not promote rows, and does not modify `training/llm_corpus`; R25AK is required before any reviewed subset may be promoted.
