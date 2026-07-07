# R28RT2 Readable Generation Smoke

Commands:

```bash
python3 scripts/r28rt2_inspect_tokenizer_runtime.py
python3 scripts/r28rt2_readable_generation_smoke.py
python3 scripts/r28rt2_browser_worker_smoke.py
```

Expected status:

- q4 shard checksum: passed
- prompt encode: passed
- q4 forward: passed
- generated token count: at least 4 real q4 token ids
- decoded text: non-empty readable display text
- backend inference: false
- external API: false
- fallback remains available
- quality status: `quality_not_ready`

The smoke does not judge answer quality.
