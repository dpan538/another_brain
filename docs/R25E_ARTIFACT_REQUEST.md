# R25E Artifact Request

No reviewed local decoder artifact is currently admitted. To continue R25E,
place a browser-ready decoder candidate under an approved inbox path:

```text
static_llm/inbox/qwen2_5_0_5b_instruct_q4/
  artifact_metadata.json
  config.json
  tokenizer.json
  tokenizer_config.json
  model shards or backend-ready files
  checksums.sha256
```

Codex must not download remote weights. The user supplies the local artifact.

Required metadata includes model id, architecture, parameter count,
quantization, context length, tokenizer type, source URL, source revision,
license, license URL, conversion tool, conversion command, conversion date,
review status, reviewer, target profile, expected byte size, expected shard
count, and `contains_private_data: false`.

Before any real model-like file can be committed, add:

```text
static_llm/inbox/<candidate>/APPROVE_STATIC_LLM_PRODUCTION_ADMISSION.json
```

with `scope: "commit_assets"` and no private paths or secrets. The marker does
not bypass gates; metadata, hashes, budget, backend format, no-backend policy,
and R24/R25 checks must still pass.

Raw checkpoints may need conversion before the real first-token gate can pass.
