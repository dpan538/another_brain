# R25E Artifact Request

No reviewed local decoder artifact is currently admitted. For the main product
path, continue by preparing a future self-trained release artifact produced by
the project's from-scratch training pipeline. Compatibility or baseline
artifacts may still use this inbox path only when explicitly reviewed as
comparison-only.

```text
static_llm/inbox/browser_decoder_candidate_tbd/
  artifact_metadata.json
  config.json
  tokenizer.json
  tokenizer_config.json
  model shards or backend-ready files
  checksums.sha256
```

Codex must not download remote weights. The main-path artifact should come
from the future project training run; user-supplied external artifacts are
baseline/compatibility only. R25G/R25I request templates live under
`static_llm/request_pack/` and `static_llm/release_decisions/`.

Use the R25H capacity envelope before supplying a real release artifact. A
future release should include real total bytes, tokenizer/config sizes, shard
count, largest shard size, backend-ready format, hashes, license, provenance,
and a reviewed release decision record. Dry-run capacity manifests are not
production admission.

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
