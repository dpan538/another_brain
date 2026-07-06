# R27A12 Training Streams

R27A12 reuses existing approved training streams and does not fetch new public corpus, parse root documents, parse `data/public_ingestion`, or use eval prompts as training rows.

| Stream | Source path | Bytes | Lines |
| --- | --- | ---: | ---: |
| `tokenizer` | `/Users/jarlgiovanni/Desktop/another_brain_train_r27a11/artifacts/r27a4/model_lab/tokenizer/tokenizer.json` | 1155170 | None |
| `chinese_general` | `/Users/jarlgiovanni/Desktop/another_brain_train_r27a11/artifacts/r27a7/training_mix/continued_pretraining_stream.jsonl` | 180460442 | 83072 |
| `dialogue_rag` | `/Users/jarlgiovanni/Desktop/another_brain_train_r27a11/artifacts/r27a7/training_mix/rag_value_anchor_replay_stream.jsonl` | 34560241 | 42781 |
| `consolidation` | `/Users/jarlgiovanni/Desktop/another_brain_train_r27a11/artifacts/r27a7/training_mix/consolidation_stream.jsonl` | 141644697 | 97639 |
| `dev` | `/Users/jarlgiovanni/Desktop/another_brain_train_r27a11/artifacts/r27a7/training_mix/dev.jsonl` | 12984278 | 6966 |
| `stratified_heldout` | `/Users/jarlgiovanni/Desktop/another_brain_train_r27a11/artifacts/r27a7/training_mix/stratified_heldout.jsonl` | 12972419 | 6962 |

- OK: `True`
- Missing: `[]`
- Forbidden paths: `[]`
- Old question pack rows 51-100 used: `False`
