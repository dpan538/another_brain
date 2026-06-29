# Passage Threshold Selection

Selected English threshold: 25 words.

Status: corpus_frozen_partial.

## Rationale

The 10/5/3-word relaxations admitted very short fragments with higher ambiguity and retrieval-insufficient risk. The 3-word run produced no gain over 5 words. The selected 25-word threshold keeps a larger corpus than the original 45-word run while avoiding the lowest-quality short-passage band. Coverage was not used as a blocking objective.

## Threshold Summary

| Threshold | Observed pages | Observed passages | Useful definition | Incomplete fragment | Template residue | Retrieval R@10 |
|---:|---:|---:|---:|---:|---:|---:|
| 45 | 3028 | 7801 | 0.8177 | 0.0612 | 0.1588 | 0.9567 |
| 25 | 3066 | 7971 | 0.8134 | 0.0645 | 0.1559 | 0.96 |
| 10 | 3081 | 8067 | 0.8097 | 0.0652 | 0.1543 | 0.97 |
| 5 | 3082 | 8073 | 0.8091 | 0.0659 | 0.1542 | 0.97 |
| 3 | 3082 | 8073 | 0.8091 | 0.0659 | 0.1542 | 0.97 |

Below-threshold English passages are quarantined under `data/public_ingestion/generated/final/quarantine/`. Chinese shards are frozen as generated. The final retrieval index was built once from the frozen Chinese passages, selected English passages, and canonical graph.
