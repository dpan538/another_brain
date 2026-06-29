# From-Scratch Training Program

This directory holds plans, schemas, and dry-run scaffolding for a future
project-trained decoder LLM. It contains no model weights.

Current phase can report `phase_1_tokenizer_dry_run` after R25J local tokenizer
dry-run artifacts pass. Formal decoder training progress remains `0%`.

The product path is:

1. reviewed corpus and tokenizer plan
2. from-scratch decoder architecture envelope
3. local training run after future approval
4. quantized static browser artifact
5. release decision and R25E/R25H admission
6. disabled-by-default browser draft path wrapped by R24 verifier/fallback

External pretrained artifacts are comparison or compatibility surfaces only.
LoRA, fine-tuning, and adapters are not the final strategy.

R25J adds `tokenizer_dry_run_config.json` and a tiny toy decoder config. The
tokenizer dry-run uses approved corpus text only and writes ignored artifacts.
The toy decoder overfit command is disabled by default and is not a product
training path.
