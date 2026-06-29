# Static LLM Inbox

Place local reviewed decoder artifact candidates here only when the user has
already supplied them locally. R25C scripts inspect local files; they do not
download, train, or call a hosted model API.

Expected candidate layout:

```text
static_llm/inbox/browser_decoder_candidate_tbd/
  artifact_metadata.json
  config.json
  tokenizer.json
  model-00001.<local-format>
```

Real model files are ignored by default. Keep them unstaged unless an explicit
approval marker exists and all R25C admission gates pass.
