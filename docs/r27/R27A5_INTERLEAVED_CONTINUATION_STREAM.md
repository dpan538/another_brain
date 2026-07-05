# R27A5 Interleaved Continuation Stream

R27A5 uses deterministic token-budget interleaving across continued public pretraining, SFT public instruction, SFT RAG, SFT value/aesthetic, answer-as-user anchors, refusal/boundary rows, and symbolic reasoning. The manifest records target mix, available mix, and actual first 100k/500k/1M token coverage. No curriculum can be starved merely because it appears later in a JSONL file.

First 1M token mix: `{'rag_evidence_grounded': 85543, 'reasoning_symbolic': 138657, 'secondary_english_mixed': 133010, 'sft_public_instruction': 107705, 'sft_rag_evidence': 63162, 'sft_refusal_boundary': 42240, 'sft_value_aesthetic': 26824, 'user_answered_anchor': 3038, 'value_aesthetic': 21842, 'public_chinese_pretraining': 377979}`.
