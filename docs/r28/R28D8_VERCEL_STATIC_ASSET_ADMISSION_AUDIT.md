# R28D8 Vercel Static Asset Admission Audit

R28D8 audits why Vercel fresh deployment reported:

- `staticLlmManifestsChecked: 10`
- `admittedStaticLlmAssets: 0`

## Finding

The committed R28M1 static q4 files exist locally and are tracked by git under:

`web/another_brain/model_assets/r28m1/`

The admitted static LLM manifest references 10 files:

- 5 q4 shard `.bin` files
- model config
- quantization manifest
- checksums manifest
- tokenizer metadata
- exact runtime tokenizer

The Vercel failure is consistent with source upload filtering rather than missing local git files. `.vercelignore` had global model-weight excludes including `*.bin`; Vercel applies those globs before the build runs. That can remove the q4 shard files from the fresh deployment workspace, causing admitted manifest validation to fail and producing `admittedStaticLlmAssets: 0`.

## Audit Coverage

`scripts/r28d8_vercel_static_asset_admission_audit.py` checks:

- expected R28M1 files exist
- expected files are tracked by git
- expected files are not ignored by `.vercelignore`
- q4 shard count matches the quantization manifest
- tokenizer runtime asset exists
- static manifest and asset manifest paths align
- checksum manifest shape and paths are valid
- shard sizes and total bundle estimate remain within limits
- runtime metadata keeps backend/external/product claims false
- Vercel-like build matrix reports positive static LLM admission

The audit writes:

`artifacts/r28d8/reports/vercel_static_asset_admission_audit.json`

This artifact is local-only and must not be committed.
