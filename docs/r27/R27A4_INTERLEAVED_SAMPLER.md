# R27A4 Interleaved Sampler

R27A4 replaces the R27A3 ordered stream with deterministic token-budget interleaving. The manifest records target mix, available mix, and actual first 100k/500k/1M token coverage. No curriculum can be starved merely because it appears later in a JSONL file.

First 1M token mix: `{'public_chinese_pretraining': 398138, 'rag_evidence_grounded': 153372, 'reasoning_symbolic': 109494, 'secondary_english_mixed': 208829, 'user_answered_anchor': 3194, 'value_aesthetic': 21926, 'instruction_distillation': 105047}`.
