# R27A6 SFT Curriculum

Built `45285` engineering-only SFT records from promoted public instruction, RAG/evidence, value/aesthetic, answer-as-user anchors, refusal/boundary examples, and reasoning replay. The format is `<|user|> ... <|assistant|> ... <|end|>` and does not change the R27A4 tokenizer vocabulary.

The curriculum stores no chain-of-thought, hidden prompts, eval prompts, private raw data, old excluded rows, or generic assistant style targets. Raw/processed SFT JSONL remains ignored under `artifacts/r27a6/sft/`.
