# Tokenizer Training Plan

The project tokenizer should be trained from reviewed project corpus only after
future approval. R25I does not train a tokenizer.

Requirements:

- multilingual `zh`, `en`, and `mixed` support
- deterministic Unicode normalization
- no raw private data
- no chain-of-thought data
- no eval prompt copying
- no long copyrighted text
- no unreviewed external model output
- held-out tokenizer evaluation before model training
- versioned tokenizer IDs and reports

Special tokens should be reviewed before training and may include:

- `<pad>`
- `<bos>`
- `<eos>`
- `<unk>`
- `<user>`
- `<assistant>`
- `<evidence>`
- `<final>`

Target vocab sizes for review: `16000`, `24000`, and `32000`.

Future local output paths:

- ignored tokenizer training reports under `artifacts/training_os/tokenizers/`
- admitted release tokenizer under
  `static_llm/assets/<release>/tokenizer.json` only after R25E/R25H release
  admission
