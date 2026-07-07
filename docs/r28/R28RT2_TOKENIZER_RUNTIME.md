# R28RT2 Tokenizer Runtime

The committed R28M1 tokenizer file is runtime lineage metadata, not a full tokenizer vocabulary. It does not include an exact token-id-to-string table.

R28RT2 therefore adds browser runtime tokenizer code:

- encode: `unicode_modulo_runtime_display_codec`
- decode: `lossy_runtime_display_codec`
- vocab size: 16,000
- Chinese text handling: Unicode codepoint input path with readable display decode
- exact decode: false
- limitation: `exact_runtime_tokenizer_vocab_missing`

This is a small runtime display codec for smoke and UI readability. It is not a tokenizer training artifact and not a product tokenizer.
