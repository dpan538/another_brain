# R27A5 Lineage Decision

- R27A4 checkpoint found: `True`.
- R27A4 tokenizer found: `True`.
- Compatible for resume: `True`.
- Decision: `resume_r27a4_mini8m`.
- Reason: `compatible_r27a4_mini8m_checkpoint_and_tokenizer_found`.
- Checkpoint: `artifacts/r27a4/model_lab/checkpoints/r27a4_long_run_campaign_v1_cpu.pt`.
- Tokenizer: `artifacts/r27a4/model_lab/tokenizer/tokenizer.json`.

If R27A4 is resumed, tokenizer type, vocab size, context length, and model dimensions are fixed; R27A5 must not train a replacement tokenizer for that checkpoint.
