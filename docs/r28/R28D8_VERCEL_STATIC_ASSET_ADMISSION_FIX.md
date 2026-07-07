# R28D8 Vercel Static Asset Admission Fix

## Root Cause

Vercel fresh deployments used `.vercelignore` before running `npm run build:vercel`. The file globally ignored model-weight extensions, including:

`*.bin`

The R28M1 q4 shards are committed `.bin` files under:

`web/another_brain/model_assets/r28m1/shards/`

Local builds still passed because the files existed in the local checkout. Vercel source upload could omit those `.bin` shard files, so the admitted static LLM manifest could not validate its required files and `admittedStaticLlmAssets` became `0`.

## Patch

R28D8 adds a narrow `.vercelignore` re-include:

`!web/another_brain/model_assets/r28m1/**`

This keeps the approved R28M1 static q4 assets in Vercel's source upload without allowing arbitrary model weights elsewhere.

R28D8 also strengthens `scripts/check_vercel_static_build.mjs` so it understands `.vercelignore` glob and negation rules and fails if an admitted static LLM asset would be ignored by Vercel upload.

## New Gates

- `scripts/r28d8_vercel_static_asset_admission_audit.py`
- `scripts/r28d8_assert_static_llm_assets_admitted.py`
- `npm run test:r28d8`

These gates do not train, quantize, download, or admit a product model. They only verify that already committed static q4 browser assets remain deployable.
