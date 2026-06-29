# From-Scratch Training Program

This directory holds plans, schemas, and dry-run scaffolding for a future
project-trained decoder LLM. It contains no model weights.

Current phase can report `phase_3_small_decoder_pilot_planned` after R25L
expanded corpus, tokenizer dry-run, and pilot-plan checks pass. This is a
planning state only. Formal decoder training progress remains `0%`.

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

R25L adds an expanded project-authored corpus plan/config, R25L tokenizer
dry-run config, and a small decoder pilot plan. The pilot runner skips by
default, writes no weights, and cannot be treated as a browser release.
